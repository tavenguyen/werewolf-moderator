import type { Server, Socket } from 'socket.io';
import { executeDayVote, executeHunterShot, executeMayorSuccession, executeNightPhase } from '../engine/gameEngine';
import { generateNightTurnPlan } from '../engine/turnPlan';
import {
  canHostTallyEarly,
  castDayVote,
  castMayorBallot,
  castRunoffVote,
  tallyDayVotes,
  tallyMayorElection,
} from '../engine/voting';
import { ROLES_BY_ID } from '../engine/roles';
import { getAliveNeighbors } from '../engine/seating';
import { isWerewolfForInvestigation } from '../engine/nightResolution';
import {
  createHostBoardView,
  createPlayerPrivateView,
  createPostGameView,
  createPublicRoomView,
} from './projections';
import { RoomService } from './roomService';
import { TimerManager } from './timerManager';
import type {
  ClientCreateRoomPayload,
  ClientDayVotePayload,
  ClientEmergencyEliminatePayload,
  ClientHostControlPayload,
  ClientHunterShotPayload,
  ClientJoinRoomPayload,
  ClientMayorElectPayload,
  ClientMayorTransferPayload,
  ClientNightActionPayload,
  ClientResumePayload,
  ClientStartGamePayload,
  ClientUpdateSettingsPayload,
  PlayerPrivateView,
  RoomPlayer,
  RoomState,
  ServerErrorCode,
  ServerResponse,
} from './types';
import type { PlayerId } from '../engine/types';

export class SocketGateway {
  private io: Server;
  private roomService: RoomService;
  private timerManager: TimerManager;

  constructor(io: Server, roomService: RoomService, timerManager: TimerManager) {
    this.io = io;
    this.roomService = roomService;
    this.timerManager = timerManager;
  }

  public registerEvents(): void {
    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });
  }

  private handleConnection(socket: Socket): void {
    // 1. Tạo phòng
    socket.on(
      'room:create',
      (payload: ClientCreateRoomPayload, cb?: (res: ServerResponse) => void) => {
        try {
          const result = this.roomService.createRoom(payload);
          const room = this.roomService.getRoom(result.roomCode);
          if (!room) {
            this.sendError(cb, 'ROOM_NOT_FOUND', 'Không thể khởi tạo phòng.');
            return;
          }

          room.host.socketId = socket.id;
          if (result.playerId) {
            const player = room.players.get(result.playerId);
            if (player) {
              player.socketId = socket.id;
            }
          }

          socket.join(result.roomCode);

          this.sendOk(cb, result);
          this.broadcastRoom(room);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Lỗi khi tạo phòng.';
          this.sendError(cb, 'INTERNAL_ERROR', message);
        }
      }
    );

    // 2. Tham gia phòng
    socket.on(
      'room:join',
      (payload: ClientJoinRoomPayload, cb?: (res: ServerResponse) => void) => {
        try {
          const result = this.roomService.joinRoom(payload.roomCode, payload.username);
          const room = this.roomService.getRoom(payload.roomCode);
          if (!room) {
            this.sendError(cb, 'ROOM_NOT_FOUND', 'Bàn chưa tồn tại hoặc đã kết thúc.');
            return;
          }

          const player = room.players.get(result.playerId);
          if (player) {
            player.socketId = socket.id;
          }

          socket.join(payload.roomCode);

          this.sendOk(cb, result);
          this.broadcastRoom(room);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Lỗi khi tham gia phòng.';
          const code: ServerErrorCode =
            message.includes('chưa tồn tại') || message.includes('không tồn tại')
              ? 'ROOM_NOT_FOUND'
              : message.includes('đã có người sử dụng')
                ? 'NAME_TAKEN'
                : message.includes('tối đa')
                  ? 'ROOM_FULL'
                  : message.includes('đã bắt đầu')
                    ? 'GAME_ALREADY_STARTED'
                    : 'INTERNAL_ERROR';
          this.sendError(cb, code, message);
        }
      }
    );

    // 3. Khôi phục phiên (Resume)
    socket.on('room:resume', (payload: ClientResumePayload, cb?: (res: ServerResponse) => void) => {
      const room = this.roomService.getRoom(payload.roomCode);
      if (!room) {
        this.sendError(cb, 'ROOM_NOT_FOUND', 'Bàn chưa tồn tại hoặc đã kết thúc.');
        return;
      }

      // Kiểm tra Host
      if (room.host.hostToken === payload.token) {
        this.roomService.reconnectHost(payload.roomCode, payload.token, socket.id);
        socket.join(payload.roomCode);
        this.sendOk(cb, {
          isHost: true,
          isPlayer: room.host.isPlayer,
          playerId: room.host.playerId,
        });
        this.broadcastRoom(room);
        return;
      }

      // Kiểm tra Player
      const player = this.roomService.reconnectPlayer(
        payload.roomCode,
        payload.token,
        socket.id
      );
      if (player) {
        socket.join(payload.roomCode);
        this.sendOk(cb, { isHost: false, playerId: player.id });
        this.broadcastRoom(room);
        return;
      }

      this.sendError(cb, 'INVALID_TOKEN', 'Token không hợp lệ hoặc đã hết hạn.');
    });

    // 3b. Rời phòng (Leave)
    socket.on('room:leave', (payload: { roomCode: string; token: string }, cb?: (res: ServerResponse) => void) => {
      const room = this.roomService.getRoom(payload.roomCode);
      if (!room) {
        this.sendError(cb, 'ROOM_NOT_FOUND', 'Bàn chưa tồn tại hoặc đã kết thúc.');
        return;
      }

      const ok = this.roomService.leaveRoom(payload.roomCode, payload.token);
      socket.leave(payload.roomCode);

      this.sendOk(cb, { left: ok });
      const updatedRoom = this.roomService.getRoom(payload.roomCode);
      if (updatedRoom) {
        this.broadcastRoom(updatedRoom);
      }
    });

    // 4. Cài đặt phòng (Host)
    socket.on(
      'lobby:updateSettings',
      (payload: ClientUpdateSettingsPayload, cb?: (res: ServerResponse) => void) => {
        this.runInQueue(payload.roomCode, cb, async (room) => {
          if (room.host.hostToken !== payload.token) {
            throw { code: 'NOT_HOST', message: 'Chỉ Host mới có quyền đổi cài đặt.' };
          }
          const updated = this.roomService.updateSettings(
            payload.roomCode,
            payload.token,
            payload.settings
          );
          this.broadcastRoom(room);
          return updated;
        });
      }
    );

    // 5. Bắt đầu ván (Host)
    socket.on(
      'lobby:start',
      (payload: ClientStartGamePayload, cb?: (res: ServerResponse) => void) => {
        this.runInQueue(payload.roomCode, cb, async (room) => {
          if (room.host.hostToken !== payload.token) {
            throw { code: 'NOT_HOST', message: 'Chỉ Host mới có quyền bắt đầu ván đấu.' };
          }

          this.roomService.startGame(payload.roomCode, payload.token, payload.customRoleIds);

          if (!room.gameState) {
            throw { code: 'INTERNAL_ERROR', message: 'Không thể tạo GameState.' };
          }

          // Tạo Night Turn Plan cho Đêm 1
          room.nightTurnPlan = generateNightTurnPlan(room.gameState);
          room.currentNightTurnIndex = 0;
          room.nightActionsAccumulator = {};
          room.nightActionAcks.clear();

          // Bắt đầu timer cho lượt đêm đầu tiên
          this.startCurrentNightTurnTimer(room);

          this.broadcastRoom(room);
          return { started: true };
        });
      }
    );

    // 6. Hành động Ban Đêm (Night Action)
    socket.on(
      'night:action',
      (payload: ClientNightActionPayload, cb?: (res: ServerResponse) => void) => {
        this.runInQueue(payload.roomCode, cb, async (room) => {
          const player = this.findPlayerByToken(room, payload.token);
          if (!player) {
            throw { code: 'INVALID_TOKEN', message: 'Người chơi không hợp lệ.' };
          }

          if (room.gameState?.phase !== 'NIGHT') {
            throw { code: 'INVALID_PHASE', message: 'Không phải pha ban đêm.' };
          }

          // Kiểm tra Grace Period ngầm (+1s)
          if (!this.timerManager.isWithinGracePeriod(room)) {
            throw { code: 'NOT_YOUR_TURN', message: 'Lượt hành động đã kết thúc.' };
          }

          const currentTurn = room.nightTurnPlan[room.currentNightTurnIndex];
          if (!currentTurn) {
            throw { code: 'NOT_YOUR_TURN', message: 'Không có lượt hoạt động.' };
          }

          if (!currentTurn.activePlayerIds.includes(player.id) || !currentTurn.canAct) {
            throw { code: 'NOT_YOUR_TURN', message: 'Không phải lượt của bạn.' };
          }

          // Idempotency: Kiểm tra người chơi đã gửi action trong lượt này chưa
          if (room.nightActionAcks.has(player.id)) {
            throw { code: 'ALREADY_ACTED', message: 'Bạn đã thực hiện hành động lượt này.' };
          }

          // Ghi nhận hành động vào accumulator
          this.applyNightAction(room, player.id, currentTurn.turnKey, payload.action);
          room.nightActionAcks.add(player.id);

          // Cập nhật lại snapshot cho riêng player để khóa nút ngay lập tức
          this.sendPrivateView(room, player);

          return { ack: true };
        });
      }
    );

    // 7. Bỏ phiếu Biểu quyết Ban Ngày (Day Vote)
    socket.on('day:vote', (payload: ClientDayVotePayload, cb?: (res: ServerResponse) => void) => {
      this.runInQueue(payload.roomCode, cb, async (room) => {
        const player = this.findPlayerByToken(room, payload.token);
        if (!player) {
          throw { code: 'INVALID_TOKEN', message: 'Người chơi không hợp lệ.' };
        }

        const gameState = room.gameState;
        if (!gameState) {
          throw { code: 'GAME_NOT_STARTED', message: 'Ván chơi chưa bắt đầu.' };
        }

        // Bù trễ mạng ngầm (+1s)
        if (!this.timerManager.isWithinGracePeriod(room)) {
          throw { code: 'VOTE_LOCKED', message: 'Thời gian bỏ phiếu đã kết thúc.' };
        }

        if (gameState.phase === 'DAY_DISCUSS') {
          if (gameState.dayState?.voteLocked) {
            throw { code: 'VOTE_LOCKED', message: 'Hòm phiếu đang bị khóa trong 60s đầu.' };
          }

          if (Object.prototype.hasOwnProperty.call(gameState.dayState?.ballots ?? {}, player.id)) {
            throw { code: 'ALREADY_VOTED', message: 'Bạn đã gửi phiếu biểu quyết kín.' };
          }

          room.gameState = castDayVote(gameState, player.id, payload.targetPlayerId);
          this.broadcastRoom(room);
          return { voted: true };
        }

        if (gameState.phase === 'DAY_RUNOFF') {
          if (
            Object.prototype.hasOwnProperty.call(
              gameState.dayState?.runoffBallots ?? {},
              player.id
            )
          ) {
            throw { code: 'ALREADY_VOTED', message: 'Bạn đã gửi phiếu Runoff.' };
          }

          room.gameState = castRunoffVote(gameState, player.id, payload.targetPlayerId);
          this.broadcastRoom(room);
          return { voted: true };
        }

        throw { code: 'INVALID_PHASE', message: 'Hiện không ở pha bỏ phiếu biểu quyết.' };
      });
    });

    // 8. Chốt vote ban ngày (Host chốt sớm hoặc tự động)
    socket.on(
      'day:finalizePublicVote',
      (payload: ClientHostControlPayload, cb?: (res: ServerResponse) => void) => {
        this.runInQueue(payload.roomCode, cb, async (room) => {
          if (room.host.hostToken !== payload.token) {
            throw { code: 'NOT_HOST', message: 'Chỉ Host mới có quyền chốt biểu quyết.' };
          }

          if (!room.gameState || room.gameState.phase !== 'DAY_DISCUSS') {
            throw { code: 'INVALID_PHASE', message: 'Không ở pha thảo luận biểu quyết.' };
          }

          if (room.gameState.dayState?.voteLocked) {
            throw { code: 'VOTE_LOCKED', message: 'Phiếu đang bị khóa.' };
          }

          if (!canHostTallyEarly(room.gameState)) {
            throw { code: 'CANNOT_TALLY_YET', message: 'Chưa đủ người chơi gửi phiếu.' };
          }

          this.executeFinalizeDayVote(room);
          return { finalized: true };
        });
      }
    );

    // 9. Bầu cử Trưởng làng Ngày 1
    socket.on(
      'mayor:elect',
      (payload: ClientMayorElectPayload, cb?: (res: ServerResponse) => void) => {
        this.runInQueue(payload.roomCode, cb, async (room) => {
          const player = this.findPlayerByToken(room, payload.token);
          if (!player) {
            throw { code: 'INVALID_TOKEN', message: 'Người chơi không hợp lệ.' };
          }

          if (room.gameState?.phase !== 'DAY_MAYOR_ELECTION') {
            throw { code: 'INVALID_PHASE', message: 'Không phải pha bầu cử Trưởng làng.' };
          }

          if (!this.timerManager.isWithinGracePeriod(room)) {
            throw { code: 'VOTE_LOCKED', message: 'Hết thời gian bầu cử.' };
          }

          if (
            Object.prototype.hasOwnProperty.call(
              room.gameState.dayState?.mayorBallots ?? {},
              player.id
            )
          ) {
            throw { code: 'ALREADY_VOTED', message: 'Bạn đã bỏ phiếu bầu Trưởng làng.' };
          }

          room.gameState = castMayorBallot(room.gameState, player.id, payload.candidateId);
          this.broadcastRoom(room);
          return { voted: true };
        });
      }
    );

    // 10. Phát súng Thợ săn (Hunter Shot)
    socket.on(
      'hunter:shot',
      (payload: ClientHunterShotPayload, cb?: (res: ServerResponse) => void) => {
        this.runInQueue(payload.roomCode, cb, async (room) => {
          const player = this.findPlayerByToken(room, payload.token);
          if (!player) {
            throw { code: 'INVALID_TOKEN', message: 'Người chơi không hợp lệ.' };
          }

          if (room.gameState?.phase !== 'HUNTER_SHOT') {
            throw { code: 'INVALID_PHASE', message: 'Không phải pha Thợ săn nổ súng.' };
          }

          if (room.gameState.pendingHunterShotPlayerId !== player.id) {
            throw { code: 'NOT_YOUR_TURN', message: 'Bạn không phải Thợ săn được nổ súng.' };
          }

          if (!this.timerManager.isWithinGracePeriod(room)) {
            throw { code: 'VOTE_LOCKED', message: 'Hết thời gian nổ súng.' };
          }

          this.timerManager.clearRoomTimer(room);
          const { nextState, winOutcome } = executeHunterShot(
            room.gameState,
            payload.targetPlayerId
          );
          room.gameState = nextState;

          this.routePostHunterPhase(room, winOutcome);
          return { shot: true };
        });
      }
    );

    // 11. Truyền huy hiệu Trưởng làng (Mayor Succession)
    socket.on(
      'mayor:transfer',
      (payload: ClientMayorTransferPayload, cb?: (res: ServerResponse) => void) => {
        this.runInQueue(payload.roomCode, cb, async (room) => {
          const player = this.findPlayerByToken(room, payload.token);
          if (!player) {
            throw { code: 'INVALID_TOKEN', message: 'Người chơi không hợp lệ.' };
          }

          if (room.gameState?.phase !== 'MAYOR_SUCCESSION') {
            throw { code: 'INVALID_PHASE', message: 'Không phải pha truyền huy hiệu.' };
          }

          if (room.gameState.pendingMayorSuccessionPlayerId !== player.id) {
            throw { code: 'NOT_YOUR_TURN', message: 'Bạn không phải Trưởng làng qua đời.' };
          }

          if (!this.timerManager.isWithinGracePeriod(room)) {
            throw { code: 'VOTE_LOCKED', message: 'Hết thời gian truyền huy hiệu.' };
          }

          this.timerManager.clearRoomTimer(room);
          const { nextState, winOutcome } = executeMayorSuccession(
            room.gameState,
            payload.successorPlayerId
          );
          room.gameState = nextState;

          this.routePostMayorSuccessionPhase(room, winOutcome);
          return { transferred: true };
        });
      }
    );

    // 12. Điều khiển Host: Pause / Resume / Extend / EmergencyEliminate / Rematch
    socket.on(
      'host:pause',
      (payload: ClientHostControlPayload, cb?: (res: ServerResponse) => void) => {
        this.runInQueue(payload.roomCode, cb, async (room) => {
          if (room.host.hostToken !== payload.token) {
            throw { code: 'NOT_HOST', message: 'Chỉ Host mới có quyền tạm dừng.' };
          }
          const phase = room.gameState?.phase;
          if (phase !== 'DAY_DISCUSS' && phase !== 'DAY_MAYOR_ELECTION') {
            throw { code: 'PAUSE_NOT_ALLOWED', message: 'Chỉ có thể tạm dừng ở pha thảo luận ban ngày.' };
          }
          const ok = this.timerManager.pauseTimer(room);
          if (!ok) {
            throw { code: 'PAUSE_NOT_ALLOWED', message: 'Không thể tạm dừng lúc này.' };
          }
          this.broadcastRoom(room);
          return { paused: true };
        });
      }
    );

    socket.on(
      'host:resume',
      (payload: ClientHostControlPayload, cb?: (res: ServerResponse) => void) => {
        this.runInQueue(payload.roomCode, cb, async (room) => {
          if (room.host.hostToken !== payload.token) {
            throw { code: 'NOT_HOST', message: 'Chỉ Host mới có quyền tiếp tục.' };
          }
          const ok = this.timerManager.resumeTimer(
            room,
            () => this.handleTimerExpiry(room),
            () => this.broadcastRoom(room)
          );
          if (!ok) {
            throw { code: 'PAUSE_NOT_ALLOWED', message: 'Không thể tiếp tục lúc này.' };
          }
          this.broadcastRoom(room);
          return { resumed: true };
        });
      }
    );

    socket.on(
      'host:extendTime',
      (payload: ClientHostControlPayload, cb?: (res: ServerResponse) => void) => {
        this.runInQueue(payload.roomCode, cb, async (room) => {
          if (room.host.hostToken !== payload.token) {
            throw { code: 'NOT_HOST', message: 'Chỉ Host mới có quyền gia hạn thời gian.' };
          }
          const ok = this.timerManager.extendDayTimer(room, () => this.finalizeDayVote(room));
          if (!ok) {
            throw {
              code: 'MAX_EXTENSIONS_REACHED',
              message: 'Đã đạt tối đa 2 lần gia hạn hoặc không ở pha thảo luận.',
            };
          }
          this.broadcastRoom(room);
          return { extended: true };
        });
      }
    );

    socket.on(
      'host:emergencyEliminate',
      (payload: ClientEmergencyEliminatePayload, cb?: (res: ServerResponse) => void) => {
        this.runInQueue(payload.roomCode, cb, async (room) => {
          if (room.host.hostToken !== payload.token) {
            throw { code: 'NOT_HOST', message: 'Chỉ Host mới có quyền loại khẩn cấp.' };
          }
          this.roomService.emergencyEliminate(
            payload.roomCode,
            payload.token,
            payload.targetPlayerId
          );
          this.broadcastRoom(room);
          return { eliminated: true };
        });
      }
    );

    socket.on(
      'host:rematch',
      (payload: ClientHostControlPayload, cb?: (res: ServerResponse) => void) => {
        this.runInQueue(payload.roomCode, cb, async (room) => {
          if (room.host.hostToken !== payload.token) {
            throw { code: 'NOT_HOST', message: 'Chỉ Host mới có quyền tái đấu.' };
          }
          this.roomService.rematch(payload.roomCode, payload.token);

          if (!room.gameState) {
            throw { code: 'INTERNAL_ERROR', message: 'Không thể tạo rematch GameState.' };
          }

          room.nightTurnPlan = generateNightTurnPlan(room.gameState);
          room.currentNightTurnIndex = 0;
          room.nightActionsAccumulator = {};
          room.nightActionAcks.clear();

          this.startCurrentNightTurnTimer(room);
          this.broadcastRoom(room);
          return { rematched: true };
        });
      }
    );

    // 13. Ngắt kết nối socket
    socket.on('disconnect', () => {
      const info = this.roomService.handleSocketDisconnect(socket.id);
      if (info) {
        const room = this.roomService.getRoom(info.roomCode);
        if (room) {
          this.broadcastRoom(room);
        }
      }
    });
  }

  // -------------------------------------------------------------
  // Điều phối Pha & Timer Callbacks
  // -------------------------------------------------------------

  /**
   * Bắt đầu timer cho lượt đêm hiện tại (Fake delay 7–14s).
   */
  private startCurrentNightTurnTimer(room: RoomState): void {
    const currentTurn = room.nightTurnPlan[room.currentNightTurnIndex];
    if (!currentTurn) return;

    this.timerManager.startNightTurnTimer(room, () => {
      this.advanceNightTurn(room);
    });
  }

  /**
   * Chuyển tiếp lượt Đêm tiếp theo hoặc chốt Đêm.
   */
  private advanceNightTurn(room: RoomState): void {
    const queue = this.roomService.getCommandQueue(room.roomCode);
    void queue.enqueue(async () => {
      const currentTurn = room.nightTurnPlan[room.currentNightTurnIndex];
      if (currentTurn?.turnKey === 'wolf_pack') {
        this.tallyWolfPackCandidate(room);
      }

      room.currentNightTurnIndex += 1;

      if (room.currentNightTurnIndex < room.nightTurnPlan.length) {
        room.nightActionAcks.clear();
        this.startCurrentNightTurnTimer(room);
        this.broadcastRoom(room);
      } else {
        // Đã hết các lượt đêm -> Phân giải đêm (executeNightPhase)
        this.resolveNightAndTransition(room);
      }
    });
  }

  /**
   * Tally tạm thời phiếu của bầy Sói để Phù thủy biết nạn nhân nếu có kỹ năng witchKnowsVictim.
   */
  private tallyWolfPackCandidate(room: RoomState): void {
    const wolfActions = room.nightActionsAccumulator.wolfPack;
    if (!wolfActions?.individualVotes) return;

    const counts = new Map<PlayerId, number>();
    for (const targetId of Object.values(wolfActions.individualVotes)) {
      if (targetId) {
        counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
      }
    }

    if (counts.size === 0) {
      wolfActions.targets = [];
      return;
    }

    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    wolfActions.targets = [sorted[0][0]];
  }

  /**
   * Phân giải đêm và chuyển pha:
   */
  private resolveNightAndTransition(room: RoomState): void {
    if (!room.gameState) return;

    const { nextState, winOutcome } = executeNightPhase(
      room.gameState,
      room.nightActionsAccumulator
    );
    room.gameState = nextState;

    if (winOutcome) {
      room.gameState.phase = 'GAME_OVER';
      this.timerManager.clearRoomTimer(room);
      this.broadcastRoom(room);
      return;
    }

    const roundDeaths = room.gameState.deaths.filter(
      (d) => d.roundNumber === room.gameState!.roundNumber && d.phase === 'NIGHT'
    );
    if (roundDeaths.length > 0) {
      room.publicHistoryLogs.push(`Trời đã sáng. Đêm qua có ${roundDeaths.length} người ngã xuống!`);
    } else {
      room.publicHistoryLogs.push('Trời đã sáng. Một đêm bình yên, không ai ngã xuống!');
    }

    if (room.gameState.phase === 'HUNTER_SHOT') {
      this.timerManager.startHunterShotTimer(room, () => {
        this.handleHunterTimeout(room);
      });
      this.broadcastRoom(room);
      return;
    }

    if (room.gameState.phase === 'MAYOR_SUCCESSION') {
      this.timerManager.startMayorSuccessionTimer(room, () => {
        this.handleMayorSuccessionTimeout(room);
      });
      this.broadcastRoom(room);
      return;
    }

    if (room.gameState.phase === 'DAY_MAYOR_ELECTION') {
      this.timerManager.startMayorElectionTimer(room, () => {
        this.finalizeMayorElection(room);
      });
      this.broadcastRoom(room);
      return;
    }

    if (room.gameState.phase === 'DAY_DISCUSS') {
      this.startDayDiscussion(room);
      this.broadcastRoom(room);
    }
  }

  /**
   * Bắt đầu pha Thảo luận ban ngày (tùy chỉnh thảo luận & khóa vote).
   */
  private startDayDiscussion(room: RoomState): void {
    if (room.gameState) {
      room.publicHistoryLogs.push(`Bắt đầu Ngày ${room.gameState.roundNumber}: Mở phiên thảo luận làng.`);
    }
    const discussSec = room.settings.dayDiscussionSeconds ?? DEFAULT_DAY_DISCUSS_SEC;
    const lockSec = room.settings.dayVoteLockSeconds ?? DEFAULT_VOTE_LOCK_SEC;

    this.timerManager.startDayDiscussTimer(
      room,
      () => {
        this.finalizeDayVote(room);
      },
      () => {
        // Callback mở khóa biểu quyết
        this.broadcastRoom(room);
      },
      discussSec,
      lockSec
    );
  }

  /**
   * Chốt kết quả Bầu cử Trưởng làng Ngày 1.
   */
  private finalizeMayorElection(room: RoomState): void {
    const queue = this.roomService.getCommandQueue(room.roomCode);
    void queue.enqueue(async () => {
      if (!room.gameState) return;

      const { nextState } = tallyMayorElection(room.gameState);
      room.gameState = nextState;

      // Sau khi bầu Mayor xong, chuyển sang DAY_DISCUSS
      this.startDayDiscussion(room);
      this.broadcastRoom(room);
    });
  }

  /**
   * Chốt phiếu Biểu quyết treo cổ ban ngày (Vote kín).
   */
  public finalizeDayVote(room: RoomState): void {
    const queue = this.roomService.getCommandQueue(room.roomCode);
    void queue.enqueue(async () => {
      this.executeFinalizeDayVote(room);
    });
  }

  public executeFinalizeDayVote(room: RoomState): void {
    if (!room.gameState) return;

    // Tally vote kín: chỉ công bố map số phiếu + abstainCount, nếu bật revealVoterIdentities thì bổ sung voterDetails
    const livingVoters = room.gameState.players.filter((p) => p.isAlive && p.voteWeight > 0);
    const tallies: Record<PlayerId, number> = {};
    const voterDetails: Record<PlayerId, PlayerId[]> = {};
    let abstainCount = 0;

    for (const voter of livingVoters) {
      const targetId = room.gameState.dayState?.ballots[voter.id];
      if (!targetId) {
        abstainCount += voter.voteWeight;
      } else {
        tallies[targetId] = (tallies[targetId] ?? 0) + voter.voteWeight;
        if (!voterDetails[targetId]) voterDetails[targetId] = [];
        voterDetails[targetId].push(voter.id);
      }
    }

    if (room.settings.revealVoterIdentities) {
      room.lastVoteTally = { tallies, abstainCount, voterDetails };
    } else {
      room.lastVoteTally = { tallies, abstainCount };
    }

    const { outcome } = tallyDayVotes(room.gameState);
    room.publicHistoryLogs.push(outcome.reason);

    if (outcome.type === 'RUNOFF' && outcome.candidateIds) {
      // Hòa phiếu -> Vòng Runoff
      room.gameState.phase = 'DAY_RUNOFF';
      this.timerManager.startMayorElectionTimer(
        room,
        () => {
          this.finalizeRunoffVote(room);
        },
        30
      );
      this.broadcastRoom(room);
      return;
    }

    const targetPlayerId = outcome.type === 'EXECUTE' ? (outcome.targetPlayerId ?? null) : null;
    const { nextState, winOutcome } = executeDayVote(room.gameState, targetPlayerId);
    room.gameState = nextState;

    if (winOutcome) {
      room.gameState.phase = 'GAME_OVER';
      this.timerManager.clearRoomTimer(room);
      this.broadcastRoom(room);
      return;
    }

    const roundDeaths = room.gameState.deaths.filter(
      (d) => d.roundNumber === room.gameState!.roundNumber && d.phase === 'NIGHT'
    );
    if (roundDeaths.length > 0) {
      room.publicHistoryLogs.push(`Trời đã sáng. Đêm qua có ${roundDeaths.length} người ngã xuống!`);
    } else {
      room.publicHistoryLogs.push('Trời đã sáng. Một đêm bình yên, không ai ngã xuống!');
    }

    if (room.gameState.phase === 'HUNTER_SHOT') {
      this.timerManager.startHunterShotTimer(room, () => {
        this.handleHunterTimeout(room);
      });
      this.broadcastRoom(room);
      return;
    }

    if (room.gameState.phase === 'MAYOR_SUCCESSION') {
      this.timerManager.startMayorSuccessionTimer(room, () => {
        this.handleMayorSuccessionTimeout(room);
      });
      this.broadcastRoom(room);
      return;
    }

    if (room.gameState.phase === 'NIGHT') {
      this.startNewNight(room);
    }
  }

  /**
   * Chốt biểu quyết Runoff.
   */
  private finalizeRunoffVote(room: RoomState): void {
    const queue = this.roomService.getCommandQueue(room.roomCode);
    void queue.enqueue(async () => {
      if (!room.gameState) return;

      const livingVoters = room.gameState.players.filter((p) => p.isAlive && p.voteWeight > 0);
      const runoffWeights = new Map<PlayerId, number>();
      const tallies: Record<PlayerId, number> = {};
      const voterDetails: Record<PlayerId, PlayerId[]> = {};
      let abstainCount = 0;

      for (const voter of livingVoters) {
        const targetId = room.gameState.dayState?.runoffBallots?.[voter.id];
        if (!targetId) {
          abstainCount += voter.voteWeight;
        } else {
          runoffWeights.set(targetId, (runoffWeights.get(targetId) ?? 0) + voter.voteWeight);
          tallies[targetId] = (tallies[targetId] ?? 0) + voter.voteWeight;
          if (!voterDetails[targetId]) voterDetails[targetId] = [];
          voterDetails[targetId].push(voter.id);
        }
      }

      if (room.settings.revealVoterIdentities) {
        room.lastVoteTally = { tallies, abstainCount, voterDetails };
      } else {
        room.lastVoteTally = { tallies, abstainCount };
      }

      let executeTargetId: PlayerId | null = null;
      if (runoffWeights.size > 0) {
        const sorted = Array.from(runoffWeights.entries()).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 1 || (sorted[0] && sorted[1] && sorted[0][1] > sorted[1][1])) {
          executeTargetId = sorted[0][0];
        }
      }

      const { nextState, winOutcome } = executeDayVote(room.gameState, executeTargetId);
      room.gameState = nextState;

      if (winOutcome) {
        room.gameState.phase = 'GAME_OVER';
        this.timerManager.clearRoomTimer(room);
        this.broadcastRoom(room);
        return;
      }

      if (room.gameState.phase === 'HUNTER_SHOT') {
        this.timerManager.startHunterShotTimer(room, () => {
          this.handleHunterTimeout(room);
        });
        this.broadcastRoom(room);
        return;
      }

      if (room.gameState.phase === 'NIGHT') {
        this.startNewNight(room);
      }
    });
  }

  /**
   * Bắt đầu một Đêm mới:
   */
  private startNewNight(room: RoomState): void {
    if (!room.gameState) return;

    room.nightTurnPlan = generateNightTurnPlan(room.gameState);
    room.currentNightTurnIndex = 0;
    room.nightActionsAccumulator = {};
    room.nightActionAcks.clear();
    room.seerInvestigationResult = undefined;
    room.sorcererInvestigationResult = undefined;
    room.auraInvestigationResult = undefined;
    room.foxInvestigationResult = undefined;
    room.piInvestigationResult = undefined;

    this.startCurrentNightTurnTimer(room);
    this.broadcastRoom(room);
  }

  /**
   * Xử lý timeout Thợ săn (tự động tính là bắn trượt).
   */
  private handleHunterTimeout(room: RoomState): void {
    const queue = this.roomService.getCommandQueue(room.roomCode);
    void queue.enqueue(async () => {
      if (!room.gameState || room.gameState.phase !== 'HUNTER_SHOT') return;

      const { nextState, winOutcome } = executeHunterShot(room.gameState, null);
      room.gameState = nextState;
      this.routePostHunterPhase(room, winOutcome);
    });
  }

  /**
   * Xử lý timeout Mayor Succession (mất danh hiệu Trưởng làng).
   */
  private handleMayorSuccessionTimeout(room: RoomState): void {
    const queue = this.roomService.getCommandQueue(room.roomCode);
    void queue.enqueue(async () => {
      if (!room.gameState || room.gameState.phase !== 'MAYOR_SUCCESSION') return;

      const { nextState, winOutcome } = executeMayorSuccession(room.gameState, null);
      room.gameState = nextState;
      this.routePostMayorSuccessionPhase(room, winOutcome);
    });
  }

  private routePostHunterPhase(room: RoomState, winOutcome: unknown): void {
    if (winOutcome || room.gameState?.phase === 'GAME_OVER') {
      this.timerManager.clearRoomTimer(room);
      this.broadcastRoom(room);
      return;
    }

    if (room.gameState?.phase === 'MAYOR_SUCCESSION') {
      this.timerManager.startMayorSuccessionTimer(room, () => {
        this.handleMayorSuccessionTimeout(room);
      });
      this.broadcastRoom(room);
      return;
    }

    if (room.gameState?.phase === 'NIGHT') {
      this.startNewNight(room);
      return;
    }

    if (room.gameState?.phase === 'DAY_DISCUSS') {
      this.startDayDiscussion(room);
      this.broadcastRoom(room);
      return;
    }

    this.broadcastRoom(room);
  }

  private routePostMayorSuccessionPhase(room: RoomState, winOutcome: unknown): void {
    if (winOutcome || room.gameState?.phase === 'GAME_OVER') {
      this.timerManager.clearRoomTimer(room);
      this.broadcastRoom(room);
      return;
    }

    if (room.gameState?.phase === 'NIGHT') {
      this.startNewNight(room);
      return;
    }

    if (room.gameState?.phase === 'DAY_DISCUSS') {
      this.startDayDiscussion(room);
      this.broadcastRoom(room);
      return;
    }

    this.broadcastRoom(room);
  }

  private handleTimerExpiry(room: RoomState): void {
    if (!room.gameState) return;
    const phase = room.gameState.phase;

    if (phase === 'NIGHT') {
      this.advanceNightTurn(room);
    } else if (phase === 'DAY_DISCUSS') {
      this.finalizeDayVote(room);
    } else if (phase === 'DAY_RUNOFF') {
      this.finalizeRunoffVote(room);
    } else if (phase === 'DAY_MAYOR_ELECTION') {
      this.finalizeMayorElection(room);
    } else if (phase === 'HUNTER_SHOT') {
      this.handleHunterTimeout(room);
    } else if (phase === 'MAYOR_SUCCESSION') {
      this.handleMayorSuccessionTimeout(room);
    }
  }

  // -------------------------------------------------------------
  // Helpers & Projections Broadcast
  // -------------------------------------------------------------

  /**
   * Áp dụng hành động đêm của từng vai vào NightActions Accumulator.
   */
  private applyNightAction(
    room: RoomState,
    playerId: PlayerId,
    turnKey: string,
    action: ClientNightActionPayload['action']
  ): void {
    const acc = room.nightActionsAccumulator;
    const gameState = room.gameState;
    if (!gameState) return;

    switch (turnKey) {
      case 'cupid':
        if (action.target1 && action.target2) {
          acc.cupid = { target1: action.target1, target2: action.target2 };
        }
        break;

      case 'bodyguard':
        if (action.targetId) {
          acc.bodyguard = { targetId: action.targetId };
        }
        break;

      case 'wolf_pack':
        if (!acc.wolfPack) {
          acc.wolfPack = { individualVotes: {} };
        }
        if (!acc.wolfPack.individualVotes) {
          acc.wolfPack.individualVotes = {};
        }
        acc.wolfPack.individualVotes[playerId] = action.isSkip ? null : (action.targetId ?? null);
        break;

      case 'white_wolf':
        acc.whiteWolf = { targetId: action.targetId ?? null };
        break;

      case 'seer':
        if (action.targetId) {
          acc.seer = { targetId: action.targetId };
          const target = gameState.players.find((p) => p.id === action.targetId);
          if (target) {
            const def = ROLES_BY_ID[target.roleId];
            room.seerInvestigationResult = {
              targetId: action.targetId,
              result: def?.seerResult ?? 'VILLAGER',
            };
          }
        }
        break;

      case 'sorcerer':
        if (action.targetId) {
          acc.sorcerer = { targetId: action.targetId };
          const target = gameState.players.find((p) => p.id === action.targetId);
          if (target) {
            room.sorcererInvestigationResult = {
              targetId: action.targetId,
              isSeer: target.roleId === 'seer',
            };
          }
        }
        break;

      case 'witch':
        acc.witch = {
          heal: action.heal,
          healTargetId: action.healTargetId ?? null,
          poisonTargetId: action.poisonTargetId ?? null,
        };
        break;

      case 'wild_child':
      case 'night_wild_child':
        if (action.targetId) {
          acc.wildChild = { targetId: action.targetId };
        }
        break;

      case 'dire_wolf':
      case 'night_dire_wolf':
        if (action.targetId) {
          acc.direWolf = { targetId: action.targetId };
        }
        break;

      case 'hoodlum':
      case 'night_hoodlum':
        if (action.target1 && action.target2) {
          acc.hoodlum = { target1: action.target1, target2: action.target2 };
        }
        break;

      case 'mason':
      case 'night_mason':
        // Xác nhận lượt (acknowledgement)
        break;

      case 'wolf_accursed':
      case 'night_wolf_accursed':
        acc.accursedWolf = { curseTargetId: action.curseTargetId ?? null };
        break;

      case 'big_bad_wolf':
      case 'night_big_bad_wolf':
        acc.bigBadWolf = { targetId: action.targetId ?? null };
        break;

      case 'aura_seer':
      case 'night_aura_seer':
        if (action.targetId) {
          acc.auraSeer = { targetId: action.targetId };
          const target = gameState.players.find((p) => p.id === action.targetId);
          if (target) {
            const isSpecial = target.roleId !== 'villager' && target.roleId !== 'werewolf';
            room.auraInvestigationResult = {
              targetId: action.targetId,
              result: isSpecial ? 'SPECIAL' : 'NORMAL',
            };
          }
        }
        break;

      case 'pi':
      case 'night_pi':
        if (action.targetId) {
          acc.pi = { targetId: action.targetId };
          const neighbors = getAliveNeighbors(gameState.players, action.targetId);
          const group = neighbors ? neighbors.group : [];
          const inspectedPlayerIds = group.map((p) => p.id);
          const hasWerewolf = group.some((p) => isWerewolfForInvestigation(p));
          room.piInvestigationResult = {
            targetId: action.targetId,
            hasWerewolf,
            inspectedPlayerIds,
          };
        }
        break;

      case 'fox':
      case 'night_fox':
        acc.fox = { targetId: action.targetId ?? '', isSkip: action.isSkip };
        if (action.targetId && !action.isSkip) {
          const neighbors = getAliveNeighbors(gameState.players, action.targetId);
          const group = neighbors ? neighbors.group : [];
          const inspectedPlayerIds = group.map((p) => p.id);
          const hasWerewolf = group.some((p) => isWerewolfForInvestigation(p));
          room.foxInvestigationResult = {
            targetId: action.targetId,
            hasWerewolf,
            inspectedPlayerIds,
          };
        }
        break;

      case 'spellcaster':
      case 'night_spellcaster':
        if (action.targetId) {
          acc.spellcaster = { targetId: action.targetId };
        }
        break;

      case 'troublemaker':
      case 'night_troublemaker':
        acc.troublemaker = { activate: Boolean(action.activate) };
        break;

      case 'doppelganger':
      case 'night_doppelganger':
        if (action.targetId) {
          acc.doppelganger = { targetId: action.targetId };
        }
        break;

      case 'pied_piper':
      case 'night_pied_piper':
        if (action.targetIds) {
          acc.piedPiper = { targetIds: action.targetIds };
        }
        break;

      case 'cult_leader':
      case 'night_cult_leader':
        if (action.targetId) {
          acc.cultLeader = { targetId: action.targetId };
        }
        break;
    }
  }

  /**
   * Broadcast toàn bộ projections tương ứng tới đúng client trong phòng.
   */
  public broadcastRoom(room: RoomState): void {
    // 1. Public Room View (gửi tới toàn phòng)
    const publicView = createPublicRoomView(room);
    this.io.to(room.roomCode).emit('room:publicSnapshot', publicView);

    // 2. Timer Snapshot
    const timerSnapshot = this.timerManager.createTimerSnapshot(room);
    this.io.to(room.roomCode).emit('timer:snapshot', timerSnapshot);

    // 3. Host Board View (chỉ gửi riêng cho Host)
    if (room.host.socketId) {
      const hostView = createHostBoardView(room);
      this.io.to(room.host.socketId).emit('room:hostSnapshot', hostView);
    }

    // 4. Player Private Views (chỉ gửi vai riêng cho từng người chơi)
    for (const player of room.players.values()) {
      this.sendPrivateView(room, player);
    }

    // 5. Post Game View (nếu GAME_OVER)
    if (room.gameState?.phase === 'GAME_OVER') {
      const postGameView = createPostGameView(room);
      if (postGameView) {
        this.io.to(room.roomCode).emit('game:postGame', postGameView);
      }
    }
  }

  private sendPrivateView(room: RoomState, player: RoomPlayer): void {
    if (!player.socketId) return;
    const privateView = createPlayerPrivateView(room, player.id);
    if (privateView) {
      this.io.to(player.socketId).emit('room:playerSnapshot', privateView);
    }
  }

  private findPlayerByToken(room: RoomState, token: string): RoomPlayer | undefined {
    for (const player of room.players.values()) {
      if (player.playerToken && player.playerToken === token) {
        return player;
      }
    }
    return undefined;
  }

  private runInQueue<T>(
    roomCode: string,
    cb: ((res: ServerResponse<T>) => void) | undefined,
    task: (room: RoomState) => Promise<T>
  ): void {
    const room = this.roomService.getRoom(roomCode);
    if (!room) {
      this.sendError(cb, 'ROOM_NOT_FOUND', 'Bàn chưa tồn tại hoặc đã kết thúc.');
      return;
    }

    const queue = this.roomService.getCommandQueue(roomCode);
    void queue
      .enqueue(async () => {
        return task(room);
      })
      .then((data) => {
        this.sendOk(cb, data);
      })
      .catch((err: unknown) => {
        if (
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          'message' in err &&
          typeof (err as { code: string }).code === 'string' &&
          typeof (err as { message: string }).message === 'string'
        ) {
          const typedErr = err as { code: ServerErrorCode; message: string };
          this.sendError(cb, typedErr.code, typedErr.message);
        } else {
          const message = err instanceof Error ? err.message : 'Lỗi xử lý yêu cầu.';
          this.sendError(cb, 'INTERNAL_ERROR', message);
        }
      });
  }

  private sendOk<T>(cb: ((res: ServerResponse<T>) => void) | undefined, data: T): void {
    if (cb) {
      cb({ ok: true, data });
    }
  }

  private sendError<T = unknown>(
    cb: ((res: ServerResponse<T>) => void) | undefined,
    code: ServerErrorCode,
    message: string
  ): void {
    if (cb) {
      cb({ ok: false, error: { code, message } });
    }
  }
}
