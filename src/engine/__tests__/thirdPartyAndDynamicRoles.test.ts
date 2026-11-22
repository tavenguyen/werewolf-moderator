import { describe, expect, it } from 'bun:test';
import { processDeathCascade } from '../deathCascade';
import { executeDayVote, executeHunterShot, executeNightPhase } from '../gameEngine';
import { resolveNight } from '../nightResolution';
import { ROLES_BY_ID } from '../roles';
import { generateNightTurnPlan } from '../turnPlan';
import { checkWinCondition } from '../winConditions';
import { createTestGame } from './testHelpers';

describe('Engine - Phase 5 Third Party & Dynamic Roles (pied_piper, cult_leader, drunk, doppelganger)', () => {
  // =========================================================================
  // 1. METADATA & CONFIGURATION
  // =========================================================================
  describe('Roles Metadata & Config', () => {
    it('should have correct metadata for pied_piper, cult_leader, drunk, doppelganger', () => {
      const piper = ROLES_BY_ID['pied_piper'];
      expect(piper.implementedInEngine).toBe(true);
      expect(piper.playableInUI).toBe(true);
      expect(piper.multiDeviceOnly).toBe(true);
      expect(piper.faction).toBe('THIRD_PARTY');
      expect(piper.wakeFrequency).toBe('EVERY_NIGHT');
      expect(piper.wakePriority).toBe(60);

      const cult = ROLES_BY_ID['cult_leader'];
      expect(cult.implementedInEngine).toBe(true);
      expect(cult.playableInUI).toBe(true);
      expect(cult.multiDeviceOnly).toBe(true);
      expect(cult.faction).toBe('THIRD_PARTY');
      expect(cult.wakeFrequency).toBe('EVERY_NIGHT');
      expect(cult.wakePriority).toBe(62);

      const doppel = ROLES_BY_ID['doppelganger'];
      expect(doppel.implementedInEngine).toBe(true);
      expect(doppel.playableInUI).toBe(true);
      expect(doppel.multiDeviceOnly).toBe(true);
      expect(doppel.faction).toBe('THIRD_PARTY');
      expect(doppel.wakeFrequency).toBe('FIRST_NIGHT_ONLY');
      expect(doppel.wakePriority).toBe(11);

      const drunk = ROLES_BY_ID['drunk'];
      expect(drunk.implementedInEngine).toBe(true);
      expect(drunk.playableInUI).toBe(true);
      expect(drunk.multiDeviceOnly).toBe(true);
      expect(drunk.faction).toBe('VILLAGER');
      expect(drunk.wakeFrequency).toBe('CONDITIONAL');
    });
  });

  // =========================================================================
  // 2. TURN PLAN (generateNightTurnPlan)
  // =========================================================================
  describe('Night Turn Plan for Phase 5 Roles', () => {
    it('should schedule Doppelganger only at Night 1 with priority 11', () => {
      const game = createTestGame([
        'doppelganger',
        'werewolf',
        'seer',
        'villager',
        'villager',
        'villager',
      ]);

      const planN1 = generateNightTurnPlan(game);
      const dgTurnN1 = planN1.find((t) => t.turnKey === 'doppelganger');
      expect(dgTurnN1).toBeDefined();
      expect(dgTurnN1!.priority).toBe(11);
      expect(dgTurnN1!.canAct).toBe(true);
      expect(dgTurnN1!.activePlayerIds).toEqual([game.players[0].id]);

      game.roundNumber = 2;
      const planN2 = generateNightTurnPlan(game);
      const dgTurnN2 = planN2.find((t) => t.turnKey === 'doppelganger');
      expect(dgTurnN2).toBeUndefined();
    });

    it('should schedule Pied Piper at Priority 60 every night', () => {
      const game = createTestGame([
        'pied_piper',
        'werewolf',
        'seer',
        'villager',
        'villager',
        'villager',
      ]);

      const plan = generateNightTurnPlan(game);
      const piperTurn = plan.find((t) => t.turnKey === 'pied_piper');
      expect(piperTurn).toBeDefined();
      expect(piperTurn!.priority).toBe(60);
      expect(piperTurn!.canAct).toBe(true);
      expect(piperTurn!.activePlayerIds).toEqual([game.players[0].id]);
    });

    it('should schedule Cult Leader at Priority 62 every night', () => {
      const game = createTestGame([
        'cult_leader',
        'werewolf',
        'seer',
        'villager',
        'villager',
        'villager',
      ]);

      const plan = generateNightTurnPlan(game);
      const cultTurn = plan.find((t) => t.turnKey === 'cult_leader');
      expect(cultTurn).toBeDefined();
      expect(cultTurn!.priority).toBe(62);
      expect(cultTurn!.canAct).toBe(true);
      expect(cultTurn!.activePlayerIds).toEqual([game.players[0].id]);
    });

    it('should NOT wake Drunk on Night 1 or Night 2, but wake Drunk as their real role from Night 3', () => {
      const game = createTestGame([
        'drunk',
        'werewolf',
        'villager',
        'villager',
        'villager',
        'villager',
      ]);
      const drunkPlayer = game.players[0];
      drunkPlayer.drunkRealRoleId = 'seer';

      // Đêm 1
      const planN1 = generateNightTurnPlan(game);
      expect(planN1.some((t) => t.turnKey === 'drunk')).toBe(false);
      expect(planN1.some((t) => t.turnKey === 'seer')).toBe(false);

      // Đêm 2
      game.roundNumber = 2;
      const planN2 = generateNightTurnPlan(game);
      expect(planN2.some((t) => t.turnKey === 'drunk')).toBe(false);
      expect(planN2.some((t) => t.turnKey === 'seer')).toBe(false);

      // Đêm 3: Drunk thức dậy với vai thật Tiên tri
      game.roundNumber = 3;
      const planN3 = generateNightTurnPlan(game);
      const seerTurn = planN3.find((t) => t.turnKey === 'seer');
      expect(seerTurn).toBeDefined();
      expect(seerTurn!.canAct).toBe(true);
      expect(seerTurn!.activePlayerIds).toEqual([drunkPlayer.id]);
    });

    it('should let Drunk wake with Werewolves from Night 3 if real role is a Werewolf', () => {
      const game = createTestGame([
        'drunk',
        'werewolf',
        'villager',
        'villager',
        'villager',
        'villager',
      ]);
      const drunkPlayer = game.players[0];
      drunkPlayer.drunkRealRoleId = 'werewolf';

      game.roundNumber = 3;
      const planN3 = generateNightTurnPlan(game);
      const wolfTurn = planN3.find((t) => t.turnKey === 'wolf_pack');
      expect(wolfTurn).toBeDefined();
      expect(wolfTurn!.activePlayerIds).toContain(drunkPlayer.id);
      expect(wolfTurn!.activePlayerIds).toContain(game.players[1].id);
    });
  });

  // =========================================================================
  // 3. PIED PIPER (Người thổi sáo)
  // =========================================================================
  describe('Pied Piper (pied_piper)', () => {
    it('should enchant up to 2 players per night and record AWAKENED event', () => {
      const game = createTestGame([
        'pied_piper',
        'villager',
        'villager',
        'werewolf',
        'villager',
        'villager',
      ]);
      const [piper, v1, v2] = game.players;

      const { nextState, output } = resolveNight(game, {
        piedPiper: { targetIds: [v1.id, v2.id] },
      });

      expect(nextState.players.find((p) => p.id === v1.id)!.isEnchanted).toBe(true);
      expect(nextState.players.find((p) => p.id === v2.id)!.isEnchanted).toBe(true);

      const piperEvents = output.events.filter((e) => e.sourceRole === 'pied_piper');
      expect(piperEvents).toHaveLength(2);
      expect(piperEvents[0].type).toBe('AWAKENED');
    });

    it('should reset all enchantments when Pied Piper dies', () => {
      const game = createTestGame([
        'pied_piper',
        'villager',
        'villager',
        'werewolf',
        'villager',
        'villager',
      ]);
      const [piper, v1, v2] = game.players;
      v1.isEnchanted = true;
      v2.isEnchanted = true;

      // Pied Piper chết do treo cổ
      processDeathCascade(game, [{ playerId: piper.id, cause: 'VILLAGE_VOTE' }]);

      expect(game.players.find((p) => p.id === piper.id)!.isAlive).toBe(false);
      expect(game.players.find((p) => p.id === v1.id)!.isEnchanted).toBe(false);
      expect(game.players.find((p) => p.id === v2.id)!.isEnchanted).toBe(false);
    });

    it('should win immediately when all living other players are enchanted', () => {
      const game = createTestGame([
        'pied_piper',
        'villager',
        'villager',
        'werewolf',
        'villager',
        'villager',
      ]);
      const [piper, v1, v2] = game.players;
      // 3 người khác đã chết
      for (let i = 3; i < game.players.length; i++) {
        game.players[i].isAlive = false;
      }
      v1.isEnchanted = true;
      v2.isEnchanted = true;

      const winOutcome = checkWinCondition(game);
      expect(winOutcome).not.toBeNull();
      expect(winOutcome!.winner).toBe('PIED_PIPER');
      expect(winOutcome!.winningPlayerIds).toEqual([piper.id]);
    });
  });

  // =========================================================================
  // 4. CULT LEADER (Trưởng giáo phái)
  // =========================================================================
  describe('Cult Leader (cult_leader)', () => {
    it('should recruit 1 player per night and record AWAKENED event', () => {
      const game = createTestGame([
        'cult_leader',
        'villager',
        'villager',
        'werewolf',
        'villager',
        'villager',
      ]);
      const [cult, v1] = game.players;

      const { nextState, output } = resolveNight(game, {
        cultLeader: { targetId: v1.id },
      });

      expect(nextState.players.find((p) => p.id === v1.id)!.isCultMember).toBe(true);
      const cultEvent = output.events.find((e) => e.sourceRole === 'cult_leader');
      expect(cultEvent).toBeDefined();
      expect(cultEvent!.type).toBe('AWAKENED');
    });

    it('should reset all cult memberships when Cult Leader dies', () => {
      const game = createTestGame([
        'cult_leader',
        'villager',
        'villager',
        'werewolf',
        'villager',
        'villager',
      ]);
      const [cult, v1, v2] = game.players;
      v1.isCultMember = true;
      v2.isCultMember = true;

      processDeathCascade(game, [{ playerId: cult.id, cause: 'VILLAGE_VOTE' }]);

      expect(game.players.find((p) => p.id === cult.id)!.isAlive).toBe(false);
      expect(game.players.find((p) => p.id === v1.id)!.isCultMember).toBe(false);
      expect(game.players.find((p) => p.id === v2.id)!.isCultMember).toBe(false);
    });

    it('should win immediately when all living other players are cult members', () => {
      const game = createTestGame([
        'cult_leader',
        'villager',
        'villager',
        'werewolf',
        'villager',
        'villager',
      ]);
      const [cult, v1, v2] = game.players;
      for (let i = 3; i < game.players.length; i++) {
        game.players[i].isAlive = false;
      }
      v1.isCultMember = true;
      v2.isCultMember = true;

      const winOutcome = checkWinCondition(game);
      expect(winOutcome).not.toBeNull();
      expect(winOutcome!.winner).toBe('CULT_LEADER');
      expect(winOutcome!.winningPlayerIds).toEqual([cult.id]);
    });
  });

  // =========================================================================
  // 5. DOPPELGANGER (Nhân bản)
  // =========================================================================
  describe('Doppelganger (doppelganger)', () => {
    it('should record targetId on Night 1', () => {
      const game = createTestGame([
        'doppelganger',
        'villager',
        'villager',
        'werewolf',
        'villager',
        'villager',
      ]);
      const [dg, v1] = game.players;

      const { nextState } = executeNightPhase(game, {
        doppelganger: { targetId: v1.id },
      });

      expect(nextState.players.find((p) => p.id === dg.id)!.doppelgangerTargetId).toBe(v1.id);
    });

    it('should inherit Elder with 2 elderHp', () => {
      const game = createTestGame([
        'doppelganger',
        'elder',
        'villager',
        'werewolf',
        'villager',
        'villager',
      ]);
      const [dg, elder] = game.players;
      dg.doppelgangerTargetId = elder.id;

      processDeathCascade(game, [{ playerId: elder.id, cause: 'VILLAGE_VOTE' }]);

      const pDg = game.players.find((p) => p.id === dg.id)!;
      expect(pDg.roleId).toBe('elder');
      expect(pDg.elderHp).toBe(2);
    });

    it('should inherit Pied Piper or Cult Leader and reset previous charms', () => {
      const game = createTestGame([
        'doppelganger',
        'pied_piper',
        'villager',
        'werewolf',
        'villager',
        'villager',
      ]);
      const [dg, piper, v1] = game.players;
      dg.doppelgangerTargetId = piper.id;
      v1.isEnchanted = true;

      processDeathCascade(game, [{ playerId: piper.id, cause: 'VILLAGE_VOTE' }]);

      const pDg = game.players.find((p) => p.id === dg.id)!;
      expect(pDg.roleId).toBe('pied_piper');
      expect(pDg.faction).toBe('THIRD_PARTY');
      // Bùa cũ bị reset về false để Doppelganger bắt đầu lại từ 0
      expect(game.players.find((p) => p.id === v1.id)!.isEnchanted).toBe(false);
    });
  });

  // =========================================================================
  // 6. HOODLUM INTERACTION WITH PHASE 5 SOLO ROLES
  // =========================================================================
  describe('Hoodlum Win Constraints with Phase 5', () => {
    it('should NOT allow Hoodlum to win with Pied Piper', () => {
      const game = createTestGame([
        'pied_piper',
        'hoodlum',
        'villager',
        'villager',
        'werewolf',
        'villager',
      ]);
      const [piper, hoodlum, target1, target2] = game.players;
      hoodlum.hoodlumTargetIds = [target1.id, target2.id];

      // Giết 2 mục tiêu của Hoodlum
      target1.isAlive = false;
      target2.isAlive = false;
      game.players[4].isAlive = false;
      game.players[5].isAlive = false;

      // Hoodlum bị thôi miên
      hoodlum.isEnchanted = true;

      const outcome = checkWinCondition(game);
      expect(outcome).not.toBeNull();
      expect(outcome!.winner).toBe('PIED_PIPER');
      // Hoodlum KHÔNG được thắng ké với Pied Piper
      expect(outcome!.winningPlayerIds).not.toContain(hoodlum.id);
      expect(outcome!.winningPlayerIds).toEqual([piper.id]);
    });

    it('should NOT allow Hoodlum to win with Cult Leader', () => {
      const game = createTestGame([
        'cult_leader',
        'hoodlum',
        'villager',
        'villager',
        'werewolf',
        'villager',
      ]);
      const [cult, hoodlum, target1, target2] = game.players;
      hoodlum.hoodlumTargetIds = [target1.id, target2.id];

      target1.isAlive = false;
      target2.isAlive = false;
      game.players[4].isAlive = false;
      game.players[5].isAlive = false;

      hoodlum.isCultMember = true;

      const outcome = checkWinCondition(game);
      expect(outcome).not.toBeNull();
      expect(outcome!.winner).toBe('CULT_LEADER');
      // Hoodlum KHÔNG được thắng ké với Cult Leader
      expect(outcome!.winningPlayerIds).not.toContain(hoodlum.id);
      expect(outcome!.winningPlayerIds).toEqual([cult.id]);
    });
  });
});
