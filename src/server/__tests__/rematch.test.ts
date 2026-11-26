import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { RoomService } from '../roomService';
import { TimerManager } from '../timerManager';
import { SocketGateway } from '../socketGateway';
import { createMockIoServer, type MockSocketIOServer, type MockClientSocket } from './mockSocket';

describe('Realtime Backend - Rematch Lifecycle', () => {
  let mockIo: MockSocketIOServer;
  let roomService: RoomService;
  let timerManager: TimerManager;
  let gateway: SocketGateway;
  const clientSockets: MockClientSocket[] = [];

  beforeEach(() => {
    mockIo = createMockIoServer();
    roomService = new RoomService();
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

  const setupGameOverGame = async () => {
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

    // Start game
    await new Promise((resolve) => {
      hostClient.emit(
        'lobby:start',
        {
          roomCode,
          token: hostToken,
          customRoleIds: ['werewolf', 'werewolf', 'seer', 'witch', 'villager', 'villager'],
        },
        resolve
      );
    });

    const room = roomService.getRoom(roomCode)!;
    // Giả lập ván chơi kết thúc GAME_OVER
    room.gameState!.phase = 'GAME_OVER';

    return { hostClient, roomCode, hostToken, players, room };
  };

  it('từ chối rematch khi ván chưa kết thúc', async () => {
    const hostClient = createClient();
    const createRes: any = await new Promise((resolve) => {
      hostClient.emit('room:create', { isPlayer: false }, resolve);
    });
    const { roomCode, hostToken } = createRes.data;

    for (let i = 1; i <= 6; i++) {
      const client = createClient();
      await new Promise((resolve) => {
        client.emit('room:join', { roomCode, username: `P${i}` }, resolve);
      });
    }

    // Bắt đầu ván
    await new Promise((resolve) => {
      hostClient.emit('lobby:start', { roomCode, token: hostToken }, resolve);
    });

    // Khi đang chơi dở (phase NIGHT) -> Bấm rematch bị từ chối
    const rematchRes: any = await new Promise((resolve) => {
      hostClient.emit('host:rematch', { roomCode, token: hostToken }, resolve);
    });
    expect(rematchRes.ok).toBe(false);
  });

  it('từ chối rematch nếu không phải Host', async () => {
    const { roomCode, players } = await setupGameOverGame();

    // Player bình thường bấm rematch -> Bị từ chối NOT_HOST
    const rematchRes: any = await new Promise((resolve) => {
      players[0].client.emit('host:rematch', { roomCode, token: players[0].token }, resolve);
    });
    expect(rematchRes.ok).toBe(false);
    expect(rematchRes.error.code).toBe('NOT_HOST');
  });

  it('rematch thành công: giữ nguyên roster và tokens, tăng generation, reset trạng thái ván mới', async () => {
    const { hostClient, roomCode, hostToken, players, room } = await setupGameOverGame();

    // Ghi nhận thông tin ván cũ
    const oldGeneration = room.gameGeneration;
    const oldTokens = players.map((p) => p.token);
    const oldPlayerIds = players.map((p) => p.id);

    // Một số người đã chết ở ván cũ
    room.players.get(players[0].id)!.isAlive = false;
    room.players.get(players[1].id)!.isAlive = false;

    // Host kích hoạt Rematch
    const rematchRes: any = await new Promise((resolve) => {
      hostClient.emit('host:rematch', { roomCode, token: hostToken }, resolve);
    });
    expect(rematchRes.ok).toBe(true);
    expect(rematchRes.data.rematched).toBe(true);

    // 1. Kiểm tra generation tăng lên
    expect(room.gameGeneration).toBe(oldGeneration + 1);

    // 2. Kiểm tra roster và token giữ nguyên 100%
    expect(room.players.size).toBe(6);
    for (let i = 0; i < players.length; i++) {
      const roomPlayer = room.players.get(oldPlayerIds[i])!;
      expect(roomPlayer).toBeDefined();
      expect(roomPlayer.playerToken).toBe(oldTokens[i]);
      // Toàn bộ người chơi đều được hồi sinh
      expect(roomPlayer.isAlive).toBe(true);
    }

    // 3. Trạng thái ván mới sạch sẽ
    expect(room.gameState).toBeDefined();
    expect(room.gameState!.generation).toBe(oldGeneration + 1);
    expect(room.gameState!.phase).toBe('NIGHT');
    expect(room.gameState!.roundNumber).toBe(1);
    expect(room.gameState!.deaths).toEqual([]);
    expect(room.gameState!.witchHealUsed).toBe(false);
    expect(room.gameState!.witchPoisonUsed).toBe(false);

    // 4. Lượt đêm mới được tạo
    expect(room.nightTurnPlan.length).toBeGreaterThan(0);
    expect(room.currentNightTurnIndex).toBe(0);
    expect(room.timers.deadlineAt).toBeDefined();
  });

  it('rematch tôn trọng settings.customDeck và dọn sạch toàn bộ *InvestigationResult', async () => {
    const { hostClient, roomCode, hostToken, players, room } = await setupGameOverGame();

    room.settings.customDeck = {
      werewolf: 1,
      seer: 1,
      aura_seer: 1,
      fox: 1,
      villager: 2,
    };
    room.seerInvestigationResult = { targetId: players[0].id, result: 'WEREWOLF' };
    room.sorcererInvestigationResult = { targetId: players[0].id, isSeer: false };
    room.auraInvestigationResult = { targetId: players[0].id, result: 'SPECIAL' };
    room.foxInvestigationResult = { targetId: players[0].id, hasWerewolf: true, inspectedPlayerIds: [] };
    room.piInvestigationResult = { targetId: players[0].id, hasWerewolf: false, inspectedPlayerIds: [] };

    const rematchRes: any = await new Promise((resolve) => {
      hostClient.emit('host:rematch', { roomCode, token: hostToken }, resolve);
    });
    expect(rematchRes.ok).toBe(true);

    expect(room.seerInvestigationResult).toBeUndefined();
    expect(room.sorcererInvestigationResult).toBeUndefined();
    expect(room.auraInvestigationResult).toBeUndefined();
    expect(room.foxInvestigationResult).toBeUndefined();
    expect(room.piInvestigationResult).toBeUndefined();

    const roleCounts: Record<string, number> = {};
    for (const p of room.gameState!.players) {
      roleCounts[p.roleId] = (roleCounts[p.roleId] ?? 0) + 1;
    }
    expect(roleCounts).toEqual(room.settings.customDeck);
  });
});
