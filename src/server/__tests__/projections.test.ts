import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { RoomService } from '../roomService';
import { TimerManager } from '../timerManager';
import { SocketGateway } from '../socketGateway';
import { createMockIoServer, type MockSocketIOServer, type MockClientSocket } from './mockSocket';
import {
  createPlayerPrivateView,
  getWolfPackVictimCandidate,
  getRawWolfPackVictim,
} from '../projections';
import type { RoomState } from '../types';

describe('Realtime Backend - Projections & Targets for Phase 3 (wolf_accursed, big_bad_wolf, lone_wolf)', () => {
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

    for (let i = 1; i <= roles.length; i++) {
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

  describe('getWolfPackVictimCandidate and getRawWolfPackVictim', () => {
    it('trả về nạn nhân của bầy sói khi không bị che chở hay nguyền', () => {
      const room: any = {
        nightActionsAccumulator: {
          wolfPack: { targets: ['player_3'] },
        },
      };

      expect(getRawWolfPackVictim(room as RoomState)).toBe('player_3');
      expect(getWolfPackVictimCandidate(room as RoomState)).toBe('player_3');
    });

    it('getWolfPackVictimCandidate trả về null khi nạn nhân được Bảo vệ che chở', () => {
      const room: any = {
        nightActionsAccumulator: {
          wolfPack: { targets: ['player_3'] },
          bodyguard: { targetId: 'player_3' },
        },
      };

      // Raw victim vẫn là player_3
      expect(getRawWolfPackVictim(room as RoomState)).toBe('player_3');
      // Candidate gửi cho Phù thủy bị ẩn (trả về null)
      expect(getWolfPackVictimCandidate(room as RoomState)).toBeNull();
    });

    it('getWolfPackVictimCandidate trả về null khi nạn nhân bị Sói nguyền nguyền rủa', () => {
      const room: any = {
        nightActionsAccumulator: {
          wolfPack: { targets: ['player_4'] },
          accursedWolf: { curseTargetId: 'player_4' },
        },
      };

      expect(getRawWolfPackVictim(room as RoomState)).toBe('player_4');
      expect(getWolfPackVictimCandidate(room as RoomState)).toBeNull();
    });

    it('trả về null khi bầy sói chọn bỏ qua (isSkip = true)', () => {
      const room: any = {
        nightActionsAccumulator: {
          wolfPack: { isSkip: true, targets: ['player_3'] },
        },
      };

      expect(getRawWolfPackVictim(room as RoomState)).toBeNull();
      expect(getWolfPackVictimCandidate(room as RoomState)).toBeNull();
    });

    it('hỗ trợ big_bad_wolf, wolfCubDoubleKillNextNight, lastProtectedPlayerId và villagePowerStripped nhất quán với getWitchVictimsPreview', () => {
      const room: any = {
        gameState: {
          players: [
            { id: 'p1', roleId: 'big_bad_wolf', faction: 'WEREWOLF', isAlive: true },
            { id: 'p2', roleId: 'villager', faction: 'VILLAGER', isAlive: true },
            { id: 'p3', roleId: 'villager', faction: 'VILLAGER', isAlive: true },
            { id: 'p4', roleId: 'bodyguard', faction: 'VILLAGER', isAlive: true },
          ],
          deaths: [],
          wolfCubDoubleKillNextNight: true,
          lastProtectedPlayerId: 'p2',
          villagePowerStripped: false,
          settings: { allowWolfSkip: true, allowWolfFriendlyFire: false },
        },
        nightActionsAccumulator: {
          wolfPack: { targets: ['p2'] },
          bigBadWolf: { targetId: 'p3' },
          // Bảo vệ trùng đêm trước (p2) -> không có hiệu lực
          bodyguard: { targetId: 'p2' },
        },
      };

      expect(getRawWolfPackVictim(room as RoomState)).toBe('p2');
      expect(getWolfPackVictimCandidate(room as RoomState)).toBe('p2');

      // Nếu p2 được bảo vệ hợp lệ (không trùng lastProtectedPlayerId) -> Phù thủy thấy nạn nhân thứ 2 (p3)
      room.gameState.lastProtectedPlayerId = null;
      expect(getWolfPackVictimCandidate(room as RoomState)).toBe('p3');

      // Nếu làng mất phép (villagePowerStripped = true) -> Bảo vệ vô hiệu -> Phù thủy vẫn thấy p2
      room.gameState.villagePowerStripped = true;
      expect(getWolfPackVictimCandidate(room as RoomState)).toBe('p2');
    });
  });

  describe('Projections cho wolf_accursed', () => {
    it('wolf_accursed nhận validTargets là duy nhất nạn nhân còn sống của bầy Sói', async () => {
      const { roomCode, players } = await setupGame([
        'werewolf',
        'wolf_accursed',
        'seer',
        'witch',
        'villager',
        'villager',
      ]);
      const room = roomService.getRoom(roomCode)!;

      const accursedWolf = room.gameState!.players.find((p) => p.roleId === 'wolf_accursed')!;
      const victim = room.gameState!.players.find((p) => p.roleId === 'villager')!;

      // Giả lập bầy Sói đã cắn victim
      room.nightActionsAccumulator.wolfPack = { targets: [victim.id] };

      // Giả lập tới lượt wolf_accursed
      room.nightTurnPlan = [
        {
          roleId: 'wolf_accursed',
          turnKey: 'wolf_accursed',
          priority: 32,
          titleVi: 'Sói nguyền',
          titleEn: 'Accursed Wolf',
          activePlayerIds: [accursedWolf.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_wolf_accursed',
        },
      ];
      room.currentNightTurnIndex = 0;
      room.nightActionAcks.clear();

      const privateView = createPlayerPrivateView(room, accursedWolf.id);
      expect(privateView).not.toBeNull();
      expect(privateView!.canActCurrentTurn).toBe(true);
      expect(privateView!.validTargets).toEqual([victim.id]);
      expect(privateView!.skills.wolfPackVictimId).toBe(victim.id);
    });

    it('wolf_accursed vẫn thấy validTargets là nạn nhân ngay cả khi Bảo vệ đã đỡ', async () => {
      const { roomCode } = await setupGame([
        'werewolf',
        'wolf_accursed',
        'seer',
        'witch',
        'bodyguard',
        'villager',
      ]);
      const room = roomService.getRoom(roomCode)!;

      const accursedWolf = room.gameState!.players.find((p) => p.roleId === 'wolf_accursed')!;
      const victim = room.gameState!.players.find((p) => p.roleId === 'villager')!;

      // Bầy Sói cắn victim, và Bảo vệ đã bảo vệ victim
      room.nightActionsAccumulator.wolfPack = { targets: [victim.id] };
      room.nightActionsAccumulator.bodyguard = { targetId: victim.id };

      room.nightTurnPlan = [
        {
          roleId: 'wolf_accursed',
          turnKey: 'wolf_accursed',
          priority: 32,
          titleVi: 'Sói nguyền',
          titleEn: 'Accursed Wolf',
          activePlayerIds: [accursedWolf.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_wolf_accursed',
        },
      ];
      room.currentNightTurnIndex = 0;
      room.nightActionAcks.clear();

      const privateView = createPlayerPrivateView(room, accursedWolf.id);
      expect(privateView).not.toBeNull();
      // Wolf accursed vẫn nhắm vào victim (để sau này engine giải mã hoàn trả phép)
      expect(privateView!.validTargets).toEqual([victim.id]);
    });
  });

  describe('Projections cho big_bad_wolf', () => {
    it('big_bad_wolf nhận validTargets là các người chơi còn sống, loại trừ chính mình, phe Sói và nạn nhân bầy Sói', async () => {
      const { roomCode } = await setupGame([
        'werewolf',
        'big_bad_wolf',
        'seer',
        'witch',
        'villager',
        'villager',
      ]);
      const room = roomService.getRoom(roomCode)!;

      const bigBadWolf = room.gameState!.players.find((p) => p.roleId === 'big_bad_wolf')!;
      const regularWolf = room.gameState!.players.find((p) => p.roleId === 'werewolf')!;
      const seer = room.gameState!.players.find((p) => p.roleId === 'seer')!;
      const witch = room.gameState!.players.find((p) => p.roleId === 'witch')!;
      const villagers = room.gameState!.players.filter((p) => p.roleId === 'villager');

      // Bầy Sói đã cắn 1 người dân làng
      const packVictim = villagers[0];
      room.nightActionsAccumulator.wolfPack = { targets: [packVictim.id] };

      room.nightTurnPlan = [
        {
          roleId: 'big_bad_wolf',
          turnKey: 'big_bad_wolf',
          priority: 33,
          titleVi: 'Sói đại ca',
          titleEn: 'Big Bad Wolf',
          activePlayerIds: [bigBadWolf.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_big_bad_wolf',
        },
      ];
      room.currentNightTurnIndex = 0;
      room.nightActionAcks.clear();

      const privateView = createPlayerPrivateView(room, bigBadWolf.id);
      expect(privateView).not.toBeNull();
      expect(privateView!.canActCurrentTurn).toBe(true);

      // Mục tiêu hợp lệ phải bao gồm: seer, witch, villagers[1]
      // Không bao gồm: bigBadWolf, regularWolf, packVictim (villagers[0])
      expect(privateView!.validTargets).toContain(seer.id);
      expect(privateView!.validTargets).toContain(witch.id);
      expect(privateView!.validTargets).toContain(villagers[1].id);
      expect(privateView!.validTargets).not.toContain(bigBadWolf.id);
      expect(privateView!.validTargets).not.toContain(regularWolf.id);
      expect(privateView!.validTargets).not.toContain(packVictim.id);
    });

    it('big_bad_wolf được phép chọn phe Sói nếu allowWolfFriendlyFire = true', async () => {
      const { roomCode } = await setupGame([
        'werewolf',
        'big_bad_wolf',
        'seer',
        'witch',
        'villager',
        'villager',
      ]);
      const room = roomService.getRoom(roomCode)!;
      room.settings.allowWolfFriendlyFire = true;

      const bigBadWolf = room.gameState!.players.find((p) => p.roleId === 'big_bad_wolf')!;
      const regularWolf = room.gameState!.players.find((p) => p.roleId === 'werewolf')!;
      const seer = room.gameState!.players.find((p) => p.roleId === 'seer')!;

      room.nightActionsAccumulator.wolfPack = { targets: [seer.id] };

      room.nightTurnPlan = [
        {
          roleId: 'big_bad_wolf',
          turnKey: 'big_bad_wolf',
          priority: 33,
          titleVi: 'Sói đại ca',
          titleEn: 'Big Bad Wolf',
          activePlayerIds: [bigBadWolf.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_big_bad_wolf',
        },
      ];
      room.currentNightTurnIndex = 0;
      room.nightActionAcks.clear();

      const privateView = createPlayerPrivateView(room, bigBadWolf.id);
      expect(privateView).not.toBeNull();
      // Khi bật friendly fire, regularWolf xuất hiện trong danh sách validTargets
      expect(privateView!.validTargets).toContain(regularWolf.id);
      expect(privateView!.validTargets).not.toContain(seer.id);
    });
  });

  describe('SocketGateway night:action cho wolf_accursed và big_bad_wolf', () => {
    it('lưu accursedWolf trong accumulator khi gửi action qua socket', async () => {
      const { roomCode, players } = await setupGame([
        'werewolf',
        'wolf_accursed',
        'seer',
        'witch',
        'villager',
        'villager',
      ]);
      const room = roomService.getRoom(roomCode)!;

      const accursedWolf = room.gameState!.players.find((p) => p.roleId === 'wolf_accursed')!;
      const wolfPlayer = players.find((p) => p.id === accursedWolf.id)!;
      const victim = room.gameState!.players.find((p) => p.roleId === 'villager')!;

      room.nightTurnPlan = [
        {
          roleId: 'wolf_accursed',
          turnKey: 'wolf_accursed',
          priority: 32,
          titleVi: 'Sói nguyền',
          titleEn: 'Accursed Wolf',
          activePlayerIds: [accursedWolf.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_wolf_accursed',
        },
      ];
      room.currentNightTurnIndex = 0;
      room.nightActionAcks.clear();

      const actionRes: any = await new Promise((resolve) => {
        wolfPlayer.client.emit(
          'night:action',
          {
            roomCode,
            token: wolfPlayer.token,
            roleId: 'wolf_accursed',
            action: { curseTargetId: victim.id },
          },
          resolve
        );
      });

      expect(actionRes.ok).toBe(true);
      expect(room.nightActionsAccumulator.accursedWolf).toEqual({
        curseTargetId: victim.id,
      });
    });

    it('lưu bigBadWolf trong accumulator khi gửi action qua socket', async () => {
      const { roomCode, players } = await setupGame([
        'werewolf',
        'big_bad_wolf',
        'seer',
        'witch',
        'villager',
        'villager',
      ]);
      const room = roomService.getRoom(roomCode)!;

      const bigBadWolf = room.gameState!.players.find((p) => p.roleId === 'big_bad_wolf')!;
      const wolfPlayer = players.find((p) => p.id === bigBadWolf.id)!;
      const victim = room.gameState!.players.find((p) => p.roleId === 'villager')!;

      room.nightTurnPlan = [
        {
          roleId: 'big_bad_wolf',
          turnKey: 'big_bad_wolf',
          priority: 33,
          titleVi: 'Sói đại ca',
          titleEn: 'Big Bad Wolf',
          activePlayerIds: [bigBadWolf.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_big_bad_wolf',
        },
      ];
      room.currentNightTurnIndex = 0;
      room.nightActionAcks.clear();

      const actionRes: any = await new Promise((resolve) => {
        wolfPlayer.client.emit(
          'night:action',
          {
            roomCode,
            token: wolfPlayer.token,
            roleId: 'big_bad_wolf',
            action: { targetId: victim.id },
          },
          resolve
        );
      });

      expect(actionRes.ok).toBe(true);
      expect(room.nightActionsAccumulator.bigBadWolf).toEqual({
        targetId: victim.id,
      });
    });
  });

  describe('Phase 4 Projections & Targets (aura_seer, pi, fox, spellcaster, troublemaker)', () => {
    it('validTargets chính xác cho các vai Phase 4', async () => {
      const { roomCode, players } = await setupGame([
        'aura_seer',
        'pi',
        'fox',
        'spellcaster',
        'troublemaker',
        'werewolf',
      ]);
      const room = roomService.getRoom(roomCode)!;

      const pAura = room.gameState!.players.find((p) => p.roleId === 'aura_seer')!;
      const pPi = room.gameState!.players.find((p) => p.roleId === 'pi')!;
      const pFox = room.gameState!.players.find((p) => p.roleId === 'fox')!;
      const pSpell = room.gameState!.players.find((p) => p.roleId === 'spellcaster')!;
      const pTrouble = room.gameState!.players.find((p) => p.roleId === 'troublemaker')!;

      // 1. aura_seer: không soi chính mình
      room.nightTurnPlan = [
        {
          roleId: 'aura_seer',
          turnKey: 'aura_seer',
          priority: 41,
          titleVi: 'Tiên tri hào quang',
          titleEn: 'Aura Seer',
          activePlayerIds: [pAura.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_aura_seer',
        },
      ];
      room.currentNightTurnIndex = 0;
      let view = createPlayerPrivateView(room, pAura.id);
      expect(view!.validTargets).not.toContain(pAura.id);
      expect(view!.validTargets).toContain(pPi.id);

      // 2. pi & fox: được chọn chính mình (allowSelfTarget: true)
      room.nightTurnPlan = [
        {
          roleId: 'pi',
          turnKey: 'pi',
          priority: 42,
          titleVi: 'Thám tử',
          titleEn: 'P.I.',
          activePlayerIds: [pPi.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_pi',
        },
      ];
      view = createPlayerPrivateView(room, pPi.id);
      expect(view!.validTargets).toContain(pPi.id);

      room.nightTurnPlan = [
        {
          roleId: 'fox',
          turnKey: 'fox',
          priority: 43,
          titleVi: 'Con cáo',
          titleEn: 'Fox',
          activePlayerIds: [pFox.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_fox',
        },
      ];
      view = createPlayerPrivateView(room, pFox.id);
      expect(view!.validTargets).toContain(pFox.id);

      // 3. spellcaster: không chọn người bị câm đêm trước (lastMutedPlayerId)
      room.gameState!.lastMutedPlayerId = pAura.id;
      room.nightTurnPlan = [
        {
          roleId: 'spellcaster',
          turnKey: 'spellcaster',
          priority: 55,
          titleVi: 'Người phù phép',
          titleEn: 'Spellcaster',
          activePlayerIds: [pSpell.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_spellcaster',
        },
      ];
      view = createPlayerPrivateView(room, pSpell.id);
      expect(view!.validTargets).not.toContain(pAura.id);
      expect(view!.validTargets).toContain(pFox.id);

      // 4. troublemaker: validTargets = []
      room.nightTurnPlan = [
        {
          roleId: 'troublemaker',
          turnKey: 'troublemaker',
          priority: 58,
          titleVi: 'Kẻ phá rối',
          titleEn: 'Troublemaker',
          activePlayerIds: [pTrouble.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_troublemaker',
        },
      ];
      view = createPlayerPrivateView(room, pTrouble.id);
      expect(view!.validTargets).toEqual([]);
    });

    it('createPlayerPrivateView trả về skills và investigationResult chính xác', async () => {
      const { roomCode } = await setupGame([
        'aura_seer',
        'pi',
        'fox',
        'spellcaster',
        'troublemaker',
        'werewolf',
      ]);
      const room = roomService.getRoom(roomCode)!;

      const pAura = room.gameState!.players.find((p) => p.roleId === 'aura_seer')!;
      const pPi = room.gameState!.players.find((p) => p.roleId === 'pi')!;
      const pFox = room.gameState!.players.find((p) => p.roleId === 'fox')!;
      const pSpell = room.gameState!.players.find((p) => p.roleId === 'spellcaster')!;
      const pTrouble = room.gameState!.players.find((p) => p.roleId === 'troublemaker')!;

      room.gameState!.mutedPlayerId = pSpell.id;
      room.gameState!.foxLostPower = true;
      room.gameState!.piUsed = true;
      room.gameState!.troublemakerUsed = true;

      const viewSpell = createPlayerPrivateView(room, pSpell.id);
      expect(viewSpell!.skills.isMuted).toBe(true);

      const viewFox = createPlayerPrivateView(room, pFox.id);
      expect(viewFox!.skills.foxLostPower).toBe(true);

      const viewPi = createPlayerPrivateView(room, pPi.id);
      expect(viewPi!.skills.piUsed).toBe(true);

      const viewTrouble = createPlayerPrivateView(room, pTrouble.id);
      expect(viewTrouble!.skills.troublemakerUsed).toBe(true);

      // Test investigation results
      room.auraInvestigationResult = { targetId: pPi.id, result: 'SPECIAL' };
      const viewAura = createPlayerPrivateView(room, pAura.id);
      expect(viewAura!.investigationResult).toEqual({
        targetId: pPi.id,
        result: 'SPECIAL',
      });

      room.foxInvestigationResult = {
        targetId: pFox.id,
        hasWerewolf: true,
        inspectedPlayerIds: [pFox.id],
      };
      const viewFoxResult = createPlayerPrivateView(room, pFox.id);
      expect(viewFoxResult!.investigationResult?.hasWerewolf).toBe(true);

      room.piInvestigationResult = {
        targetId: pPi.id,
        hasWerewolf: false,
        inspectedPlayerIds: [pPi.id],
      };
      const viewPiResult = createPlayerPrivateView(room, pPi.id);
      expect(viewPiResult!.investigationResult?.hasWerewolf).toBe(false);
    });

    it('SocketGateway night:action xử lý chuẩn xác cho Phase 4 roles', async () => {
      const { roomCode, players } = await setupGame([
        'aura_seer',
        'pi',
        'fox',
        'spellcaster',
        'troublemaker',
        'werewolf',
      ]);
      const room = roomService.getRoom(roomCode)!;

      const pAura = room.gameState!.players.find((p) => p.roleId === 'aura_seer')!;
      const pTrouble = room.gameState!.players.find((p) => p.roleId === 'troublemaker')!;
      const auraPlayer = players.find((pl) => pl.id === pAura.id)!;
      const troublePlayer = players.find((pl) => pl.id === pTrouble.id)!;
      const targetPlayer = room.gameState!.players.find((p) => p.id !== pAura.id)!;

      // Gửi action aura_seer
      room.nightTurnPlan = [
        {
          roleId: 'aura_seer',
          turnKey: 'aura_seer',
          priority: 41,
          titleVi: 'Tiên tri hào quang',
          titleEn: 'Aura Seer',
          activePlayerIds: [auraPlayer.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_aura_seer',
        },
      ];
      room.currentNightTurnIndex = 0;
      room.nightActionAcks.clear();

      const auraRes: any = await new Promise((resolve) => {
        auraPlayer.client.emit(
          'night:action',
          {
            roomCode,
            token: auraPlayer.token,
            roleId: 'aura_seer',
            action: { targetId: targetPlayer.id },
          },
          resolve
        );
      });
      expect(auraRes.ok).toBe(true);
      expect(room.nightActionsAccumulator.auraSeer).toEqual({
        targetId: targetPlayer.id,
      });

      // Gửi action troublemaker activate
      room.nightTurnPlan = [
        {
          roleId: 'troublemaker',
          turnKey: 'troublemaker',
          priority: 58,
          titleVi: 'Kẻ phá rối',
          titleEn: 'Troublemaker',
          activePlayerIds: [troublePlayer.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_troublemaker',
        },
      ];
      room.currentNightTurnIndex = 0;
      room.nightActionAcks.clear();

      const troubleRes: any = await new Promise((resolve) => {
        troublePlayer.client.emit(
          'night:action',
          {
            roomCode,
            token: troublePlayer.token,
            roleId: 'troublemaker',
            action: { activate: true },
          },
          resolve
        );
      });
      expect(troubleRes.ok).toBe(true);
      expect(room.nightActionsAccumulator.troublemaker).toEqual({
        activate: true,
      });
    });

    it('Phase 5 Projections: calculateNightValidTargets và skills cho Doppelganger, Pied Piper, Cult Leader, Drunk', async () => {
      const { roomCode, players } = await setupGame([
        'doppelganger',
        'pied_piper',
        'cult_leader',
        'drunk',
        'villager',
        'werewolf',
      ]);
      const room = roomService.getRoom(roomCode)!;

      const pDoppel = room.gameState!.players.find((p) => p.roleId === 'doppelganger')!;
      const pPiper = room.gameState!.players.find((p) => p.roleId === 'pied_piper')!;
      const pCult = room.gameState!.players.find((p) => p.roleId === 'cult_leader')!;
      const pDrunk = room.gameState!.players.find((p) => p.roleId === 'drunk')!;
      const pVillager = room.gameState!.players.find((p) => p.roleId === 'villager')!;

      // Đánh dấu pVillager đã bị thôi miên và đã vào giáo phái
      pVillager.isEnchanted = true;
      pCult.isEnchanted = false;
      pVillager.isCultMember = true;
      pDrunk.isCultMember = false;

      // 1. Doppelganger valid targets: người sống khác mình
      room.nightTurnPlan = [
        {
          roleId: 'doppelganger',
          turnKey: 'doppelganger',
          priority: 11,
          titleVi: 'Nhân bản',
          titleEn: 'Doppelganger',
          activePlayerIds: [pDoppel.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_doppelganger',
        },
      ];
      room.currentNightTurnIndex = 0;
      room.nightActionAcks.clear();

      const viewDoppel = createPlayerPrivateView(room, pDoppel.id)!;
      expect(viewDoppel.validTargets).not.toContain(pDoppel.id);
      expect(viewDoppel.validTargets).toContain(pPiper.id);
      expect(viewDoppel.validTargets).toContain(pVillager.id);

      // 2. Pied Piper valid targets: người sống chưa bị thôi miên và khác mình
      room.nightTurnPlan = [
        {
          roleId: 'pied_piper',
          turnKey: 'pied_piper',
          priority: 60,
          titleVi: 'Người thổi sáo',
          titleEn: 'Pied Piper',
          activePlayerIds: [pPiper.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_pied_piper',
        },
      ];
      room.currentNightTurnIndex = 0;
      room.nightActionAcks.clear();

      const viewPiper = createPlayerPrivateView(room, pPiper.id)!;
      expect(viewPiper.validTargets).not.toContain(pPiper.id);
      expect(viewPiper.validTargets).not.toContain(pVillager.id); // Đã bị thôi miên
      expect(viewPiper.validTargets).toContain(pCult.id); // Chưa bị thôi miên

      // 3. Cult Leader valid targets: người sống chưa vào giáo phái và khác mình
      room.nightTurnPlan = [
        {
          roleId: 'cult_leader',
          turnKey: 'cult_leader',
          priority: 62,
          titleVi: 'Trưởng giáo phái',
          titleEn: 'Cult Leader',
          activePlayerIds: [pCult.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_cult_leader',
        },
      ];
      room.currentNightTurnIndex = 0;
      room.nightActionAcks.clear();

      const viewCult = createPlayerPrivateView(room, pCult.id)!;
      expect(viewCult.validTargets).not.toContain(pCult.id);
      expect(viewCult.validTargets).not.toContain(pVillager.id); // Đã là thành viên
      expect(viewCult.validTargets).toContain(pDrunk.id); // Chưa vào giáo phái

      // 4. Skills projection: isEnchanted, isCultMember, doppelgangerTargetId
      const viewVillager = createPlayerPrivateView(room, pVillager.id)!;
      expect(viewVillager.skills.isEnchanted).toBe(true);
      expect(viewVillager.skills.isCultMember).toBe(true);

      pDoppel.doppelgangerTargetId = pVillager.id;
      const viewDoppelAfter = createPlayerPrivateView(room, pDoppel.id)!;
      expect(viewDoppelAfter.skills.doppelgangerTargetId).toBe(pVillager.id);

      // 5. Drunk real role id: ở Đêm 1-2 chưa hiện, ở Đêm 3+ hiện
      pDrunk.drunkRealRoleId = 'seer';
      room.gameState!.roundNumber = 1;
      const viewDrunkRound1 = createPlayerPrivateView(room, pDrunk.id)!;
      expect(viewDrunkRound1.skills.drunkRealRoleId).toBeUndefined();

      room.gameState!.roundNumber = 3;
      const viewDrunkRound3 = createPlayerPrivateView(room, pDrunk.id)!;
      expect(viewDrunkRound3.skills.drunkRealRoleId).toBe('seer');

      // Người khác nhìn không thấy drunkRealRoleId
      const viewVillagerRound3 = createPlayerPrivateView(room, pVillager.id)!;
      expect(viewVillagerRound3.skills.drunkRealRoleId).toBeUndefined();
    });

    it('SocketGateway night:action xử lý chuẩn xác cho Phase 5 roles: doppelganger, pied_piper, cult_leader', async () => {
      const { roomCode, players } = await setupGame([
        'doppelganger',
        'pied_piper',
        'cult_leader',
        'villager',
        'villager',
        'werewolf',
      ]);
      const room = roomService.getRoom(roomCode)!;

      const pDoppel = room.gameState!.players.find((p) => p.roleId === 'doppelganger')!;
      const pPiper = room.gameState!.players.find((p) => p.roleId === 'pied_piper')!;
      const pCult = room.gameState!.players.find((p) => p.roleId === 'cult_leader')!;
      const pVillagers = room.gameState!.players.filter((p) => p.roleId === 'villager');

      const doppelPlayer = players.find((pl) => pl.id === pDoppel.id)!;
      const piperPlayer = players.find((pl) => pl.id === pPiper.id)!;
      const cultPlayer = players.find((pl) => pl.id === pCult.id)!;

      // 1. Doppelganger
      room.nightTurnPlan = [
        {
          roleId: 'doppelganger',
          turnKey: 'doppelganger',
          priority: 11,
          titleVi: 'Nhân bản',
          titleEn: 'Doppelganger',
          activePlayerIds: [doppelPlayer.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_doppelganger',
        },
      ];
      room.currentNightTurnIndex = 0;
      room.nightActionAcks.clear();

      const doppelRes: any = await new Promise((resolve) => {
        doppelPlayer.client.emit(
          'night:action',
          {
            roomCode,
            token: doppelPlayer.token,
            roleId: 'doppelganger',
            action: { targetId: pVillagers[0].id },
          },
          resolve
        );
      });
      expect(doppelRes.ok).toBe(true);
      expect(room.nightActionsAccumulator.doppelganger).toEqual({
        targetId: pVillagers[0].id,
      });

      // 2. Pied Piper
      room.nightTurnPlan = [
        {
          roleId: 'pied_piper',
          turnKey: 'pied_piper',
          priority: 60,
          titleVi: 'Người thổi sáo',
          titleEn: 'Pied Piper',
          activePlayerIds: [piperPlayer.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_pied_piper',
        },
      ];
      room.currentNightTurnIndex = 0;
      room.nightActionAcks.clear();

      const piperRes: any = await new Promise((resolve) => {
        piperPlayer.client.emit(
          'night:action',
          {
            roomCode,
            token: piperPlayer.token,
            roleId: 'pied_piper',
            action: { targetIds: [pVillagers[0].id, pVillagers[1].id] },
          },
          resolve
        );
      });
      expect(piperRes.ok).toBe(true);
      expect(room.nightActionsAccumulator.piedPiper).toEqual({
        targetIds: [pVillagers[0].id, pVillagers[1].id],
      });

      // 3. Cult Leader
      room.nightTurnPlan = [
        {
          roleId: 'cult_leader',
          turnKey: 'cult_leader',
          priority: 62,
          titleVi: 'Trưởng giáo phái',
          titleEn: 'Cult Leader',
          activePlayerIds: [cultPlayer.id],
          isFake: false,
          canAct: true,
          audioKey: 'night_cult_leader',
        },
      ];
      room.currentNightTurnIndex = 0;
      room.nightActionAcks.clear();

      const cultRes: any = await new Promise((resolve) => {
        cultPlayer.client.emit(
          'night:action',
          {
            roomCode,
            token: cultPlayer.token,
            roleId: 'cult_leader',
            action: { targetId: pVillagers[1].id },
          },
          resolve
        );
      });
      expect(cultRes.ok).toBe(true);
      expect(room.nightActionsAccumulator.cultLeader).toEqual({
        targetId: pVillagers[1].id,
      });
    });
  });
});
