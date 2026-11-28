import {
  createInitialGameState,
  executeDayVote,
  executeEmergencyEliminate,
  executeHunterShot,
  executeMayorSuccession,
  executeNightPhase,
} from '../../gameEngine';
import { generateNightTurnPlan } from '../../turnPlan';
import type { GameState, PlayerId } from '../../types';
import {
  buildVoteMetadata,
  castDayVote,
  castMayorBallot,
  castRunoffVote,
  tallyDayVotes,
  tallyMayorElection,
  tallyRunoffVotes,
} from '../../voting';
import { generateFuzzNightActions, pickFuzzVoteTarget } from './generator';
import {
  assertFinalMatchInvariants,
  assertGameStateInvariants,
  assertTurnPlanInvariants,
  InvariantViolationError,
  type InvariantContext,
} from './invariants';
import { SeededRng } from './prng';
import { generateToxicCombinatorialConfig } from './targetedGenerator';

export interface TargetedFuzzOptions {
  clusterIndex?: number;
  passiveDayMode?: boolean;
  allowEmergencyEliminate?: boolean;
  checkImmutability?: boolean;
}

export interface TargetedFuzzSummary {
  seed: number;
  clusterId: string;
  playerCount: number;
  roundsPlayed: number;
  winner: string | null;
  roleIds: string[];
}

function checkImmutabilitySnapshot(
  enabled: boolean,
  before: string,
  originalState: GameState,
  ctx: InvariantContext
): void {
  if (!enabled) return;
  if (JSON.stringify(originalState) !== before) {
    throw new InvariantViolationError('I5', 'Engine mutated input state in targeted fuzz', ctx);
  }
}

/**
 * Kiểm tra bất biến Deadlock nội tại:
 * Nếu toàn bộ người sống đều mất khả năng tạo tiến triển (0 Sói cắn đêm, 0 Thổi sáo, 0 Giáo phái,
 * 0 sát thương trễ đang chờ, 0 Thiên sứ Ngày 1, và 0 Dân làng), trạng thái không được phép tiếp tục lơ lửng.
 */
export function assertNoUnbreakableStalemateState(state: GameState, ctx: InvariantContext): void {
  if (state.phase === 'GAME_OVER' || state.phase === 'HUNTER_SHOT' || state.phase === 'MAYOR_SUCCESSION') {
    return;
  }
  const alive = state.players.filter((p) => p.isAlive);
  const activeWolves = alive.filter(
    (p) => p.faction === 'WEREWOLF' && p.roleId !== 'minion' && p.roleId !== 'sorcerer'
  );
  const livingVillagers = alive.filter((p) => p.faction === 'VILLAGER');
  const hasPiedPiper = alive.some((p) => p.roleId === 'pied_piper');
  const hasCultLeader = alive.some((p) => p.roleId === 'cult_leader');
  const hasWhiteWolf = alive.some((p) => p.roleId === 'white_wolf');
  const hasAngelR1 = state.roundNumber === 1 && alive.some((p) => p.roleId === 'angel');
  const hasWitchPoison =
    alive.some((p) => p.roleId === 'witch') &&
    !state.witchPoisonUsed &&
    !state.villagePowerStripped;
  const hasPendingDelayedDeath = alive.some(
    (p) =>
      Boolean(p.infectedWithTetanus) ||
      (p.roleId === 'tough_guy' && typeof p.toughGuyBittenNight === 'number')
  );
  const hasWakingDrunk =
    state.roundNumber < 3 &&
    alive.some((p) => p.roleId === 'drunk' && Boolean(p.drunkRealRoleId));

  const hasTannerSelfMajority =
    alive.length >= 2 &&
    alive.some((p) => p.roleId === 'tanner' && p.voteWeight > alive.length / 2);

  if (
    activeWolves.length === 0 &&
    livingVillagers.length === 0 &&
    !hasPiedPiper &&
    !hasCultLeader &&
    !hasWhiteWolf &&
    !hasAngelR1 &&
    !hasTannerSelfMajority
  ) {
    throw new InvariantViolationError(
      'DEADLOCK',
      `Unwinnable non-killer stalemate state persisted in phase=${state.phase}: roles=${alive.map((p) => p.roleId).join(',')}`,
      ctx
    );
  }

  const livingCouple = alive.filter((p) => p.loverId);
  const isCrossCouple =
    livingCouple.length === 2 &&
    livingCouple[0].loverId === livingCouple[1].id &&
    livingCouple[0].faction !== livingCouple[1].faction;
  if (
    isCrossCouple &&
    activeWolves.length === 0 &&
    !hasPiedPiper &&
    !hasCultLeader &&
    !hasWhiteWolf &&
    !hasWitchPoison &&
    !hasPendingDelayedDeath &&
    !hasAngelR1 &&
    !hasWakingDrunk
  ) {
    const nonCouple = alive.filter((p) => !livingCouple.some((c) => c.id === p.id));
    const cWeight = livingCouple.reduce((s, p) => s + p.voteWeight, 0);
    const nWeight = nonCouple.reduce((s, p) => s + p.voteWeight, 0);
    const maj = alive.length / 2;
    const hoodlumWeight = nonCouple
      .filter((p) => p.roleId === 'hoodlum')
      .reduce((s, p) => s + p.voteWeight, 0);
    const hasTannerCoalition = alive.some((p) => {
      if (p.roleId !== 'tanner' || p.voteWeight <= 0) return false;
      const inC = livingCouple.some((c) => c.id === p.id);
      return (inC ? nWeight : cWeight) + p.voteWeight > maj;
    });
    if (
      cWeight + nWeight === 0 ||
      (state.settings.lynchThreshold === 'MAJORITY' &&
        cWeight <= maj &&
        nWeight <= maj &&
        cWeight + hoodlumWeight <= maj &&
        !hasTannerCoalition)
    ) {
      throw new InvariantViolationError(
        'DEADLOCK',
        `Cross-faction couple stalemate persisted in phase=${state.phase} (${cWeight} vs ${nWeight}, alive=${alive.length})`,
        ctx
      );
    }
  }
}

function resolveSpecialsTargeted(
  initialState: GameState,
  rng: SeededRng,
  ctx: InvariantContext,
  forceProgress: boolean,
  checkImmutability: boolean
): { state: GameState; gameOver: boolean } {
  let state = initialState;
  let guard = 0;
  const maxSteps = state.players.length * 2 + 6;

  while (
    (state.phase === 'HUNTER_SHOT' || state.phase === 'MAYOR_SUCCESSION') &&
    guard < maxSteps
  ) {
    guard += 1;
    if (state.phase === 'HUNTER_SHOT') {
      const aliveIds = state.players.filter((p) => p.isAlive).map((p) => p.id);
      const targetId =
        !forceProgress && state.settings.allowHunterSkipShot && rng.chance(0.15)
          ? null
          : aliveIds.length > 0
            ? rng.pick(aliveIds)
            : null;
      ctx.stepLabel = `R${state.roundNumber}:HunterShot(${targetId ?? 'SKIP'})`;
      ctx.trace.push(ctx.stepLabel);
      const before = checkImmutability ? JSON.stringify(state) : '';
      const res = executeHunterShot(state, targetId);
      checkImmutabilitySnapshot(checkImmutability, before, state, ctx);
      state = res.nextState;
      assertGameStateInvariants(state, ctx);
      assertNoUnbreakableStalemateState(state, ctx);
      if (state.phase === 'GAME_OVER' || res.winOutcome) {
        return { state, gameOver: true };
      }
    } else if (state.phase === 'MAYOR_SUCCESSION') {
      const aliveIds = state.players.filter((p) => p.isAlive).map((p) => p.id);
      const successorId =
        !forceProgress && rng.chance(0.15)
          ? null
          : aliveIds.length > 0
            ? rng.pick(aliveIds)
            : null;
      ctx.stepLabel = `R${state.roundNumber}:MayorTransfer(${successorId ?? 'TIMEOUT'})`;
      ctx.trace.push(ctx.stepLabel);
      const before = checkImmutability ? JSON.stringify(state) : '';
      const res = executeMayorSuccession(state, successorId);
      checkImmutabilitySnapshot(checkImmutability, before, state, ctx);
      state = res.nextState;
      assertGameStateInvariants(state, ctx);
      assertNoUnbreakableStalemateState(state, ctx);
      if (state.phase === 'GAME_OVER' || res.winOutcome) {
        return { state, gameOver: true };
      }
    }
  }

  if (state.phase === 'HUNTER_SHOT' || state.phase === 'MAYOR_SUCCESSION') {
    throw new InvariantViolationError(
      'I4',
      `Exceeded maxSteps (${maxSteps}) stuck in ${state.phase}`,
      ctx
    );
  }

  return { state, gameOver: state.phase === 'GAME_OVER' };
}

/**
 * Chạy 1 ván Targeted Combinatorial Fuzzing (hỗ trợ passiveDayMode để săn Deadlock không cần treo cổ).
 */
export function runTargetedToxicGame(
  seed: number,
  options: TargetedFuzzOptions = {}
): TargetedFuzzSummary {
  const rng = new SeededRng(seed);
  const { config, clusterId } = generateToxicCombinatorialConfig(rng, options.clusterIndex);
  const passiveDayMode = Boolean(options.passiveDayMode);
  const checkImmutability = options.checkImmutability ?? seed % 50 === 0;
  const allowEmergency = options.allowEmergencyEliminate ?? !passiveDayMode;

  if (passiveDayMode) {
    // Trong chế độ săn deadlock khi dân không treo cổ được ai:
    // cấm Sói cố tình bỏ cắn vô hạn, buộc Sói/Sáo/Giáo phái phải hành động thật vào ban đêm.
    config.settings = {
      ...config.settings,
      allowWolfSkip: false,
      lynchThreshold: 'MAJORITY',
      tieVoteMode: 'ESCAPE',
    };
  }

  const trace: string[] = [
    `Toxic(${clusterId}, ${config.playerCount}p, passive=${passiveDayMode}, roles=${config.roleIds.join(',')})`,
  ];
  const ctx: InvariantContext = { seed, stepLabel: 'INIT', trace };

  let state = createInitialGameState(config.players, config.roleIds, config.settings, 1);
  state.phase = 'NIGHT';
  assertGameStateInvariants(state, ctx);
  assertNoUnbreakableStalemateState(state, ctx);

  // Khi Elder chết oan làm Bảo vệ mất phép, số vòng tối đa không quá ~3*N + Elder/ToughGuy buffer
  const maxRounds = config.playerCount * 3 + 12;
  let guard = 0;

  while (state.phase !== 'GAME_OVER' && guard < maxRounds) {
    guard += 1;
    const round = state.roundNumber;
    const forceProgress = passiveDayMode || guard > config.playerCount + 2;

    if (state.phase === 'NIGHT') {
      if (allowEmergency && !forceProgress && rng.chance(0.03)) {
        const alive = state.players.filter((p) => p.isAlive);
        if (alive.length > 3) {
          const victim = rng.pick(alive);
          ctx.stepLabel = `R${round}:NIGHT:Emergency(${victim.id})`;
          ctx.trace.push(ctx.stepLabel);
          const before = checkImmutability ? JSON.stringify(state) : '';
          const elimRes = executeEmergencyEliminate(state, victim.id);
          checkImmutabilitySnapshot(checkImmutability, before, state, ctx);
          state = elimRes.nextState;
          assertGameStateInvariants(state, ctx);
          assertNoUnbreakableStalemateState(state, ctx);
          if (state.phase === 'GAME_OVER' || elimRes.winOutcome) break;

          if (state.phase === 'HUNTER_SHOT' || state.phase === 'MAYOR_SUCCESSION') {
            const specRes = resolveSpecialsTargeted(state, rng, ctx, forceProgress, checkImmutability);
            state = specRes.state;
            if (specRes.gameOver) break;
            if (state.phase === 'NIGHT') continue;
          }
        }
      }

      const plan = generateNightTurnPlan(state);
      ctx.stepLabel = `R${round}:TurnPlan`;
      assertTurnPlanInvariants(state, plan, ctx);

      const actions = generateFuzzNightActions(state, plan, rng, forceProgress);
      ctx.stepLabel = `R${round}:Night`;
      ctx.trace.push(ctx.stepLabel);
      const before = checkImmutability ? JSON.stringify(state) : '';
      const nightRes = executeNightPhase(state, actions, rng.nextInt(1, 1_000_000));
      checkImmutabilitySnapshot(checkImmutability, before, state, ctx);
      state = nightRes.nextState;
      assertGameStateInvariants(state, ctx);
      assertNoUnbreakableStalemateState(state, ctx);
      if (state.phase === 'GAME_OVER' || nightRes.winOutcome) break;

      if (state.phase === 'HUNTER_SHOT' || state.phase === 'MAYOR_SUCCESSION') {
        const specRes = resolveSpecialsTargeted(state, rng, ctx, forceProgress, checkImmutability);
        state = specRes.state;
        if (specRes.gameOver) break;
      }
    }

    if (state.phase === 'DAY_MAYOR_ELECTION') {
      const livingVoters = state.players.filter((p) => p.isAlive);
      const aliveIds = livingVoters.map((p) => p.id);
      for (const voter of livingVoters) {
        if (!passiveDayMode && rng.chance(0.15)) continue;
        state = castMayorBallot(state, voter.id, passiveDayMode ? null : rng.pick(aliveIds));
      }
      ctx.stepLabel = `R${state.roundNumber}:MayorTally`;
      ctx.trace.push(ctx.stepLabel);
      const beforeMayor = checkImmutability ? JSON.stringify(state) : '';
      const mayorRes = tallyMayorElection(state);
      checkImmutabilitySnapshot(checkImmutability, beforeMayor, state, ctx);
      state = mayorRes.nextState;
      assertGameStateInvariants(state, ctx);
    }

    if (state.phase === 'DAY_DISCUSS' || state.phase === 'DAY_VOTE') {
      const livingVoters = state.players.filter((p) => p.isAlive && p.voteWeight > 0);
      const aliveIds = state.players.filter((p) => p.isAlive).map((p) => p.id);

      if (passiveDayMode) {
        // Khi chỉ còn Cặp đôi khác phe vs phần còn lại (0 Sói/Sáo/Giáo phái), mỗi bên bỏ phiếu theo lợi ích phe mình;
        // mọi tình huống còn lại mọi người đều bỏ phiếu trắng (0 treo cổ) để ép tiến triển hoàn toàn qua ban đêm.
        const aliveList = state.players.filter((p) => p.isAlive);
        const hasWolfOrConverter = aliveList.some(
          (p) =>
            (p.faction === 'WEREWOLF' && p.roleId !== 'minion' && p.roleId !== 'sorcerer') ||
            p.roleId === 'white_wolf' ||
            p.roleId === 'pied_piper' ||
            p.roleId === 'cult_leader'
        );
        const livingCouple = aliveList.filter((p) => p.loverId);
        const hasCrossCoupleEndgame =
          !hasWolfOrConverter &&
          livingCouple.length === 2 &&
          livingCouple[0].loverId === livingCouple[1].id &&
          livingCouple[0].faction !== livingCouple[1].faction;

        if (hasCrossCoupleEndgame) {
          const nonCouple = aliveList.filter((p) => !livingCouple.some((c) => c.id === p.id));
          const cWeight = livingCouple.reduce((s, p) => s + p.voteWeight, 0);
          const nWeight = nonCouple.reduce((s, p) => s + p.voteWeight, 0);
          const maj = aliveList.length / 2;
          const coalitionTanner = aliveList.find((p) => {
            if (p.roleId !== 'tanner' || p.voteWeight <= 0) return false;
            const inC = livingCouple.some((c) => c.id === p.id);
            return (inC ? nWeight : cWeight) + p.voteWeight > maj;
          });
          if (coalitionTanner && cWeight <= maj && nWeight <= maj) {
            const tannerInCouple = livingCouple.some((c) => c.id === coalitionTanner.id);
            for (const voter of livingVoters) {
              const isInCouple = livingCouple.some((c) => c.id === voter.id);
              const alliesWithTanner =
                voter.id === coalitionTanner.id || (tannerInCouple ? !isInCouple : isInCouple);
              state = castDayVote(
                state,
                voter.id,
                alliesWithTanner ? coalitionTanner.id : null
              );
            }
          } else {
            const coupleTarget =
              livingCouple.find((c) => !(c.roleId === 'prince' && !state.princeRevealed))?.id ??
              livingCouple[0].id;
            const nonCoupleNonHoodlum = nonCouple.filter((p) => p.roleId !== 'hoodlum');
            const nonCoupleTarget =
              (nonCoupleNonHoodlum.find((p) => !(p.roleId === 'prince' && !state.princeRevealed)) ??
                nonCoupleNonHoodlum[0] ??
                nonCouple[0])?.id ?? null;
            for (const voter of livingVoters) {
              const isInCouple = livingCouple.some((c) => c.id === voter.id);
              const voteTarget =
                isInCouple || (voter.roleId === 'hoodlum' && nonCoupleNonHoodlum.length > 0)
                  ? nonCoupleTarget
                  : coupleTarget;
              state = castDayVote(state, voter.id, voteTarget);
            }
          }
        } else {
          const tannerMayor = !hasWolfOrConverter
            ? aliveList.find(
                (p) =>
                  aliveList.length >= 2 &&
                  p.roleId === 'tanner' &&
                  p.voteWeight > aliveList.length / 2
              )
            : undefined;
          for (const voter of livingVoters) {
            state = castDayVote(
              state,
              voter.id,
              tannerMayor && voter.id === tannerMayor.id ? tannerMayor.id : null
            );
          }
        }
      } else {
        const focusedTarget = forceProgress ? pickFuzzVoteTarget(state, aliveIds, rng, true) : null;
        for (const voter of livingVoters) {
          const chosen = forceProgress
            ? focusedTarget
            : pickFuzzVoteTarget(state, aliveIds, rng, false);
          state = castDayVote(state, voter.id, chosen);
        }
      }

      const tallies: Record<PlayerId, number> = {};
      const voterDetails: Record<PlayerId, PlayerId[]> = {};
      let abstainCount = 0;
      for (const voter of livingVoters) {
        const tId = state.dayState?.ballots?.[voter.id];
        const target = tId ? state.players.find((p) => p.id === tId && p.isAlive) : undefined;
        if (!target) {
          abstainCount += voter.voteWeight;
        } else {
          tallies[target.id] = (tallies[target.id] ?? 0) + voter.voteWeight;
          if (!voterDetails[target.id]) voterDetails[target.id] = [];
          voterDetails[target.id].push(voter.id);
        }
      }

      ctx.stepLabel = `R${state.roundNumber}:DayTally`;
      ctx.trace.push(ctx.stepLabel);
      const tallyRes = tallyDayVotes(state);
      state = tallyRes.nextState;
      assertGameStateInvariants(state, ctx);

      if (tallyRes.outcome.type === 'RUNOFF' && tallyRes.outcome.candidateIds) {
        const cands = tallyRes.outcome.candidateIds;
        const rVoters = state.players.filter((p) => p.isAlive && p.voteWeight > 0);
        for (const voter of rVoters) {
          state = castRunoffVote(
            state,
            voter.id,
            passiveDayMode ? null : forceProgress ? cands[0] : rng.pick(cands)
          );
        }
        const rTallies: Record<PlayerId, number> = {};
        const rVoterDetails: Record<PlayerId, PlayerId[]> = {};
        let rAbstain = 0;
        for (const voter of rVoters) {
          const tId = state.dayState?.runoffBallots?.[voter.id];
          const target = tId ? state.players.find((p) => p.id === tId && p.isAlive) : undefined;
          if (!target) {
            rAbstain += voter.voteWeight;
          } else {
            rTallies[target.id] = (rTallies[target.id] ?? 0) + voter.voteWeight;
            if (!rVoterDetails[target.id]) rVoterDetails[target.id] = [];
            rVoterDetails[target.id].push(voter.id);
          }
        }
        const beforeRunoffTally = checkImmutability ? JSON.stringify(state) : '';
        const runoffRes = tallyRunoffVotes(state);
        checkImmutabilitySnapshot(checkImmutability, beforeRunoffTally, state, ctx);
        state = runoffRes.nextState;
        assertGameStateInvariants(state, ctx);
        const execTarget =
          runoffRes.outcome.type === 'EXECUTE' ? (runoffRes.outcome.targetPlayerId ?? null) : null;
        const voteMeta = buildVoteMetadata(
          state,
          'RUNOFF',
          { tallies: rTallies, abstainCount: rAbstain, voterDetails: rVoterDetails },
          { includeVoters: true }
        );
        const beforeRunoffExec = checkImmutability ? JSON.stringify(state) : '';
        const execRes = executeDayVote(state, execTarget, voteMeta);
        checkImmutabilitySnapshot(checkImmutability, beforeRunoffExec, state, ctx);
        state = execRes.nextState;
        assertGameStateInvariants(state, ctx);
        assertNoUnbreakableStalemateState(state, ctx);
        if (state.phase === 'GAME_OVER' || execRes.winOutcome) break;
      } else {
        let targetsToExecute: PlayerId | PlayerId[] | null = null;
        if (tallyRes.outcome.type === 'EXECUTE' && tallyRes.outcome.targetPlayerId) {
          const list = [tallyRes.outcome.targetPlayerId];
          if (state.doubleVoteDay) {
            const secondCand = Object.entries(tallies)
              .sort((a, b) => b[1] - a[1])
              .find(([id]) => id !== tallyRes.outcome.targetPlayerId);
            if (secondCand) list.push(secondCand[0]);
          }
          targetsToExecute = list;
        }
        const voteMeta = buildVoteMetadata(
          state,
          'DAY',
          { tallies, abstainCount, voterDetails },
          { includeVoters: true }
        );
        ctx.stepLabel = `R${state.roundNumber}:DayExecute`;
        ctx.trace.push(ctx.stepLabel);
        const beforeExec = checkImmutability ? JSON.stringify(state) : '';
        const execRes = executeDayVote(state, targetsToExecute, voteMeta);
        checkImmutabilitySnapshot(checkImmutability, beforeExec, state, ctx);
        state = execRes.nextState;
        assertGameStateInvariants(state, ctx);
        assertNoUnbreakableStalemateState(state, ctx);
        if (state.phase === 'GAME_OVER' || execRes.winOutcome) break;
      }

      if (state.phase === 'HUNTER_SHOT' || state.phase === 'MAYOR_SUCCESSION') {
        const specRes = resolveSpecialsTargeted(state, rng, ctx, forceProgress, checkImmutability);
        state = specRes.state;
        if (specRes.gameOver) break;
      }
    }
  }

  ctx.stepLabel = 'FINAL';
  assertFinalMatchInvariants(state, ctx);
  const winEvt = state.eventLog?.find((e) => e.actionType === 'WIN');

  return {
    seed,
    clusterId,
    playerCount: config.playerCount,
    roundsPlayed: state.roundNumber,
    winner: winEvt?.metadata?.win?.winner ?? null,
    roleIds: config.roleIds,
  };
}
