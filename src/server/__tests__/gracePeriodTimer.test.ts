import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { RoomService } from '../roomService';
import { TimerManager, GRACE_PERIOD_MS } from '../timerManager';
import { SocketGateway } from '../socketGateway';
import { createMockIoServer, type MockSocketIOServer, type MockClientSocket } from './mockSocket';
import { createInitialDayState } from '../../engine/voting';

describe('Realtime Backend - Grace Period (+1s) & Timer Management', () => {
  let mockIo: MockSocketIOServer;
  let roomService: RoomService;
  let timerManager: TimerManager;
  let gateway: SocketGateway;
  let fakeNow = 1_000_000;
  const clientSockets: MockClientSocket[] = [];

  beforeEach(() => {
    fakeNow = 1_000_000;
    mockIo = createMockIoServer();
    roomService = new RoomService();
    timerManager = new TimerManager({
      minNightDelaySec: 10,
      maxNightDelaySec: 10,
      nowFn: () => fakeNow,
    });
    gateway = new SocketGateway(mockIo as any, roomService, timerManager);
    gateway.registerEvents();
  });

  afterEach(() => {
    for (const c of clientSockets) {
      c.disconnect();
    }
    clientSockets.length = 0;
    roomService.destroy();
    mockIo.close();
  });

  const createClient = (): MockClientSocket => {
    const c = mockIo.createClientSocket();
    clientSockets.push(c);
    return c;
  };

  it('tạo serverCutoffAt ngầm đúng bằng deadlineAt + 1000ms', () => {
    const { roomCode } = roomService.createRoom({ isPlayer: false });
    const room = roomService.getRoom(roomCode)!;

    let expired = false;
    const { deadlineAt, serverCutoffAt } = timerManager.startNightTurnTimer(
      room,
      () => {
        expired = true;
      },
      10 // 10 giây
    );

    expect(deadlineAt).toBe(fakeNow + 10_000);
    expect(serverCutoffAt).toBe(deadlineAt + GRACE_PERIOD_MS);
    expect(serverCutoffAt).toBe(deadlineAt + 1000);
    expect(expired).toBe(false);
  });

  it('chấp nhận gói tin trong khoảng +1s grace period và từ chối sau cutoff', () => {
    const { roomCode } = roomService.createRoom({ isPlayer: false });
    const room = roomService.getRoom(roomCode)!;

    const { deadlineAt, serverCutoffAt } = timerManager.startNightTurnTimer(room, () => {}, 10);

    // 1. Trước deadline: Hợp lệ
    expect(timerManager.isWithinGracePeriod(room, deadlineAt - 1000)).toBe(true);

    // 2. Vừa chạm deadline: Hợp lệ
    expect(timerManager.isWithinGracePeriod(room, deadlineAt)).toBe(true);

    // 3. Trong grace period (+500ms sau deadline): HỢP LỆ!
    expect(timerManager.isWithinGracePeriod(room, deadlineAt + 500)).toBe(true);

    // 4. Đúng mốc cutoff (+1000ms sau deadline): HỢP LỆ!
    expect(timerManager.isWithinGracePeriod(room, serverCutoffAt)).toBe(true);

    // 5. Sau cutoff (+1001ms sau deadline): TỪ CHỐI!
    expect(timerManager.isWithinGracePeriod(room, serverCutoffAt + 1)).toBe(false);
    expect(timerManager.isWithinGracePeriod(room, serverCutoffAt + 500)).toBe(false);
  });

  it('tạm dừng và tiếp tục giữ nguyên thời gian còn lại', () => {
    const { roomCode } = roomService.createRoom({ isPlayer: false });
    const room = roomService.getRoom(roomCode)!;

    // Bắt đầu 60s
    timerManager.startNightTurnTimer(room, () => {}, 60);
    expect(room.timers.isPaused).toBe(false);

    // 20s trôi qua
    fakeNow += 20_000;

    // Host Pause
    const paused = timerManager.pauseTimer(room);
    expect(paused).toBe(true);
    expect(room.timers.isPaused).toBe(true);
    // Còn lại đúng 40s (40_000ms)
    expect(room.timers.remainingBeforePause).toBe(40_000);

    // Giả lập 10s trong lúc pause (thời gian không bị trôi)
    fakeNow += 10_000;

    // Host Resume
    const resumed = timerManager.resumeTimer(room, () => {});
    expect(resumed).toBe(true);
    expect(room.timers.isPaused).toBe(false);
    // deadline mới = fakeNow hiện tại + 40_000ms
    expect(room.timers.deadlineAt).toBe(fakeNow + 40_000);
    expect(room.timers.serverCutoffAt).toBe(fakeNow + 40_000 + GRACE_PERIOD_MS);
  });

  it('gia hạn +30s tối đa 2 lần ban ngày và từ chối lần thứ 3', async () => {
    const hostClient = createClient();
    const createRes: any = await new Promise((resolve) => {
      hostClient.emit('room:create', { isPlayer: false }, resolve);
    });
    const { roomCode, hostToken } = createRes.data;
    const room = roomService.getRoom(roomCode)!;

    // Thiết lập Day Discuss
    room.gameState = {
      generation: 1,
      roundNumber: 1,
      phase: 'DAY_DISCUSS',
      players: [],
      settings: room.settings,
      deaths: [],
      witchHealUsed: false,
      witchPoisonUsed: false,
      wolfCubDoubleKillNextNight: false,
      dreamWolfAwakened: false,
      foxLostPower: false,
      piUsed: false,
      troublemakerUsed: false,
      accursedWolfUsed: false,
      doubleVoteDay: false,
      villagePowerStripped: false,
      mayorId: null,
      dayState: createInitialDayState(),
      historyLogs: [],
    };

    timerManager.startDayDiscussTimer(room, () => {}, undefined, 180, 60);
    const initialDeadline = room.timers.deadlineAt!;

    // Lần 1: +30s -> Thành công
    const ext1: any = await new Promise((resolve) => {
      hostClient.emit('host:extendTime', { roomCode, token: hostToken }, resolve);
    });
    expect(ext1.ok).toBe(true);
    expect(room.gameState.dayState?.extensionsUsed).toBe(1);
    expect(room.timers.deadlineAt).toBe(initialDeadline + 30_000);

    // Lần 2: +30s -> Thành công
    const ext2: any = await new Promise((resolve) => {
      hostClient.emit('host:extendTime', { roomCode, token: hostToken }, resolve);
    });
    expect(ext2.ok).toBe(true);
    expect(room.gameState.dayState?.extensionsUsed).toBe(2);
    expect(room.timers.deadlineAt).toBe(initialDeadline + 60_000);

    // Lần 3: +30s -> Bị từ chối MAX_EXTENSIONS_REACHED
    const ext3: any = await new Promise((resolve) => {
      hostClient.emit('host:extendTime', { roomCode, token: hostToken }, resolve);
    });
    expect(ext3.ok).toBe(false);
    expect(ext3.error.code).toBe('MAX_EXTENSIONS_REACHED');
  });

  it('F-05: TimerSnapshotPayload không lộ serverCutoffAt ra client', () => {
    const { roomCode } = roomService.createRoom({ isPlayer: false });
    const room = roomService.getRoom(roomCode)!;

    timerManager.startNightTurnTimer(room, () => {}, 10);
    const snapshot = timerManager.createTimerSnapshot(room);

    expect(snapshot.deadlineAt).toBeDefined();
    expect((snapshot as any).serverCutoffAt).toBeUndefined();
  });

  it('F-02 & F-07: Pause trong 60s đầu thảo luận và gia hạn +30s khi đang pause được khôi phục chính xác', () => {
    const { roomCode } = roomService.createRoom({ isPlayer: false });
    const room = roomService.getRoom(roomCode)!;
    room.gameState = {
      generation: 1,
      roundNumber: 1,
      phase: 'DAY_DISCUSS',
      players: [],
      settings: room.settings,
      deaths: [],
      witchHealUsed: false,
      witchPoisonUsed: false,
      wolfCubDoubleKillNextNight: false,
      dreamWolfAwakened: false,
      foxLostPower: false,
      piUsed: false,
      troublemakerUsed: false,
      accursedWolfUsed: false,
      doubleVoteDay: false,
      villagePowerStripped: false,
      mayorId: null,
      dayState: createInitialDayState(),
      historyLogs: [],
    };

    let voteUnlocked = false;
    timerManager.startDayDiscussTimer(
      room,
      () => {},
      () => {
        voteUnlocked = true;
      },
      180,
      60
    );

    expect(room.gameState.dayState?.voteLocked).toBe(true);

    // 20s trôi qua (còn 40s khóa vote, 160s thảo luận)
    fakeNow += 20_000;

    // Host Pause
    timerManager.pauseTimer(room);
    expect(room.timers.isPaused).toBe(true);
    expect(room.timers.remainingBeforePause).toBe(160_000);
    expect(room.timers.remainingVoteLockMs).toBe(40_000);

    // Host gia hạn +30s khi đang Pause
    const ext = timerManager.extendDayTimer(room, () => {}, 30);
    expect(ext).toBe(true);
    // Thời gian còn lại phải tăng thành 190s
    expect(room.timers.remainingBeforePause).toBe(190_000);

    // Resume
    timerManager.resumeTimer(
      room,
      () => {},
      () => {
        voteUnlocked = true;
      }
    );
    expect(room.timers.isPaused).toBe(false);
    expect(room.timers.deadlineAt).toBe(fakeNow + 190_000);
  });

  it('F-08: từ chối host:pause ở pha không hợp lệ (NIGHT)', async () => {
    const hostClient = createClient();
    const createRes: any = await new Promise((resolve) => {
      hostClient.emit('room:create', { isPlayer: false }, resolve);
    });
    const { roomCode, hostToken } = createRes.data;
    const room = roomService.getRoom(roomCode)!;

    // Giả lập pha NIGHT
    room.gameState = {
      generation: 1,
      roundNumber: 1,
      phase: 'NIGHT',
      players: [],
      settings: room.settings,
      deaths: [],
      witchHealUsed: false,
      witchPoisonUsed: false,
      wolfCubDoubleKillNextNight: false,
      dreamWolfAwakened: false,
      foxLostPower: false,
      piUsed: false,
      troublemakerUsed: false,
      accursedWolfUsed: false,
      doubleVoteDay: false,
      villagePowerStripped: false,
      mayorId: null,
      historyLogs: [],
    };

    const pauseRes: any = await new Promise((resolve) => {
      hostClient.emit('host:pause', { roomCode, token: hostToken }, resolve);
    });
    expect(pauseRes.ok).toBe(false);
    expect(pauseRes.error.code).toBe('PAUSE_NOT_ALLOWED');
  });
});
