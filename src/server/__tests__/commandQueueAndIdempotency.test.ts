import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { createInitialDayState } from '../../engine/voting';
import { RoomService } from '../roomService';
import { TimerManager } from '../timerManager';
import { SocketGateway } from '../socketGateway';
import { createMockIoServer, type MockSocketIOServer, type MockClientSocket } from './mockSocket';

describe('Realtime Backend - Command Queue & Idempotency', () => {
  let mockIo: MockSocketIOServer;
  let roomService: RoomService;
  let timerManager: TimerManager;
  let gateway: SocketGateway;
  const clientSockets: MockClientSocket[] = [];

  beforeEach(() => {
    mockIo = createMockIoServer();
    roomService = new RoomService();
    // Đặt fake delay đêm 5s
    timerManager = new TimerManager({ minNightDelaySec: 5, maxNightDelaySec: 5 });
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

  /**
   * Helper tạo phòng 6 người chơi và bắt đầu ván đấu với role chỉ định.
   */
  const setupSixPlayerGame = async (
    roles: string[] = ['werewolf', 'werewolf', 'seer', 'witch', 'villager', 'villager']
  ) => {
    const hostClient = createClient();
    const createRes: any = await new Promise((resolve) => {
      hostClient.emit('room:create', { isPlayer: false }, resolve);
    });
    const roomCode = createRes.data.roomCode;
    const hostToken = createRes.data.hostToken;

    const players: Array<{ client: MockClientSocket; token: string; id: string; name: string }> = [];

    for (let i = 1; i <= 6; i++) {
      const client = createClient();
      const joinRes: any = await new Promise((resolve) => {
        client.emit('room:join', { roomCode, username: `Player ${i}` }, resolve);
      });
      players.push({
        client,
        token: joinRes.data.playerToken,
        id: joinRes.data.playerId,
        name: `Player ${i}`,
      });
    }

    const startRes: any = await new Promise((resolve) => {
      hostClient.emit(
        'lobby:start',
        { roomCode, token: hostToken, customRoleIds: roles },
        resolve
      );
    });
    expect(startRes.ok).toBe(true);

    return { hostClient, roomCode, hostToken, players };
  };

  it('tuần tự hóa các lệnh gửi cùng lúc qua Room Command Queue', async () => {
    const { roomCode, hostToken, hostClient } = await setupSixPlayerGame();
    const queue = roomService.getCommandQueue(roomCode);

    const executionOrder: number[] = [];

    // Đẩy 3 tác vụ bất đồng bộ cùng lúc
    const p1 = queue.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 20));
      executionOrder.push(1);
      return 1;
    });

    const p2 = queue.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 10));
      executionOrder.push(2);
      return 2;
    });

    const p3 = queue.enqueue(async () => {
      executionOrder.push(3);
      return 3;
    });

    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual([1, 2, 3]);
    // Phải được thực thi tuần tự FIFO 1 -> 2 -> 3
    expect(executionOrder).toEqual([1, 2, 3]);
  });

  it('từ chối gửi đúp hành động trong cùng một lượt đêm (ALREADY_ACTED)', async () => {
    const { roomCode, players } = await setupSixPlayerGame();
    const room = roomService.getRoom(roomCode)!;

    // Tìm xem ai là Seer
    const seerPlayerState = room.gameState!.players.find((p) => p.roleId === 'seer')!;
    const seer = players.find((p) => p.id === seerPlayerState.id)!;

    // Tua lượt đêm đến lượt của Seer
    const seerTurnIndex = room.nightTurnPlan.findIndex((t) => t.turnKey === 'seer');
    expect(seerTurnIndex).toBeGreaterThanOrEqual(0);
    room.currentNightTurnIndex = seerTurnIndex;
    room.nightActionAcks.clear();

    const target = players.find((p) => p.id !== seer.id)!;

    // Gửi hành động lần 1 -> Thành công
    const res1: any = await new Promise((resolve) => {
      seer.client.emit(
        'night:action',
        {
          roomCode,
          token: seer.token,
          roleId: 'seer',
          action: { targetId: target.id },
        },
        resolve
      );
    });
    expect(res1.ok).toBe(true);

    // Gửi hành động lần 2 ngay lập tức (double-click / double-submit) -> Bị từ chối ALREADY_ACTED
    const res2: any = await new Promise((resolve) => {
      seer.client.emit(
        'night:action',
        {
          roomCode,
          token: seer.token,
          roleId: 'seer',
          action: { targetId: target.id },
        },
        resolve
      );
    });
    expect(res2.ok).toBe(false);
    expect(res2.error.code).toBe('ALREADY_ACTED');
  });

  it('từ chối gửi đúp phiếu bầu biểu quyết ban ngày (ALREADY_VOTED)', async () => {
    const { roomCode, players } = await setupSixPlayerGame();
    const room = roomService.getRoom(roomCode)!;

    // Chuyển phase sang DAY_DISCUSS và mở khóa vote
    room.gameState!.phase = 'DAY_DISCUSS';
    room.gameState!.dayState = createInitialDayState();
    room.gameState!.dayState.voteLocked = false;
    room.gameState!.dayState.voteLockRemainingSeconds = 0;

    const voter = players[0];
    const candidate = players[1];

    // Gửi vote lần 1 -> Thành công
    const res1: any = await new Promise((resolve) => {
      voter.client.emit(
        'day:vote',
        {
          roomCode,
          token: voter.token,
          targetPlayerId: candidate.id,
        },
        resolve
      );
    });
    expect(res1.ok).toBe(true);

    // Gửi vote lần 2 -> Bị từ chối ALREADY_VOTED (luật không cho đổi phiếu)
    const res2: any = await new Promise((resolve) => {
      voter.client.emit(
        'day:vote',
        {
          roomCode,
          token: voter.token,
          targetPlayerId: players[2].id,
        },
        resolve
      );
    });
    expect(res2.ok).toBe(false);
    expect(res2.error.code).toBe('ALREADY_VOTED');
  });
});
