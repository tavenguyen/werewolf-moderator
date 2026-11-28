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
import { executeDayVote, executeHunterShot, executeNightPhase } from '../../engine/gameEngine';

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

  it('Phase 2 Projections: Mason, Wild Child, Dire Wolf, Hoodlum skills & targets', async () => {
    const { roomCode } = await setupGame();
    const room = roomService.getRoom(roomCode)!;

    const [p1, p2, p3, p4, p5, p6] = room.gameState!.players;
    p1.roleId = 'mason';
    p1.initialRoleId = 'mason';
    p1.faction = 'VILLAGER';
    p2.roleId = 'mason';
    p2.initialRoleId = 'mason';
    p2.faction = 'VILLAGER';
    p3.roleId = 'wild_child';
    p3.initialRoleId = 'wild_child';
    p3.roleModelId = p4.id;
    p4.roleId = 'dire_wolf';
    p4.initialRoleId = 'dire_wolf';
    p4.companionId = p5.id;
    p5.roleId = 'hoodlum';
    p5.initialRoleId = 'hoodlum';
    p5.hoodlumTargetIds = [p1.id, p2.id];

    // 1. Mason p1
    const p1View = createPlayerPrivateView(room, p1.id);
    expect(p1View).not.toBeNull();
    expect(p1View!.skills.masonPartnerIds).toEqual([p2.id]);
    expect(p1View!.teammates.some((t) => t.id === p2.id && t.roleId === 'mason')).toBe(true);

    // 2. Wild child p3
    const p3View = createPlayerPrivateView(room, p3.id);
    expect(p3View).not.toBeNull();
    expect(p3View!.skills.roleModelId).toBe(p4.id);

    // 3. Dire wolf p4
    const p4View = createPlayerPrivateView(room, p4.id);
    expect(p4View).not.toBeNull();
    expect(p4View!.skills.companionId).toBe(p5.id);

    // 4. Hoodlum p5
    const p5View = createPlayerPrivateView(room, p5.id);
    expect(p5View).not.toBeNull();
    expect(p5View!.skills.hoodlumTargetIds).toEqual([p1.id, p2.id]);
  });

  it('PublicRoomView.currentTurnInfo tuyệt đối không rò rỉ isFake hay canAct', async () => {
    const { roomCode } = await setupGame(['werewolf', 'seer', 'witch', 'villager', 'villager', 'villager']);
    const room = roomService.getRoom(roomCode)!;

    // Giả lập Seer đã chết -> lượt fake
    const seer = room.gameState!.players.find((p) => p.roleId === 'seer')!;
    seer.isAlive = false;
    room.nightTurnPlan = [
      {
        roleId: 'seer',
        turnKey: 'seer',
        priority: 40,
        titleVi: 'Tiên tri',
        titleEn: 'Seer',
        activePlayerIds: [],
        isFake: true,
        canAct: false,
        audioKey: 'night_seer',
      },
    ];
    room.currentNightTurnIndex = 0;

    const publicView = createPublicRoomView(room);
    expect(publicView.currentTurnInfo).toBeDefined();
    expect(publicView.currentTurnInfo!.turnKey).toBe('seer');
    expect((publicView.currentTurnInfo as Record<string, unknown>).isFake).toBeUndefined();
    expect((publicView.currentTurnInfo as Record<string, unknown>).canAct).toBeUndefined();
  });

  it('Cupid validTargets loại trừ bản thân khi allowCupidSelfMatch = false', async () => {
    const { roomCode } = await setupGame(['cupid', 'werewolf', 'seer', 'villager', 'villager', 'villager']);
    const room = roomService.getRoom(roomCode)!;
    const cupid = room.gameState!.players.find((p) => p.roleId === 'cupid')!;

    room.nightTurnPlan = [
      {
        roleId: 'cupid',
        turnKey: 'cupid',
        priority: 10,
        titleVi: 'Thần tình yêu',
        titleEn: 'Cupid',
        activePlayerIds: [cupid.id],
        isFake: false,
        canAct: true,
        audioKey: 'night_cupid',
      },
    ];
    room.currentNightTurnIndex = 0;

    // Mặc định allowCupidSelfMatch = true -> bao gồm Cupid
    const viewAllowed = createPlayerPrivateView(room, cupid.id)!;
    expect(viewAllowed.validTargets).toContain(cupid.id);

    // Tắt allowCupidSelfMatch = false -> loại trừ Cupid
    room.settings.allowCupidSelfMatch = false;
    const viewDisallowed = createPlayerPrivateView(room, cupid.id)!;
    expect(viewDisallowed.validTargets).not.toContain(cupid.id);
    expect(viewDisallowed.validTargets.length).toBe(5);
  });

  it('Witch nhận đủ witchVictimIds khi Sói cắn nhiều người và khóa bình thứ 2 khi allowWitchBothPotionsSameNight = false', async () => {
    const { roomCode } = await setupGame(['werewolf', 'wolf_cub', 'witch', 'villager', 'villager', 'villager']);
    const room = roomService.getRoom(roomCode)!;
    room.settings.witchKnowsVictim = true;
    room.settings.allowWitchBothPotionsSameNight = false;
    room.gameState!.wolfCubDoubleKillNextNight = true;

    const witch = room.gameState!.players.find((p) => p.roleId === 'witch')!;
    const villagers = room.gameState!.players.filter((p) => p.roleId === 'villager');

    room.nightActionsAccumulator.wolfPack = {
      targets: [villagers[0].id, villagers[1].id],
    };

    const witchTurnIdx = room.nightTurnPlan.findIndex((t) => t.turnKey === 'witch');
    room.currentNightTurnIndex = witchTurnIdx;
    room.nightActionAcks.clear();

    const witchViewBefore = createPlayerPrivateView(room, witch.id)!;
    expect(witchViewBefore.skills.witchVictimId).toBe(villagers[0].id);
    expect(witchViewBefore.skills.witchVictimIds).toEqual([villagers[0].id, villagers[1].id]);
    expect(witchViewBefore.skills.witchHealUsed).toBe(false);
    expect(witchViewBefore.skills.witchPoisonUsed).toBe(false);

    // Khi Phù thủy đã dùng bình Cứu trong đêm này -> bình Độc cũng bị đánh dấu không khả dụng
    room.nightActionsAccumulator.witch = { heal: true };
    const witchViewAfterHeal = createPlayerPrivateView(room, witch.id)!;
    expect(witchViewAfterHeal.skills.witchHealUsed).toBe(true);
    expect(witchViewAfterHeal.skills.witchPoisonUsed).toBe(true);
  });

  it('publicTimeline & morningAnnouncements tuân thủ chống spoil (revealOnDeath = false), giữ 3 ngoại lệ lộ vai và chỉ mở full matchEvents khi GAME_OVER', async () => {
    const { roomCode } = await setupGame([
      'werewolf',
      'prince',
      'hunter',
      'seer',
      'drunk',
      'villager',
    ]);
    const room = roomService.getRoom(roomCode)!;
    room.settings.revealOnDeath = false;

    const seer = room.gameState!.players.find((p) => p.roleId === 'seer')!;
    const prince = room.gameState!.players.find((p) => p.roleId === 'prince')!;
    const hunter = room.gameState!.players.find((p) => p.roleId === 'hunter')!;
    const villager = room.gameState!.players.find((p) => p.roleId === 'villager')!;
    const drunk = room.gameState!.players.find((p) => p.roleId === 'drunk')!;
    drunk.drunkRealRoleId = 'witch';

    // Đêm 1: Sói cắn Tiên tri, Tiên tri soi
    room.gameState = executeNightPhase(room.gameState!, {
      wolfPack: { targets: [seer.id] },
      seer: { targetId: villager.id },
    }).nextState;

    const publicAfterN1 = createPublicRoomView(room);
    const hostAfterN1 = createHostBoardView(room);

    // Anti-spoiler: publicTimeline & hostBoardView không lộ SECRET_NIGHT hoặc vai Tiên tri khi revealOnDeath = false
    const pubTextN1 = publicAfterN1.publicTimeline.map((i) => i.text).join('\n');
    expect(pubTextN1).not.toContain('Tiên tri');
    expect(pubTextN1).not.toContain('Kẻ say rượu');
    expect(hostAfterN1.publicRoom.publicTimeline.map((i) => i.text).join('\n')).not.toContain('Tiên tri');
    expect(publicAfterN1.morningAnnouncements[0]?.actionType).toBe('DAWN_SUMMARY');
    expect(createPostGameView(room)).toBeNull();

    // Ngày 1: vote Hoàng tử -> Hoàng tử vẫn phải lộ diện theo luật ngay cả khi revealOnDeath = false
    room.gameState = executeDayVote(room.gameState!, prince.id).nextState;
    const pubTextD1 = createPublicRoomView(room).publicTimeline.map((i) => i.text).join('\n');
    expect(pubTextD1).toContain('Hoàng tử');

    // Đêm 2: Sói cắn Thợ săn -> Thợ săn nổ súng giết Dân (vào thẳng GAME_OVER nếu cân bằng)
    room.gameState = executeNightPhase(room.gameState!, {
      wolfPack: { targets: [hunter.id] },
    }).nextState;
    room.gameState = executeHunterShot(room.gameState!, villager.id).nextState;
    room.gameState!.phase = 'GAME_OVER';

    const pubFinal = createPublicRoomView(room);
    expect(pubFinal.publicTimeline.map((i) => i.text).join('\n')).toContain('Thợ săn');

    const postGame = createPostGameView(room);
    expect(postGame).not.toBeNull();
    expect(postGame!.matchEvents.some((e) => e.actionType === 'INSPECT')).toBe(true);
    expect(postGame!.matchEvents.some((e) => e.actionType === 'DRUNK_SLEEP')).toBe(true);
    const drunkInfo = postGame!.allRoles.find((r) => r.id === drunk.id);
    expect(drunkInfo?.drunkRealRoleId).toBe('witch');
  });

  it('ẩn nguyên nhân COMPANION_DEATH / COUPLE_HEARTBREAK khi revealOnDeath = false, che nguồn Nhân bản của Thợ săn và trả activeHunterPlayerId đúng', async () => {
    const { roomCode } = await setupGame([
      'dire_wolf',    // p1
      'hunter',       // p2
      'doppelganger', // p3 (copy hunter p2)
      'cupid',        // p4
      'village_idiot',// p5
      'villager',     // p6
    ]);
    const room = roomService.getRoom(roomCode)!;
    room.settings.revealOnDeath = false;

    const direWolf = room.gameState!.players.find((p) => p.roleId === 'dire_wolf')!;
    const hunter = room.gameState!.players.find((p) => p.roleId === 'hunter')!;
    const dg = room.gameState!.players.find((p) => p.roleId === 'doppelganger')!;
    const idiot = room.gameState!.players.find((p) => p.roleId === 'village_idiot')!;
    const villager = room.gameState!.players.find((p) => p.roleId === 'villager')!;

    // Đêm 1: direWolf chọn hunter, doppelganger chọn hunter, cupid ghép hunter + villager
    room.gameState = executeNightPhase(room.gameState!, {
      direWolf: { targetId: hunter.id },
      doppelganger: { targetId: hunter.id },
      cupid: { target1: hunter.id, target2: villager.id },
      wolfPack: { targets: [hunter.id] },
    }).nextState;

    // Lúc này hunter, villager (đau tim) và dire_wolf (bạn đồng hành) đều chết; HUNTER_SHOT đang chờ p2
    expect(room.gameState!.phase).toBe('HUNTER_SHOT');
    const pubHunter = createPublicRoomView(room);
    expect(pubHunter.activeHunterPlayerId).toBe(hunter.id);
    // publicView.deaths khi revealOnDeath = false không được lộ roleId, cause ngầm hoặc cascadeDepth
    for (const d of pubHunter.deaths) {
      expect(d.roleId).toBe('unknown');
      expect(d.cause).toBe('UNKNOWN');
      expect(d.cascadeDepth).toBeUndefined();
    }

    // Kiểm tra CASCADE_DEATH xảy ra ban ngày (PUBLIC): ẩn "bạn đồng hành" và "người yêu" khi revealOnDeath = false
    const { roomCode: rDay } = await setupGame([
      'dire_wolf',
      'cupid',
      'werewolf',
      'villager',
      'villager',
      'villager',
    ]);
    const dayRoom = roomService.getRoom(rDay)!;
    dayRoom.settings.revealOnDeath = false;
    const dwDay = dayRoom.gameState!.players.find((p) => p.roleId === 'dire_wolf')!;
    const vDay = dayRoom.gameState!.players.filter((p) => p.roleId === 'villager');
    dayRoom.gameState = executeNightPhase(dayRoom.gameState!, {
      direWolf: { targetId: vDay[0].id },
      cupid: { target1: vDay[0].id, target2: vDay[1].id },
      wolfPack: { isSkip: true },
    }).nextState;
    dayRoom.gameState = executeDayVote(dayRoom.gameState!, vDay[0].id).nextState;

    const pubDayView = createPublicRoomView(dayRoom);
    const pubDayCascadeText = pubDayView.publicTimeline.map((i) => i.text).join('\n');
    expect(pubDayCascadeText).toContain('chết theo sau cái chết');
    expect(pubDayCascadeText).not.toContain('bạn đồng hành');
    expect(pubDayCascadeText).not.toContain('người yêu');
    expect(pubDayView.deaths.find((d) => d.playerId === vDay[0].id)?.cause).toBe('VILLAGE_VOTE');
    expect(pubDayView.deaths.find((d) => d.playerId === dwDay.id)?.cause).toBe('UNKNOWN');
    expect(pubDayView.deaths.find((d) => d.playerId === vDay[1].id)?.cause).toBe('UNKNOWN');
    expect(pubDayView.deaths.find((d) => d.playerId === dwDay.id)?.cascadeDepth).toBeUndefined();

    // Kiểm tra ngoại lệ village_idiot lật bài khi revealOnDeath = false
    const { roomCode: r2 } = await setupGame([
      'werewolf',
      'village_idiot',
      'doppelganger',
      'hunter',
      'villager',
      'villager',
    ]);
    const room2 = roomService.getRoom(r2)!;
    room2.settings.revealOnDeath = false;
    const r2Idiot = room2.gameState!.players.find((p) => p.roleId === 'village_idiot')!;
    const r2Dg = room2.gameState!.players.find((p) => p.roleId === 'doppelganger')!;
    const r2Hunter = room2.gameState!.players.find((p) => p.roleId === 'hunter')!;
    const r2Villagers = room2.gameState!.players.filter((p) => p.roleId === 'villager');

    room2.gameState = executeNightPhase(room2.gameState!, {
      doppelganger: { targetId: r2Hunter.id },
      wolfPack: { targets: [r2Hunter.id] },
    }).nextState;
    room2.gameState = executeHunterShot(room2.gameState!, r2Villagers[0].id).nextState;
    room2.gameState = executeDayVote(room2.gameState!, r2Idiot.id).nextState;

    const r2Night2 = executeNightPhase(room2.gameState!, {
      wolfPack: { targets: [r2Dg.id] },
    }).nextState;
    room2.gameState = executeHunterShot(r2Night2, r2Villagers[1].id).nextState;

    const pubR2Text = createPublicRoomView(room2).publicTimeline.map((i) => i.text).join('\n');
    expect(pubR2Text).toContain('Thằng ngốc');
    expect(pubR2Text).toContain('Thợ săn');
    expect(pubR2Text).not.toContain('Nhân bản');
  });
});
