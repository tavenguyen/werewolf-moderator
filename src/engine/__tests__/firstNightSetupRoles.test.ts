import { describe, expect, it } from 'bun:test';
import { processDeathCascade } from '../deathCascade';
import { resolveNight } from '../nightResolution';
import { ROLES_BY_ID } from '../roles';
import { generateNightTurnPlan } from '../turnPlan';
import { checkWinCondition } from '../winConditions';
import { createTestGame } from './testHelpers';

describe('Engine - First Night Setup Roles (mason, wild_child, dire_wolf, hoodlum)', () => {
  // =========================================================================
  // 1. METADATA & CONFIGURATION
  // =========================================================================
  describe('Roles Metadata', () => {
    it('should have correct metadata for mason, wild_child, dire_wolf, hoodlum', () => {
      const mason = ROLES_BY_ID['mason'];
      expect(mason.implementedInEngine).toBe(true);
      expect(mason.playableInUI).toBe(true);
      expect(mason.faction).toBe('VILLAGER');
      expect(mason.wakeFrequency).toBe('FIRST_NIGHT_ONLY');
      expect(mason.wakePriority).toBe(14);

      const wildChild = ROLES_BY_ID['wild_child'];
      expect(wildChild.implementedInEngine).toBe(true);
      expect(wildChild.playableInUI).toBe(true);
      expect(wildChild.multiDeviceOnly).toBe(true);
      expect(wildChild.faction).toBe('VILLAGER');
      expect(wildChild.wakeFrequency).toBe('FIRST_NIGHT_ONLY');
      expect(wildChild.wakePriority).toBe(12);

      const direWolf = ROLES_BY_ID['dire_wolf'];
      expect(direWolf.implementedInEngine).toBe(true);
      expect(direWolf.playableInUI).toBe(true);
      expect(direWolf.faction).toBe('WEREWOLF');
      expect(direWolf.wakeFrequency).toBe('EVERY_NIGHT');
      expect(direWolf.wakePriority).toBe(16);

      const hoodlum = ROLES_BY_ID['hoodlum'];
      expect(hoodlum.implementedInEngine).toBe(true);
      expect(hoodlum.playableInUI).toBe(true);
      expect(hoodlum.faction).toBe('THIRD_PARTY');
      expect(hoodlum.wakeFrequency).toBe('FIRST_NIGHT_ONLY');
      expect(hoodlum.wakePriority).toBe(13);
    });
  });

  // =========================================================================
  // 2. WILD CHILD (Đứa con hoang)
  // =========================================================================
  describe('Wild Child (wild_child)', () => {
    it('should generate Night 1 turn with priority 12 and not appear on Night 2', () => {
      const game = createTestGame([
        'wild_child', // p1
        'werewolf',   // p2
        'seer',       // p3
        'bodyguard',  // p4
        'villager',   // p5
        'villager',   // p6
      ]);

      const planN1 = generateNightTurnPlan(game);
      const wcTurnN1 = planN1.find((t) => t.turnKey === 'wild_child');
      expect(wcTurnN1).toBeDefined();
      expect(wcTurnN1!.priority).toBe(12);
      expect(wcTurnN1!.roleId).toBe('wild_child');
      expect(wcTurnN1!.titleVi).toBe('Đứa con hoang');
      expect(wcTurnN1!.activePlayerIds).toEqual(['p1']);
      expect(wcTurnN1!.canAct).toBe(true);

      // Đêm 2 không có lượt riêng
      game.roundNumber = 2;
      const planN2 = generateNightTurnPlan(game);
      const wcTurnN2 = planN2.find((t) => t.turnKey === 'wild_child');
      expect(wcTurnN2).toBeUndefined();
    });

    it('should assign roleModelId during Night 1 resolution', () => {
      const game = createTestGame([
        'wild_child', // p1
        'werewolf',   // p2
        'seer',       // p3
        'bodyguard',  // p4
        'villager',   // p5
        'villager',   // p6
      ]);

      const { nextState } = resolveNight(game, {
        wildChild: { targetId: 'p5' },
      });

      const wc = nextState.players.find((p) => p.id === 'p1')!;
      expect(wc.roleModelId).toBe('p5');
      expect(wc.faction).toBe('VILLAGER');
      expect(wc.roleId).toBe('wild_child');
    });

    it('should remain villager while idol is alive and not wake with wolf pack', () => {
      const game = createTestGame([
        'wild_child', // p1
        'werewolf',   // p2
        'seer',       // p3
        'bodyguard',  // p4
        'villager',   // p5
        'villager',   // p6
      ]);
      game.players[0].roleModelId = 'p5';

      const plan = generateNightTurnPlan(game);
      const wolfTurn = plan.find((t) => t.turnKey === 'wolf_pack')!;
      expect(wolfTurn.activePlayerIds).not.toContain('p1');
      expect(wolfTurn.activePlayerIds).toEqual(['p2']);
    });

    it('should immediately transform into Werewolf when idol dies by any cause', () => {
      const game = createTestGame([
        'wild_child', // p1
        'werewolf',   // p2
        'seer',       // p3
        'bodyguard',  // p4
        'villager',   // p5 (idol)
        'villager',   // p6
      ]);
      game.players[0].roleModelId = 'p5';

      // Thần tượng p5 bị treo cổ
      processDeathCascade(game, [{ playerId: 'p5', cause: 'VILLAGE_VOTE' }]);

      const wc = game.players.find((p) => p.id === 'p1')!;
      expect(wc.faction).toBe('WEREWOLF');
      expect(wc.roleId).toBe('werewolf');
      expect(game.historyLogs.some((l) => l.includes('Đứa con hoang (Player 1) mất đi thần tượng và đã biến thành Ma sói!'))).toBe(true);

      // Đêm kế tiếp thức dậy cắn cùng bầy Sói
      game.roundNumber = 2;
      const plan = generateNightTurnPlan(game);
      const wolfTurn = plan.find((t) => t.turnKey === 'wolf_pack')!;
      expect(wolfTurn.activePlayerIds).toContain('p1');
      expect(wolfTurn.activePlayerIds).toContain('p2');
    });

    it('should die as villager if dying before idol', () => {
      const game = createTestGame([
        'wild_child', // p1
        'werewolf',   // p2
        'seer',       // p3
        'bodyguard',  // p4
        'villager',   // p5 (idol)
        'villager',   // p6
      ]);
      game.players[0].roleModelId = 'p5';

      // p1 chết trước do sói cắn
      processDeathCascade(game, [{ playerId: 'p1', cause: 'WOLF_PACK' }]);
      const wc = game.players.find((p) => p.id === 'p1')!;
      expect(wc.isAlive).toBe(false);
      expect(wc.faction).toBe('VILLAGER');
      expect(wc.roleId).toBe('wild_child');

      // Thần tượng p5 chết sau đó -> p1 không bị biến đổi vì đã chết
      processDeathCascade(game, [{ playerId: 'p5', cause: 'VILLAGE_VOTE' }]);
      expect(wc.faction).toBe('VILLAGER');
      expect(wc.roleId).toBe('wild_child');
    });
  });

  // =========================================================================
  // 3. DIRE WOLF (Sói tuyết)
  // =========================================================================
  describe('Dire Wolf (dire_wolf)', () => {
    it('should have solo turn priority 16 on Night 1 and wake with wolves every night', () => {
      const game = createTestGame([
        'dire_wolf', // p1
        'werewolf',  // p2
        'seer',      // p3
        'bodyguard', // p4
        'villager',  // p5
        'villager',  // p6
      ]);

      const planN1 = generateNightTurnPlan(game);
      const dwTurnN1 = planN1.find((t) => t.turnKey === 'dire_wolf');
      expect(dwTurnN1).toBeDefined();
      expect(dwTurnN1!.priority).toBe(16);
      expect(dwTurnN1!.activePlayerIds).toEqual(['p1']);

      const wolfTurnN1 = planN1.find((t) => t.turnKey === 'wolf_pack')!;
      expect(wolfTurnN1.activePlayerIds).toContain('p1');
      expect(wolfTurnN1.activePlayerIds).toContain('p2');

      // Đêm 2 không có solo turn nhưng vẫn cắn cùng bầy Sói
      game.roundNumber = 2;
      const planN2 = generateNightTurnPlan(game);
      expect(planN2.find((t) => t.turnKey === 'dire_wolf')).toBeUndefined();
      const wolfTurnN2 = planN2.find((t) => t.turnKey === 'wolf_pack')!;
      expect(wolfTurnN2.activePlayerIds).toContain('p1');
      expect(wolfTurnN2.activePlayerIds).toContain('p2');
    });

    it('should record companionId during Night 1 resolution', () => {
      const game = createTestGame([
        'dire_wolf', // p1
        'werewolf',  // p2
        'seer',      // p3
        'bodyguard', // p4
        'villager',  // p5
        'villager',  // p6
      ]);

      const { nextState } = resolveNight(game, {
        direWolf: { targetId: 'p5' },
      });

      const dw = nextState.players.find((p) => p.id === 'p1')!;
      expect(dw.companionId).toBe('p5');
    });

    it('should die of heartbreak (COMPANION_DEATH) when companion dies', () => {
      const game = createTestGame([
        'dire_wolf', // p1
        'werewolf',  // p2
        'seer',      // p3
        'bodyguard', // p4
        'villager',  // p5 (companion)
        'villager',  // p6
      ]);
      game.players[0].companionId = 'p5';

      // Bạn đồng hành p5 chết do treo cổ
      const deaths = processDeathCascade(game, [{ playerId: 'p5', cause: 'VILLAGE_VOTE' }]);

      expect(game.players.find((p) => p.id === 'p1')!.isAlive).toBe(false);
      expect(game.players.find((p) => p.id === 'p5')!.isAlive).toBe(false);

      const dwDeath = deaths.find((d) => d.playerId === 'p1');
      expect(dwDeath).toBeDefined();
      expect(dwDeath!.cause).toBe('COMPANION_DEATH');
      expect(dwDeath!.cascadeDepth).toBe(1);
    });

    it('should NOT kill companion when Dire Wolf dies (one-way relationship)', () => {
      const game = createTestGame([
        'dire_wolf', // p1
        'werewolf',  // p2
        'seer',      // p3
        'bodyguard', // p4
        'villager',  // p5 (companion)
        'villager',  // p6
      ]);
      game.players[0].companionId = 'p5';

      // Sói tuyết p1 bị treo cổ
      const deaths = processDeathCascade(game, [{ playerId: 'p1', cause: 'VILLAGE_VOTE' }]);

      expect(game.players.find((p) => p.id === 'p1')!.isAlive).toBe(false);
      expect(game.players.find((p) => p.id === 'p5')!.isAlive).toBe(true);
      expect(deaths.some((d) => d.playerId === 'p5')).toBe(false);
    });
  });

  // =========================================================================
  // 4. MASON (Hội Tam Điểm)
  // =========================================================================
  describe('Mason (mason)', () => {
    it('should wake all alive masons together on Night 1 with priority 14', () => {
      const game = createTestGame([
        'mason',    // p1
        'mason',    // p2
        'werewolf', // p3
        'seer',     // p4
        'villager', // p5
        'villager', // p6
      ]);

      const planN1 = generateNightTurnPlan(game);
      const masonTurnN1 = planN1.find((t) => t.turnKey === 'mason');
      expect(masonTurnN1).toBeDefined();
      expect(masonTurnN1!.priority).toBe(14);
      expect(masonTurnN1!.roleId).toBe('mason');
      expect(masonTurnN1!.titleVi).toBe('Hội Tam Điểm');
      expect(masonTurnN1!.activePlayerIds).toEqual(['p1', 'p2']);
      expect(masonTurnN1!.canAct).toBe(true);

      // Đêm 2 không thức dậy
      game.roundNumber = 2;
      const planN2 = generateNightTurnPlan(game);
      expect(planN2.find((t) => t.turnKey === 'mason')).toBeUndefined();
    });
  });

  // =========================================================================
  // 5. HOODLUM (Du côn)
  // =========================================================================
  describe('Hoodlum (hoodlum)', () => {
    it('should have turn on Night 1 with priority 13 and not appear on Night 2', () => {
      const game = createTestGame([
        'hoodlum',  // p1
        'werewolf', // p2
        'seer',     // p3
        'bodyguard',// p4
        'villager', // p5
        'villager', // p6
      ]);

      const planN1 = generateNightTurnPlan(game);
      const hlTurnN1 = planN1.find((t) => t.turnKey === 'hoodlum');
      expect(hlTurnN1).toBeDefined();
      expect(hlTurnN1!.priority).toBe(13);
      expect(hlTurnN1!.activePlayerIds).toEqual(['p1']);
      expect(hlTurnN1!.canAct).toBe(true);

      game.roundNumber = 2;
      const planN2 = generateNightTurnPlan(game);
      expect(planN2.find((t) => t.turnKey === 'hoodlum')).toBeUndefined();
    });

    it('should record 2 targets during Night 1 resolution', () => {
      const game = createTestGame([
        'hoodlum',  // p1
        'werewolf', // p2
        'seer',     // p3
        'bodyguard',// p4
        'villager', // p5
        'villager', // p6
      ]);

      const { nextState } = resolveNight(game, {
        hoodlum: { target1: 'p2', target2: 'p3' },
      });

      const hl = nextState.players.find((p) => p.id === 'p1')!;
      expect(hl.hoodlumTargetIds).toEqual(['p2', 'p3']);
    });

    it('should win alongside Villagers when both targets are dead and Hoodlum is alive', () => {
      const game = createTestGame([
        'hoodlum',  // p1
        'werewolf', // p2 (target 1)
        'villager', // p3 (target 2)
        'villager', // p4
        'villager', // p5
        'villager', // p6
      ]);
      game.players[0].hoodlumTargetIds = ['p2', 'p3'];

      // p2 và p3 chết
      game.players[1].isAlive = false;
      game.players[2].isAlive = false;

      // Toàn bộ sói (p2) đã chết, dân (p4, p5, p6) còn sống
      const outcome = checkWinCondition(game);
      expect(outcome).not.toBeNull();
      expect(outcome!.winner).toBe('VILLAGER');
      expect(outcome!.winningPlayerIds).toContain('p1');
      expect(outcome!.winningPlayerIds).toContain('p4');
      expect(outcome!.winningPlayerIds).toContain('p5');
      expect(outcome!.winningPlayerIds).toContain('p6');
      expect(outcome!.reason).toContain('Du côn (Player 1) đã hoàn thành mục tiêu thanh toán và cùng giành chiến thắng!');
    });

    it('should win alongside Werewolves when both targets are dead and Hoodlum is alive', () => {
      const game = createTestGame([
        'hoodlum',  // p1
        'werewolf', // p2
        'werewolf', // p3
        'villager', // p4 (target 1)
        'villager', // p5 (target 2)
        'villager', // p6
      ]);
      game.players[0].hoodlumTargetIds = ['p4', 'p5'];

      // p4, p5, p6 chết -> Sói áp đảo (2 Sói vs 1 Du côn không phải sói)
      game.players[3].isAlive = false;
      game.players[4].isAlive = false;
      game.players[5].isAlive = false;

      const outcome = checkWinCondition(game);
      expect(outcome).not.toBeNull();
      expect(outcome!.winner).toBe('WEREWOLF');
      expect(outcome!.winningPlayerIds).toContain('p1');
      expect(outcome!.winningPlayerIds).toContain('p2');
      expect(outcome!.winningPlayerIds).toContain('p3');
      expect(outcome!.reason).toContain('Du côn (Player 1) đã hoàn thành mục tiêu thanh toán và cùng giành chiến thắng!');
    });

    it('should win alongside Couple when both targets are dead and Hoodlum is alive', () => {
      const game = createTestGame([
        'hoodlum',  // p1
        'villager', // p2 (lover 1)
        'werewolf', // p3 (lover 2)
        'villager', // p4 (target 1)
        'villager', // p5 (target 2)
        'villager', // p6
      ]);
      game.players[0].hoodlumTargetIds = ['p4', 'p5'];

      // Ghép đôi khác phe (p2 + p3)
      game.players[1].loverId = 'p3';
      game.players[2].loverId = 'p2';
      game.players[1].isCrossFactionCouple = true;
      game.players[2].isCrossFactionCouple = true;

      // Các người khác chết hết
      game.players[3].isAlive = false;
      game.players[4].isAlive = false;
      game.players[5].isAlive = false;

      const outcome = checkWinCondition(game);
      expect(outcome).not.toBeNull();
      expect(outcome!.winner).toBe('COUPLE');
      expect(outcome!.winningPlayerIds).toContain('p1');
      expect(outcome!.winningPlayerIds).toContain('p2');
      expect(outcome!.winningPlayerIds).toContain('p3');
      expect(outcome!.reason).toContain('Du côn (Player 1) đã hoàn thành mục tiêu thanh toán và cùng giành chiến thắng!');
    });

    it('should NOT win if at least 1 target is still alive', () => {
      const game = createTestGame([
        'hoodlum',  // p1
        'werewolf', // p2 (target 1, DEAD)
        'villager', // p3 (target 2, ALIVE)
        'villager', // p4
        'villager', // p5
        'villager', // p6
      ]);
      game.players[0].hoodlumTargetIds = ['p2', 'p3'];

      // Chỉ p2 chết, p3 vẫn sống
      game.players[1].isAlive = false;

      const outcome = checkWinCondition(game);
      expect(outcome).not.toBeNull();
      expect(outcome!.winner).toBe('VILLAGER');
      expect(outcome!.winningPlayerIds).not.toContain('p1');
    });

    it('should NOT win if Hoodlum died before game over', () => {
      const game = createTestGame([
        'hoodlum',  // p1 (DEAD)
        'werewolf', // p2 (target 1, DEAD)
        'villager', // p3 (target 2, DEAD)
        'villager', // p4
        'villager', // p5
        'villager', // p6
      ]);
      game.players[0].hoodlumTargetIds = ['p2', 'p3'];

      game.players[0].isAlive = false;
      game.players[1].isAlive = false;
      game.players[2].isAlive = false;

      const outcome = checkWinCondition(game);
      expect(outcome).not.toBeNull();
      expect(outcome!.winner).toBe('VILLAGER');
      expect(outcome!.winningPlayerIds).not.toContain('p1');
    });

    it('should NOT win alongside solo roles like Tanner or Angel', () => {
      // 1. Tanner
      const gameTanner = createTestGame([
        'hoodlum',  // p1
        'tanner',   // p2
        'werewolf', // p3 (target 1)
        'villager', // p4 (target 2)
        'villager', // p5
        'villager', // p6
      ]);
      gameTanner.players[0].hoodlumTargetIds = ['p3', 'p4'];
      gameTanner.players[2].isAlive = false;
      gameTanner.players[3].isAlive = false;

      // Tanner bị treo cổ
      gameTanner.deaths.push({
        playerId: 'p2',
        roleId: 'tanner',
        cause: 'VILLAGE_VOTE',
        roundNumber: 2,
        phase: 'DAY_VOTE',
        cascadeDepth: 0,
      });

      const outcomeTanner = checkWinCondition(gameTanner);
      expect(outcomeTanner).not.toBeNull();
      expect(outcomeTanner!.winner).toBe('TANNER');
      expect(outcomeTanner!.winningPlayerIds).toEqual(['p2']);
      expect(outcomeTanner!.winningPlayerIds).not.toContain('p1');

      // 2. Angel Ngày 1
      const gameAngel = createTestGame([
        'hoodlum',  // p1
        'angel',    // p2
        'werewolf', // p3 (target 1)
        'villager', // p4 (target 2)
        'villager', // p5
        'villager', // p6
      ]);
      gameAngel.players[0].hoodlumTargetIds = ['p3', 'p4'];
      gameAngel.players[2].isAlive = false;
      gameAngel.players[3].isAlive = false;

      gameAngel.deaths.push({
        playerId: 'p2',
        roleId: 'angel',
        cause: 'VILLAGE_VOTE',
        roundNumber: 1,
        phase: 'DAY_VOTE',
        cascadeDepth: 0,
      });

      const outcomeAngel = checkWinCondition(gameAngel);
      expect(outcomeAngel).not.toBeNull();
      expect(outcomeAngel!.winner).toBe('ANGEL');
      expect(outcomeAngel!.winningPlayerIds).toEqual(['p2']);
      expect(outcomeAngel!.winningPlayerIds).not.toContain('p1');
    });
  });
});
