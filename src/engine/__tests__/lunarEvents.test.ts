import { describe, expect, it } from 'bun:test';
import {
  applyLastEchoChoice,
  applySeanceAnswer,
  applySeancePickQuestion,
  castDayVote,
  createInitialDayState,
  createInitialLunarState,
  drawLunarEventIfNeeded,
  executeDayVote,
  executeEmergencyEliminate,
  generateNightTurnPlan,
  getEffectiveVoterWeight,
  getWitchVictimsPreview,
  resetDayLunarFlagsOnNightStart,
  resolveLastEchoTimeout,
  resolveNight,
  resolveSeanceTimeout,
  SEANCE_QUESTIONS,
  shouldDrawLunarEvent,
  tallyDayVotes,
  tallyRunoffVotes,
} from '../index';
import type { GameState, LunarEventId } from '../types';
import { createTestGame } from './testHelpers';

function makeLunarGame(
  roles: string[] = ['werewolf', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager', 'villager', 'villager'],
  roundNumber = 2,
  overrides: Partial<GameState['settings']> = {}
): GameState {
  const game = createTestGame(roles, {
    lunarEventsEnabled: true,
    lunarEventCadence: 'EVERY_DAY',
    lunarAllowSpiritism: true,
    ...overrides,
  });
  game.roundNumber = roundNumber;
  game.phase = 'DAY_DISCUSS';
  game.dayState = createInitialDayState();
  return game;
}

describe('Engine - Lunar Events (Wave 1A)', () => {
  it('shouldDrawLunarEvent respects enabled, roundNumber >= 2, and cadence', () => {
    const disabled = makeLunarGame(undefined, 2, { lunarEventsEnabled: false });
    expect(shouldDrawLunarEvent(disabled)).toBe(false);

    const day1 = makeLunarGame(undefined, 1, { lunarEventCadence: 'EVERY_DAY' });
    expect(shouldDrawLunarEvent(day1)).toBe(false);

    const altDay2 = makeLunarGame(undefined, 2, { lunarEventCadence: 'ALTERNATE_DAYS' });
    expect(shouldDrawLunarEvent(altDay2)).toBe(true);

    const altDay3 = makeLunarGame(undefined, 3, { lunarEventCadence: 'ALTERNATE_DAYS' });
    expect(shouldDrawLunarEvent(altDay3)).toBe(false);

    const everyDay3 = makeLunarGame(undefined, 3, { lunarEventCadence: 'EVERY_DAY' });
    expect(shouldDrawLunarEvent(everyDay3)).toBe(true);
  });

  it('transitions penaltyVotesNextDay -> todayPenaltyVotes on Day >= 2 even when no lunar event is drawn', () => {
    const game = makeLunarGame(undefined, 3, { lunarEventCadence: 'ALTERNATE_DAYS' });
    game.lunarState!.penaltyVotesNextDay = { p6: 2 };

    const next = drawLunarEventIfNeeded(game, 42, 'MULTI_DEVICE');
    expect(next.lunarState!.todayPenaltyVotes).toEqual({ p6: 2 });
    expect(next.lunarState!.penaltyVotesNextDay).toEqual({});
    expect(next.lunarState!.currentDayEvent).toBeNull();
  });

  it('dawns_guarantee excludes Drunk with non-Villager drunkRealRoleId and picks valid pair', () => {
    const game = makeLunarGame(
      ['werewolf', 'werewolf', 'drunk', 'villager', 'villager', 'villager'],
      2
    );
    // p3 is drunk with werewolf real role -> excluded from guaranteed Villager
    game.players[2].drunkRealRoleId = 'werewolf';
    // Exclude all other events so dawns_guarantee is guaranteed to be drawn
    game.lunarState!.usedEventIds = [
      'midnight_echo',
      'neighbors_fury',
      'flash_trial',
      'open_ballot',
      'blood_oath',
      'blood_moon',
      'silver_shield',
      'misty_moon',
      'mirror_moon',
      'last_echo',
      'seance',
    ];

    const drawn = drawLunarEventIfNeeded(game, 7, 'SINGLE_DEVICE');
    expect(drawn.lunarState!.currentDayEvent?.eventId).toBe('dawns_guarantee');
    const detail = drawn.lunarState!.currentDayEvent!.detailLineVi;
    // At least one of the two named players must be a true villager (p4, p5, or p6)
    const trueVillagerNames = [game.players[3].name, game.players[4].name, game.players[5].name];
    const mentionsTrueVillager = trueVillagerNames.some((name) => detail.includes(`[${name}]`));
    expect(mentionsTrueVillager).toBe(true);

    // If ALL villagers are drunk-with-werewolf-real-role, dawns_guarantee is NOT eligible
    const noTrueVillager = makeLunarGame(
      ['werewolf', 'werewolf', 'drunk', 'sorcerer', 'minion', 'tanner'],
      2
    );
    noTrueVillager.players[2].drunkRealRoleId = 'werewolf';
    noTrueVillager.lunarState!.usedEventIds = [
      'midnight_echo',
      'neighbors_fury',
      'flash_trial',
      'open_ballot',
      'blood_oath',
      'blood_moon',
      'silver_shield',
      'misty_moon',
      'mirror_moon',
      'last_echo',
      'seance',
    ];
    const notDrawn = drawLunarEventIfNeeded(noTrueVillager, 7, 'SINGLE_DEVICE');
    // Pool was empty -> reset usedEventIds -> drew one of the other eligible events (not dawns_guarantee)
    expect(notDrawn.lunarState!.currentDayEvent?.eventId).not.toBe('dawns_guarantee');
  });

  it('draws all 12 events when guards are satisfied and resets pool keeping last_echo excluded', () => {
    const allIds: LunarEventId[] = [
      'dawns_guarantee',
      'midnight_echo',
      'neighbors_fury',
      'flash_trial',
      'open_ballot',
      'blood_oath',
      'blood_moon',
      'silver_shield',
      'misty_moon',
      'mirror_moon',
      'last_echo',
      'seance',
    ];

    for (const targetId of allIds) {
      const game = makeLunarGame(
        ['werewolf', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager', 'villager', 'villager'],
        2
      );
      game.deaths.push({
        playerId: 'p8',
        name: 'P8',
        roleId: 'villager',
        faction: 'VILLAGER',
        cause: 'WOLF_PACK',
        roundNumber: 2,
      });
      game.players[7].isAlive = false;
      // 7 living players (p1..p7) >= 7, seer alive, bodyguard alive, death in round 2
      game.lunarState!.usedEventIds = allIds.filter((id) => id !== targetId);

      const drawn = drawLunarEventIfNeeded(game, 42, 'MULTI_DEVICE');
      expect(drawn.lunarState!.currentDayEvent?.eventId).toBe(targetId);
    }

    // Pool exhaustion with lastEchoPermanentActive = true keeps last_echo excluded
    const exhausted = makeLunarGame(undefined, 2);
    exhausted.lunarState!.lastEchoPermanentActive = true;
    exhausted.lunarState!.usedEventIds = [...allIds];
    const afterReset = drawLunarEventIfNeeded(exhausted, 42, 'SINGLE_DEVICE');
    expect(afterReset.lunarState!.currentDayEvent?.eventId).not.toBe('last_echo');
    expect(afterReset.lunarState!.usedEventIds).toContain('last_echo');
  });

  it('Blood Moon + Wolf Cub double kill caps at 2 targets and clears both flags after night', () => {
    const game = makeLunarGame(
      ['werewolf', 'wolf_cub', 'seer', 'bodyguard', 'witch', 'villager', 'villager', 'villager'],
      2
    );
    game.wolfCubDoubleKillNextNight = true;
    game.lunarState!.wolfDoubleKillTonight = true;
    game.lunarState!.bloodMoonRevealTonight = true;

    const plan = generateNightTurnPlan(game);
    const wolfStep = plan.find((s) => s.turnKey === 'wolf_pack');
    expect(wolfStep?.maxTargets).toBe(2);

    const preview = getWitchVictimsPreview(game, {
      wolfPack: { targets: ['p6', 'p7', 'p8'] },
    });
    expect(preview).toEqual(['p6', 'p7']);

    const { nextState, output } = resolveNight(game, {
      wolfPack: { targets: ['p6', 'p7', 'p8'] },
    });
    expect(output.newDeaths.map((d) => d.playerId)).toEqual(['p6', 'p7']);
    expect(nextState.wolfCubDoubleKillNextNight).toBe(false);
    expect(nextState.lunarState!.wolfDoubleKillTonight).toBe(false);
    expect(nextState.lunarState!.bloodMoonRevealTonight).toBe(false);
    expect(nextState.lunarState!.bloodMoonRevealedPlayerIds).toEqual(['p6', 'p7']);

    const deathEvents = output.events.filter((e) => e.type === 'DEATH');
    expect(deathEvents.every((e) => e.isPublic === true)).toBe(true);

    const dawnEvt = nextState.eventLog.find((e) => e.actionType === 'DAWN_SUMMARY');
    expect(dawnEvt?.metadata?.dawnDeaths?.every((d) => d.forceReveal === true)).toBe(true);
  });

  it('Silver Shield allows Bodyguard to protect the same player two nights in a row', () => {
    const game = makeLunarGame(
      ['werewolf', 'seer', 'bodyguard', 'witch', 'villager', 'villager'],
      2
    );
    game.lastProtectedPlayerId = 'p6';
    game.lunarState!.silverShieldActiveTonight = true;

    const preview = getWitchVictimsPreview(game, {
      bodyguard: { targetId: 'p6' },
      wolfPack: { targets: ['p6'] },
    });
    expect(preview).toEqual([]);

    const { nextState, output } = resolveNight(game, {
      bodyguard: { targetId: 'p6' },
      wolfPack: { targets: ['p6'] },
    });
    expect(output.newDeaths).toHaveLength(0);
    expect(nextState.lunarState!.silverShieldActiveTonight).toBe(false);
  });

  it('Misty Moon turns Seer/Sorcerer into 3-seat cluster inspect and lets Fox keep power', () => {
    const game = makeLunarGame(
      ['werewolf', 'sorcerer', 'seer', 'fox', 'villager', 'villager', 'villager'],
      2
    );
    game.lunarState!.mistyMoonActiveTonight = true;

    // p1=werewolf, p2=sorcerer, p3=seer, p4=fox, p5=villager, p6=villager, p7=villager
    // Cluster around p6 is [p5, p6, p7] -> no werewolf!
    const { nextState, output } = resolveNight(game, {
      seer: { targetId: 'p6' },
      sorcerer: { targetId: 'p6' },
      fox: { targetId: 'p6' },
    });

    expect(output.infoResults.seerResult).toEqual({
      targetId: 'p6',
      result: 'VILLAGER',
      hasWerewolf: false,
      inspectedPlayerIds: ['p5', 'p6', 'p7'],
      mistyMoon: true,
    });
    expect(output.infoResults.sorcererResult).toEqual({
      targetId: 'p6',
      isSeer: false,
      hasWerewolf: false,
      inspectedPlayerIds: ['p5', 'p6', 'p7'],
      mistyMoon: true,
    });
    expect(nextState.foxLostPower).toBe(false);
    expect(output.infoResults.foxResult?.keptPower).toBe(true);
    expect(nextState.lunarState!.mistyMoonActiveTonight).toBe(false);
    // 3 skills activated (seer, sorcerer, fox)
    expect(nextState.lunarState!.lastNightActivatedSkillCount).toBe(3);
  });

  it('Mirror Moon sets pending reflection on wolf inspect and emits anonymous event next dawn', () => {
    const game = makeLunarGame(
      ['werewolf', 'seer', 'bodyguard', 'villager', 'villager', 'villager'],
      2
    );
    game.lunarState!.mirrorMoonActiveTonight = true;

    const { nextState } = resolveNight(game, {
      seer: { targetId: 'p1' },
      wolfPack: { targets: ['p6'] },
    });
    expect(nextState.lunarState!.mirrorMoonReflectedPending).toBe(true);
    expect(nextState.lunarState!.mirrorMoonActiveTonight).toBe(false);

    // Next day start (even if lunar event is NOT drawn) emits anonymous LUNAR_MIRROR_REFLECTION
    nextState.roundNumber = 3;
    nextState.settings.lunarEventsEnabled = false;
    const day3 = drawLunarEventIfNeeded(nextState, 42, 'SINGLE_DEVICE');
    expect(day3.lunarState!.mirrorMoonReflectedPending).toBe(false);

    const mirrorEvt = day3.eventLog.find((e) => e.actionType === 'LUNAR_MIRROR_REFLECTION');
    expect(mirrorEvt).toBeDefined();
    expect(mirrorEvt?.actor).toBeNull();
    expect(mirrorEvt?.targets).toEqual([]);
    expect(mirrorEvt?.metadata?.lunar?.summaryVi).toBe(
      'Ánh trăng đêm qua đã phản chiếu một cặp mắt đỏ!'
    );
  });

  it('tallyDayVotes handles 0 voter ballots + 1 penalty vote in PLURALITY and MAJORITY', () => {
    const pluralityGame = makeLunarGame(undefined, 2, { lynchThreshold: 'PLURALITY' });
    pluralityGame.lunarState!.todayPenaltyVotes = { p6: 1 };

    const resPlurality = tallyDayVotes(pluralityGame);
    expect(resPlurality.outcome.type).toBe('EXECUTE');
    expect(resPlurality.outcome.targetPlayerId).toBe('p6');

    const majorityGame = makeLunarGame(undefined, 2, { lynchThreshold: 'MAJORITY' });
    majorityGame.lunarState!.todayPenaltyVotes = { p6: 1 };

    const resMajority = tallyDayVotes(majorityGame);
    expect(resMajority.outcome.type).toBe('ESCAPE');
  });

  it('Neighbors Fury doubles vote weight (excluding revealed village_idiot) and Open Ballot reveals voters', () => {
    const game = makeLunarGame(
      ['werewolf', 'village_idiot', 'villager', 'villager', 'villager', 'villager'],
      2,
      { revealVoterIdentities: false, tieVoteMode: 'RUNOFF' }
    );
    game.players[1].voteWeight = 0; // revealed village_idiot
    game.lunarState!.neighborsFuryPlayerIds = ['p2', 'p3'];
    game.lunarState!.openBallotActiveToday = true;

    expect(getEffectiveVoterWeight(game, game.players[1])).toBe(0);
    expect(getEffectiveVoterWeight(game, game.players[2])).toBe(2);

    // p3 (weight 2) votes p1, p4 (weight 1) + p5 (weight 1) vote p6 -> tie 2-2 -> RUNOFF
    let voted = castDayVote(game, 'p3', 'p1');
    voted = castDayVote(voted, 'p4', 'p6');
    voted = castDayVote(voted, 'p5', 'p6');

    const tallied = tallyDayVotes(voted);
    expect(tallied.outcome.type).toBe('RUNOFF');
    const tallyEvt = tallied.nextState.eventLog.find((e) => e.actionType === 'VOTE_TALLY');
    const p1Tally = tallyEvt?.metadata?.vote?.tallies.find((t) => t.target.playerId === 'p1');
    expect(p1Tally?.voters?.map((v) => v.playerId)).toEqual(['p3']);

    // Runoff also respects Neighbors Fury (2 votes for p3)
    let runoff = tallied.nextState;
    runoff.dayState!.runoffBallots = { p3: 'p1', p4: 'p6' };
    const runoffRes = tallyRunoffVotes(runoff);
    expect(runoffRes.outcome.type).toBe('EXECUTE');
    expect(runoffRes.outcome.targetPlayerId).toBe('p1');
  });

  it('Blood Oath triggers wolfDoubleKillTonight when no one dies from Day vote', () => {
    const game = makeLunarGame(undefined, 2);
    game.lunarState!.bloodOathPendingToday = true;

    const { nextState } = executeDayVote(game, null);
    expect(nextState.lunarState!.wolfDoubleKillTonight).toBe(true);
    expect(nextState.phase).toBe('NIGHT');
    expect(nextState.roundNumber).toBe(3);
    const oathEvt = nextState.eventLog.find((e) => e.actionType === 'LUNAR_BLOOD_OATH_TRIGGERED');
    expect(oathEvt).toBeDefined();
  });

  it('Last Echo queues multiple lynched players (Troublemaker double vote) and advances to NIGHT', () => {
    const game = makeLunarGame(
      ['werewolf', 'werewolf', 'seer', 'bodyguard', 'villager', 'villager', 'villager', 'villager'],
      2
    );
    game.doubleVoteDay = true;
    game.lunarState!.lastEchoPermanentActive = true;

    const { nextState } = executeDayVote(game, ['p5', 'p6']);
    expect(nextState.phase).toBe('LAST_ECHO_MARK');
    expect(nextState.lunarState!.lastEchoState?.pendingQueuePlayerIds).toEqual(['p5', 'p6']);
    expect(nextState.lunarState!.lastEchoState?.activeExecutorId).toBe('p5');

    const afterFirst = applyLastEchoChoice(nextState, 'p5', 'p1');
    expect(afterFirst.phase).toBe('LAST_ECHO_MARK');
    expect(afterFirst.lunarState!.penaltyVotesNextDay).toEqual({ p1: 1 });
    expect(afterFirst.lunarState!.lastEchoState?.activeExecutorId).toBe('p6');

    const afterSecondTimeout = resolveLastEchoTimeout(afterFirst);
    expect(afterSecondTimeout.phase).toBe('NIGHT');
    expect(afterSecondTimeout.roundNumber).toBe(3);
    expect(afterSecondTimeout.lunarState!.lastEchoState).toBeNull();
    expect(afterSecondTimeout.lunarState!.penaltyVotesNextDay).toEqual({ p1: 1 });
  });

  it('Seance flow: pick question -> answer -> DAY_DISCUSS, and idempotent timeout', () => {
    const game = makeLunarGame(undefined, 2);
    game.deaths.push({
      playerId: 'p8',
      name: 'P8',
      roleId: 'villager',
      faction: 'VILLAGER',
      cause: 'WOLF_PACK',
      roundNumber: 2,
    });
    game.players[7].isAlive = false;
    game.mayorId = 'p3';
    game.lunarState!.usedEventIds = [
      'dawns_guarantee',
      'midnight_echo',
      'neighbors_fury',
      'flash_trial',
      'open_ballot',
      'blood_oath',
      'blood_moon',
      'silver_shield',
      'misty_moon',
      'mirror_moon',
      'last_echo',
    ];

    const drawn = drawLunarEventIfNeeded(game, 42, 'MULTI_DEVICE');
    expect(drawn.phase).toBe('LUNAR_SEANCE');
    expect(drawn.lunarState!.seanceState?.mediumPlayerId).toBe('p3');
    expect(drawn.lunarState!.seanceState?.targetDeadPlayerId).toBe('p8');

    const picked = applySeancePickQuestion(drawn, 'p3', 'Q2_WOLVES_CAUSE');
    expect(picked.lunarState!.seanceState?.stage).toBe('WAIT_ANSWER');
    expect(picked.lunarState!.seanceState?.selectedQuestionText).toBe(
      SEANCE_QUESTIONS.Q2_WOLVES_CAUSE
    );

    const answered = applySeanceAnswer(picked, 'p8', 'YES');
    expect(answered.phase).toBe('DAY_DISCUSS');
    expect(answered.lunarState!.seanceState?.stage).toBe('RESOLVED');
    const seanceEvt = answered.eventLog.find((e) => e.actionType === 'LUNAR_SEANCE_RESULT');
    expect(seanceEvt?.metadata?.lunar?.answer).toBe('YES');

    // Timeout path is idempotent
    const timedOut = resolveSeanceTimeout(picked);
    expect(timedOut.phase).toBe('DAY_DISCUSS');
    expect(resolveSeanceTimeout(timedOut).phase).toBe('DAY_DISCUSS');
  });

  it('executeEmergencyEliminate handles mid-LUNAR_SEANCE and mid-LAST_ECHO_MARK cleanly', () => {
    // 1. Mid-LUNAR_SEANCE when medium is emergency eliminated
    const seanceGame = makeLunarGame(undefined, 2);
    seanceGame.phase = 'LUNAR_SEANCE';
    seanceGame.lunarState!.seanceState = {
      stage: 'PICK_QUESTION',
      mediumPlayerId: 'p3',
      targetDeadPlayerId: 'p8',
      selectedQuestionId: null,
      answer: null,
    };
    const afterSeanceElim = executeEmergencyEliminate(seanceGame, 'p3');
    expect(afterSeanceElim.nextState.lunarState!.seanceState).toBeNull();
    expect(afterSeanceElim.nextState.phase).toBe('DAY_DISCUSS');

    // 2. Mid-LAST_ECHO_MARK when activeExecutorId is emergency eliminated (or remaining queue)
    const echoGame = makeLunarGame(undefined, 2);
    echoGame.phase = 'LAST_ECHO_MARK';
    echoGame.lunarState!.lastEchoState = {
      pendingQueuePlayerIds: ['p6'],
      activeExecutorId: 'p6',
      hasPendingHunterAfter: false,
      hasPendingMayorAfter: false,
    };
    const afterEchoElim = executeEmergencyEliminate(echoGame, 'p6');
    expect(afterEchoElim.nextState.phase).toBe('NIGHT');
    expect(afterEchoElim.nextState.roundNumber).toBe(3);
    expect(afterEchoElim.nextState.lunarState!.lastEchoState).toBeNull();
  });

  it('resetDayLunarFlagsOnNightStart clears day-scoped lunar flags', () => {
    const game = makeLunarGame(undefined, 2);
    game.lunarState = {
      ...createInitialLunarState(),
      flashTrialActiveToday: true,
      openBallotActiveToday: true,
      bloodOathPendingToday: true,
      neighborsFuryPlayerIds: ['p2'],
      todayPenaltyVotes: { p1: 1 },
      lastEchoPermanentActive: true,
    };
    resetDayLunarFlagsOnNightStart(game);
    expect(game.lunarState.flashTrialActiveToday).toBe(false);
    expect(game.lunarState.openBallotActiveToday).toBe(false);
    expect(game.lunarState.bloodOathPendingToday).toBe(false);
    expect(game.lunarState.neighborsFuryPlayerIds).toEqual([]);
    expect(game.lunarState.todayPenaltyVotes).toEqual({});
    expect(game.lunarState.lastEchoPermanentActive).toBe(true);
  });
});
