import { processDeathCascade } from './deathCascade';
import {
  appendMatchEvent,
  recordWinOutcomeEvent,
  resolveFollowupEventStage,
  snapshotPlayer,
} from './matchLog';
import { resolveNight, type NightResolutionOutput } from './nightResolution';
import { isBitingWolf, ROLES_BY_ID } from './roles';
import { getAliveNeighbors } from './seating';
import { createInitialLunarState, resetDayLunarFlagsOnNightStart } from './lunarEvents';
import type {
  GameState,
  MatchEventMetadata,
  NightActions,
  PlayerId,
  PlayerState,
  RoomSettings,
  WinOutcome,
} from './types';
import { createInitialDayState, passMayorTitle } from './voting';
import { checkWinCondition } from './winConditions';

export interface PlayerSetupInput {
  id: PlayerId;
  name: string;
  seatIndex: number;
  drunkRealRoleId?: string;
}

const DRUNK_ELIGIBLE_ROLE_POOL = [
  'seer',
  'bodyguard',
  'witch',
  'hunter',
  'aura_seer',
  'fox',
  'pi',
  'spellcaster',
  'troublemaker',
  'bear_tamer',
  'elder',
  'village_idiot',
  'prince',
  'tough_guy',
  'rusty_knight',
  'villager',
] as const;

function pickDrunkRealRoleId(usedRoleIds: Set<string>, seedIndex: number): string {
  const unused = DRUNK_ELIGIBLE_ROLE_POOL.filter((roleId) => !usedRoleIds.has(roleId));
  const pool = unused.length > 0 ? unused : DRUNK_ELIGIBLE_ROLE_POOL;
  return pool[Math.abs(seedIndex) % pool.length] ?? 'villager';
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  revealOnDeath: false,
  allowWolfSkip: false,
  allowWolfFriendlyFire: false,
  witchHealMode: 'AOE',
  witchKnowsVictim: false,
  witchWasteHealOnEmpty: false,
  allowWitchSelfHeal: true,
  tieVoteMode: 'ESCAPE',
  ghostMode: false,
  hasMayor: false,
  allowBodyguardSelfProtect: true,
  allowWitchBothPotionsSameNight: true,
  witchDoubleProtectKills: false,
  firstNightNoKill: false,
  seerRevealMode: 'FACTION',
  allowCupidSelfMatch: true,
  dayDiscussionSeconds: 180,
  dayVoteLockSeconds: 60,
  revealVoterIdentities: false,
  lynchThreshold: 'PLURALITY',
  hunterShootsOnPoison: true,
  allowHunterSkipShot: true,
  lunarEventsEnabled: false,
  lunarEventCadence: 'ALTERNATE_DAYS',
  lunarAllowSpiritism: true,
  customDeck: {
    werewolf: 2,
    seer: 1,
    bodyguard: 1,
    villager: 2,
  },
};

/**
 * Khởi tạo GameState ban đầu từ danh sách người chơi và role đã gán.
 */
export function createInitialGameState(
  playersInput: PlayerSetupInput[],
  assignedRoleIds: string[],
  settings: Partial<RoomSettings> = {},
  generation: number = 1
): GameState {
  if (playersInput.length < 6 || playersInput.length > 16) {
    throw new Error(`Số lượng người chơi phải từ 6 đến 16 (hiện tại: ${playersInput.length})`);
  }

  if (playersInput.length !== assignedRoleIds.length) {
    throw new Error('Số lượng người chơi không khớp với số lượng vai trò được chia');
  }

  const mergedSettings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS, ...settings };
  const usedRoleIds = new Set<string>(assignedRoleIds);

  const players: PlayerState[] = playersInput.map((input, idx) => {
    const roleId = assignedRoleIds[idx] ?? 'villager';
    const def = ROLES_BY_ID[roleId];
    if (!def || !def.implementedInEngine) {
      throw new Error(`Vai trò [${roleId}] chưa được hỗ trợ trong Game Engine`);
    }

    let drunkRealRoleId: string | undefined;
    if (roleId === 'drunk') {
      if (input.drunkRealRoleId && ROLES_BY_ID[input.drunkRealRoleId]?.implementedInEngine) {
        drunkRealRoleId = input.drunkRealRoleId;
      } else {
        drunkRealRoleId = pickDrunkRealRoleId(usedRoleIds, generation - 1 + idx);
        usedRoleIds.add(drunkRealRoleId);
      }
    }

    return {
      id: input.id,
      name: input.name,
      seatIndex: input.seatIndex,
      roleId,
      initialRoleId: roleId,
      faction: def?.faction ?? 'VILLAGER',
      isAlive: true,
      voteWeight: 1,
      elderHp: roleId === 'elder' ? 2 : undefined,
      drunkRealRoleId,
    };
  });

  return {
    generation,
    roundNumber: 1,
    phase: 'LOBBY',
    players,
    settings: mergedSettings,
    deaths: [],
    witchHealUsed: false,
    witchPoisonUsed: false,
    wolfCubDoubleKillNextNight: false,
    dreamWolfAwakened: false,
    foxLostPower: false,
    piUsed: false,
    troublemakerUsed: false,
    accursedWolfUsed: false,
    doubleVoteDay: false,
    villagePowerStripped: false,
    lastMutedPlayerId: null,
    mutedPlayerId: null,
    mayorId: null,
    pendingHunterShotPlayerId: null,
    pendingHunterQueue: [],
    pendingHunterDeathEventIds: {},
    pendingMayorSuccessionPlayerId: null,
    lunarState: createInitialLunarState(),
    historyLogs: [],
    eventLog: [],
    eventSeq: 0,
  };
}

/**
 * Đánh giá tiếng gầm của Gấu thuần hóa (Bear Tamer).
 */
export function evaluateBearGrowl(state: GameState): boolean | undefined {
  const hasBearTamerInGame = state.players.some((p) => p.roleId === 'bear_tamer');
  if (!hasBearTamerInGame) return undefined;

  const bearTamer = state.players.find((p) => p.roleId === 'bear_tamer' && p.isAlive);
  if (!bearTamer) return false;

  if (bearTamer.faction === 'WEREWOLF') {
    return true;
  }

  const neighbors = getAliveNeighbors(state.players, bearTamer.id);
  if (!neighbors) return false;

  return isBitingWolf(neighbors.left) || isBitingWolf(neighbors.right);
}

/**
 * Phát sinh các thông báo bị động đầu ngày (Gấu gầm, Cấm nói, Phá rối) đúng 1 lần cho vòng hiện tại
 * sau khi mọi pha xen giữa (HUNTER_SHOT, MAYOR_SUCCESSION) đã hoàn tất.
 */
export function emitMorningAnnouncements(state: GameState): void {
  state.bearGrowled = evaluateBearGrowl(state);

  if (state.morningAnnouncedRound === state.roundNumber) {
    return;
  }
  state.morningAnnouncedRound = state.roundNumber;

  if (state.bearGrowled) {
    state.historyLogs.push('Sáng sớm nay, tiếng gấu gầm dữ dội vang vọng khắp ngôi làng!');
    appendMatchEvent(state, {
      roundNumber: state.roundNumber,
      stage: 'DAY_ANNOUNCEMENT',
      actionType: 'BEAR_GROWL',
      visibility: 'PUBLIC',
      actor: null,
      targets: [],
      outcome: 'SUCCESS',
    });
  }

  if (state.mutedPlayerId) {
    const mutedPlayer = state.players.find(
      (p) => p.id === state.mutedPlayerId && p.isAlive
    );
    if (mutedPlayer) {
      state.historyLogs.push(
        `[${mutedPlayer.name}] đã bị phù phép câm lặng và không được phát biểu trong hôm nay!`
      );
      appendMatchEvent(state, {
        roundNumber: state.roundNumber,
        stage: 'DAY_ANNOUNCEMENT',
        actionType: 'MUTE_ANNOUNCE',
        visibility: 'PUBLIC',
        actor: null,
        targets: [snapshotPlayer(mutedPlayer)],
        outcome: 'SUCCESS',
      });
    } else {
      state.mutedPlayerId = null;
    }
  }

  if (state.doubleVoteDay) {
    appendMatchEvent(state, {
      roundNumber: state.roundNumber,
      stage: 'DAY_ANNOUNCEMENT',
      actionType: 'TROUBLEMAKER_ANNOUNCE',
      visibility: 'PUBLIC',
      actor: null,
      targets: [],
      outcome: 'SUCCESS',
    });
  }
}

/**
 * Bắt đầu pha ban ngày (Day Phase).
 */
export function startDayPhase(state: GameState): GameState {
  const nextState: GameState = structuredClone(state);
  nextState.dayState = createInitialDayState();

  if (nextState.roundNumber === 1 && nextState.settings.hasMayor) {
    nextState.phase = 'DAY_MAYOR_ELECTION';
    nextState.historyLogs.push('Bắt đầu Ngày 1: Toàn làng tiến hành bầu Trưởng làng!');
  } else {
    nextState.phase = 'DAY_DISCUSS';
    nextState.historyLogs.push(`Bắt đầu Ngày ${nextState.roundNumber}: Mở phiên thảo luận làng.`);
  }

  emitMorningAnnouncements(nextState);
  return nextState;
}

/**
 * Điều phối Pha Đêm (Pure Function):
 * Chạy phân giải đêm, chốt người chết, nối pha Thợ săn / Trưởng làng và kiểm tra thắng thua.
 */
export function executeNightPhase(
  state: GameState,
  actions: NightActions,
  randomSeed: number = 42
): {
  nextState: GameState;
  nightOutput: NightResolutionOutput;
  winOutcome: WinOutcome | null;
} {
  const inputWithPhase: GameState = structuredClone(state);
  inputWithPhase.phase = 'NIGHT';

  const { nextState, output: nightOutput } = resolveNight(inputWithPhase, actions, randomSeed);
  const hasAlivePlayers = nextState.players.some((p) => p.isAlive);

  if (nextState.pendingHunterShotPlayerId && hasAlivePlayers) {
    nextState.phase = 'HUNTER_SHOT';
    nextState.previousPhaseBeforeHunter =
      nextState.roundNumber === 1 && nextState.settings.hasMayor
        ? 'DAY_MAYOR_ELECTION'
        : 'DAY_DISCUSS';
    return { nextState, nightOutput, winOutcome: null };
  }

  if (nextState.pendingMayorSuccessionPlayerId && hasAlivePlayers) {
    nextState.phase = 'MAYOR_SUCCESSION';
    nextState.previousPhaseBeforeMayorSuccession =
      nextState.roundNumber === 1 && nextState.settings.hasMayor
        ? 'DAY_MAYOR_ELECTION'
        : 'DAY_DISCUSS';
    return { nextState, nightOutput, winOutcome: null };
  }

  const winOutcome = checkWinCondition(nextState);
  if (winOutcome) {
    nextState.phase = 'GAME_OVER';
    recordWinOutcomeEvent(nextState, winOutcome, nextState.roundNumber);
  } else if (nextState.phase === 'DAY_DISCUSS' || nextState.phase === 'DAY_MAYOR_ELECTION') {
    emitMorningAnnouncements(nextState);
  } else {
    nextState.dayState = createInitialDayState();
    nextState.phase =
      nextState.roundNumber === 1 && nextState.settings.hasMayor
        ? 'DAY_MAYOR_ELECTION'
        : 'DAY_DISCUSS';
    emitMorningAnnouncements(nextState);
  }

  return { nextState, nightOutput, winOutcome };
}

function transitionAngelDay1Survival(state: GameState, dayRound: number): void {
  if (dayRound !== 1) return;
  for (const p of state.players) {
    if (p.isAlive && p.roleId === 'angel' && p.faction !== 'VILLAGER') {
      const oldSnap = snapshotPlayer(p);
      p.faction = 'VILLAGER';
      state.historyLogs.push(
        `Thiên sứ (${p.name}) đã sống sót qua Ngày 1 và hòa mình thành Dân làng thường.`
      );
      appendMatchEvent(state, {
        roundNumber: dayRound,
        stage: 'DAY_VOTE',
        actionType: 'ANGEL_TO_VILLAGER',
        visibility: 'SECRET_NIGHT',
        actor: oldSnap,
        targets: [],
        outcome: 'SUCCESS',
        metadata: {
          roleChange: {
            oldRoleId: 'angel',
            newRoleId: 'angel',
            oldFaction: oldSnap.faction,
            newFaction: 'VILLAGER',
          },
        },
      });
    }
  }
}

/**
 * Điều phối Pha Biểu Quyết Ban Ngày (Day Vote Resolution) — Pure Function.
 */
export function executeDayVote(
  state: GameState,
  targetPlayerId: PlayerId | PlayerId[] | null,
  voteSummary?: MatchEventMetadata['vote']
): {
  nextState: GameState;
  survivedByReveal: boolean;
  winOutcome: WinOutcome | null;
} {
  const nextState: GameState = structuredClone(state);
  const dayRound = state.roundNumber;
  nextState.phase = 'DAY_VOTE';

  const targets: PlayerId[] = (
    Array.isArray(targetPlayerId) ? targetPlayerId : [targetPlayerId]
  ).filter((id): id is PlayerId => Boolean(id));

  let survivedByReveal = false;

  // Trường hợp không có ai bị vote (bỏ phiếu trắng hoặc hòa)
  if (targets.length === 0) {
    transitionAngelDay1Survival(nextState, dayRound);
    nextState.historyLogs.push('Hòa phiếu hoặc bỏ phiếu trắng: Không ai bị treo cổ hôm nay.');

    const hasTallyInThisRound = (nextState.eventLog ?? []).some(
      (e) =>
        e.roundNumber === dayRound &&
        e.stage === 'DAY_VOTE' &&
        e.actionType === 'VOTE_TALLY'
    );
    if (!hasTallyInThisRound) {
      appendMatchEvent(nextState, {
        roundNumber: dayRound,
        stage: 'DAY_VOTE',
        actionType: 'VOTE_NO_EXECUTION',
        visibility: 'PUBLIC',
        actor: null,
        targets: [],
        outcome: 'NO_EFFECT',
      });
    }

    if (nextState.lunarState?.bloodOathPendingToday) {
      nextState.lunarState.wolfDoubleKillTonight = true;
      nextState.lunarState.bloodOathPendingToday = false;
      nextState.historyLogs.push(
        'Lời Thề Máu kích hoạt: Không ai bị treo cổ hôm nay, đêm nay Ma Sói được cắn 2 người!'
      );
      appendMatchEvent(nextState, {
        roundNumber: dayRound,
        stage: 'DAY_VOTE',
        actionType: 'LUNAR_BLOOD_OATH_TRIGGERED',
        visibility: 'PUBLIC',
        actor: null,
        targets: [],
        outcome: 'SUCCESS',
        metadata: {
          lunar: {
            eventId: 'blood_oath',
            category: 'CRESCENT',
            titleVi: 'Lời Thề Máu',
            summaryVi: 'Không ai bị treo cổ hôm nay — đêm nay Ma Sói được cắn 2 người!',
          },
        },
      });
    }

    nextState.doubleVoteDay = false;
    const winOutcome = checkWinCondition(nextState);
    if (winOutcome) {
      nextState.phase = 'GAME_OVER';
      recordWinOutcomeEvent(nextState, winOutcome, dayRound);
      return { nextState, survivedByReveal: false, winOutcome };
    }

    nextState.roundNumber += 1;
    nextState.phase = 'NIGHT';
    resetDayLunarFlagsOnNightStart(nextState);
    return { nextState, survivedByReveal: false, winOutcome: null };
  }

  const isDoubleVote = Boolean(nextState.doubleVoteDay || targets.length > 1);

  for (let idx = 0; idx < targets.length; idx++) {
    const tId = targets[idx];
    const step: 1 | 2 = idx === 0 ? 1 : 2;
    const target = nextState.players.find((p) => p.id === tId);
    if (!target) continue;

    const stepVoteMeta: MatchEventMetadata['vote'] | undefined = voteSummary
      ? {
          ...voteSummary,
          isDoubleVoteDay: isDoubleVote,
          executionStep: isDoubleVote ? step : undefined,
        }
      : isDoubleVote
        ? {
            voteKind: 'DAY',
            tallies: [],
            abstainVotes: 0,
            isDoubleVoteDay: true,
            executionStep: step,
          }
        : undefined;

    // Nếu nạn nhân lượt 2 đã chết ngay trong chuỗi cascade của lượt 1 (vd: cặp đôi Cupid / Sói tuyết)
    if (!target.isAlive) {
      appendMatchEvent(nextState, {
        roundNumber: dayRound,
        stage: 'DAY_VOTE',
        actionType: 'VOTE_EXECUTION',
        visibility: 'PUBLIC',
        actor: null,
        targets: [snapshotPlayer(target)],
        outcome: 'NO_EFFECT',
        metadata: {
          vote: {
            ...(stepVoteMeta ?? { voteKind: 'DAY', tallies: [], abstainVotes: 0 }),
            executionStep: step,
            cancelledReason: 'ALREADY_DEAD',
          },
        },
      });
      continue;
    }

    // 1. Thằng ngốc (Village Idiot) lật bài thoát chết (mất quyền vote)
    if (target.roleId === 'village_idiot' && target.voteWeight > 0) {
      target.voteWeight = 0;
      survivedByReveal = true;
      nextState.historyLogs.push(
        `Thằng ngốc (${target.name}) lật bài thoát chết nhưng bị tước vĩnh viễn quyền bỏ phiếu!`
      );
      appendMatchEvent(nextState, {
        roundNumber: dayRound,
        stage: 'DAY_VOTE',
        actionType: 'VOTE_SURVIVED_REVEAL',
        visibility: 'PUBLIC',
        actor: snapshotPlayer(target),
        targets: [snapshotPlayer(target)],
        outcome: 'IMMUNE',
        ...(stepVoteMeta ? { metadata: { vote: stepVoteMeta } } : {}),
      });
      continue;
    }

    // 1b. Hoàng tử (Prince) lật bài thoát chết (giữ nguyên quyền vote)
    if (target.roleId === 'prince' && !nextState.princeRevealed) {
      nextState.princeRevealed = true;
      survivedByReveal = true;
      nextState.historyLogs.push(
        `Hoàng tử (${target.name}) lật bài thoát chết và giữ nguyên quyền bỏ phiếu!`
      );
      appendMatchEvent(nextState, {
        roundNumber: dayRound,
        stage: 'DAY_VOTE',
        actionType: 'VOTE_SURVIVED_REVEAL',
        visibility: 'PUBLIC',
        actor: snapshotPlayer(target),
        targets: [snapshotPlayer(target)],
        outcome: 'IMMUNE',
        ...(stepVoteMeta ? { metadata: { vote: stepVoteMeta } } : {}),
      });
      continue;
    }

    // 2. Treo cổ đưa vào Death Cascade
    const execEvt = appendMatchEvent(nextState, {
      roundNumber: dayRound,
      stage: 'DAY_VOTE',
      actionType: 'VOTE_EXECUTION',
      visibility: 'PUBLIC',
      actor: null,
      targets: [snapshotPlayer(target)],
      outcome: 'SUCCESS',
      ...(stepVoteMeta ? { metadata: { vote: stepVoteMeta } } : {}),
    });

    processDeathCascade(nextState, [
      { playerId: target.id, cause: 'VILLAGE_VOTE', parentEventId: execEvt.id },
    ]);

    const immediateWin = checkWinCondition(nextState);
    if (immediateWin && (immediateWin.winner === 'ANGEL' || immediateWin.winner === 'TANNER')) {
      if (idx === 0 && targets.length > 1) {
        const skippedTarget = nextState.players.find((p) => p.id === targets[1]);
        if (skippedTarget) {
          appendMatchEvent(nextState, {
            roundNumber: dayRound,
            stage: 'DAY_VOTE',
            actionType: 'VOTE_EXECUTION',
            visibility: 'PUBLIC',
            actor: null,
            targets: [snapshotPlayer(skippedTarget)],
            outcome: 'NO_EFFECT',
            metadata: {
              vote: {
                ...(voteSummary ?? { voteKind: 'DAY', tallies: [], abstainVotes: 0 }),
                isDoubleVoteDay: true,
                executionStep: 2,
                cancelledReason: 'IMMEDIATE_WIN',
              },
            },
          });
        }
      }
      nextState.phase = 'GAME_OVER';
      nextState.doubleVoteDay = false;
      recordWinOutcomeEvent(nextState, immediateWin, dayRound);
      return { nextState, survivedByReveal, winOutcome: immediateWin };
    }
  }

  nextState.doubleVoteDay = false;
  transitionAngelDay1Survival(nextState, dayRound);

  const hasAlivePlayers = nextState.players.some((p) => p.isAlive);
  const lynchedInRound = nextState.deaths.filter(
    (d) => d.roundNumber === dayRound && d.cause === 'VILLAGE_VOTE'
  );

  if (lynchedInRound.length === 0 && nextState.lunarState?.bloodOathPendingToday) {
    nextState.lunarState.wolfDoubleKillTonight = true;
    nextState.lunarState.bloodOathPendingToday = false;
    nextState.historyLogs.push(
      'Lời Thề Máu kích hoạt: Không ai bị treo cổ hôm nay, đêm nay Ma Sói được cắn 2 người!'
    );
    appendMatchEvent(nextState, {
      roundNumber: dayRound,
      stage: 'DAY_VOTE',
      actionType: 'LUNAR_BLOOD_OATH_TRIGGERED',
      visibility: 'PUBLIC',
      actor: null,
      targets: [],
      outcome: 'SUCCESS',
      metadata: {
        lunar: {
          eventId: 'blood_oath',
          category: 'CRESCENT',
          titleVi: 'Lời Thề Máu',
          summaryVi: 'Không ai bị treo cổ hôm nay — đêm nay Ma Sói được cắn 2 người!',
        },
      },
    });
  }

  const finalWin = checkWinCondition(nextState);
  if (finalWin) {
    nextState.phase = 'GAME_OVER';
    recordWinOutcomeEvent(nextState, finalWin, dayRound);
    return { nextState, survivedByReveal, winOutcome: finalWin };
  }

  if (
    lynchedInRound.length >= 1 &&
    nextState.lunarState?.lastEchoPermanentActive &&
    hasAlivePlayers
  ) {
    const queue = lynchedInRound.map((d) => d.playerId);
    nextState.lunarState.lastEchoState = {
      pendingQueuePlayerIds: queue,
      activeExecutorId: queue[0] ?? null,
      hasPendingHunterAfter: Boolean(nextState.pendingHunterShotPlayerId),
      hasPendingMayorAfter: Boolean(nextState.pendingMayorSuccessionPlayerId),
    };
    nextState.phase = 'LAST_ECHO_MARK';
    return { nextState, survivedByReveal, winOutcome: null };
  }

  if (nextState.pendingHunterShotPlayerId && hasAlivePlayers) {
    nextState.phase = 'HUNTER_SHOT';
    nextState.previousPhaseBeforeHunter = 'NIGHT';
    return { nextState, survivedByReveal, winOutcome: null };
  }

  if (nextState.pendingMayorSuccessionPlayerId && hasAlivePlayers) {
    nextState.phase = 'MAYOR_SUCCESSION';
    nextState.previousPhaseBeforeMayorSuccession = 'NIGHT';
    return { nextState, survivedByReveal, winOutcome: null };
  }

  nextState.roundNumber += 1;
  nextState.phase = 'NIGHT';
  resetDayLunarFlagsOnNightStart(nextState);

  return { nextState, survivedByReveal, winOutcome: null };
}

/**
 * Điều phối phát súng của Thợ săn (Hunter Shot) — Pure Function.
 * Hỗ trợ hàng đợi nhiều Thợ săn nối tiếp và truyền đúng parentEventId về cái chết gốc.
 */
export function executeHunterShot(
  state: GameState,
  targetPlayerId: PlayerId | null
): {
  nextState: GameState;
  winOutcome: WinOutcome | null;
  resumedInterruptedNight?: boolean;
} {
  const nextState: GameState = structuredClone(state);
  const queue =
    nextState.pendingHunterQueue && nextState.pendingHunterQueue.length > 0
      ? [...nextState.pendingHunterQueue]
      : nextState.pendingHunterShotPlayerId
        ? [nextState.pendingHunterShotPlayerId]
        : [];

  const shooterId = queue.shift() ?? null;
  nextState.pendingHunterQueue = queue;
  nextState.pendingHunterShotPlayerId = queue[0] ?? null;

  const shooter = shooterId
    ? nextState.players.find((p) => p.id === shooterId)
    : undefined;
  const shooterSnap = shooter ? snapshotPlayer(shooter, { roleId: 'hunter' }) : null;

  const parentDeathEventId =
    shooterId && nextState.pendingHunterDeathEventIds
      ? nextState.pendingHunterDeathEventIds[shooterId]
      : undefined;
  if (shooterId && nextState.pendingHunterDeathEventIds) {
    delete nextState.pendingHunterDeathEventIds[shooterId];
  }

  const shotRound = nextState.roundNumber;
  const shotStage = resolveFollowupEventStage(
    nextState,
    nextState.previousPhaseBeforeHunter,
    parentDeathEventId
  );

  if (targetPlayerId) {
    const target = nextState.players.find((p) => p.id === targetPlayerId);
    if (target && target.isAlive) {
      nextState.historyLogs.push(`Thợ săn đã nổ phát súng sau cùng tiêu diệt [${target.name}]!`);
      const shotEvt = appendMatchEvent(nextState, {
        roundNumber: shotRound,
        stage: shotStage,
        actionType: 'HUNTER_SHOT',
        visibility: 'PUBLIC',
        actor: shooterSnap,
        targets: [snapshotPlayer(target)],
        outcome: 'SUCCESS',
        parentEventId: parentDeathEventId ?? null,
      });
      processDeathCascade(nextState, [
        { playerId: target.id, cause: 'HUNTER_SHOT', parentEventId: shotEvt.id },
      ]);
    } else {
      nextState.historyLogs.push('Thợ săn không chọn ai hoặc đã bắn trượt.');
      appendMatchEvent(nextState, {
        roundNumber: shotRound,
        stage: shotStage,
        actionType: 'HUNTER_SHOT',
        visibility: 'PUBLIC',
        actor: shooterSnap,
        targets: [],
        outcome: 'NO_EFFECT',
        parentEventId: parentDeathEventId ?? null,
        metadata: { noShotReason: 'TIMEOUT_OR_SKIP' },
      });
    }
  } else {
    nextState.historyLogs.push('Thợ săn không chọn ai hoặc đã bắn trượt.');
    appendMatchEvent(nextState, {
      roundNumber: shotRound,
      stage: shotStage,
      actionType: 'HUNTER_SHOT',
      visibility: 'PUBLIC',
      actor: shooterSnap,
      targets: [],
      outcome: 'NO_EFFECT',
      parentEventId: parentDeathEventId ?? null,
      metadata: { noShotReason: 'TIMEOUT_OR_SKIP' },
    });
  }

  const hasAlivePlayers = nextState.players.some((p) => p.isAlive);

  // Nếu vẫn còn Thợ săn kế tiếp trong hàng đợi và còn người sống -> bắn tiếp trước khi checkWinCondition
  if (nextState.pendingHunterShotPlayerId && hasAlivePlayers) {
    nextState.phase = 'HUNTER_SHOT';
    return { nextState, winOutcome: null };
  }

  const winOutcome = checkWinCondition(nextState);
  if (winOutcome) {
    nextState.phase = 'GAME_OVER';
    recordWinOutcomeEvent(nextState, winOutcome, shotRound);
    return { nextState, winOutcome };
  }

  if (nextState.pendingMayorSuccessionPlayerId && hasAlivePlayers) {
    nextState.phase = 'MAYOR_SUCCESSION';
    nextState.previousPhaseBeforeMayorSuccession =
      nextState.previousPhaseBeforeHunter ?? 'DAY_DISCUSS';
    nextState.previousPhaseBeforeHunter = undefined;
    return { nextState, winOutcome: null };
  }

  let resumedInterruptedNight = false;
  if (nextState.phase === 'DAY_DISCUSS' || nextState.phase === 'DAY_MAYOR_ELECTION') {
    nextState.previousPhaseBeforeHunter = undefined;
    emitMorningAnnouncements(nextState);
  } else {
    const targetPhase =
      nextState.previousPhaseBeforeHunter &&
      nextState.previousPhaseBeforeHunter !== 'HUNTER_SHOT' &&
      nextState.previousPhaseBeforeHunter !== 'MAYOR_SUCCESSION'
        ? nextState.previousPhaseBeforeHunter
        : 'DAY_DISCUSS';
    nextState.phase = targetPhase;
    nextState.previousPhaseBeforeHunter = undefined;
    if (nextState.phase === 'NIGHT') {
      if (nextState.interruptedPhaseDuringNight) {
        nextState.interruptedPhaseDuringNight = false;
        resumedInterruptedNight = true;
      } else {
        nextState.roundNumber += 1;
        resetDayLunarFlagsOnNightStart(nextState);
      }
    } else if (nextState.phase === 'DAY_DISCUSS' || nextState.phase === 'DAY_MAYOR_ELECTION') {
      if (!nextState.dayState) {
        nextState.dayState = createInitialDayState();
      }
      emitMorningAnnouncements(nextState);
    }
  }

  return { nextState, winOutcome, ...(resumedInterruptedNight ? { resumedInterruptedNight } : {}) };
}

/**
 * Điều phối phiên truyền danh hiệu Trưởng làng khi Trưởng làng qua đời.
 */
export function executeMayorSuccession(
  state: GameState,
  successorPlayerId: PlayerId | null
): {
  nextState: GameState;
  winOutcome: WinOutcome | null;
  resumedInterruptedNight?: boolean;
} {
  const successionRound = state.roundNumber;
  const wasInterruptedNight = Boolean(
    state.previousPhaseBeforeMayorSuccession === 'NIGHT' && state.interruptedPhaseDuringNight
  );
  const nextState = passMayorTitle(
    state,
    state.pendingMayorSuccessionPlayerId ?? '',
    successorPlayerId
  );

  const winOutcome = checkWinCondition(nextState);
  if (winOutcome) {
    nextState.phase = 'GAME_OVER';
    nextState.interruptedPhaseDuringNight = false;
    nextState.previousPhaseBeforeMayorSuccession = undefined;
    recordWinOutcomeEvent(nextState, winOutcome, successionRound);
    return { nextState, winOutcome };
  }

  if (nextState.phase === 'DAY_DISCUSS' || nextState.phase === 'DAY_MAYOR_ELECTION') {
    emitMorningAnnouncements(nextState);
  } else if (nextState.phase === 'NIGHT' && !wasInterruptedNight) {
    resetDayLunarFlagsOnNightStart(nextState);
  }

  return {
    nextState,
    winOutcome,
    ...(wasInterruptedNight && nextState.phase === 'NIGHT' ? { resumedInterruptedNight: true } : {}),
  };
}

/**
 * Loại khẩn cấp một người chơi khỏi bàn (Pure Function dùng chung cho Server & LocalAdapter):
 * - Sử dụng cause 'EMERGENCY_ELIMINATE' để không kích hoạt thắng Tanner/Angel hay mất phép Già làng.
 * - Vẫn chạy cascade (cặp đôi, Thợ săn, Trưởng làng) và checkWinCondition theo quân số.
 */
export function executeEmergencyEliminate(
  state: GameState,
  targetPlayerId: PlayerId
): {
  nextState: GameState;
  winOutcome: WinOutcome | null;
} {
  const nextState: GameState = structuredClone(state);
  const target = nextState.players.find((p) => p.id === targetPlayerId);
  if (!target || !target.isAlive) {
    return { nextState, winOutcome: null };
  }

  const prevPhase = nextState.phase;
  const isAlreadySpecialPhase = prevPhase === 'HUNTER_SHOT' || prevPhase === 'MAYOR_SUCCESSION';
  let effectiveReturnPhase = isAlreadySpecialPhase
    ? (nextState.previousPhaseBeforeHunter ??
        nextState.previousPhaseBeforeMayorSuccession ??
        'DAY_DISCUSS')
    : prevPhase;
  const preserveMidNight =
    effectiveReturnPhase === 'NIGHT' &&
    (!isAlreadySpecialPhase || Boolean(nextState.interruptedPhaseDuringNight));
  const eventRound = nextState.roundNumber;

  let seanceClearedByElim = false;
  if (prevPhase === 'LUNAR_SEANCE' && nextState.lunarState?.seanceState) {
    const seance = nextState.lunarState.seanceState;
    if (targetPlayerId === seance.mediumPlayerId || targetPlayerId === seance.targetDeadPlayerId) {
      nextState.lunarState.seanceState = null;
      seanceClearedByElim = true;
      effectiveReturnPhase = 'DAY_DISCUSS';
    }
  }

  let lastEchoQueueEmptiedByElim = false;
  if (prevPhase === 'LAST_ECHO_MARK' && nextState.lunarState?.lastEchoState) {
    const lastEcho = nextState.lunarState.lastEchoState;
    if (
      targetPlayerId === lastEcho.activeExecutorId ||
      lastEcho.pendingQueuePlayerIds.includes(targetPlayerId)
    ) {
      lastEcho.pendingQueuePlayerIds = lastEcho.pendingQueuePlayerIds.filter(
        (id) => id !== targetPlayerId
      );
      lastEcho.activeExecutorId = lastEcho.pendingQueuePlayerIds[0] ?? null;
      if (lastEcho.pendingQueuePlayerIds.length === 0) {
        lastEchoQueueEmptiedByElim = true;
        effectiveReturnPhase = 'NIGHT';
      }
    }
  }

  nextState.historyLogs.push(`Quản trò đã trục xuất khẩn cấp [${target.name}] khỏi bàn.`);
  const elimEvt = appendMatchEvent(nextState, {
    roundNumber: eventRound,
    stage: 'DAY_VOTE',
    actionType: 'EMERGENCY_ELIMINATE',
    visibility: 'PUBLIC',
    actor: null,
    targets: [snapshotPlayer(target)],
    outcome: 'SUCCESS',
  });

  processDeathCascade(nextState, [
    { playerId: targetPlayerId, cause: 'EMERGENCY_ELIMINATE', parentEventId: elimEvt.id },
  ]);

  const hasAlivePlayers = nextState.players.some((p) => p.isAlive);
  if (nextState.pendingHunterShotPlayerId && hasAlivePlayers) {
    nextState.previousPhaseBeforeHunter = effectiveReturnPhase;
    if (preserveMidNight) {
      nextState.interruptedPhaseDuringNight = true;
    }
    if (nextState.pendingMayorSuccessionPlayerId) {
      nextState.previousPhaseBeforeMayorSuccession = effectiveReturnPhase;
    }
    nextState.phase = 'HUNTER_SHOT';
    return { nextState, winOutcome: null };
  }

  if (nextState.pendingMayorSuccessionPlayerId && hasAlivePlayers) {
    nextState.previousPhaseBeforeMayorSuccession = effectiveReturnPhase;
    if (preserveMidNight) {
      nextState.interruptedPhaseDuringNight = true;
    }
    nextState.phase = 'MAYOR_SUCCESSION';
    return { nextState, winOutcome: null };
  }

  const winOutcome = checkWinCondition(nextState);
  if (winOutcome) {
    nextState.phase = 'GAME_OVER';
    nextState.interruptedPhaseDuringNight = false;
    nextState.previousPhaseBeforeHunter = undefined;
    nextState.previousPhaseBeforeMayorSuccession = undefined;
    recordWinOutcomeEvent(nextState, winOutcome, eventRound);
    return { nextState, winOutcome };
  }

  if (seanceClearedByElim) {
    if (!nextState.dayState) {
      nextState.dayState = createInitialDayState();
    }
    nextState.phase = 'DAY_DISCUSS';
  } else if (lastEchoQueueEmptiedByElim) {
    nextState.roundNumber += 1;
    nextState.phase = 'NIGHT';
    resetDayLunarFlagsOnNightStart(nextState);
  }

  return { nextState, winOutcome: null };
}

/**
 * Tái đấu (Rematch) — Pure Function.
 */
export function createRematchGameState(
  state: GameState,
  assignedRoleIds: string[]
): GameState {
  const playersInput: PlayerSetupInput[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    seatIndex: p.seatIndex,
  }));

  return createInitialGameState(
    playersInput,
    assignedRoleIds,
    state.settings,
    state.generation + 1
  );
}
