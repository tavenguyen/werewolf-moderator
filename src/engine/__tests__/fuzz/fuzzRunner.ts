import {
  createInitialGameState,
  executeDayVote,
  executeEmergencyEliminate,
  executeHunterShot,
  executeMayorSuccession,
  executeNightPhase,
} from '../../gameEngine';
import { ROLES, ROLES_BY_ID } from '../../roles';
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
import {
  generateFuzzMatchConfig,
  generateFuzzNightActions,
  pickFuzzVoteTarget,
} from './generator';
import {
  assertFinalMatchInvariants,
  assertGameStateInvariants,
  assertTurnPlanInvariants,
  InvariantViolationError,
  type InvariantContext,
} from './invariants';
import { SeededRng } from './prng';

export interface FuzzRunOptions {
  checkImmutability?: boolean;
  allowEmergencyEliminate?: boolean;
}

export interface FuzzRunSummary {
  seed: number;
  playerCount: number;
  roundsPlayed: number;
  winner: string | null;
  roleIds: string[];
  settings: GameState['settings'];
}

export interface FuzzBatchStats {
  gamesPlayed: number;
  maxRoundsSeen: number;
  rolesAppeared: Set<string>;
  winnersSeen: Map<string, number>;
  settingsTrueSeen: Set<string>;
  settingsFalseSeen: Set<string>;
}

const IMMUTABLE_OP_CHECK = (
  checkEnabled: boolean,
  beforeSnapshot: string,
  originalState: GameState,
  ctx: InvariantContext
) => {
  if (!checkEnabled) return;
  if (JSON.stringify(originalState) !== beforeSnapshot) {
    throw new InvariantViolationError(
      'I5',
      'Pure engine transition mutated input GameState!',
      ctx
    );
  }
};

function resolveSpecialTransitions(
  initialState: GameState,
  rng: SeededRng,
  ctx: InvariantContext,
  forceProgress: boolean,
  allowEmergency: boolean,
  checkImmutability: boolean
): { state: GameState; gameOver: boolean } {
  let state = initialState;
  let guard = 0;
  const maxSpecialSteps = state.players.length * 2 + 6;

  while (
    (state.phase === 'HUNTER_SHOT' || state.phase === 'MAYOR_SUCCESSION') &&
    guard < maxSpecialSteps
  ) {
    guard += 1;

    // Thỉnh thoảng chèn Trục xuất khẩn cấp ngay giữa pha chuyển tiếp để stress-test soft-lock
    if (allowEmergency && !forceProgress && rng.chance(0.03)) {
      const alive = state.players.filter((p) => p.isAlive);
      if (alive.length > 3) {
        const victim = rng.pick(alive);
        ctx.stepLabel = `R${state.roundNumber}:${state.phase}:Emergency(${victim.id})`;
        ctx.trace.push(ctx.stepLabel);
        const before = checkImmutability ? JSON.stringify(state) : '';
        const res = executeEmergencyEliminate(state, victim.id);
        IMMUTABLE_OP_CHECK(checkImmutability, before, state, ctx);
        state = res.nextState;
        assertGameStateInvariants(state, ctx);
        if (state.phase === 'GAME_OVER') return { state, gameOver: true };
        continue;
      }
    }

    if (state.phase === 'HUNTER_SHOT') {
      const aliveIds = state.players.filter((p) => p.isAlive).map((p) => p.id);
      const targetId =
        !forceProgress && state.settings.allowHunterSkipShot && rng.chance(0.18)
          ? null
          : aliveIds.length > 0
            ? rng.pick(aliveIds)
            : null;
      ctx.stepLabel = `R${state.roundNumber}:HunterShot(${targetId ?? 'SKIP'})`;
      ctx.trace.push(ctx.stepLabel);
      const before = checkImmutability ? JSON.stringify(state) : '';
      const res = executeHunterShot(state, targetId);
      IMMUTABLE_OP_CHECK(checkImmutability, before, state, ctx);
      state = res.nextState;
      assertGameStateInvariants(state, ctx);
      if (state.phase === 'GAME_OVER' || res.winOutcome) {
        return { state, gameOver: true };
      }
    } else if (state.phase === 'MAYOR_SUCCESSION') {
      const aliveIds = state.players.filter((p) => p.isAlive).map((p) => p.id);
      const successorId =
        !forceProgress && rng.chance(0.18)
          ? null
          : aliveIds.length > 0
            ? rng.pick(aliveIds)
            : null;
      ctx.stepLabel = `R${state.roundNumber}:MayorTransfer(${successorId ?? 'TIMEOUT'})`;
      ctx.trace.push(ctx.stepLabel);
      const before = checkImmutability ? JSON.stringify(state) : '';
      const res = executeMayorSuccession(state, successorId);
      IMMUTABLE_OP_CHECK(checkImmutability, before, state, ctx);
      state = res.nextState;
      assertGameStateInvariants(state, ctx);
      if (state.phase === 'GAME_OVER' || res.winOutcome) {
        return { state, gameOver: true };
      }
    }
  }

  if (state.phase === 'HUNTER_SHOT' || state.phase === 'MAYOR_SUCCESSION') {
    throw new InvariantViolationError(
      'I4',
      `Exceeded maxSpecialSteps (${maxSpecialSteps}) stuck in ${state.phase}`,
      ctx
    );
  }

  return { state, gameOver: state.phase === 'GAME_OVER' };
}

/**
 * Chạy trọn vẹn 1 ván đấu headless từ seed tất định và kiểm chứng mọi bất biến.
 */
export function runSingleFuzzGame(
  seed: number,
  options: FuzzRunOptions = {}
): FuzzRunSummary {
  const rng = new SeededRng(seed);
  const checkImmutability = options.checkImmutability ?? seed % 100 === 0;
  const allowEmergency = options.allowEmergencyEliminate ?? true;

  const config = generateFuzzMatchConfig(rng);
  const trace: string[] = [
    `Init(${config.playerCount}p, roles=${config.roleIds.join(',')})`,
  ];
  const ctx: InvariantContext = { seed, stepLabel: 'INIT', trace };

  let state = createInitialGameState(
    config.players,
    config.roleIds,
    config.settings,
    1
  );
  state.phase = 'NIGHT';
  assertGameStateInvariants(state, ctx);

  const maxRounds = config.playerCount * 3 + 8;
  let safetyCounter = 0;

  while (state.phase !== 'GAME_OVER' && safetyCounter < maxRounds) {
    safetyCounter += 1;
    const round = state.roundNumber;
    const forceProgress = safetyCounter > config.playerCount + 2;

    if (state.phase === 'NIGHT') {
      // Thỉnh thoảng giả lập Trục xuất khẩn cấp ngay giữa Đêm trước khi phân giải
      if (allowEmergency && !forceProgress && rng.chance(0.035)) {
        const alive = state.players.filter((p) => p.isAlive);
        if (alive.length > 3) {
          const victim = rng.pick(alive);
          ctx.stepLabel = `R${round}:NIGHT:Emergency(${victim.id})`;
          ctx.trace.push(ctx.stepLabel);
          const before = checkImmutability ? JSON.stringify(state) : '';
          const elimRes = executeEmergencyEliminate(state, victim.id);
          IMMUTABLE_OP_CHECK(checkImmutability, before, state, ctx);
          state = elimRes.nextState;
          assertGameStateInvariants(state, ctx);
          if (state.phase === 'GAME_OVER' || elimRes.winOutcome) break;

          if (state.phase === 'HUNTER_SHOT' || state.phase === 'MAYOR_SUCCESSION') {
            const specRes = resolveSpecialTransitions(
              state,
              rng,
              ctx,
              forceProgress,
              false,
              checkImmutability
            );
            state = specRes.state;
            if (specRes.gameOver) break;
            // Quay lại đúng Đêm bị gián đoạn để chạy tiếp
            if (state.phase === 'NIGHT') {
              continue;
            }
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
      IMMUTABLE_OP_CHECK(checkImmutability, before, state, ctx);
      state = nightRes.nextState;
      assertGameStateInvariants(state, ctx);

      if (state.phase === 'GAME_OVER' || nightRes.winOutcome) break;

      if (state.phase === 'HUNTER_SHOT' || state.phase === 'MAYOR_SUCCESSION') {
        const specRes = resolveSpecialTransitions(
          state,
          rng,
          ctx,
          forceProgress,
          allowEmergency,
          checkImmutability
        );
        state = specRes.state;
        if (specRes.gameOver) break;
      }
    }

    // Pha bầu Trưởng làng (nếu DAY_MAYOR_ELECTION)
    if (state.phase === 'DAY_MAYOR_ELECTION') {
      const livingVoters = state.players.filter((p) => p.isAlive);
      const aliveIds = livingVoters.map((p) => p.id);
      for (const voter of livingVoters) {
        if (rng.chance(0.15)) continue;
        state = castMayorBallot(state, voter.id, rng.pick(aliveIds));
      }
      ctx.stepLabel = `R${state.roundNumber}:MayorTally`;
      ctx.trace.push(ctx.stepLabel);
      const before = checkImmutability ? JSON.stringify(state) : '';
      const mayorRes = tallyMayorElection(state);
      IMMUTABLE_OP_CHECK(checkImmutability, before, state, ctx);
      state = mayorRes.nextState;
      assertGameStateInvariants(state, ctx);
    }

    // Pha thảo luận & Biểu quyết Ban ngày
    if (state.phase === 'DAY_DISCUSS' || state.phase === 'DAY_VOTE') {
      if (allowEmergency && !forceProgress && rng.chance(0.035)) {
        const alive = state.players.filter((p) => p.isAlive);
        if (alive.length > 3) {
          const victim = rng.pick(alive);
          ctx.stepLabel = `R${state.roundNumber}:DAY:Emergency(${victim.id})`;
          ctx.trace.push(ctx.stepLabel);
          const beforeDayEmerg = checkImmutability ? JSON.stringify(state) : '';
          const elimRes = executeEmergencyEliminate(state, victim.id);
          IMMUTABLE_OP_CHECK(checkImmutability, beforeDayEmerg, state, ctx);
          state = elimRes.nextState;
          assertGameStateInvariants(state, ctx);
          if (state.phase === 'GAME_OVER' || elimRes.winOutcome) break;

          if (state.phase === 'HUNTER_SHOT' || state.phase === 'MAYOR_SUCCESSION') {
            const specRes = resolveSpecialTransitions(
              state,
              rng,
              ctx,
              forceProgress,
              false,
              checkImmutability
            );
            state = specRes.state;
            if (specRes.gameOver) break;
          }
        }
      }

      if (state.phase !== 'DAY_DISCUSS' && state.phase !== 'DAY_VOTE') {
        continue;
      }

      const livingVoters = state.players.filter((p) => p.isAlive && p.voteWeight > 0);
      const aliveIds = state.players.filter((p) => p.isAlive).map((p) => p.id);
      const focusedTarget = forceProgress
        ? pickFuzzVoteTarget(state, aliveIds, rng, true)
        : null;

      for (const voter of livingVoters) {
        const chosen = forceProgress
          ? focusedTarget
          : pickFuzzVoteTarget(state, aliveIds, rng, false);
        state = castDayVote(state, voter.id, chosen);
      }

      // Tính tally metadata để đồng bộ như Server / LocalAdapter
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
      const beforeTally = checkImmutability ? JSON.stringify(state) : '';
      const dayTallyRes = tallyDayVotes(state);
      IMMUTABLE_OP_CHECK(checkImmutability, beforeTally, state, ctx);
      state = dayTallyRes.nextState;
      assertGameStateInvariants(state, ctx);

      if (dayTallyRes.outcome.type === 'RUNOFF' && dayTallyRes.outcome.candidateIds) {
        const candIds = dayTallyRes.outcome.candidateIds;
        const runoffVoters = state.players.filter((p) => p.isAlive && p.voteWeight > 0);
        const forcedRunoffTarget = forceProgress ? candIds[0] : null;
        for (const voter of runoffVoters) {
          const pick = forceProgress
            ? forcedRunoffTarget
            : rng.chance(0.18)
              ? null
              : rng.pick(candIds);
          state = castRunoffVote(state, voter.id, pick);
        }

        const rTallies: Record<PlayerId, number> = {};
        const rVoterDetails: Record<PlayerId, PlayerId[]> = {};
        let rAbstain = 0;
        for (const voter of runoffVoters) {
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

        ctx.stepLabel = `R${state.roundNumber}:RunoffTally`;
        ctx.trace.push(ctx.stepLabel);
        const beforeRunoffTally = checkImmutability ? JSON.stringify(state) : '';
        const runoffRes = tallyRunoffVotes(state);
        IMMUTABLE_OP_CHECK(checkImmutability, beforeRunoffTally, state, ctx);
        state = runoffRes.nextState;

        const execTarget =
          runoffRes.outcome.type === 'EXECUTE' ? (runoffRes.outcome.targetPlayerId ?? null) : null;
        const voteMeta = buildVoteMetadata(
          state,
          'RUNOFF',
          { tallies: rTallies, abstainCount: rAbstain, voterDetails: rVoterDetails },
          { includeVoters: true }
        );
        const beforeRunoffExec = checkImmutability ? JSON.stringify(state) : '';
        const dayVoteRes = executeDayVote(state, execTarget, voteMeta);
        IMMUTABLE_OP_CHECK(checkImmutability, beforeRunoffExec, state, ctx);
        state = dayVoteRes.nextState;
        assertGameStateInvariants(state, ctx);
        if (state.phase === 'GAME_OVER' || dayVoteRes.winOutcome) break;
      } else {
        let targetsToExecute: PlayerId | PlayerId[] | null = null;
        if (dayTallyRes.outcome.type === 'EXECUTE' && dayTallyRes.outcome.targetPlayerId) {
          const list = [dayTallyRes.outcome.targetPlayerId];
          if (state.doubleVoteDay) {
            const secondCand = Object.entries(tallies)
              .sort((a, b) => b[1] - a[1])
              .find(([id]) => id !== dayTallyRes.outcome.targetPlayerId);
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
        const dayVoteRes = executeDayVote(state, targetsToExecute, voteMeta);
        IMMUTABLE_OP_CHECK(checkImmutability, beforeExec, state, ctx);
        state = dayVoteRes.nextState;
        assertGameStateInvariants(state, ctx);
        if (state.phase === 'GAME_OVER' || dayVoteRes.winOutcome) break;
      }

      if (state.phase === 'HUNTER_SHOT' || state.phase === 'MAYOR_SUCCESSION') {
        const specRes = resolveSpecialTransitions(
          state,
          rng,
          ctx,
          forceProgress,
          allowEmergency,
          checkImmutability
        );
        state = specRes.state;
        if (specRes.gameOver) break;
      }
    }
  }

  ctx.stepLabel = 'FINAL';
  assertFinalMatchInvariants(state, ctx);
  const winEvt = state.eventLog.find((e) => e.actionType === 'WIN');

  return {
    seed,
    playerCount: config.playerCount,
    roundsPlayed: state.roundNumber,
    winner: winEvt?.metadata?.win?.winner ?? null,
    roleIds: config.roleIds,
    settings: state.settings,
  };
}

/**
 * Chạy hàng loạt N ván đấu fuzzing từ baseSeed và thống kê độ phủ vai trò / công tắc luật.
 */
export function runFuzzBatch(count: number, baseSeed: number = 1): FuzzBatchStats {
  const rolesAppeared = new Set<string>();
  const winnersSeen = new Map<string, number>();
  const settingsTrueSeen = new Set<string>();
  const settingsFalseSeen = new Set<string>();
  let maxRoundsSeen = 0;

  for (let i = 0; i < count; i++) {
    const seed = baseSeed + i;
    const summary = runSingleFuzzGame(seed);
    if (summary.roundsPlayed > maxRoundsSeen) {
      maxRoundsSeen = summary.roundsPlayed;
    }
    for (const r of summary.roleIds) rolesAppeared.add(r);
    if (summary.winner) {
      winnersSeen.set(summary.winner, (winnersSeen.get(summary.winner) ?? 0) + 1);
    }

    for (const [k, v] of Object.entries(summary.settings)) {
      if (typeof v === 'boolean') {
        if (v) settingsTrueSeen.add(k);
        else settingsFalseSeen.add(k);
      } else if (typeof v === 'string') {
        if (v === 'AOE' || v === 'RUNOFF' || v === 'EXACT_ROLE' || v === 'MAJORITY') {
          settingsTrueSeen.add(`${k}:${v}`);
        } else {
          settingsFalseSeen.add(`${k}:${v}`);
        }
      }
    }
  }

  return {
    gamesPlayed: count,
    maxRoundsSeen,
    rolesAppeared,
    winnersSeen,
    settingsTrueSeen,
    settingsFalseSeen,
  };
}

export function getAllImplementedRoleIds(): string[] {
  return ROLES.filter((r) => r.implementedInEngine && ROLES_BY_ID[r.id]).map((r) => r.id);
}
