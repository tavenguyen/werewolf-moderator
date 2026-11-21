import type { RoomState, TimerSnapshotPayload } from './types';
import { tickDayTimer } from '../engine/voting';

export const GRACE_PERIOD_MS = 1000; // 1 giây bù trễ mạng ngầm
export const DEFAULT_HUNTER_TIMEOUT_SEC = 15;
export const DEFAULT_MAYOR_TIMEOUT_SEC = 10;
export const DEFAULT_DAY_DISCUSS_SEC = 180;
export const DEFAULT_VOTE_LOCK_SEC = 60;
export const DEFAULT_MAYOR_ELECTION_SEC = 45;

export interface TimerOptions {
  minNightDelaySec?: number;
  maxNightDelaySec?: number;
  nowFn?: () => number;
}

export class TimerManager {
  private minNightDelaySec: number;
  private maxNightDelaySec: number;
  private nowFn: () => number;
  private voteUnlockTimers = new Map<string, NodeJS.Timeout>();

  constructor(options: TimerOptions = {}) {
    this.minNightDelaySec = options.minNightDelaySec ?? 7;
    this.maxNightDelaySec = options.maxNightDelaySec ?? 14;
    this.nowFn = options.nowFn ?? (() => Date.now());
  }

  public getNow(): number {
    return this.nowFn();
  }

  /**
   * Kiểm tra xem thời điểm gửi gói tin có nằm trong khung hợp lệ
   * (tính cả 1 giây bù trễ mạng ngầm serverCutoffAt = deadlineAt + 1000ms) hay không.
   */
  public isWithinGracePeriod(room: RoomState, timestamp?: number): boolean {
    if (room.timers.isPaused) return false;
    if (!room.timers.serverCutoffAt) return true;
    const now = timestamp ?? this.getNow();
    return now <= room.timers.serverCutoffAt;
  }

  /**
   * Tạo snapshot timer để gửi tới client.
   * Client chỉ nhận deadlineAt và đếm ngược; serverCutoffAt không lộ ra UI.
   */
  public createTimerSnapshot(room: RoomState): TimerSnapshotPayload {
    const gameState = room.gameState;
    const currentTurn =
      gameState?.phase === 'NIGHT' && room.nightTurnPlan.length > 0
        ? room.nightTurnPlan[room.currentNightTurnIndex]
        : undefined;

    return {
      deadlineAt: room.timers.deadlineAt,
      isPaused: room.timers.isPaused,
      phase: gameState?.phase ?? 'LOBBY',
      turnKey: currentTurn?.turnKey,
      discussionSecondsRemaining: gameState?.dayState?.discussionSecondsRemaining,
      voteLockRemainingSeconds: gameState?.dayState?.voteLockRemainingSeconds,
      voteLocked: gameState?.dayState?.voteLocked,
      extensionsUsed: gameState?.dayState?.extensionsUsed,
      titleVi: currentTurn?.titleVi,
      titleEn: currentTurn?.titleEn,
    };
  }

  /**
   * Xóa toàn bộ timer đang chạy của phòng.
   */
  public clearRoomTimer(room: RoomState): void {
    if (room.timers.timerId) {
      clearTimeout(room.timers.timerId);
      room.timers.timerId = null;
    }
    const unlockTimer = this.voteUnlockTimers.get(room.roomCode);
    if (unlockTimer) {
      clearTimeout(unlockTimer);
      this.voteUnlockTimers.delete(room.roomCode);
    }
    room.timers.deadlineAt = null;
    room.timers.serverCutoffAt = null;
    room.timers.isPaused = false;
    room.timers.voteLockDeadlineAt = undefined;
    room.timers.remainingVoteLockMs = undefined;
  }

  /**
   * Bắt đầu timer cho một lượt Đêm với Fake Delay ngẫu nhiên (7–14 giây).
   */
  public startNightTurnTimer(
    room: RoomState,
    onCutoffExpire: () => void,
    customDurationSec?: number
  ): { deadlineAt: number; serverCutoffAt: number } {
    this.clearRoomTimer(room);

    const durationSec =
      customDurationSec ??
      Math.floor(
        Math.random() * (this.maxNightDelaySec - this.minNightDelaySec + 1)
      ) + this.minNightDelaySec;

    const now = this.getNow();
    const durationMs = durationSec * 1000;
    const deadlineAt = now + durationMs;
    const serverCutoffAt = deadlineAt + GRACE_PERIOD_MS;

    room.timers.phase = 'NIGHT';
    room.timers.deadlineAt = deadlineAt;
    room.timers.serverCutoffAt = serverCutoffAt;
    room.timers.isPaused = false;

    // Timeout server ngắt đúng tại serverCutoffAt (bù +1s trễ mạng)
    const timeoutDelay = Math.max(0, serverCutoffAt - now);
    room.timers.timerId = setTimeout(() => {
      room.timers.timerId = null;
      onCutoffExpire();
    }, timeoutDelay);

    return { deadlineAt, serverCutoffAt };
  }

  /**
   * Bắt đầu timer Ban ngày (Thảo luận 180s, khóa vote 60s đầu tiên).
   */
  public startDayDiscussTimer(
    room: RoomState,
    onCutoffExpire: () => void,
    onVoteUnlock?: () => void,
    customDiscussSec: number = DEFAULT_DAY_DISCUSS_SEC,
    customLockSec: number = DEFAULT_VOTE_LOCK_SEC
  ): { deadlineAt: number; serverCutoffAt: number } {
    this.clearRoomTimer(room);

    const now = this.getNow();
    const deadlineAt = now + customDiscussSec * 1000;
    const serverCutoffAt = deadlineAt + GRACE_PERIOD_MS;

    room.timers.phase = 'DAY_DISCUSS';
    room.timers.deadlineAt = deadlineAt;
    room.timers.serverCutoffAt = serverCutoffAt;
    room.timers.isPaused = false;

    // Timeout chuyển pha khi hết giờ thảo luận
    const timeoutDelay = Math.max(0, serverCutoffAt - now);
    room.timers.timerId = setTimeout(() => {
      room.timers.timerId = null;
      onCutoffExpire();
    }, timeoutDelay);

    // Timeout độc lập 60s để mở khóa biểu quyết
    const lockDelayMs = customLockSec * 1000;
    room.timers.voteLockDeadlineAt = now + lockDelayMs;
    room.timers.remainingVoteLockMs = undefined;

    const unlockTimer = setTimeout(() => {
      this.voteUnlockTimers.delete(room.roomCode);
      if (room.gameState?.dayState) {
        room.gameState.dayState.voteLocked = false;
        room.gameState.dayState.voteLockRemainingSeconds = 0;
      }
      if (onVoteUnlock) {
        onVoteUnlock();
      }
    }, lockDelayMs);

    this.voteUnlockTimers.set(room.roomCode, unlockTimer);

    return { deadlineAt, serverCutoffAt };
  }

  /**
   * Bắt đầu timer Bầu cử Trưởng làng Ngày 1 (mặc định 45s).
   */
  public startMayorElectionTimer(
    room: RoomState,
    onCutoffExpire: () => void,
    durationSec: number = DEFAULT_MAYOR_ELECTION_SEC
  ): { deadlineAt: number; serverCutoffAt: number } {
    this.clearRoomTimer(room);

    const now = this.getNow();
    const deadlineAt = now + durationSec * 1000;
    const serverCutoffAt = deadlineAt + GRACE_PERIOD_MS;

    room.timers.phase = 'DAY_MAYOR_ELECTION';
    room.timers.deadlineAt = deadlineAt;
    room.timers.serverCutoffAt = serverCutoffAt;
    room.timers.isPaused = false;

    const timeoutDelay = Math.max(0, serverCutoffAt - now);
    room.timers.timerId = setTimeout(() => {
      room.timers.timerId = null;
      onCutoffExpire();
    }, timeoutDelay);

    return { deadlineAt, serverCutoffAt };
  }

  /**
   * Bắt đầu timer Phát súng Thợ săn (15s).
   */
  public startHunterShotTimer(
    room: RoomState,
    onCutoffExpire: () => void,
    durationSec: number = DEFAULT_HUNTER_TIMEOUT_SEC
  ): { deadlineAt: number; serverCutoffAt: number } {
    this.clearRoomTimer(room);

    const now = this.getNow();
    const deadlineAt = now + durationSec * 1000;
    const serverCutoffAt = deadlineAt + GRACE_PERIOD_MS;

    room.timers.phase = 'HUNTER_SHOT';
    room.timers.deadlineAt = deadlineAt;
    room.timers.serverCutoffAt = serverCutoffAt;
    room.timers.isPaused = false;

    const timeoutDelay = Math.max(0, serverCutoffAt - now);
    room.timers.timerId = setTimeout(() => {
      room.timers.timerId = null;
      onCutoffExpire();
    }, timeoutDelay);

    return { deadlineAt, serverCutoffAt };
  }

  /**
   * Bắt đầu timer Truyền danh hiệu Trưởng làng (10s).
   */
  public startMayorSuccessionTimer(
    room: RoomState,
    onCutoffExpire: () => void,
    durationSec: number = DEFAULT_MAYOR_TIMEOUT_SEC
  ): { deadlineAt: number; serverCutoffAt: number } {
    this.clearRoomTimer(room);

    const now = this.getNow();
    const deadlineAt = now + durationSec * 1000;
    const serverCutoffAt = deadlineAt + GRACE_PERIOD_MS;

    room.timers.phase = 'MAYOR_SUCCESSION';
    room.timers.deadlineAt = deadlineAt;
    room.timers.serverCutoffAt = serverCutoffAt;
    room.timers.isPaused = false;

    const timeoutDelay = Math.max(0, serverCutoffAt - now);
    room.timers.timerId = setTimeout(() => {
      room.timers.timerId = null;
      onCutoffExpire();
    }, timeoutDelay);

    return { deadlineAt, serverCutoffAt };
  }

  /**
   * Tạm dừng timer (Pause):
   * Lưu lại phần thời gian còn lại (remainingBeforePause).
   */
  public pauseTimer(room: RoomState): boolean {
    if (room.timers.isPaused || !room.timers.deadlineAt) {
      return false;
    }

    const now = this.getNow();
    const remaining = Math.max(0, room.timers.deadlineAt - now);
    room.timers.remainingBeforePause = remaining;
    room.timers.isPaused = true;

    if (room.timers.timerId) {
      clearTimeout(room.timers.timerId);
      room.timers.timerId = null;
    }

    // Nếu đang trong thời gian khóa vote, lưu lại thời gian khóa còn lại
    if (room.gameState?.dayState?.voteLocked && room.timers.voteLockDeadlineAt) {
      const remainingLock = Math.max(0, room.timers.voteLockDeadlineAt - now);
      room.timers.remainingVoteLockMs = remainingLock;
      room.gameState.dayState.voteLockRemainingSeconds = Math.ceil(remainingLock / 1000);
    }

    const unlockTimer = this.voteUnlockTimers.get(room.roomCode);
    if (unlockTimer) {
      clearTimeout(unlockTimer);
      this.voteUnlockTimers.delete(room.roomCode);
    }

    if (room.gameState?.dayState) {
      room.gameState.dayState.isPaused = true;
    }

    return true;
  }

  /**
   * Tiếp tục timer (Resume):
   * Đặt lại deadlineAt = now + remaining, serverCutoffAt = deadlineAt + 1000ms.
   */
  public resumeTimer(
    room: RoomState,
    onCutoffExpire: () => void,
    onVoteUnlock?: () => void
  ): boolean {
    if (!room.timers.isPaused || room.timers.remainingBeforePause === undefined) {
      return false;
    }

    const now = this.getNow();
    const remaining = room.timers.remainingBeforePause;
    const deadlineAt = now + remaining;
    const serverCutoffAt = deadlineAt + GRACE_PERIOD_MS;

    room.timers.deadlineAt = deadlineAt;
    room.timers.serverCutoffAt = serverCutoffAt;
    room.timers.isPaused = false;
    room.timers.remainingBeforePause = undefined;

    const timeoutDelay = Math.max(0, serverCutoffAt - now);
    room.timers.timerId = setTimeout(() => {
      room.timers.timerId = null;
      onCutoffExpire();
    }, timeoutDelay);

    // Khôi phục lại timer mở khóa vote nếu chưa mở khóa
    if (
      room.gameState?.dayState?.voteLocked &&
      room.timers.remainingVoteLockMs !== undefined
    ) {
      const lockDelay = room.timers.remainingVoteLockMs;
      room.timers.voteLockDeadlineAt = now + lockDelay;
      room.timers.remainingVoteLockMs = undefined;

      const unlockTimer = setTimeout(() => {
        this.voteUnlockTimers.delete(room.roomCode);
        if (room.gameState?.dayState) {
          room.gameState.dayState.voteLocked = false;
          room.gameState.dayState.voteLockRemainingSeconds = 0;
        }
        if (onVoteUnlock) {
          onVoteUnlock();
        }
      }, lockDelay);

      this.voteUnlockTimers.set(room.roomCode, unlockTimer);
    }

    if (room.gameState?.dayState) {
      room.gameState.dayState.isPaused = false;
    }

    return true;
  }

  /**
   * Gia hạn thời gian thảo luận (+30s): Tối đa 2 lần.
   * Chú ý: voteLockRemainingSeconds không bị kéo dài khi gia hạn.
   */
  public extendDayTimer(
    room: RoomState,
    onCutoffExpire: () => void,
    extraSeconds: number = 30
  ): boolean {
    const gameState = room.gameState;
    if (!gameState?.dayState || gameState.dayState.extensionsUsed >= 2) {
      return false;
    }

    if (!room.timers.deadlineAt || !room.timers.serverCutoffAt) {
      return false;
    }

    gameState.dayState.extensionsUsed += 1;
    gameState.dayState.discussionSecondsRemaining += extraSeconds;
    gameState.historyLogs.push(
      `Host đã gia hạn thêm +${extraSeconds}s thảo luận (${gameState.dayState.extensionsUsed}/2 lần)!`
    );

    const extraMs = extraSeconds * 1000;
    room.timers.deadlineAt += extraMs;
    room.timers.serverCutoffAt += extraMs;

    // Nếu đang Pause, cộng thêm thời gian vào remainingBeforePause
    if (room.timers.isPaused && room.timers.remainingBeforePause !== undefined) {
      room.timers.remainingBeforePause += extraMs;
    }

    // Reset lại timeout server với mốc mới nếu không bị pause
    if (room.timers.timerId && !room.timers.isPaused) {
      clearTimeout(room.timers.timerId);
      const now = this.getNow();
      const timeoutDelay = Math.max(0, room.timers.serverCutoffAt - now);
      room.timers.timerId = setTimeout(() => {
        room.timers.timerId = null;
        onCutoffExpire();
      }, timeoutDelay);
    }

    return true;
  }
}
