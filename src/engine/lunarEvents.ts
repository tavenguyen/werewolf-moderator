import { appendMatchEvent, snapshotPlayer } from './matchLog';
import { ROLES_BY_ID } from './roles';
import { getAliveNeighbors } from './seating';
import type {
  GameState,
  LunarEventCategory,
  LunarEventId,
  LunarEventState,
  PlayerId,
  PlayerState,
  SeanceQuestionId,
} from './types';
import { createInitialDayState } from './voting';

export const SEANCE_QUESTIONS: Record<SeanceQuestionId, string> = {
  Q1_SUSPECT_ALIVE: 'Người làm bạn nghi ngờ nhất khi còn sống hiện vẫn đang sống đúng không?',
  Q2_WOLVES_CAUSE: 'Bạn có tin rằng nguyên nhân cái chết của mình đến từ bầy Sói không?',
  Q3_NEIGHBOR_WOLF:
    'Trong hai người ngồi cạnh bạn lúc còn sống, bạn có nghi ngờ ít nhất một người thuộc phe Sói không?',
  Q4_PROTECT_IMPORTANT:
    'Cái chết của bạn đêm qua có liên quan đến việc bảo vệ một người quan trọng trong làng không?',
};

interface LunarEventDefinition {
  id: LunarEventId;
  category: LunarEventCategory;
  titleVi: string;
  summaryVi: string;
}

const LUNAR_EVENT_CATALOG: readonly LunarEventDefinition[] = [
  {
    id: 'dawns_guarantee',
    category: 'FULL_MOON',
    titleVi: 'Ánh Bình Minh Bảo Chứng',
    summaryVi: 'Ánh sáng bình minh chỉ điểm một cặp đôi trong làng có ít nhất một Dân làng thật sự.',
  },
  {
    id: 'midnight_echo',
    category: 'FULL_MOON',
    titleVi: 'Tiếng Vọng Nửa Đêm',
    summaryVi: 'Dư âm phép thuật đêm qua vang vọng khắp ngôi làng.',
  },
  {
    id: 'neighbors_fury',
    category: 'FULL_MOON',
    titleVi: 'Cơn Thịnh Nộ Của Hàng Xóm',
    summaryVi: 'Những người ngồi cạnh nạn nhân đêm qua phẫn nộ, mang gấp đôi trọng lượng phiếu hôm nay.',
  },
  {
    id: 'flash_trial',
    category: 'FULL_MOON',
    titleVi: 'Phiên Xử Chớp Nhoáng',
    summaryVi: 'Phiên thảo luận hôm nay bị rút ngắn gấp rút trước khi màn đêm buông xuống.',
  },
  {
    id: 'open_ballot',
    category: 'CRESCENT',
    titleVi: 'Bỏ Phiếu Công Khai',
    summaryVi: 'Mọi lá phiếu treo cổ hôm nay sẽ được công khai danh tính người bỏ phiếu.',
  },
  {
    id: 'blood_oath',
    category: 'CRESCENT',
    titleVi: 'Lời Thề Máu',
    summaryVi: 'Nếu hôm nay không ai bị treo cổ, đêm nay bầy Sói sẽ được cắn 2 nạn nhân.',
  },
  {
    id: 'blood_moon',
    category: 'CRESCENT',
    titleVi: 'Trăng Máu',
    summaryVi: 'Đêm nay bầy Sói được cắn 2 nạn nhân và toàn bộ nạn nhân đêm nay sẽ bị lật vai trò khi bình minh.',
  },
  {
    id: 'silver_shield',
    category: 'CRESCENT',
    titleVi: 'Khiên Bạc',
    summaryVi: 'Đêm nay Bảo vệ được phép bảo vệ cùng một người hai đêm liên tiếp.',
  },
  {
    id: 'misty_moon',
    category: 'CRESCENT',
    titleVi: 'Trăng Sương Mù',
    summaryVi: 'Đêm nay mọi phép soi đều bị nhiễu thành soi cụm 3 người; Con cáo không bị mất phép.',
  },
  {
    id: 'mirror_moon',
    category: 'CRESCENT',
    titleVi: 'Trăng Soi Gương',
    summaryVi: 'Nếu Tiên tri soi trúng Ma Sói đêm nay, ánh trăng sẽ phản chiếu cặp mắt đỏ vào sáng mai.',
  },
  {
    id: 'last_echo',
    category: 'NEW_MOON',
    titleVi: 'Dư Âm Cuối Cùng',
    summaryVi: 'Từ nay về sau, mỗi người bị treo cổ sẽ để lại 1 phiếu phạt cho ngày hôm sau.',
  },
  {
    id: 'seance',
    category: 'SPIRITISM',
    titleVi: 'Cầu Hồn',
    summaryVi: 'Linh hồn người mới khuất được triệu hồi để trả lời một câu hỏi Có/Không từ làng.',
  },
];

function createSeededRng(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isTrueVillagerForDawnsGuarantee(player: PlayerState): boolean {
  if (player.faction !== 'VILLAGER') return false;
  if (player.roleId !== 'drunk') return true;
  if (!player.drunkRealRoleId) return false;
  return ROLES_BY_ID[player.drunkRealRoleId]?.faction === 'VILLAGER';
}

function getEligibleNeighborsFuryIds(state: GameState): PlayerId[] {
  const nonLynchRoundDeaths = state.deaths.filter(
    (d) =>
      d.roundNumber === state.roundNumber &&
      d.cause !== 'VILLAGE_VOTE' &&
      d.cause !== 'EMERGENCY_ELIMINATE'
  );
  if (nonLynchRoundDeaths.length === 0) return [];

  const furySet = new Set<PlayerId>();
  for (const death of nonLynchRoundDeaths) {
    const tempPlayers = state.players.map((p) =>
      p.id === death.playerId ? { ...p, isAlive: true } : p
    );
    const neighbors = getAliveNeighbors(tempPlayers, death.playerId);
    if (!neighbors) continue;
    for (const candidate of [neighbors.left, neighbors.right]) {
      if (candidate.id === death.playerId) continue;
      const realPlayer = state.players.find((p) => p.id === candidate.id && p.isAlive);
      if (!realPlayer) continue;
      if (realPlayer.roleId === 'village_idiot' && realPlayer.voteWeight === 0) continue;
      furySet.add(realPlayer.id);
    }
  }
  return Array.from(furySet);
}

function isEventEligible(
  eventId: LunarEventId,
  state: GameState,
  deviceMode: 'MULTI_DEVICE' | 'SINGLE_DEVICE'
): boolean {
  const lunarState = state.lunarState;
  const living = state.players.filter((p) => p.isAlive);
  const hasAliveRole = (roleId: string) => living.some((p) => p.roleId === roleId);

  switch (eventId) {
    case 'dawns_guarantee':
      return living.length >= 2 && living.some((p) => isTrueVillagerForDawnsGuarantee(p));
    case 'midnight_echo':
      return state.roundNumber >= 2;
    case 'neighbors_fury': {
      const hasNonLynchDeath = state.deaths.some(
        (d) =>
          d.roundNumber === state.roundNumber &&
          d.cause !== 'VILLAGE_VOTE' &&
          d.cause !== 'EMERGENCY_ELIMINATE'
      );
      return hasNonLynchDeath && getEligibleNeighborsFuryIds(state).length > 0;
    }
    case 'flash_trial':
      return state.roundNumber >= 2;
    case 'open_ballot':
      return deviceMode === 'MULTI_DEVICE' && !state.settings.revealVoterIdentities;
    case 'blood_oath':
      return living.length >= 7;
    case 'blood_moon':
      return living.length >= 7 && !state.wolfCubDoubleKillNextNight;
    case 'silver_shield':
      return !state.villagePowerStripped && hasAliveRole('bodyguard');
    case 'misty_moon':
      return (
        hasAliveRole('sorcerer') ||
        (!state.villagePowerStripped &&
          (hasAliveRole('seer') ||
            hasAliveRole('apprentice_seer') ||
            (hasAliveRole('fox') && !state.foxLostPower)))
      );
    case 'mirror_moon':
      return !state.villagePowerStripped && (hasAliveRole('seer') || hasAliveRole('apprentice_seer'));
    case 'last_echo':
      return !lunarState?.lastEchoPermanentActive;
    case 'seance':
      return (
        state.settings.lunarAllowSpiritism !== false &&
        state.deaths.length >= 1 &&
        living.length >= 1
      );
    default:
      return false;
  }
}

export function createInitialLunarState(): LunarEventState {
  return {
    usedEventIds: [],
    currentDayEvent: null,
    lastNightActivatedSkillCount: 0,
    neighborsFuryPlayerIds: [],
    flashTrialActiveToday: false,
    openBallotActiveToday: false,
    bloodOathPendingToday: false,
    wolfDoubleKillTonight: false,
    bloodMoonRevealTonight: false,
    bloodMoonRevealedPlayerIds: [],
    silverShieldActiveTonight: false,
    mistyMoonActiveTonight: false,
    mirrorMoonActiveTonight: false,
    mirrorMoonReflectedPending: false,
    lastEchoPermanentActive: false,
    lastEchoState: null,
    penaltyVotesNextDay: {},
    todayPenaltyVotes: {},
    seanceState: null,
  };
}

export function shouldDrawLunarEvent(state: GameState): boolean {
  if (!state.settings.lunarEventsEnabled) return false;
  if (state.roundNumber < 2) return false;
  const cadence = state.settings.lunarEventCadence ?? 'ALTERNATE_DAYS';
  return cadence === 'EVERY_DAY' || state.roundNumber % 2 === 0;
}

export function resetDayLunarFlagsOnNightStart(state: GameState): void {
  if (!state.lunarState) return;
  state.lunarState.currentDayEvent = null;
  state.lunarState.neighborsFuryPlayerIds = [];
  state.lunarState.flashTrialActiveToday = false;
  state.lunarState.openBallotActiveToday = false;
  state.lunarState.bloodOathPendingToday = false;
  state.lunarState.todayPenaltyVotes = {};
  state.lunarState.seanceState = null;
  state.lunarState.lastEchoState = null;
}

export function drawLunarEventIfNeeded(
  state: GameState,
  randomSeed: number = 42,
  deviceMode: 'MULTI_DEVICE' | 'SINGLE_DEVICE' = 'MULTI_DEVICE'
): GameState {
  const nextState: GameState = structuredClone(state);
  if (!nextState.lunarState) {
    nextState.lunarState = createInitialLunarState();
  }

  // Luôn chuyển phiếu phạt từ ngày hôm trước sang hôm nay khi bắt đầu Ngày >= 2
  if (nextState.roundNumber >= 2) {
    nextState.lunarState.todayPenaltyVotes = { ...nextState.lunarState.penaltyVotesNextDay };
    nextState.lunarState.penaltyVotesNextDay = {};
  }

  // Phát thông báo phản chiếu của Trăng Soi Gương (Mirror Moon) nếu có từ đêm qua
  if (nextState.lunarState.mirrorMoonReflectedPending) {
    const mirrorText = 'Ánh trăng đêm qua đã phản chiếu một cặp mắt đỏ!';
    nextState.historyLogs.push(mirrorText);
    appendMatchEvent(nextState, {
      roundNumber: nextState.roundNumber,
      stage: 'DAY_ANNOUNCEMENT',
      actionType: 'LUNAR_MIRROR_REFLECTION',
      visibility: 'PUBLIC',
      actor: null,
      targets: [],
      outcome: 'SUCCESS',
      metadata: {
        lunar: {
          eventId: 'mirror_moon',
          category: 'CRESCENT',
          titleVi: 'Trăng Soi Gương',
          summaryVi: mirrorText,
          detailLineVi: mirrorText,
        },
      },
    });
    nextState.lunarState.mirrorMoonReflectedPending = false;
  }

  if (!shouldDrawLunarEvent(nextState)) {
    return nextState;
  }

  let usedSet = new Set(nextState.lunarState.usedEventIds);
  let pool = LUNAR_EVENT_CATALOG.filter(
    (ev) => !usedSet.has(ev.id) && isEventEligible(ev.id, nextState, deviceMode)
  );

  if (pool.length === 0) {
    nextState.lunarState.usedEventIds = nextState.lunarState.lastEchoPermanentActive
      ? ['last_echo']
      : [];
    usedSet = new Set(nextState.lunarState.usedEventIds);
    pool = LUNAR_EVENT_CATALOG.filter(
      (ev) => !usedSet.has(ev.id) && isEventEligible(ev.id, nextState, deviceMode)
    );
    if (pool.length === 0) {
      return nextState;
    }
  }

  const rng = createSeededRng(randomSeed + nextState.roundNumber * 101);
  const chosen = pool[Math.floor(rng() * pool.length) % pool.length]!;
  nextState.lunarState.usedEventIds.push(chosen.id);

  const living = nextState.players.filter((p) => p.isAlive);
  let detailLineVi = chosen.summaryVi;

  switch (chosen.id) {
    case 'dawns_guarantee': {
      const guaranteedPool = living.filter((p) => isTrueVillagerForDawnsGuarantee(p));
      const guaranteed = guaranteedPool[Math.floor(rng() * guaranteedPool.length) % guaranteedPool.length]!;
      const others = living.filter((p) => p.id !== guaranteed.id);
      const other = others[Math.floor(rng() * others.length) % others.length]!;
      const pair = rng() < 0.5 ? [guaranteed, other] : [other, guaranteed];
      detailLineVi = `Ít nhất 1 trong 2 người là Dân làng thật sự: [${pair[0].name}] hoặc [${pair[1].name}].`;
      break;
    }
    case 'midnight_echo': {
      const count = nextState.lunarState.lastNightActivatedSkillCount;
      detailLineVi = `Đêm qua có ${count} kỹ năng đặc biệt đã được kích hoạt.`;
      break;
    }
    case 'neighbors_fury': {
      const furyIds = getEligibleNeighborsFuryIds(nextState);
      nextState.lunarState.neighborsFuryPlayerIds = furyIds;
      const names = furyIds
        .map((id) => nextState.players.find((p) => p.id === id)?.name ?? id)
        .join(', ');
      detailLineVi = `Hàng xóm phẫn nộ (x2 phiếu hôm nay): ${names}.`;
      break;
    }
    case 'flash_trial': {
      nextState.lunarState.flashTrialActiveToday = true;
      break;
    }
    case 'open_ballot': {
      nextState.lunarState.openBallotActiveToday = true;
      break;
    }
    case 'blood_oath': {
      nextState.lunarState.bloodOathPendingToday = true;
      break;
    }
    case 'blood_moon': {
      nextState.lunarState.wolfDoubleKillTonight = true;
      nextState.lunarState.bloodMoonRevealTonight = true;
      break;
    }
    case 'silver_shield': {
      nextState.lunarState.silverShieldActiveTonight = true;
      break;
    }
    case 'misty_moon': {
      nextState.lunarState.mistyMoonActiveTonight = true;
      break;
    }
    case 'mirror_moon': {
      nextState.lunarState.mirrorMoonActiveTonight = true;
      break;
    }
    case 'last_echo': {
      nextState.lunarState.lastEchoPermanentActive = true;
      break;
    }
    case 'seance': {
      const aliveMayor = nextState.mayorId
        ? living.find((p) => p.id === nextState.mayorId)
        : undefined;
      const medium = aliveMayor ?? living[Math.floor(rng() * living.length) % living.length]!;
      const deadTargetId = nextState.deaths[nextState.deaths.length - 1]!.playerId;
      const deadTarget = nextState.players.find((p) => p.id === deadTargetId);
      nextState.lunarState.seanceState = {
        stage: 'PICK_QUESTION',
        mediumPlayerId: medium.id,
        targetDeadPlayerId: deadTargetId,
        selectedQuestionId: null,
        selectedQuestionText: null,
        answer: null,
      };
      nextState.phase = 'LUNAR_SEANCE';
      detailLineVi = `[${medium.name}] triệu hồi linh hồn [${deadTarget?.name ?? deadTargetId}] để hỏi 1 câu Có/Không.`;
      break;
    }
  }

  nextState.lunarState.currentDayEvent = {
    eventId: chosen.id,
    category: chosen.category,
    titleVi: chosen.titleVi,
    summaryVi: chosen.summaryVi,
    detailLineVi,
    roundDrawn: nextState.roundNumber,
  };

  nextState.historyLogs.push(`Sự kiện Tuần Trăng [${chosen.titleVi}]: ${detailLineVi}`);
  appendMatchEvent(nextState, {
    roundNumber: nextState.roundNumber,
    stage: 'DAY_ANNOUNCEMENT',
    actionType: 'LUNAR_EVENT_DRAWN',
    visibility: 'PUBLIC',
    actor: null,
    targets: [],
    outcome: 'SUCCESS',
    metadata: {
      lunar: {
        eventId: chosen.id,
        category: chosen.category,
        titleVi: chosen.titleVi,
        summaryVi: chosen.summaryVi,
        detailLineVi,
      },
    },
  });

  return nextState;
}

export function applySeancePickQuestion(
  state: GameState,
  actorId: PlayerId,
  questionId: SeanceQuestionId
): GameState {
  const nextState: GameState = structuredClone(state);
  const seance = nextState.lunarState?.seanceState;
  if (
    nextState.phase !== 'LUNAR_SEANCE' ||
    !seance ||
    seance.stage !== 'PICK_QUESTION' ||
    seance.mediumPlayerId !== actorId ||
    !Object.prototype.hasOwnProperty.call(SEANCE_QUESTIONS, questionId)
  ) {
    return nextState;
  }

  seance.selectedQuestionId = questionId;
  seance.selectedQuestionText = SEANCE_QUESTIONS[questionId];
  seance.stage = 'WAIT_ANSWER';
  return nextState;
}

export function applySeanceAnswer(
  state: GameState,
  actorId: PlayerId,
  answer: 'YES' | 'NO'
): GameState {
  const nextState: GameState = structuredClone(state);
  const seance = nextState.lunarState?.seanceState;
  if (
    nextState.phase !== 'LUNAR_SEANCE' ||
    !seance ||
    seance.stage !== 'WAIT_ANSWER' ||
    seance.targetDeadPlayerId !== actorId ||
    (answer !== 'YES' && answer !== 'NO')
  ) {
    return nextState;
  }

  seance.answer = answer;
  seance.stage = 'RESOLVED';

  const deadPlayer = nextState.players.find((p) => p.id === seance.targetDeadPlayerId);
  const mediumPlayer = nextState.players.find((p) => p.id === seance.mediumPlayerId);
  const questionText = seance.selectedQuestionText ?? '';
  const answerLabel = answer === 'YES' ? 'CÓ' : 'KHÔNG';

  nextState.historyLogs.push(
    `Cầu Hồn: [${deadPlayer?.name ?? seance.targetDeadPlayerId}] trả lời "${answerLabel}" cho câu hỏi "${questionText}".`
  );
  appendMatchEvent(nextState, {
    roundNumber: nextState.roundNumber,
    stage: 'DAY_ANNOUNCEMENT',
    actionType: 'LUNAR_SEANCE_RESULT',
    visibility: 'PUBLIC',
    actor: deadPlayer ? snapshotPlayer(deadPlayer) : null,
    targets: mediumPlayer ? [snapshotPlayer(mediumPlayer)] : [],
    outcome: 'SUCCESS',
    metadata: {
      lunar: {
        eventId: 'seance',
        category: 'SPIRITISM',
        titleVi: 'Cầu Hồn',
        questionText,
        answer,
      },
    },
  });

  if (!nextState.dayState) {
    nextState.dayState = createInitialDayState();
  }
  nextState.phase = 'DAY_DISCUSS';
  return nextState;
}

export function resolveSeanceTimeout(state: GameState): GameState {
  const nextState: GameState = structuredClone(state);
  const seance = nextState.lunarState?.seanceState;
  if (nextState.phase !== 'LUNAR_SEANCE' || !seance || seance.stage === 'RESOLVED') {
    return nextState;
  }

  seance.answer = null;
  seance.stage = 'RESOLVED';

  const deadPlayer = nextState.players.find((p) => p.id === seance.targetDeadPlayerId);
  const mediumPlayer = nextState.players.find((p) => p.id === seance.mediumPlayerId);

  nextState.historyLogs.push('Cầu Hồn hết thời gian, linh hồn đã tan biến.');
  appendMatchEvent(nextState, {
    roundNumber: nextState.roundNumber,
    stage: 'DAY_ANNOUNCEMENT',
    actionType: 'LUNAR_SEANCE_RESULT',
    visibility: 'PUBLIC',
    actor: deadPlayer ? snapshotPlayer(deadPlayer) : null,
    targets: mediumPlayer ? [snapshotPlayer(mediumPlayer)] : [],
    outcome: 'NO_EFFECT',
    metadata: {
      lunar: {
        eventId: 'seance',
        category: 'SPIRITISM',
        titleVi: 'Cầu Hồn',
        questionText: seance.selectedQuestionText ?? undefined,
        answer: null,
      },
      note: 'Hết thời gian Cầu Hồn',
    },
  });

  if (!nextState.dayState) {
    nextState.dayState = createInitialDayState();
  }
  nextState.phase = 'DAY_DISCUSS';
  return nextState;
}

export function applyLastEchoChoice(
  state: GameState,
  executorId: PlayerId,
  targetPlayerId: PlayerId | null
): GameState {
  const nextState: GameState = structuredClone(state);
  const lastEcho = nextState.lunarState?.lastEchoState;
  if (
    nextState.phase !== 'LAST_ECHO_MARK' ||
    !nextState.lunarState ||
    !lastEcho ||
    lastEcho.activeExecutorId !== executorId
  ) {
    return nextState;
  }

  const executor = nextState.players.find((p) => p.id === executorId);
  const target = targetPlayerId
    ? nextState.players.find((p) => p.id === targetPlayerId && p.isAlive)
    : undefined;

  if (target) {
    nextState.lunarState.penaltyVotesNextDay[target.id] =
      (nextState.lunarState.penaltyVotesNextDay[target.id] ?? 0) + 1;
    nextState.historyLogs.push(
      `Dư Âm Cuối Cùng: [${executor?.name ?? executorId}] để lại 1 phiếu phạt cho [${target.name}] vào ngày mai.`
    );
    appendMatchEvent(nextState, {
      roundNumber: nextState.roundNumber,
      stage: 'DAY_VOTE',
      actionType: 'LUNAR_LAST_ECHO',
      visibility: 'PUBLIC',
      actor: executor ? snapshotPlayer(executor) : null,
      targets: [snapshotPlayer(target)],
      outcome: 'SUCCESS',
      metadata: {
        lunar: {
          eventId: 'last_echo',
          category: 'NEW_MOON',
          titleVi: 'Dư Âm Cuối Cùng',
        },
      },
    });
  }

  lastEcho.pendingQueuePlayerIds = lastEcho.pendingQueuePlayerIds.filter((id) => id !== executorId);
  lastEcho.activeExecutorId = lastEcho.pendingQueuePlayerIds[0] ?? null;

  if (lastEcho.pendingQueuePlayerIds.length === 0) {
    const hasAlivePlayers = nextState.players.some((p) => p.isAlive);
    if (nextState.pendingHunterShotPlayerId && hasAlivePlayers) {
      nextState.phase = 'HUNTER_SHOT';
      nextState.previousPhaseBeforeHunter = 'NIGHT';
    } else if (nextState.pendingMayorSuccessionPlayerId && hasAlivePlayers) {
      nextState.phase = 'MAYOR_SUCCESSION';
      nextState.previousPhaseBeforeMayorSuccession = 'NIGHT';
    } else {
      nextState.roundNumber += 1;
      nextState.phase = 'NIGHT';
      resetDayLunarFlagsOnNightStart(nextState);
    }
  }

  return nextState;
}

export function resolveLastEchoTimeout(state: GameState): GameState {
  const activeExecutorId = state.lunarState?.lastEchoState?.activeExecutorId;
  if (state.phase !== 'LAST_ECHO_MARK' || !activeExecutorId) {
    return structuredClone(state);
  }
  return applyLastEchoChoice(state, activeExecutorId, null);
}
