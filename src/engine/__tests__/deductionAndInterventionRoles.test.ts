import { describe, expect, it } from 'bun:test';
import {
  getAuraSeerResult,
  isWerewolfForInvestigation,
  resolveNight,
} from '../nightResolution';
import { ROLES_BY_ID } from '../roles';
import { generateNightTurnPlan } from '../turnPlan';
import {
  executeDayVote,
  executeHunterShot,
  executeNightPhase,
  startDayPhase,
} from '../gameEngine';
import { checkWinCondition } from '../winConditions';
import { createTestGame, createTestPlayers } from './testHelpers';

describe('Engine - Deduction & Intervention Roles (Phase 4)', () => {
  // =========================================================================
  // 1. METADATA & ENGINE READINESS
  // =========================================================================
  describe('Roles Metadata & Config', () => {
    const rolesToCheck = [
      { id: 'aura_seer', pack: 'DEDUCTION', priority: 41, audio: 'night_aura_seer' },
      { id: 'apprentice_seer', pack: 'DEDUCTION', priority: 40, audio: 'night_seer' },
      { id: 'fox', pack: 'DEDUCTION', priority: 43, audio: 'night_fox' },
      { id: 'pi', pack: 'DEDUCTION', priority: 42, audio: 'night_pi' },
      { id: 'spellcaster', pack: 'CHAOS', priority: 55, audio: 'night_spellcaster' },
      { id: 'troublemaker', pack: 'CHAOS', priority: 58, audio: 'night_troublemaker' },
    ];

    for (const r of rolesToCheck) {
      it(`should enable implementedInEngine and playableInUI for ${r.id}`, () => {
        const def = ROLES_BY_ID[r.id];
        expect(def).toBeDefined();
        expect(def.implementedInEngine).toBe(true);
        expect(def.playableInUI).toBe(true);
        expect(def.pack).toBe(r.pack);
        expect(def.wakePriority).toBe(r.priority);
        expect(def.audioKey).toBe(r.audio);
      });
    }
  });

  // =========================================================================
  // 2. APPRENTICE SEER (apprentice_seer) & SEER SYNCHRONIZATION
  // =========================================================================
  describe('Apprentice Seer (apprentice_seer)', () => {
    it('while Seer is alive: Seer wakes at priority 40 under "seer" turn, Apprentice Seer sleeps', () => {
      // p1: seer, p2: apprentice_seer, p3: werewolf, p4..p6: villagers
      const state = createTestGame(['seer', 'apprentice_seer', 'werewolf', 'villager', 'villager', 'villager']);
      const plan = generateNightTurnPlan(state);

      const seerTurn = plan.find((t) => t.turnKey === 'seer');
      expect(seerTurn).toBeDefined();
      expect(seerTurn?.priority).toBe(40);
      expect(seerTurn?.titleVi).toBe('Tiên tri');
      expect(seerTurn?.audioKey).toBe('night_seer');
      expect(seerTurn?.activePlayerIds).toEqual(['p1']);
      expect(seerTurn?.canAct).toBe(true);
      expect(seerTurn?.isFake).toBe(false);

      // Does not have a separate apprentice_seer turn
      expect(plan.find((t) => t.turnKey === 'apprentice_seer')).toBeUndefined();
    });

    it('when Seer dies: Apprentice Seer awakens at priority 40 with title "Tiên tri" & audioKey "night_seer"', () => {
      const state = createTestGame(['seer', 'apprentice_seer', 'werewolf', 'villager', 'villager', 'villager']);
      // Seer dies
      state.players[0].isAlive = false;
      state.deaths.push({
        playerId: 'p1',
        roleId: 'seer',
        roundNumber: 1,
        phase: 'NIGHT',
        cause: 'WOLF_PACK',
        cascadeDepth: 0,
      });

      const plan = generateNightTurnPlan(state);
      const seerTurn = plan.find((t) => t.turnKey === 'seer');
      expect(seerTurn).toBeDefined();
      expect(seerTurn?.priority).toBe(40);
      expect(seerTurn?.titleVi).toBe('Tiên tri');
      expect(seerTurn?.audioKey).toBe('night_seer');
      expect(seerTurn?.activePlayerIds).toEqual(['p2']); // apprentice_seer awakens!
      expect(seerTurn?.canAct).toBe(true);
      expect(seerTurn?.isFake).toBe(false);
    });

    it('when Seer is converted to Werewolf (cursed/wolf_accursed): Apprentice Seer awakens', () => {
      const state = createTestGame(['seer', 'apprentice_seer', 'werewolf', 'villager', 'villager', 'villager']);
      // Seer is alive but converted to werewolf
      state.players[0].roleId = 'werewolf';
      state.players[0].faction = 'WEREWOLF';

      const plan = generateNightTurnPlan(state);
      const seerTurn = plan.find((t) => t.turnKey === 'seer');
      expect(seerTurn).toBeDefined();
      expect(seerTurn?.activePlayerIds).toEqual(['p2']);
      expect(seerTurn?.canAct).toBe(true);
      expect(seerTurn?.isFake).toBe(false);
    });

    it('when both Seer and Apprentice Seer are dead: Priority 40 becomes a fake turn', () => {
      const state = createTestGame(['seer', 'apprentice_seer', 'werewolf', 'villager', 'villager', 'villager']);
      state.players[0].isAlive = false;
      state.players[1].isAlive = false;

      const plan = generateNightTurnPlan(state);
      const seerTurn = plan.find((t) => t.turnKey === 'seer');
      expect(seerTurn).toBeDefined();
      expect(seerTurn?.activePlayerIds).toEqual([]);
      expect(seerTurn?.canAct).toBe(false);
      expect(seerTurn?.isFake).toBe(true);
    });

    it('when village powers are stripped: Apprentice Seer cannot act even if Seer is dead', () => {
      const state = createTestGame(['seer', 'apprentice_seer', 'werewolf', 'villager', 'villager', 'villager']);
      state.players[0].isAlive = false;
      state.villagePowerStripped = true;

      const plan = generateNightTurnPlan(state);
      const seerTurn = plan.find((t) => t.turnKey === 'seer');
      expect(seerTurn?.activePlayerIds).toEqual([]);
      expect(seerTurn?.canAct).toBe(false);
      expect(seerTurn?.isFake).toBe(true);
    });

    it('Night Resolution: Apprentice Seer inspection produces seerResult & apprenticeSeerResult when Seer is dead', () => {
      const state = createTestGame(['seer', 'apprentice_seer', 'werewolf', 'lycan', 'minion', 'villager']);
      state.players[0].isAlive = false; // Seer dead

      // Apprentice inspects p3 (werewolf)
      const { output } = resolveNight(state, {
        apprenticeSeer: { targetId: 'p3' },
      });
      expect(output.infoResults.seerResult).toEqual({
        targetId: 'p3',
        result: 'WEREWOLF',
      });
      expect(output.infoResults.apprenticeSeerResult).toEqual({
        targetId: 'p3',
        result: 'WEREWOLF',
      });

      // Apprentice inspects p4 (lycan) -> sees WEREWOLF
      const { output: outputLycan } = resolveNight(state, {
        seer: { targetId: 'p4' },
      });
      expect(outputLycan.infoResults.seerResult?.result).toBe('WEREWOLF');

      // Apprentice inspects p5 (minion) -> sees VILLAGER
      const { output: outputMinion } = resolveNight(state, {
        seer: { targetId: 'p5' },
      });
      expect(outputMinion.infoResults.seerResult?.result).toBe('VILLAGER');
    });
  });

  // =========================================================================
  // 3. AURA SEER (aura_seer)
  // =========================================================================
  describe('Aura Seer (aura_seer)', () => {
    it('Turn Plan: generates priority 41 turn with audioKey "night_aura_seer"', () => {
      const state = createTestGame(['aura_seer', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
      const plan = generateNightTurnPlan(state);

      const auraTurn = plan.find((t) => t.turnKey === 'aura_seer');
      expect(auraTurn).toBeDefined();
      expect(auraTurn?.priority).toBe(41);
      expect(auraTurn?.titleVi).toBe('Tiên tri hào quang');
      expect(auraTurn?.audioKey).toBe('night_aura_seer');
      expect(auraTurn?.activePlayerIds).toEqual(['p1']);
      expect(auraTurn?.canAct).toBe(true);

      // Dead aura seer -> fake turn
      state.players[0].isAlive = false;
      const planDead = generateNightTurnPlan(state);
      const deadTurn = planDead.find((t) => t.turnKey === 'aura_seer');
      expect(deadTurn?.canAct).toBe(false);
      expect(deadTurn?.isFake).toBe(true);
    });

    it('Helper getAuraSeerResult: NORMAL for villager, werewolf, and drunk (< round 3); SPECIAL for others', () => {
      const villager: any = { roleId: 'villager' };
      const werewolf: any = { roleId: 'werewolf' };
      const drunkEarly: any = { roleId: 'drunk' };
      const drunkLate: any = { roleId: 'drunk' };

      expect(getAuraSeerResult(villager, 1)).toBe('NORMAL');
      expect(getAuraSeerResult(werewolf, 1)).toBe('NORMAL');
      expect(getAuraSeerResult(drunkEarly, 1)).toBe('NORMAL');
      expect(getAuraSeerResult(drunkEarly, 2)).toBe('NORMAL');
      expect(getAuraSeerResult(drunkLate, 3)).toBe('SPECIAL');

      // Other roles are all SPECIAL
      const specialRoles = [
        'seer',
        'bodyguard',
        'witch',
        'hunter',
        'cupid',
        'apprentice_seer',
        'aura_seer',
        'fox',
        'pi',
        'spellcaster',
        'troublemaker',
        'wolf_cub',
        'white_wolf',
        'tanner',
        'lycan',
        'minion',
        'sorcerer',
      ];
      for (const roleId of specialRoles) {
        expect(getAuraSeerResult({ roleId } as any, 1)).toBe('SPECIAL');
      }
    });

    it('Night Resolution: inspects target and records auraResult', () => {
      const state = createTestGame(['aura_seer', 'werewolf', 'villager', 'hunter', 'villager', 'villager']);

      // Inspect p2 (werewolf) -> NORMAL
      const res1 = resolveNight(state, {
        auraSeer: { targetId: 'p2' },
      });
      expect(res1.output.infoResults.auraResult).toEqual({
        targetId: 'p2',
        result: 'NORMAL',
      });

      // Inspect p3 (villager) -> NORMAL
      const res2 = resolveNight(state, {
        auraSeer: { targetId: 'p3' },
      });
      expect(res2.output.infoResults.auraResult).toEqual({
        targetId: 'p3',
        result: 'NORMAL',
      });

      // Inspect p4 (hunter) -> SPECIAL
      const res3 = resolveNight(state, {
        auraSeer: { targetId: 'p4' },
      });
      expect(res3.output.infoResults.auraResult).toEqual({
        targetId: 'p4',
        result: 'SPECIAL',
      });
    });

    it('Night Resolution: blocked when village powers are stripped', () => {
      const state = createTestGame(['aura_seer', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
      state.villagePowerStripped = true;

      const res = resolveNight(state, {
        auraSeer: { targetId: 'p2' },
      });
      expect(res.output.infoResults.auraResult).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. P.I. (pi)
  // =========================================================================
  describe('P.I. (pi)', () => {
    it('Turn Plan: generates priority 42 turn, becomes fake turn after piUsed', () => {
      const state = createTestGame(['pi', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
      const plan1 = generateNightTurnPlan(state);

      const piTurn1 = plan1.find((t) => t.turnKey === 'pi');
      expect(piTurn1?.priority).toBe(42);
      expect(piTurn1?.audioKey).toBe('night_pi');
      expect(piTurn1?.canAct).toBe(true);

      // Once used -> canAct is false
      state.piUsed = true;
      const plan2 = generateNightTurnPlan(state);
      const piTurn2 = plan2.find((t) => t.turnKey === 'pi');
      expect(piTurn2?.canAct).toBe(false);
      expect(piTurn2?.isFake).toBe(true);
    });

    it('Helper isWerewolfForInvestigation: lycan & wolves are true; minion & sorcerer are false', () => {
      expect(isWerewolfForInvestigation({ roleId: 'minion', faction: 'WEREWOLF' } as any)).toBe(false);
      expect(isWerewolfForInvestigation({ roleId: 'sorcerer', faction: 'WEREWOLF' } as any)).toBe(false);
      expect(isWerewolfForInvestigation({ roleId: 'lycan', faction: 'VILLAGER' } as any)).toBe(true);
      expect(isWerewolfForInvestigation({ roleId: 'werewolf', faction: 'WEREWOLF' } as any)).toBe(true);
      expect(isWerewolfForInvestigation({ roleId: 'white_wolf', faction: 'THIRD_PARTY' } as any)).toBe(true);
      expect(isWerewolfForInvestigation({ roleId: 'villager', faction: 'VILLAGER' } as any)).toBe(false);
      expect(isWerewolfForInvestigation({ roleId: 'seer', faction: 'VILLAGER' } as any)).toBe(false);
    });

    it('Night Resolution: inspects cluster of 3 and detects werewolf; marks piUsed', () => {
      // Circle seating: p1(seat 0), p2(seat 1), p3(seat 2), p4(seat 3), p5(seat 4), p6(seat 5)
      // roles: p1: pi, p2: villager, p3: werewolf, p4: villager, p5: villager, p6: villager
      const state = createTestGame(['pi', 'villager', 'werewolf', 'villager', 'villager', 'villager']);

      // Target p2: neighbors of p2 are p1 (left) and p3 (right). p3 is werewolf -> hasWerewolf: true
      const { nextState, output } = resolveNight(state, {
        pi: { targetId: 'p2' },
      });
      expect(nextState.piUsed).toBe(true);
      expect(output.infoResults.piResult).toEqual({
        targetId: 'p2',
        hasWerewolf: true,
        inspectedPlayerIds: ['p1', 'p2', 'p3'],
      });

      // Second attempt on nextState does not re-inspect
      const secondAttempt = resolveNight(nextState, {
        pi: { targetId: 'p5' },
      });
      expect(secondAttempt.output.infoResults.piResult).toBeUndefined();
    });

    it('Night Resolution: allows self-target and skips dead players', () => {
      // p1: pi, p2: villager, p3: villager, p4: werewolf, p5: villager, p6: villager
      const state = createTestGame(['pi', 'villager', 'villager', 'werewolf', 'villager', 'villager']);
      // p6 dies
      state.players[5].isAlive = false;

      // P.I. targets self (p1). Alive players in order: p1, p2, p3, p4, p5.
      // Left of p1 is p5; right of p1 is p2.
      // Cluster: [p5, p1, p2]. All villagers -> hasWerewolf: false
      const { output } = resolveNight(state, {
        pi: { targetId: 'p1' },
      });
      expect(output.infoResults.piResult).toEqual({
        targetId: 'p1',
        hasWerewolf: false,
        inspectedPlayerIds: ['p5', 'p1', 'p2'],
      });
    });

    it('Night Resolution: detects Lycan as werewolf, does NOT detect Minion/Sorcerer', () => {
      // p1: pi, p2: villager, p3: minion, p4: villager, p5: lycan, p6: villager
      const state = createTestGame(['pi', 'villager', 'minion', 'villager', 'lycan', 'villager']);

      // Target p3 (cluster p2, p3, p4): contains villager, minion, villager -> hasWerewolf: false
      const resMinion = resolveNight(state, {
        pi: { targetId: 'p3' },
      });
      expect(resMinion.output.infoResults.piResult?.hasWerewolf).toBe(false);

      // Target p5 (cluster p4, p5, p6): contains villager, lycan, villager -> hasWerewolf: true
      const resLycan = resolveNight(state, {
        pi: { targetId: 'p5' },
      });
      expect(resLycan.output.infoResults.piResult?.hasWerewolf).toBe(true);
    });
  });

  // =========================================================================
  // 5. FOX (fox)
  // =========================================================================
  describe('Fox (fox)', () => {
    it('Turn Plan: generates priority 43 turn, becomes fake turn after foxLostPower', () => {
      const state = createTestGame(['fox', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
      const plan1 = generateNightTurnPlan(state);

      const foxTurn1 = plan1.find((t) => t.turnKey === 'fox');
      expect(foxTurn1?.priority).toBe(43);
      expect(foxTurn1?.audioKey).toBe('night_fox');
      expect(foxTurn1?.canAct).toBe(true);

      // Lost power
      state.foxLostPower = true;
      const plan2 = generateNightTurnPlan(state);
      const foxTurn2 = plan2.find((t) => t.turnKey === 'fox');
      expect(foxTurn2?.canAct).toBe(false);
      expect(foxTurn2?.isFake).toBe(true);
    });

    it('Night Resolution: cluster with werewolf keeps power; cluster with no werewolves LOSES power permanently', () => {
      // p1: fox, p2: werewolf, p3: villager, p4: villager, p5: villager, p6: villager
      const state = createTestGame(['fox', 'werewolf', 'villager', 'villager', 'villager', 'villager']);

      // Target p2: cluster [p1, p2, p3] has werewolf
      const resSuccess = resolveNight(state, {
        fox: { targetId: 'p2' },
      });
      expect(resSuccess.nextState.foxLostPower).toBe(false);
      expect(resSuccess.output.infoResults.foxResult?.hasWerewolf).toBe(true);

      // Target p4: cluster [p3, p4, p5] all villagers -> LOSES power
      const resFail = resolveNight(state, {
        fox: { targetId: 'p4' },
      });
      expect(resFail.nextState.foxLostPower).toBe(true);
      expect(resFail.output.infoResults.foxResult?.hasWerewolf).toBe(false);

      // Next night with foxLostPower = true cannot act
      const resAfterLost = resolveNight(resFail.nextState, {
        fox: { targetId: 'p2' },
      });
      expect(resAfterLost.output.infoResults.foxResult).toBeUndefined();
    });

    it('Night Resolution: Fox can skip without losing power', () => {
      const state = createTestGame(['fox', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
      const res = resolveNight(state, {
        fox: { targetId: 'p4', isSkip: true },
      });
      expect(res.nextState.foxLostPower).toBe(false);
      expect(res.output.infoResults.foxResult).toBeUndefined();
    });
  });

  // =========================================================================
  // 6. SPELLCASTER (spellcaster)
  // =========================================================================
  describe('Spellcaster (spellcaster)', () => {
    it('Turn Plan: generates priority 55 turn with audioKey "night_spellcaster"', () => {
      const state = createTestGame(['spellcaster', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
      const plan = generateNightTurnPlan(state);

      const scTurn = plan.find((t) => t.turnKey === 'spellcaster');
      expect(scTurn?.priority).toBe(55);
      expect(scTurn?.audioKey).toBe('night_spellcaster');
      expect(scTurn?.activePlayerIds).toEqual(['p1']);
      expect(scTurn?.canAct).toBe(true);
    });

    it('Night Resolution: successfully mutes target for the following day', () => {
      const state = createTestGame(['spellcaster', 'werewolf', 'villager', 'villager', 'villager', 'villager']);

      const { nextState } = resolveNight(state, {
        spellcaster: { targetId: 'p3' },
      });
      expect(nextState.lastMutedPlayerId).toBe('p3');
      expect(nextState.mutedPlayerId).toBe('p3');
      expect(nextState.players.find((p) => p.id === 'p3')?.isMuted).toBe(true);
      expect(nextState.players.find((p) => p.id === 'p1')?.isMuted).toBe(false);
    });

    it('cannot mute the same player 2 consecutive nights (anti-spam check)', () => {
      const state = createTestGame(['spellcaster', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
      state.lastMutedPlayerId = 'p3'; // muted p3 last night

      // Attempt to mute p3 again
      const { nextState } = resolveNight(state, {
        spellcaster: { targetId: 'p3' },
      });
      expect(nextState.mutedPlayerId).toBeNull();
      expect(nextState.players.find((p) => p.id === 'p3')?.isMuted).toBe(false);
    });

    it('Edge Case 4.3: if target dies during the night, mutedPlayerId is null (no mute banner for dead)', () => {
      const state = createTestGame(['spellcaster', 'werewolf', 'villager', 'villager', 'villager', 'villager']);

      // Spellcaster mutes p3, but Wolves attack p3
      const { nextState } = resolveNight(state, {
        wolfPack: { targets: ['p3'] },
        spellcaster: { targetId: 'p3' },
      });

      const p3 = nextState.players.find((p) => p.id === 'p3');
      expect(p3?.isAlive).toBe(false);
      // Even though lastMutedPlayerId recorded p3, mutedPlayerId for the day is null!
      expect(nextState.lastMutedPlayerId).toBe('p3');
      expect(nextState.mutedPlayerId).toBeNull();
      expect(p3?.isMuted).toBe(false);
    });

    it('if Spellcaster dies in the night, the chosen target remains muted next day', () => {
      const state = createTestGame(['spellcaster', 'werewolf', 'villager', 'villager', 'villager', 'villager']);

      // Wolves kill spellcaster (p1); spellcaster muted p3
      const { nextState } = resolveNight(state, {
        wolfPack: { targets: ['p1'] },
        spellcaster: { targetId: 'p3' },
      });

      expect(nextState.players.find((p) => p.id === 'p1')?.isAlive).toBe(false);
      expect(nextState.mutedPlayerId).toBe('p3');
      expect(nextState.players.find((p) => p.id === 'p3')?.isMuted).toBe(true);
    });

    it('startDayPhase: announces mute in historyLogs when muted player is alive', () => {
      const state = createTestGame(['spellcaster', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
      state.mutedPlayerId = 'p3';

      const dayState = startDayPhase(state);
      expect(dayState.historyLogs.some((log) => log.includes('câm lặng'))).toBe(true);
    });
  });

  // =========================================================================
  // 7. TROUBLEMAKER (troublemaker) & DOUBLE DAY VOTE
  // =========================================================================
  describe('Troublemaker (troublemaker) & Double Day Vote', () => {
    it('Turn Plan: generates priority 58 turn, becomes fake turn after use', () => {
      const state = createTestGame(['troublemaker', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
      const plan1 = generateNightTurnPlan(state);

      const tmTurn1 = plan1.find((t) => t.turnKey === 'troublemaker');
      expect(tmTurn1?.priority).toBe(58);
      expect(tmTurn1?.audioKey).toBe('night_troublemaker');
      expect(tmTurn1?.canAct).toBe(true);

      // Once used
      state.troublemakerUsed = true;
      const plan2 = generateNightTurnPlan(state);
      const tmTurn2 = plan2.find((t) => t.turnKey === 'troublemaker');
      expect(tmTurn2?.canAct).toBe(false);
      expect(tmTurn2?.isFake).toBe(true);
    });

    it('Night Resolution: 1-time activation sets troublemakerUsed and doubleVoteDay', () => {
      const state = createTestGame(['troublemaker', 'werewolf', 'villager', 'villager', 'villager', 'villager']);

      const { nextState } = resolveNight(state, {
        troublemaker: { activate: true },
      });
      expect(nextState.troublemakerUsed).toBe(true);
      expect(nextState.doubleVoteDay).toBe(true);

      // Cannot activate again
      const nextAttempt = resolveNight(nextState, {
        troublemaker: { activate: true },
      });
      expect(nextAttempt.nextState.troublemakerUsed).toBe(true);
    });

    it('executeDayVote with 2 targets: hangs both targets in sequence and resets doubleVoteDay', () => {
      const state = createTestGame(['troublemaker', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
      state.doubleVoteDay = true;

      // Both p3 and p4 are voted out
      const { nextState } = executeDayVote(state, ['p3', 'p4']);
      expect(nextState.players.find((p) => p.id === 'p3')?.isAlive).toBe(false);
      expect(nextState.players.find((p) => p.id === 'p4')?.isAlive).toBe(false);
      expect(nextState.doubleVoteDay).toBe(false);
      expect(nextState.phase).toBe('NIGHT');
    });

    it('Edge Case 4.5: Target 1 is Angel on Day 1 -> Angel wins immediately (Priority 1), target 2 not hanged', () => {
      const state = createTestGame(['troublemaker', 'werewolf', 'angel', 'villager', 'villager', 'villager']);
      state.roundNumber = 1;
      state.doubleVoteDay = true;

      // Angel is p3, villager is p4
      const { nextState, winOutcome } = executeDayVote(state, ['p3', 'p4']);
      expect(winOutcome?.winner).toBe('ANGEL');
      expect(nextState.phase).toBe('GAME_OVER');
      expect(nextState.players.find((p) => p.id === 'p3')?.isAlive).toBe(false);
      // p4 was never processed!
      expect(nextState.players.find((p) => p.id === 'p4')?.isAlive).toBe(true);
    });

    it('Edge Case 4.5: Target 1 is Tanner -> Tanner wins immediately (Priority 2), target 2 not hanged', () => {
      const state = createTestGame(['troublemaker', 'werewolf', 'tanner', 'villager', 'villager', 'villager']);
      state.roundNumber = 2;
      state.doubleVoteDay = true;

      // Tanner is p3, villager is p4
      const { nextState, winOutcome } = executeDayVote(state, ['p3', 'p4']);
      expect(winOutcome?.winner).toBe('TANNER');
      expect(nextState.phase).toBe('GAME_OVER');
      expect(nextState.players.find((p) => p.id === 'p3')?.isAlive).toBe(false);
      expect(nextState.players.find((p) => p.id === 'p4')?.isAlive).toBe(true);
    });

    it('Edge Case 4.5: Both Angel and Tanner voted on Day 1 -> Angel wins first (Priority 1 > Priority 2)', () => {
      const state = createTestGame(['troublemaker', 'werewolf', 'angel', 'tanner', 'villager', 'villager']);
      state.roundNumber = 1;
      state.doubleVoteDay = true;

      // ['p3' (angel), 'p4' (tanner)]
      const { nextState, winOutcome } = executeDayVote(state, ['p3', 'p4']);
      expect(winOutcome?.winner).toBe('ANGEL');
      expect(nextState.phase).toBe('GAME_OVER');
      // Angel was executed first, winning immediately
      expect(nextState.players.find((p) => p.id === 'p3')?.isAlive).toBe(false);
      expect(nextState.players.find((p) => p.id === 'p4')?.isAlive).toBe(true);
    });

    it('Target 1 is Prince: Prince reveals and survives, continues to Target 2 who dies', () => {
      const state = createTestGame(['troublemaker', 'werewolf', 'prince', 'villager', 'villager', 'villager']);
      state.doubleVoteDay = true;

      // ['p3' (prince), 'p4' (villager)]
      const { nextState, survivedByReveal } = executeDayVote(state, ['p3', 'p4']);
      expect(survivedByReveal).toBe(true);
      expect(nextState.princeRevealed).toBe(true);
      expect(nextState.players.find((p) => p.id === 'p3')?.isAlive).toBe(true);
      expect(nextState.players.find((p) => p.id === 'p4')?.isAlive).toBe(false);
      expect(nextState.doubleVoteDay).toBe(false);
    });

    it('Target 1 is Village Idiot: Village Idiot reveals, loses vote, survives, Target 2 dies', () => {
      const state = createTestGame(['troublemaker', 'werewolf', 'village_idiot', 'villager', 'villager', 'villager']);
      state.doubleVoteDay = true;

      // ['p3' (village_idiot), 'p4' (villager)]
      const { nextState, survivedByReveal } = executeDayVote(state, ['p3', 'p4']);
      expect(survivedByReveal).toBe(true);
      const idiot = nextState.players.find((p) => p.id === 'p3');
      expect(idiot?.isAlive).toBe(true);
      expect(idiot?.voteWeight).toBe(0); // lost vote
      expect(nextState.players.find((p) => p.id === 'p4')?.isAlive).toBe(false);
      expect(nextState.doubleVoteDay).toBe(false);
    });

    it('Hunter is hanged as one of the targets: triggers Hunter shot phase', () => {
      const state = createTestGame(['troublemaker', 'werewolf', 'hunter', 'villager', 'villager', 'villager']);
      state.doubleVoteDay = true;

      // ['p4' (villager), 'p3' (hunter)]
      const { nextState } = executeDayVote(state, ['p4', 'p3']);
      expect(nextState.players.find((p) => p.id === 'p4')?.isAlive).toBe(false);
      expect(nextState.players.find((p) => p.id === 'p3')?.isAlive).toBe(false);
      expect(nextState.phase).toBe('HUNTER_SHOT');
      expect(nextState.pendingHunterShotPlayerId).toBe('p3');

      // Hunter shoots the werewolf -> villager win
      const shotRes = executeHunterShot(nextState, 'p2');
      expect(shotRes.winOutcome?.winner).toBe('VILLAGER');
    });

    it('Hunter is hanged as TARGET 1 on doubleVoteDay: resolves BOTH targets before entering HUNTER_SHOT', () => {
      const state = createTestGame([
        'troublemaker',
        'werewolf',
        'hunter',
        'villager',
        'villager',
        'villager',
      ]);
      state.doubleVoteDay = true;

      // ['p3' (hunter), 'p4' (villager)] - Hunter is FIRST target!
      const { nextState } = executeDayVote(state, ['p3', 'p4']);
      expect(nextState.players.find((p) => p.id === 'p3')?.isAlive).toBe(false);
      expect(nextState.players.find((p) => p.id === 'p4')?.isAlive).toBe(false);
      expect(nextState.doubleVoteDay).toBe(false);
      expect(nextState.phase).toBe('HUNTER_SHOT');
      expect(nextState.pendingHunterShotPlayerId).toBe('p3');

      const shotRes = executeHunterShot(nextState, 'p2');
      expect(shotRes.winOutcome?.winner).toBe('VILLAGER');
      expect(shotRes.nextState.phase).toBe('GAME_OVER');
    });

    it('Hunter (target 1) + Mayor (target 2) on doubleVoteDay: queues Hunter Shot then Mayor Succession before NIGHT', () => {
      const state = createTestGame([
        'troublemaker',
        'werewolf',
        'hunter',
        'villager',
        'villager',
        'villager',
      ]);
      state.doubleVoteDay = true;
      state.mayorId = 'p4';
      state.players[3].voteWeight = 2;

      const { nextState } = executeDayVote(state, ['p3', 'p4']);
      expect(nextState.players.find((p) => p.id === 'p3')?.isAlive).toBe(false);
      expect(nextState.players.find((p) => p.id === 'p4')?.isAlive).toBe(false);
      expect(nextState.phase).toBe('HUNTER_SHOT');
      expect(nextState.pendingHunterShotPlayerId).toBe('p3');
      expect(nextState.pendingMayorSuccessionPlayerId).toBe('p4');

      // Hunter shoots p5 (villager) -> transitions to MAYOR_SUCCESSION for p4
      const shotRes = executeHunterShot(nextState, 'p5');
      expect(shotRes.winOutcome).toBeNull();
      expect(shotRes.nextState.phase).toBe('MAYOR_SUCCESSION');
      expect(shotRes.nextState.pendingMayorSuccessionPlayerId).toBe('p4');

      // Mayor transfers title to p6 -> transitions to NIGHT round 2
      const { executeMayorSuccession } = require('../gameEngine');
      const mayorRes = executeMayorSuccession(shotRes.nextState, 'p6');
      expect(mayorRes.nextState.phase).toBe('NIGHT');
      expect(mayorRes.nextState.roundNumber).toBe(2);
      expect(mayorRes.nextState.mayorId).toBe('p6');
    });

    it('Single vote on double vote day: hangs only that single person', () => {
      const state = createTestGame(['troublemaker', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
      state.doubleVoteDay = true;

      const { nextState } = executeDayVote(state, 'p3');
      expect(nextState.players.find((p) => p.id === 'p3')?.isAlive).toBe(false);
      expect(nextState.doubleVoteDay).toBe(false);
      expect(nextState.phase).toBe('NIGHT');
    });
  });
});
