import { describe, expect, it } from 'bun:test';
import { LocalEngineAdapter } from '../../adapters/localEngineAdapter';
import { RoomService } from '../../server/roomService';
import { SocketGateway } from '../../server/socketGateway';
import { TimerManager } from '../../server/timerManager';
import { createMockIoServer } from '../../server/__tests__/mockSocket';
import { executeDayVote, executeNightPhase } from '../gameEngine';
import { ROLES } from '../roles';
import { canHostTallyEarly, createInitialDayState, tallyDayVotes } from '../voting';
import { checkWinCondition } from '../winConditions';
import { createTestGame } from './testHelpers';
import { runTargetedToxicGame } from './fuzz/deadlockChecker';
import { TOXIC_DEPENDENCY_CLUSTERS } from './fuzz/targetedGenerator';

describe('Engine - Targeted Combinatorial Fuzzing & Deadlock Checks', () => {
  it('ép 1.500 ván qua đủ 6 cụm bộ bài độc hại chéo vai trò (Thợ săn + Nhân bản + Phù thủy AoE + Kẻ phá rối...)', () => {
    const clusterCounts = new Map<string, number>();
    const rolesSeen = new Set<string>();

    for (let i = 0; i < 1500; i++) {
      const seed = 100_000 + i;
      const summary = runTargetedToxicGame(seed, {
        clusterIndex: i % TOXIC_DEPENDENCY_CLUSTERS.length,
        passiveDayMode: false,
      });
      expect(summary.winner).not.toBeNull();
      clusterCounts.set(summary.clusterId, (clusterCounts.get(summary.clusterId) ?? 0) + 1);
      for (const r of summary.roleIds) rolesSeen.add(r);
    }

    for (const cluster of TOXIC_DEPENDENCY_CLUSTERS) {
      expect(clusterCounts.get(cluster.id)).toBe(250);
    }
    const allEngineRoles = ROLES.filter((r) => r.implementedInEngine).map((r) => r.id);
    for (const r of allEngineRoles) {
      expect(rolesSeen.has(r)).toBe(true);
    }
  }, 90_000);

  it('săn Deadlock: chạy 600 ván độc hại ở chế độ cả làng không treo cổ được ai (PASSIVE_DAY), đảm bảo 0 ván kẹt vô tận', () => {
    for (let i = 0; i < 600; i++) {
      const seed = 200_000 + i;
      const summary = runTargetedToxicGame(seed, {
        clusterIndex: i % TOXIC_DEPENDENCY_CLUSTERS.length,
        passiveDayMode: true,
      });
      expect(summary.winner).not.toBeNull();
    }
  }, 60_000);

  it('Deadlock Check: Thằng ngốc đã lật bài (0 phiếu) + 1 Ma sói thường thắng Sói ngay, + Sói cô đơn thoát ngày qua đêm kết liễu', () => {
    // 1. Thằng ngốc (0 phiếu) vs 1 Ma sói thường -> Sói thắng ngay lập tức
    const normalCase = createTestGame([
      'village_idiot', // p1
      'werewolf',      // p2
      'villager',      // p3
      'villager',      // p4
      'villager',      // p5
      'villager',      // p6
    ]);
    normalCase.players[0].voteWeight = 0;
    for (let i = 2; i < normalCase.players.length; i++) {
      normalCase.players[i].isAlive = false;
    }
    const normalWin = checkWinCondition(normalCase);
    expect(normalWin?.winner).toBe('WEREWOLF');

    // 2. Thằng ngốc (0 phiếu) vs 1 Sói cô đơn (MAJORITY): ban ngày không thể đủ quá bán -> thoát sang Đêm cho Sói cô đơn cắn
    const loneCase = createTestGame(
      [
        'village_idiot', // p1
        'lone_wolf',     // p2
        'villager',
        'villager',
        'villager',
        'villager',
      ],
      { lynchThreshold: 'MAJORITY', tieVoteMode: 'ESCAPE', allowWolfSkip: false }
    );
    loneCase.roundNumber = 2;
    loneCase.phase = 'DAY_DISCUSS';
    loneCase.players[0].voteWeight = 0;
    for (let i = 2; i < loneCase.players.length; i++) {
      loneCase.players[i].isAlive = false;
    }
    loneCase.dayState = createInitialDayState();
    loneCase.dayState.voteLocked = false;
    // Chỉ Sói cô đơn (1 phiếu) có quyền vote, kể cả tự vote cũng chỉ đạt 1 <= 2/2 -> ESCAPE -> Đêm 3
    loneCase.dayState.ballots = { p2: 'p1' };
    expect(canHostTallyEarly(loneCase)).toBe(true);
    const tally = tallyDayVotes(loneCase);
    expect(tally.outcome.type).toBe('ESCAPE');

    const { nextState: nightState } = executeDayVote(tally.nextState, null);
    expect(nightState.phase).toBe('NIGHT');
    expect(nightState.roundNumber).toBe(3);

    const { winOutcome } = executeNightPhase(nightState, { wolfPack: { targets: ['p1'] } });
    expect(winOutcome?.winner).toBe('LONE_WOLF');
  });

  it('Deadlock Check: 0 người có quyền bỏ phiếu (2 Thằng ngốc đã lật bài) vẫn chốt ngày mượt trên Engine, SocketGateway & LocalEngineAdapter', async () => {
    // Engine & Voting: 2 Thằng ngốc (gốc + Nhân bản) đều voteWeight = 0 + Sói trắng -> 0 eligibleVoters
    const engineGame = createTestGame(['village_idiot', 'village_idiot', 'white_wolf', 'villager', 'villager', 'villager']);
    engineGame.phase = 'DAY_DISCUSS';
    engineGame.roundNumber = 2;
    engineGame.players[0].voteWeight = 0;
    engineGame.players[1].voteWeight = 0;
    for (let i = 3; i < engineGame.players.length; i++) engineGame.players[i].isAlive = false;
    engineGame.players[2].voteWeight = 0; // Giả lập cực đoan cả 3 người sống mất quyền vote
    engineGame.dayState = createInitialDayState();
    engineGame.dayState.voteLocked = false;
    expect(canHostTallyEarly(engineGame)).toBe(true);
    const tRes = tallyDayVotes(engineGame);
    expect(tRes.outcome.type).toBe('ESCAPE');
    const afterDay = executeDayVote(tRes.nextState, null);
    expect(afterDay.nextState.phase).toBe('NIGHT');

    // SocketGateway: chốt phiếu khi voteProgress.total === 0 không bị kẹt CANNOT_TALLY_YET
    const mockIo = createMockIoServer();
    const roomService = new RoomService();
    const timerManager = new TimerManager({ minNightDelaySec: 5, maxNightDelaySec: 5 });
    const gateway = new SocketGateway(mockIo as any, roomService, timerManager);
    gateway.registerEvents();
    const host = mockIo.createClientSocket();
    const clients: ReturnType<typeof mockIo.createClientSocket>[] = [host];
    let activeRoomCode: string | null = null;
    try {
      const created: any = await new Promise((r) => host.emit('room:create', { isPlayer: false }, r));
      expect(created.ok).toBe(true);
      const { roomCode, hostToken } = created.data;
      activeRoomCode = roomCode;
      for (let i = 0; i < 6; i++) {
        const c = mockIo.createClientSocket();
        clients.push(c);
        const joinRes: any = await new Promise((r) =>
          c.emit('room:join', { roomCode, username: `D${i + 1}` }, r)
        );
        expect(joinRes.ok).toBe(true);
      }
      const startRes: any = await new Promise((r) =>
        host.emit(
          'lobby:start',
          {
            roomCode,
            token: hostToken,
            customRoleIds: ['village_idiot', 'werewolf', 'villager', 'villager', 'villager', 'villager'],
          },
          r
        )
      );
      expect(startRes.ok).toBe(true);
      const room = roomService.getRoom(roomCode)!;
      await roomService.getCommandQueue(roomCode).enqueue(async () => {
        room.gameState!.phase = 'DAY_DISCUSS';
        room.gameState!.dayState = createInitialDayState();
        room.gameState!.dayState.voteLocked = false;
        for (const pl of room.gameState!.players) pl.voteWeight = 0;
      });
      const finRes: any = await new Promise((r) =>
        host.emit('day:finalizePublicVote', { roomCode, token: hostToken }, r)
      );
      expect(finRes.ok).toBe(true);
      expect(room.gameState!.phase).toBe('NIGHT');
    } finally {
      const roomToClean = activeRoomCode ? roomService.getRoom(activeRoomCode) : undefined;
      if (roomToClean) {
        timerManager.clearRoomTimer(roomToClean);
      }
      for (const s of clients) s.disconnect();
      roomService.destroy();
      mockIo.close();
    }

    // LocalEngineAdapter: submitPublicHandVotes({}) khi mọi người voteWeight = 0
    const store = new Map<string, string>();
    const prevLS = (globalThis as Record<string, unknown>).localStorage;
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    };
    const adapter = new LocalEngineAdapter();
    try {
      for (let i = 1; i <= 6; i++) adapter.addOfflinePlayer(`L${i}`);
      await adapter.startGame(['village_idiot', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
      await adapter.startFirstNight();
      const room = (adapter as unknown as { roomState: any }).roomState;
      room.gameState.phase = 'DAY_DISCUSS';
      room.gameState.dayState = createInitialDayState();
      room.gameState.dayState.voteLocked = false;
      for (const pl of room.gameState.players) pl.voteWeight = 0;
      await adapter.submitPublicHandVotes({});
      expect(adapter.getState().publicView?.dayVerdict?.isPendingNextNight).toBe(true);
      await adapter.proceedToNextNight();
      expect(adapter.getState().publicView?.phase).toBe('NIGHT');
    } finally {
      await adapter.leaveRoom();
      if (prevLS === undefined) delete (globalThis as Record<string, unknown>).localStorage;
      else (globalThis as Record<string, unknown>).localStorage = prevLS;
    }
  });

  it('Deadlock Check: không còn Sói cắn đêm lẫn Dân làng (chỉ còn Minion/Sorcerer/Hoodlum/Tanner) phải phân định Hòa ngay, giữ quyền sống cho Pied Piper/Cult/Angel R1', () => {
    const unwinnableSets: string[][] = [
      ['minion'],
      ['sorcerer'],
      ['hoodlum'],
      ['tanner'],
      ['minion', 'sorcerer'],
      ['hoodlum', 'minion'],
      ['hoodlum', 'sorcerer'],
      ['tanner', 'minion'],
      ['tanner', 'hoodlum'],
      ['doppelganger', 'minion'],
    ];

    for (const aliveSet of unwinnableSets) {
      const pad = [...aliveSet];
      while (pad.length < 6) pad.push('villager');
      const g = createTestGame(pad);
      g.roundNumber = 3;
      for (let i = aliveSet.length; i < g.players.length; i++) {
        g.players[i].isAlive = false;
      }
      const win = checkWinCondition(g);
      expect(win?.winner).toBe('DRAW');
    }

    // Trường hợp vẫn còn đường thắng hợp lệ -> chưa được ép DRAW
    const piedPiperAndMinion = createTestGame(['pied_piper', 'minion', 'villager', 'villager', 'villager', 'villager']);
    for (let i = 2; i < 6; i++) piedPiperAndMinion.players[i].isAlive = false;
    expect(checkWinCondition(piedPiperAndMinion)).toBeNull();

    const cultAndSorcerer = createTestGame(['cult_leader', 'sorcerer', 'villager', 'villager', 'villager', 'villager']);
    for (let i = 2; i < 6; i++) cultAndSorcerer.players[i].isAlive = false;
    expect(checkWinCondition(cultAndSorcerer)).toBeNull();

    // Thiên sứ Ngày 1 + Minion: còn Ngày 1 -> giữ nguyên để phân xử Ngày 1; sang Ngày 2 nếu còn là angel (edge case) -> Hòa
    const angelR1 = createTestGame(['angel', 'minion', 'villager', 'villager', 'villager', 'villager']);
    angelR1.roundNumber = 1;
    for (let i = 2; i < 6; i++) angelR1.players[i].isAlive = false;
    expect(checkWinCondition(angelR1)).toBeNull();

    // Deadlock Cặp đôi khác phe vs Dân dưới luật MAJORITY khi hết Sói + hết bình độc:
    // Cặp đôi (2 phiếu) vs 2 Dân hoặc 1 Dân + 1 Thằng ngốc 0 phiếu (tổng 4 sống -> cần > 2 = 3 phiếu) -> Hòa ngay!
    const coupleStalemate = createTestGame(
      ['hoodlum', 'wild_child', 'villager', 'village_idiot', 'werewolf', 'villager'],
      { lynchThreshold: 'MAJORITY' }
    );
    coupleStalemate.players[0].loverId = 'p2';
    coupleStalemate.players[1].loverId = 'p1';
    coupleStalemate.players[0].isCrossFactionCouple = true;
    coupleStalemate.players[1].isCrossFactionCouple = true;
    coupleStalemate.players[3].voteWeight = 0; // Thằng ngốc mất phiếu
    coupleStalemate.players[4].isAlive = false; // Sói đã chết
    coupleStalemate.players[5].isAlive = false;
    expect(checkWinCondition(coupleStalemate)?.winner).toBe('DRAW');

    // Nhưng nếu Cặp đôi (2 phiếu) vs 1 Dân (3 sống -> cần > 1.5 = 2 phiếu) -> Cặp đôi đủ phiếu thắng, chưa Hòa!
    coupleStalemate.players[3].isAlive = false;
    coupleStalemate.deaths.push({ playerId: 'p4', roleId: 'village_idiot', roundNumber: 2, phase: 'NIGHT', cause: 'WOLF_PACK' });
    expect(checkWinCondition(coupleStalemate)).toBeNull();

    // Tough Guy có toughGuyBittenNight: null (chưa bị cắn) KHÔNG được chặn DRAW; nhưng nếu đang mang vết cắn (number) thì giữ null chờ Đêm sau!
    const toughNull = createTestGame(
      ['hoodlum', 'wild_child', 'villager', 'tough_guy', 'werewolf', 'villager'],
      { lynchThreshold: 'MAJORITY' }
    );
    toughNull.players[0].loverId = 'p2';
    toughNull.players[1].loverId = 'p1';
    toughNull.players[0].isCrossFactionCouple = true;
    toughNull.players[1].isCrossFactionCouple = true;
    toughNull.players[3].toughGuyBittenNight = null;
    toughNull.players[4].isAlive = false;
    toughNull.players[5].isAlive = false;
    expect(checkWinCondition(toughNull)?.winner).toBe('DRAW');
    toughNull.players[3].toughGuyBittenNight = 1;
    expect(checkWinCondition(toughNull)).toBeNull();

    // Không được ép DRAW sớm với Cặp đôi dưới MAJORITY khi còn Angel R1, Drunk tỉnh vai nguy hiểm, Tanner hoặc Hoodlum phá thế 2-2
    const angelCouple = createTestGame(['angel', 'villager', 'villager', 'villager', 'werewolf', 'villager'], { lynchThreshold: 'MAJORITY' });
    angelCouple.roundNumber = 1;
    angelCouple.players[0].loverId = 'p2';
    angelCouple.players[1].loverId = 'p1';
    angelCouple.players[4].isAlive = false;
    angelCouple.players[5].isAlive = false;
    expect(checkWinCondition(angelCouple)).toBeNull();

    const drunkWitchCouple = createTestGame(['hoodlum', 'wild_child', 'villager', 'drunk', 'werewolf', 'villager'], { lynchThreshold: 'MAJORITY' });
    drunkWitchCouple.roundNumber = 1;
    drunkWitchCouple.players[0].loverId = 'p2';
    drunkWitchCouple.players[1].loverId = 'p1';
    drunkWitchCouple.players[3].drunkRealRoleId = 'witch';
    drunkWitchCouple.players[4].isAlive = false;
    drunkWitchCouple.players[5].isAlive = false;
    expect(checkWinCondition(drunkWitchCouple)).toBeNull();

    const tannerBreaksTie = createTestGame(['hoodlum', 'wild_child', 'villager', 'tanner', 'werewolf', 'villager'], { lynchThreshold: 'MAJORITY' });
    tannerBreaksTie.players[0].loverId = 'p2';
    tannerBreaksTie.players[1].loverId = 'p1';
    tannerBreaksTie.players[4].isAlive = false;
    tannerBreaksTie.players[5].isAlive = false;
    expect(checkWinCondition(tannerBreaksTie)).toBeNull();

    const hoodlumBreaksTie = createTestGame(['cult_leader', 'wild_child', 'villager', 'hoodlum', 'werewolf', 'villager'], { lynchThreshold: 'MAJORITY' });
    hoodlumBreaksTie.players[4].isAlive = false;
    hoodlumBreaksTie.players[5].isAlive = false;
    hoodlumBreaksTie.players[0].roleId = 'angel';
    hoodlumBreaksTie.roundNumber = 2; // angel R2 (THIRD_PARTY) + wild_child (VILLAGER) = cross-couple
    hoodlumBreaksTie.players[0].loverId = 'p2';
    hoodlumBreaksTie.players[1].loverId = 'p1';
    expect(checkWinCondition(hoodlumBreaksTie)).toBeNull();

    // Tanner làm Trưởng làng (2/3 phiếu) trong [tanner(2), minion(1), sorcerer(1)] vẫn tự treo cổ được
    const tannerMayor = createTestGame(['tanner', 'minion', 'sorcerer', 'villager', 'villager', 'villager'], { lynchThreshold: 'MAJORITY' });
    tannerMayor.roundNumber = 3;
    tannerMayor.players[0].voteWeight = 2;
    tannerMayor.mayorId = 'p1';
    for (let i = 3; i < 6; i++) tannerMayor.players[i].isAlive = false;
    expect(checkWinCondition(tannerMayor)).toBeNull();
  });
});
