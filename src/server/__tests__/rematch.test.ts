import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { RoomService } from '../roomService';
import { TimerManager } from '../timerManager';
import { SocketGateway } from '../socketGateway';
import { createMockIoServer, type MockSocketIOServer, type MockClientSocket } from './mockSocket';
import { createPostGameView, createPublicRoomView } from '../projections';
import { executeDayVote, executeNightPhase } from '../../engine/gameEngine';

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

    // 3. Phòng trở về LOBBY sạch sẽ để chỉnh lại cấu hình trước khi bắt đầu ván mới
    expect(room.gameState).toBeNull();
    expect(room.timers.phase).toBe('LOBBY');
    expect(room.timers.deadlineAt).toBeNull();
    expect(room.nightTurnPlan).toEqual([]);
    expect(room.currentNightTurnIndex).toBe(0);
    expect(room.publicHistoryLogs).toEqual([]);
  });

  it('rematch giữ lại settings.customDeck và dọn sạch toàn bộ *InvestigationResult', async () => {
    const { hostClient, roomCode, hostToken, players, room } = await setupGameOverGame();

    const customDeck = {
      werewolf: 1,
      seer: 1,
      aura_seer: 1,
      fox: 1,
      villager: 2,
    };
    room.settings.customDeck = customDeck;
    room.seerInvestigationResult = { targetId: players[0].id, result: 'WEREWOLF' };
    room.sorcererInvestigationResult = { targetId: players[0].id, isSeer: false };
    room.auraInvestigationResult = { targetId: players[0].id, result: 'SPECIAL' };
    room.foxInvestigationResult = { targetId: players[0].id, hasWerewolf: true, inspectedPlayerIds: [] };
    room.piInvestigationResult = { targetId: players[0].id, hasWerewolf: false, inspectedPlayerIds: [] };

    const rematchRes: any = await new Promise((resolve) => {
      hostClient.emit('host:rematch', { roomCode, token: hostToken }, resolve);
    });
    expect(rematchRes.ok).toBe(true);

    expect(room.gameState).toBeNull();
    expect(room.timers.phase).toBe('LOBBY');
    expect(room.seerInvestigationResult).toBeUndefined();
    expect(room.sorcererInvestigationResult).toBeUndefined();
    expect(room.auraInvestigationResult).toBeUndefined();
    expect(room.foxInvestigationResult).toBeUndefined();
    expect(room.piInvestigationResult).toBeUndefined();
    expect(room.settings.customDeck).toEqual(customDeck);
  });

  it('rematch dọn sạch publicTimeline, morningAnnouncements và postGameView sau khi ván cũ có dữ liệu', async () => {
    const { hostClient, roomCode, hostToken, room } = await setupGameOverGame();
    const villager = room.gameState!.players.find((p) => p.roleId === 'villager')!;

    room.gameState!.phase = 'NIGHT';
    room.gameState = executeNightPhase(room.gameState!, {
      wolfPack: { targets: [villager.id] },
    }).nextState;
    room.gameState = executeDayVote(room.gameState!, null).nextState;
    room.gameState!.phase = 'GAME_OVER';
    room.gameState!.roundNumber = 1;

    // Trước khi rematch: các projection log & post-game đều có dữ liệu
    const pubBefore = createPublicRoomView(room);
    expect(pubBefore.publicTimeline.length).toBeGreaterThan(0);
    expect(pubBefore.morningAnnouncements.length).toBeGreaterThan(0);
    expect(createPostGameView(room)).not.toBeNull();
    expect(createPostGameView(room)!.matchEvents.length).toBeGreaterThan(0);

    const rematchRes: any = await new Promise((resolve) => {
      hostClient.emit('host:rematch', { roomCode, token: hostToken }, resolve);
    });
    expect(rematchRes.ok).toBe(true);

    const pubAfter = createPublicRoomView(room);
    expect(pubAfter.publicTimeline).toEqual([]);
    expect(pubAfter.morningAnnouncements).toEqual([]);
    expect(pubAfter.publicLogs).toEqual([]);
    expect(createPostGameView(room)).toBeNull();
    expect(room.publicHistoryLogs).toEqual([]);
  });
});
