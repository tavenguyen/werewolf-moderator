import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { RoomService } from '../roomService';
import { TimerManager } from '../timerManager';
import { SocketGateway } from '../socketGateway';
import { createMockIoServer, type MockSocketIOServer, type MockClientSocket } from './mockSocket';
import {
  createHostBoardView,
  createPlayerPrivateView,
  createPostGameView,
  createPublicRoomView,
} from '../projections';
import type { HostBoardView, PlayerPrivateView, PublicRoomView } from '../types';

describe('Realtime Backend - Projection Secrecy & Information Hiding', () => {
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

  const setupGame = async (
    roles: string[] = ['werewolf', 'werewolf', 'seer', 'witch', 'villager', 'villager']
  ) => {
    const hostClient = createClient();
    const createRes: any = await new Promise((resolve) => {
      hostClient.emit('room:create', { isPlayer: false }, resolve);
    });
    const roomCode = createRes.data.roomCode;
    const hostToken = createRes.data.hostToken;

    const players: Array<{ client: MockClientSocket; token: string; id: string }> = [];

    for (let i = 1; i <= 6; i++) {
      const client = createClient();
      const joinRes: any = await new Promise((resolve) => {
        client.emit('room:join', { roomCode, username: `Player ${i}` }, resolve);
      });
      players.push({
        client,
        token: joinRes.data.playerToken,
        id: joinRes.data.playerId,
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

  it('publicRoomView tuyệt đối không chứa vai trò của người chơi còn sống', async () => {
    const { roomCode } = await setupGame();
    const room = roomService.getRoom(roomCode)!;

    const publicView: PublicRoomView = createPublicRoomView(room);

    expect(publicView.players.length).toBe(6);
    for (const p of publicView.players) {
      // Đảm bảo không có trường roleId, initialRoleId hay faction
      expect((p as any).roleId).toBeUndefined();
      expect((p as any).initialRoleId).toBeUndefined();
      expect((p as any).faction).toBeUndefined();
      expect(p.isAlive).toBe(true);
      expect(p.name).toBeDefined();
    }
  });

  it('hostBoardView của Host Bảng trung tâm không có vai trò người chơi còn sống', async () => {
    const { roomCode } = await setupGame();
    const room = roomService.getRoom(roomCode)!;

    const hostView: HostBoardView = createHostBoardView(room);

    expect(hostView.isHostPlayer).toBe(false);
    for (const p of hostView.publicRoom.players) {
      expect((p as any).roleId).toBeUndefined();
      expect((p as any).faction).toBeUndefined();
    }
  });

  it('playerPrivateView chỉ chứa vai trò của chính người chơi đó và bảo mật với người khác', async () => {
    const { roomCode, players } = await setupGame([
      'werewolf',
      'werewolf',
      'seer',
      'witch',
      'villager',
      'villager',
    ]);
    const room = roomService.getRoom(roomCode)!;

    // Tìm Seer
    const seerPlayer = room.gameState!.players.find((p) => p.roleId === 'seer')!;
    const seerView: PlayerPrivateView | null = createPlayerPrivateView(room, seerPlayer.id);

    expect(seerView).not.toBeNull();
    expect(seerView!.roleId).toBe('seer');
    expect(seerView!.faction).toBe('VILLAGER');
    // Dân/Tiên tri không có danh sách đồng đội
    expect(seerView!.teammates).toEqual([]);

    // Tìm Sói 1
    const wolf1 = room.gameState!.players.find((p) => p.roleId === 'werewolf')!;
    const wolf1View: PlayerPrivateView | null = createPlayerPrivateView(room, wolf1.id);

    expect(wolf1View).not.toBeNull();
    expect(wolf1View!.roleId).toBe('werewolf');
    expect(wolf1View!.faction).toBe('WEREWOLF');
    // Bầy sói thấy con sói còn lại trong teammates
    expect(wolf1View!.teammates.length).toBe(1);
    expect(wolf1View!.teammates[0].roleId).toBe('werewolf');
  });

  it('kết quả soi Tiên tri chỉ phát cho Tiên tri, không xuất hiện trong public snapshot hay host', async () => {
    const { roomCode, players } = await setupGame();
    const room = roomService.getRoom(roomCode)!;

    const seerPlayerState = room.gameState!.players.find((p) => p.roleId === 'seer')!;
    const seer = players.find((p) => p.id === seerPlayerState.id)!;
    const wolfTarget = room.gameState!.players.find((p) => p.roleId === 'werewolf')!;

    // Tua tới lượt Seer
    const seerTurnIndex = room.nightTurnPlan.findIndex((t) => t.turnKey === 'seer');
    room.currentNightTurnIndex = seerTurnIndex;
    room.nightActionAcks.clear();

    // Tiên tri soi sói
    const res: any = await new Promise((resolve) => {
      seer.client.emit(
        'night:action',
        {
          roomCode,
          token: seer.token,
          roleId: 'seer',
          action: { targetId: wolfTarget.id },
        },
        resolve
      );
    });
    expect(res.ok).toBe(true);

    // Kiểm tra kết quả trong private view của Seer
    const seerView = createPlayerPrivateView(room, seer.id);
    expect(seerView?.investigationResult).toBeDefined();
    expect(seerView?.investigationResult?.targetId).toBe(wolfTarget.id);
    expect(seerView?.investigationResult?.result).toBe('WEREWOLF');

    // Kiểm tra Public View và Host View hoàn toàn KHÔNG có kết quả soi
    const publicView = createPublicRoomView(room);
    expect((publicView as any).seerInvestigationResult).toBeUndefined();
    expect((publicView as any).investigationResult).toBeUndefined();

    const hostView = createHostBoardView(room);
    expect((hostView as any).seerInvestigationResult).toBeUndefined();
  });

  it('postGameView chỉ khả dụng khi ván kết thúc (GAME_OVER)', async () => {
    const { roomCode } = await setupGame();
    const room = roomService.getRoom(roomCode)!;

    // Khi đang chơi: postGameView phải là null
    expect(createPostGameView(room)).toBeNull();

    // Kết thúc ván
    room.gameState!.phase = 'GAME_OVER';
    const postGame = createPostGameView(room);

    expect(postGame).not.toBeNull();
    expect(postGame!.allRoles.length).toBe(6);
    // Sau khi kết thúc, toàn bộ vai trò được công bố
    for (const r of postGame!.allRoles) {
      expect(r.initialRoleId).toBeDefined();
      expect(r.finalRoleId).toBeDefined();
      expect(r.faction).toBeDefined();
    }
  });

  it('F-01: publicRoomView không bị rò rỉ các log đêm nhạy cảm', async () => {
    const { roomCode } = await setupGame();
    const room = roomService.getRoom(roomCode)!;

    // Giả lập gameState.historyLogs có chứa các log đêm bí mật
    room.gameState!.historyLogs.push(
      'Thần tình yêu đã kết nối mũi tên định mệnh cho một cặp đôi trong làng.',
      'Phù thủy đã sử dụng bình thuốc độc bí ẩn.',
      'Một Ma sói đã ngã xuống; thế lực bóng đêm đang âm thầm trỗi dậy.',
      'Già làng chịu 1 vết cắn, còn 1 giáp.'
    );

    const publicView = createPublicRoomView(room);

    // publicLogs không được chứa các log đêm nhạy cảm này
    for (const log of publicView.publicLogs) {
      expect(log).not.toContain('Phù thủy đã sử dụng bình thuốc');
      expect(log).not.toContain('Thần tình yêu');
      expect(log).not.toContain('Già làng chịu 1 vết cắn');
    }
  });

  it('F-03: witchKnowsVictim hiển thị nạn nhân bị sói cắn cho Phù thủy', async () => {
    const { roomCode, players } = await setupGame([
      'werewolf',
      'werewolf',
      'seer',
      'witch',
      'villager',
      'villager',
    ]);
    const room = roomService.getRoom(roomCode)!;
    room.settings.witchKnowsVictim = true;

    const wolf1 = room.gameState!.players.find((p) => p.roleId === 'werewolf')!;
    const witch = room.gameState!.players.find((p) => p.roleId === 'witch')!;
    const victim = room.gameState!.players.find((p) => p.roleId === 'villager')!;

    // Bầy Sói gửi vote cắn victim
    room.nightActionsAccumulator.wolfPack = {
      individualVotes: {
        [wolf1.id]: victim.id,
      },
    };

    // Đưa tới lượt Phù thủy
    const witchTurnIdx = room.nightTurnPlan.findIndex((t) => t.turnKey === 'witch');
    expect(witchTurnIdx).toBeGreaterThanOrEqual(0);
    room.currentNightTurnIndex = witchTurnIdx;
    room.nightActionAcks.clear();

    const witchView = createPlayerPrivateView(room, witch.id);
    expect(witchView).not.toBeNull();
    // Phù thủy phải thấy nạn nhân là victim.id
    expect(witchView!.skills.witchVictimId).toBe(victim.id);
  });

  it('F-09: Ma sói thường nhìn thấy Sói trắng với vai trò hiển thị là werewolf', async () => {
    const { roomCode } = await setupGame([
      'werewolf',
      'white_wolf',
      'seer',
      'witch',
      'villager',
      'villager',
    ]);
    const room = roomService.getRoom(roomCode)!;

    const regularWolf = room.gameState!.players.find((p) => p.roleId === 'werewolf')!;
    const whiteWolf = room.gameState!.players.find((p) => p.roleId === 'white_wolf')!;

    // 1. Ma sói thường nhìn đồng đội Sói trắng: phải hiển thị roleId = 'werewolf'
    const regularWolfView = createPlayerPrivateView(room, regularWolf.id);
    expect(regularWolfView).not.toBeNull();
    const teammateWhiteWolf = regularWolfView!.teammates.find((t) => t.id === whiteWolf.id);
    expect(teammateWhiteWolf).toBeDefined();
    expect(teammateWhiteWolf!.roleId).toBe('werewolf'); // Masked!

    // 2. Chính Sói trắng nhìn vai của mình: vẫn là 'white_wolf'
    const whiteWolfView = createPlayerPrivateView(room, whiteWolf.id);
    expect(whiteWolfView).not.toBeNull();
    expect(whiteWolfView!.roleId).toBe('white_wolf');
  });
});
