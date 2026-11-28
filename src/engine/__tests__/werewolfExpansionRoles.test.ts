import { describe, expect, it } from 'bun:test';
import { resolveNight, getRawWolfTargets, getWitchVictimsPreview } from '../nightResolution';
import { formatMatchEventText } from '../matchLogFormatter';
import { ROLES_BY_ID } from '../roles';
import { generateNightTurnPlan, hasAnyBitingWolfDied } from '../turnPlan';
import { checkWinCondition } from '../winConditions';
import {
  computeDeckMetrics,
  MUTUALLY_EXCLUSIVE_ROLES,
  NIGHT_HUNTING_WOLF_IDS,
  type RoleSelectionMap,
} from '../../screens/lobby/lobbyValidation';
import { createTestGame, createTestPlayers } from './testHelpers';
import type { PublicPlayerView } from '../../server/types';

function createMockLobbyPlayers(count: number): PublicPlayerView[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p_${i + 1}`,
    name: `Player ${i + 1}`,
    seatIndex: i + 1,
    isAlive: true,
    isConnected: true,
    voteWeight: 1,
    isMayor: false,
  }));
}

describe('Engine - Werewolf Expansion Roles (lone_wolf, big_bad_wolf, wolf_accursed)', () => {
  // =========================================================================
  // 1. METADATA & CONFIGURATION
  // =========================================================================
  describe('Roles Metadata & Config', () => {
    it('should have correct metadata for lone_wolf, big_bad_wolf, wolf_accursed', () => {
      const loneWolf = ROLES_BY_ID['lone_wolf'];
      expect(loneWolf.implementedInEngine).toBe(true);
      expect(loneWolf.playableInUI).toBe(true);
      expect(loneWolf.faction).toBe('WEREWOLF');
      expect(loneWolf.wakePriority).toBe(30);

      const bigBadWolf = ROLES_BY_ID['big_bad_wolf'];
      expect(bigBadWolf.implementedInEngine).toBe(true);
      expect(bigBadWolf.playableInUI).toBe(true);
      expect(bigBadWolf.faction).toBe('WEREWOLF');
      expect(bigBadWolf.wakePriority).toBe(33);

      const wolfAccursed = ROLES_BY_ID['wolf_accursed'];
      expect(wolfAccursed.implementedInEngine).toBe(true);
      expect(wolfAccursed.playableInUI).toBe(true);
      expect(wolfAccursed.multiDeviceOnly).toBe(true);
      expect(wolfAccursed.faction).toBe('WEREWOLF');
      expect(wolfAccursed.wakePriority).toBe(32);
    });
  });

  // =========================================================================
  // 2. LOBBY DECK VALIDATION
  // =========================================================================
  describe('Lobby Validation & Mutual Exclusivity', () => {
    it('should include lone_wolf, big_bad_wolf, wolf_accursed, dire_wolf, white_wolf in NIGHT_HUNTING_WOLF_IDS', () => {
      expect((NIGHT_HUNTING_WOLF_IDS as readonly string[]).includes('lone_wolf')).toBe(true);
      expect((NIGHT_HUNTING_WOLF_IDS as readonly string[]).includes('big_bad_wolf')).toBe(true);
      expect((NIGHT_HUNTING_WOLF_IDS as readonly string[]).includes('wolf_accursed')).toBe(true);
      expect((NIGHT_HUNTING_WOLF_IDS as readonly string[]).includes('dire_wolf')).toBe(true);
      expect((NIGHT_HUNTING_WOLF_IDS as readonly string[]).includes('white_wolf')).toBe(true);
    });

    it('should consider lone_wolf alone as a valid night hunting wolf', () => {
      const deck: RoleSelectionMap = {
        lone_wolf: 1,
        seer: 1,
        bodyguard: 1,
        villager: 3,
      };
      const metrics = computeDeckMetrics(deck, createMockLobbyPlayers(6), true);
      expect(metrics.hasNightHuntingWolf).toBe(true);
      expect(metrics.isReadyToStart).toBe(true);
    });

    it('should consider big_bad_wolf alone as a valid night hunting wolf', () => {
      const deck: RoleSelectionMap = {
        big_bad_wolf: 1,
        seer: 1,
        bodyguard: 1,
        villager: 3,
      };
      const metrics = computeDeckMetrics(deck, createMockLobbyPlayers(6), true);
      expect(metrics.hasNightHuntingWolf).toBe(true);
      expect(metrics.isReadyToStart).toBe(true);
    });

    it('should reject deck selecting both lone_wolf and white_wolf simultaneously', () => {
      expect(MUTUALLY_EXCLUSIVE_ROLES).toContainEqual(['lone_wolf', 'white_wolf']);

      const deck: RoleSelectionMap = {
        lone_wolf: 1,
        white_wolf: 1,
        seer: 1,
        bodyguard: 1,
        villager: 2,
      };
      const metrics = computeDeckMetrics(deck, createMockLobbyPlayers(6), true);
      expect(metrics.isReadyToStart).toBe(false);
      expect(metrics.statusType).toBe('error');
      expect(metrics.statusMessage).toContain('Không thể chọn đồng thời Sói cô đơn và Sói trắng');
    });

    it('should accept white_wolf alone without lone_wolf', () => {
      const deck: RoleSelectionMap = {
        white_wolf: 1,
        seer: 1,
        bodyguard: 1,
        villager: 3,
      };
      const metrics = computeDeckMetrics(deck, createMockLobbyPlayers(6), true);
      expect(metrics.hasNightHuntingWolf).toBe(true);
      expect(metrics.isReadyToStart).toBe(true);
    });
  });

  // =========================================================================
  // 3. TURN PLAN & hasAnyBitingWolfDied HELPER
  // =========================================================================
  describe('Turn Plan & Biting Wolf Dead Checks', () => {
    it('hasAnyBitingWolfDied returns false when no wolf died or only minion/sorcerer died', () => {
      const game = createTestGame([
        'big_bad_wolf',
        'minion',
        'sorcerer',
        'seer',
        'villager',
        'villager',
      ]);

      expect(hasAnyBitingWolfDied(game)).toBe(false);

      // Giả sử minion chết
      game.deaths.push({
        playerId: 'p2',
        roleId: 'minion',
        roundNumber: 1,
        phase: 'DAY_VOTE',
        cause: 'VILLAGE_VOTE',
        cascadeDepth: 0,
      });
      game.players[1].isAlive = false;
      expect(hasAnyBitingWolfDied(game)).toBe(false);

      // Giả sử sorcerer chết
      game.deaths.push({
        playerId: 'p3',
        roleId: 'sorcerer',
        roundNumber: 1,
        phase: 'DAY_VOTE',
        cause: 'VILLAGE_VOTE',
        cascadeDepth: 0,
      });
      game.players[2].isAlive = false;
      expect(hasAnyBitingWolfDied(game)).toBe(false);
    });

    it('hasAnyBitingWolfDied returns true when any biting wolf died', () => {
      const bitingRoles = [
        'werewolf',
        'wolf_cub',
        'white_wolf',
        'lone_wolf',
        'big_bad_wolf',
        'wolf_accursed',
        'dire_wolf',
      ];

      for (const roleId of bitingRoles) {
        const game = createTestGame([roleId, 'villager', 'villager', 'villager', 'villager', 'villager']);
        game.deaths.push({
          playerId: 'p1',
          roleId,
          roundNumber: 1,
          phase: 'DAY_VOTE',
          cause: 'VILLAGE_VOTE',
          cascadeDepth: 0,
        });
        game.players[0].isAlive = false;
        expect(hasAnyBitingWolfDied(game)).toBe(true);
      }
    });

    it('hasAnyBitingWolfDied returns true when cursed transformed to werewolf and died', () => {
      const game = createTestGame(['cursed', 'villager', 'villager', 'villager', 'villager', 'villager']);
      // Cursed hóa sói rồi chết
      game.players[0].roleId = 'werewolf';
      game.players[0].faction = 'WEREWOLF';
      game.players[0].isAlive = false;
      game.deaths.push({
        playerId: 'p1',
        roleId: 'werewolf',
        roundNumber: 2,
        phase: 'DAY_VOTE',
        cause: 'VILLAGE_VOTE',
        cascadeDepth: 0,
      });
      expect(hasAnyBitingWolfDied(game)).toBe(true);
    });

    it('should include lone_wolf, big_bad_wolf, wolf_accursed in waking wolves (Priority 30)', () => {
      const game = createTestGame([
        'lone_wolf',    // p1
        'big_bad_wolf', // p2
        'wolf_accursed',// p3
        'seer',         // p4
        'villager',     // p5
        'villager',     // p6
      ]);

      const plan = generateNightTurnPlan(game);
      const wolfPackTurn = plan.find((t) => t.turnKey === 'wolf_pack');
      expect(wolfPackTurn).toBeDefined();
      expect(wolfPackTurn!.priority).toBe(30);
      expect(wolfPackTurn!.activePlayerIds).toEqual(['p1', 'p2', 'p3']);
      expect(wolfPackTurn!.canAct).toBe(true);
    });

    it('should generate Accursed Wolf turn at priority 32 and handle alive vs used vs dead', () => {
      const game = createTestGame([
        'wolf_accursed', // p1
        'werewolf',      // p2
        'seer',          // p3
        'villager',      // p4
        'villager',      // p5
        'villager',      // p6
      ]);

      // Khi còn sống và chưa dùng
      const plan1 = generateNightTurnPlan(game);
      const accursedTurn1 = plan1.find((t) => t.turnKey === 'wolf_accursed');
      expect(accursedTurn1).toBeDefined();
      expect(accursedTurn1!.priority).toBe(32);
      expect(accursedTurn1!.canAct).toBe(true);
      expect(accursedTurn1!.isFake).toBe(false);
      expect(accursedTurn1!.activePlayerIds).toEqual(['p1']);

      // Khi đã dùng phép nguyền -> Fake turn
      game.accursedWolfUsed = true;
      const plan2 = generateNightTurnPlan(game);
      const accursedTurn2 = plan2.find((t) => t.turnKey === 'wolf_accursed');
      expect(accursedTurn2).toBeDefined();
      expect(accursedTurn2!.canAct).toBe(false);
      expect(accursedTurn2!.isFake).toBe(true);
      expect(accursedTurn2!.activePlayerIds).toEqual([]);

      // Khi chết -> Fake turn
      game.accursedWolfUsed = false;
      game.players[0].isAlive = false;
      const plan3 = generateNightTurnPlan(game);
      const accursedTurn3 = plan3.find((t) => t.turnKey === 'wolf_accursed');
      expect(accursedTurn3).toBeDefined();
      expect(accursedTurn3!.canAct).toBe(false);
      expect(accursedTurn3!.isFake).toBe(true);
    });

    it('should generate Big Bad Wolf turn at priority 33 and handle alive vs wolf died vs dead', () => {
      const game = createTestGame([
        'big_bad_wolf', // p1
        'werewolf',     // p2
        'minion',       // p3
        'seer',         // p4
        'villager',     // p5
        'villager',     // p6
      ]);

      // Chưa có sói cắn nào chết -> canAct: true
      const plan1 = generateNightTurnPlan(game);
      const bbTurn1 = plan1.find((t) => t.turnKey === 'big_bad_wolf');
      expect(bbTurn1).toBeDefined();
      expect(bbTurn1!.priority).toBe(33);
      expect(bbTurn1!.canAct).toBe(true);
      expect(bbTurn1!.isFake).toBe(false);
      expect(bbTurn1!.activePlayerIds).toEqual(['p1']);

      // Minion chết -> Big Bad Wolf VẪN được cắn thêm
      game.players[2].isAlive = false;
      game.deaths.push({
        playerId: 'p3',
        roleId: 'minion',
        roundNumber: 1,
        phase: 'DAY_VOTE',
        cause: 'VILLAGE_VOTE',
        cascadeDepth: 0,
      });
      const plan2 = generateNightTurnPlan(game);
      const bbTurn2 = plan2.find((t) => t.turnKey === 'big_bad_wolf');
      expect(bbTurn2!.canAct).toBe(true);
      expect(bbTurn2!.isFake).toBe(false);

      // Ma sói cắn đêm (p2) chết -> Big Bad Wolf MẤT lượt cắn thêm (Fake turn)
      game.players[1].isAlive = false;
      game.deaths.push({
        playerId: 'p2',
        roleId: 'werewolf',
        roundNumber: 1,
        phase: 'DAY_VOTE',
        cause: 'VILLAGE_VOTE',
        cascadeDepth: 0,
      });
      const plan3 = generateNightTurnPlan(game);
      const bbTurn3 = plan3.find((t) => t.turnKey === 'big_bad_wolf');
      expect(bbTurn3!.canAct).toBe(false);
      expect(bbTurn3!.isFake).toBe(true);
      expect(bbTurn3!.activePlayerIds).toEqual([]);

      // Big Bad Wolf chết -> Fake turn
      game.players[0].isAlive = false;
      const plan4 = generateNightTurnPlan(game);
      const bbTurn4 = plan4.find((t) => t.turnKey === 'big_bad_wolf');
      expect(bbTurn4!.canAct).toBe(false);
      expect(bbTurn4!.isFake).toBe(true);
    });
  });

  // =========================================================================
  // 4. NIGHT RESOLUTION & PREVIEW HELPERS
  // =========================================================================
  describe('Night Resolution & Preview Helpers', () => {
    it('getRawWolfTargets combines wolfPack and bigBadWolf targets', () => {
      const game = createTestGame([
        'big_bad_wolf', // p1
        'seer',         // p2
        'bodyguard',    // p3
        'villager',     // p4
        'villager',     // p5
        'villager',     // p6
      ]);

      const actions = {
        wolfPack: { targets: ['p4'] },
        bigBadWolf: { targetId: 'p5' },
      };

      const rawTargets = getRawWolfTargets(game, actions);
      expect(rawTargets).toEqual(['p4', 'p5']);
    });

    it('getRawWolfTargets deduplicates if bigBadWolf targets the same player', () => {
      const game = createTestGame([
        'big_bad_wolf', // p1
        'seer',         // p2
        'bodyguard',    // p3
        'villager',     // p4
        'villager',     // p5
        'villager',     // p6
      ]);

      const actions = {
        wolfPack: { targets: ['p4'] },
        bigBadWolf: { targetId: 'p4' },
      };

      const rawTargets = getRawWolfTargets(game, actions);
      expect(rawTargets).toEqual(['p4']);
    });

    it('getRawWolfTargets ignores bigBadWolf when a biting wolf died', () => {
      const game = createTestGame([
        'big_bad_wolf', // p1
        'werewolf',     // p2 (đã chết)
        'seer',         // p3
        'villager',     // p4
        'villager',     // p5
        'villager',     // p6
      ]);
      game.players[1].isAlive = false;
      game.deaths.push({
        playerId: 'p2',
        roleId: 'werewolf',
        roundNumber: 1,
        phase: 'DAY_VOTE',
        cause: 'VILLAGE_VOTE',
        cascadeDepth: 0,
      });

      const actions = {
        wolfPack: { targets: ['p4'] },
        bigBadWolf: { targetId: 'p5' },
      };

      const rawTargets = getRawWolfTargets(game, actions);
      expect(rawTargets).toEqual(['p4']);
    });

    it('Scenario 4: wolf_accursed + witch preview (Phù thủy thấy đêm bình yên)', () => {
      const game = createTestGame([
        'wolf_accursed', // p1
        'witch',         // p2
        'seer',          // p3
        'villager',      // p4
        'villager',      // p5
        'villager',      // p6
      ]);

      const actions = {
        wolfPack: { targets: ['p4'] },
        accursedWolf: { curseTargetId: 'p4' },
      };

      const preview = getWitchVictimsPreview(game, actions);
      expect(preview).toEqual([]);
    });

    it('Scenario 18: big_bad_wolf + bodyguard + witch preview (Bảo vệ đỡ A, Phù thủy thấy B)', () => {
      const game = createTestGame([
        'big_bad_wolf', // p1
        'bodyguard',    // p2
        'witch',        // p3
        'villager',     // p4 (A)
        'villager',     // p5 (B)
        'villager',     // p6
      ]);

      const actions = {
        wolfPack: { targets: ['p4'] },
        bigBadWolf: { targetId: 'p5' },
        bodyguard: { targetId: 'p4' },
      };

      const preview = getWitchVictimsPreview(game, actions);
      expect(preview).toEqual(['p5']);
    });

    it('Scenario 3: wolf_accursed + bodyguard (Bảo vệ đỡ trúng -> nguyền thất bại và HOÀN TRẢ)', () => {
      const game = createTestGame([
        'wolf_accursed', // p1
        'bodyguard',     // p2
        'villager',      // p3
        'villager',      // p4
        'villager',      // p5
        'villager',      // p6
      ]);

      const actions = {
        wolfPack: { targets: ['p3'] },
        accursedWolf: { curseTargetId: 'p3' },
        bodyguard: { targetId: 'p3' },
      };

      const { nextState } = resolveNight(game, actions);

      // p3 được bảo vệ che chở, không chết
      expect(nextState.players.find((p) => p.id === 'p3')!.isAlive).toBe(true);
      // p3 KHÔNG bị biến thành Ma sói
      expect(nextState.players.find((p) => p.id === 'p3')!.faction).toBe('VILLAGER');
      expect(nextState.players.find((p) => p.id === 'p3')!.roleId).toBe('villager');
      // Lời nguyền thất bại và được HOÀN TRẢ
      expect(nextState.accursedWolfUsed).toBe(false);
    });

    it('wolf_accursed successfully curses victim: transforms immediately and consumes power', () => {
      const game = createTestGame([
        'wolf_accursed', // p1
        'seer',          // p2
        'villager',      // p3
        'villager',      // p4
        'villager',      // p5
        'villager',      // p6
      ]);

      const actions = {
        wolfPack: { targets: ['p3'] },
        accursedWolf: { curseTargetId: 'p3' },
      };

      const { nextState, output } = resolveNight(game, actions);

      const target = nextState.players.find((p) => p.id === 'p3')!;
      expect(target.isAlive).toBe(true);
      expect(target.faction).toBe('WEREWOLF');
      expect(target.roleId).toBe('werewolf');
      expect(nextState.accursedWolfUsed).toBe(true);

      // Emit event AWAKENED
      const awakenedEvent = output.events.find(
        (e) => e.type === 'AWAKENED' && e.sourceRole === 'wolf_accursed'
      );
      expect(awakenedEvent).toBeDefined();
      expect(awakenedEvent!.targetPlayerId).toBe('p3');
    });

    it('wolf_accursed bypasses Elder HP and Tough Guy delay', () => {
      const game = createTestGame([
        'wolf_accursed', // p1
        'elder',         // p2 (elderHp = 2)
        'tough_guy',     // p3
        'villager',      // p4
        'villager',      // p5
        'villager',      // p6
      ]);

      // Nguyền Già làng
      const actionsElder = {
        wolfPack: { targets: ['p2'] },
        accursedWolf: { curseTargetId: 'p2' },
      };
      const { nextState: stateAfterElder } = resolveNight(game, actionsElder);
      const elder = stateAfterElder.players.find((p) => p.id === 'p2')!;
      expect(elder.isAlive).toBe(true);
      expect(elder.roleId).toBe('werewolf');
      expect(elder.faction).toBe('WEREWOLF');

      // Nguyền Người cứng cỏi
      const actionsTough = {
        wolfPack: { targets: ['p3'] },
        accursedWolf: { curseTargetId: 'p3' },
      };
      const { nextState: stateAfterTough } = resolveNight(game, actionsTough);
      const toughGuy = stateAfterTough.players.find((p) => p.id === 'p3')!;
      expect(toughGuy.isAlive).toBe(true);
      expect(toughGuy.roleId).toBe('werewolf');
      expect(toughGuy.faction).toBe('WEREWOLF');
      expect(toughGuy.toughGuyBittenNight).toBeUndefined(); // Không bị hoãn sụp đổ
    });

    it('State Snapshot: Seer inspecting the cursed target on the same night sees VILLAGER', () => {
      const game = createTestGame([
        'wolf_accursed', // p1
        'seer',          // p2
        'villager',      // p3
        'villager',      // p4
        'villager',      // p5
        'villager',      // p6
      ]);

      const actions = {
        wolfPack: { targets: ['p3'] },
        accursedWolf: { curseTargetId: 'p3' },
        seer: { targetId: 'p3' },
      };

      const { output } = resolveNight(game, actions);
      // Quy tắc State Snapshot: soi trạng thái đầu đêm -> VILLAGER
      expect(output.infoResults.seerResult?.targetId).toBe('p3');
      expect(output.infoResults.seerResult?.result).toBe('VILLAGER');
    });

    it('wolf_accursed cursing the last cult_leader disbands cult membership and links CULT_DISBAND to CURSE', () => {
      const game = createTestGame([
        'wolf_accursed', // p1
        'cult_leader',   // p2
        'villager',      // p3
        'villager',      // p4
        'villager',      // p5
        'villager',      // p6
      ]);
      game.roundNumber = 2;
      game.players[2].isCultMember = true; // p3 đã theo giáo phái từ đêm 1

      const { nextState } = resolveNight(game, {
        wolfPack: { targets: ['p2'] },
        accursedWolf: { curseTargetId: 'p2' },
        cultLeader: { targetId: 'p4' },
      });

      const turned = nextState.players.find((p) => p.id === 'p2')!;
      expect(turned.isAlive).toBe(true);
      expect(turned.roleId).toBe('werewolf');
      expect(turned.faction).toBe('WEREWOLF');
      expect(nextState.players.some((p) => p.isCultMember)).toBe(false);

      const curseEvt = nextState.eventLog?.find((e) => e.actionType === 'CURSE');
      const disbandEvt = nextState.eventLog?.find((e) => e.actionType === 'CULT_DISBAND');
      expect(curseEvt?.outcome).toBe('SUCCESS');
      expect(disbandEvt?.parentEventId).toBe(curseEvt?.id);
      expect(formatMatchEventText(disbandEvt!, { mode: 'POST_GAME' })).toContain(
        'bị nguyền thành Ma sói → Giáo phái giải tán.'
      );
    });

    it('wolf_accursed cursing the last pied_piper clears enchantments and links PIED_PIPER_CLEAR to CURSE', () => {
      const game = createTestGame([
        'wolf_accursed', // p1
        'pied_piper',    // p2
        'villager',      // p3
        'villager',      // p4
        'villager',      // p5
        'villager',      // p6
      ]);
      game.roundNumber = 2;
      game.players[2].isEnchanted = true;
      game.players[3].isEnchanted = true;

      const { nextState } = resolveNight(game, {
        wolfPack: { targets: ['p2'] },
        accursedWolf: { curseTargetId: 'p2' },
        piedPiper: { targetIds: ['p5', 'p6'] },
      });

      const turned = nextState.players.find((p) => p.id === 'p2')!;
      expect(turned.isAlive).toBe(true);
      expect(turned.roleId).toBe('werewolf');
      expect(nextState.players.some((p) => p.isEnchanted)).toBe(false);

      const curseEvt = nextState.eventLog?.find((e) => e.actionType === 'CURSE');
      const clearEvt = nextState.eventLog?.find((e) => e.actionType === 'PIED_PIPER_CLEAR');
      expect(clearEvt?.parentEventId).toBe(curseEvt?.id);
      expect(formatMatchEventText(clearEvt!, { mode: 'POST_GAME' })).toContain(
        'bị nguyền thành Ma sói → Toàn bộ bùa thôi miên tan biến.'
      );
    });

    it('big_bad_wolf attacks extra target and interacts normally with bodyguard & witch', () => {
      const game = createTestGame([
        'big_bad_wolf', // p1
        'bodyguard',    // p2
        'witch',        // p3
        'villager',     // p4
        'villager',     // p5
        'villager',     // p6
      ], { witchHealMode: 'SINGLE' });

      // Bầy sói cắn p4 (bảo vệ đỡ), Big Bad Wolf cắn p5, Phù thủy cứu p5
      const actions = {
        wolfPack: { targets: ['p4'] },
        bigBadWolf: { targetId: 'p5' },
        bodyguard: { targetId: 'p4' },
        witch: { heal: true, healTargetId: 'p5' },
      };

      const { nextState } = resolveNight(game, actions);
      expect(nextState.players.find((p) => p.id === 'p4')!.isAlive).toBe(true);
      expect(nextState.players.find((p) => p.id === 'p5')!.isAlive).toBe(true);
      expect(nextState.witchHealUsed).toBe(true);
    });

    it('big_bad_wolf double kill interacts with witch AOE heal', () => {
      const game = createTestGame([
        'big_bad_wolf', // p1
        'witch',        // p2
        'villager',     // p3
        'villager',     // p4
        'villager',     // p5
        'villager',     // p6
      ], { witchHealMode: 'AOE' });

      const actions = {
        wolfPack: { targets: ['p3'] },
        bigBadWolf: { targetId: 'p4' },
        witch: { heal: true },
      };

      const { nextState } = resolveNight(game, actions);
      expect(nextState.players.find((p) => p.id === 'p3')!.isAlive).toBe(true);
      expect(nextState.players.find((p) => p.id === 'p4')!.isAlive).toBe(true);
      expect(nextState.witchHealUsed).toBe(true);
    });

    it('big_bad_wolf attack respects Elder 2 HP and Tough Guy delay', () => {
      const game = createTestGame([
        'big_bad_wolf', // p1
        'elder',        // p2
        'tough_guy',    // p3
        'villager',     // p4
        'villager',     // p5
        'villager',     // p6
      ]);

      // Big bad wolf cắn Già làng
      const actionsElder = {
        wolfPack: { targets: ['p4'] },
        bigBadWolf: { targetId: 'p2' },
      };
      const { nextState: stateElder } = resolveNight(game, actionsElder);
      const elder = stateElder.players.find((p) => p.id === 'p2')!;
      expect(elder.isAlive).toBe(true);
      expect(elder.elderHp).toBe(1);

      // Big bad wolf cắn Người cứng cỏi
      const actionsTough = {
        wolfPack: { targets: ['p4'] },
        bigBadWolf: { targetId: 'p3' },
      };
      const { nextState: stateTough } = resolveNight(game, actionsTough);
      const toughGuy = stateTough.players.find((p) => p.id === 'p3')!;
      expect(toughGuy.isAlive).toBe(true);
      expect(toughGuy.toughGuyBittenNight).toBe(1);
    });
  });

  // =========================================================================
  // 5. WIN CONDITIONS (LONE WOLF, DEADLOCK FALLBACK, PARITY DELAY)
  // =========================================================================
  describe('Win Conditions & Deadlock Prevention', () => {
    it('Scenario 13: Deadlock fallback when only lone_wolf and white_wolf remain (aliveCount === 2)', () => {
      const game = createTestGame([
        'lone_wolf',  // p1
        'white_wolf', // p2
        'villager',   // p3 (dead)
        'villager',   // p4 (dead)
        'villager',   // p5 (dead)
        'villager',   // p6 (dead)
      ]);
      game.players[2].isAlive = false;
      game.players[3].isAlive = false;
      game.players[4].isAlive = false;
      game.players[5].isAlive = false;

      const outcome = checkWinCondition(game);
      expect(outcome).not.toBeNull();
      expect(outcome!.winner).toBe('WHITE_WOLF');
      expect(outcome!.winningPlayerIds).toEqual(['p2']);
      expect(outcome!.reason).toContain('Sói trắng và Sói cô đơn là 2 kẻ sống sót cuối cùng');
    });

    it('Priority 7: Lone Wolf sole survivor (aliveCount === 1) wins solo', () => {
      const game = createTestGame([
        'lone_wolf', // p1
        'werewolf',  // p2 (dead)
        'villager',  // p3 (dead)
        'villager',  // p4 (dead)
        'villager',  // p5 (dead)
        'villager',  // p6 (dead)
      ]);
      game.players[1].isAlive = false;
      game.players[2].isAlive = false;
      game.players[3].isAlive = false;
      game.players[4].isAlive = false;
      game.players[5].isAlive = false;

      const outcome = checkWinCondition(game);
      expect(outcome).not.toBeNull();
      expect(outcome!.winner).toBe('LONE_WOLF');
      expect(outcome!.winningPlayerIds).toEqual(['p1']);
      expect(outcome!.reason).toContain('Sói cô đơn đã tiêu diệt toàn bộ dân làng');
    });

    it('Lone Wolf wins with pack when other wolves are also alive', () => {
      const game = createTestGame([
        'lone_wolf', // p1 (alive)
        'werewolf',  // p2 (alive)
        'villager',  // p3 (alive)
        'villager',  // p4 (dead)
        'villager',  // p5 (dead)
        'villager',  // p6 (dead)
      ]);
      // Sói = 2 (p1, p2), Dân = 1 (p3) -> Wolves parity outnumber villagers (2 >= 1)
      game.players[3].isAlive = false;
      game.players[4].isAlive = false;
      game.players[5].isAlive = false;

      const outcome = checkWinCondition(game);
      expect(outcome).not.toBeNull();
      expect(outcome!.winner).toBe('WEREWOLF');
      expect(outcome!.winningPlayerIds).toContain('p1');
      expect(outcome!.winningPlayerIds).toContain('p2');
    });

    it('Lone Wolf 1 vs 1 Villager: returns null to allow Lone Wolf to hunt the villager at night', () => {
      const game = createTestGame([
        'lone_wolf', // p1 (alive)
        'werewolf',  // p2 (dead)
        'villager',  // p3 (alive)
        'villager',  // p4 (dead)
        'villager',  // p5 (dead)
        'villager',  // p6 (dead)
      ]);
      // Sói = 1 (lone_wolf), Dân = 1 (villager).
      // Thay vì kết thúc ván ngay bằng WEREWOLF win, hoãn (null) để Lone Wolf đạt solo victory
      game.players[1].isAlive = false;
      game.players[3].isAlive = false;
      game.players[4].isAlive = false;
      game.players[5].isAlive = false;

      const outcome = checkWinCondition(game);
      expect(outcome).toBeNull();
    });

    it('Lone Wolf with Minion alive and no living villagers: Werewolf pack wins', () => {
      const game = createTestGame([
        'lone_wolf', // p1 (alive)
        'minion',    // p2 (alive)
        'villager',  // p3 (dead)
        'villager',  // p4 (dead)
        'villager',  // p5 (dead)
        'villager',  // p6 (dead)
      ]);
      game.players[2].isAlive = false;
      game.players[3].isAlive = false;
      game.players[4].isAlive = false;
      game.players[5].isAlive = false;

      // livingNonWolves = 0, activeWolves = 1. Wolves win together
      const outcome = checkWinCondition(game);
      expect(outcome).not.toBeNull();
      expect(outcome!.winner).toBe('WEREWOLF');
      expect(outcome!.winningPlayerIds).toContain('p1');
      expect(outcome!.winningPlayerIds).toContain('p2');
    });
  });
});
