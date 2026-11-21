import { isMvpRole, ROLES_BY_ID } from './roles';
import { processDeathCascade } from './deathCascade';
import { resolveNight, type NightResolutionOutput } from './nightResolution';
import { createInitialDayState, passMayorTitle } from './voting';
import type {
  GamePhase,
  GameState,
  NightActions,
  PlayerId,
  PlayerState,
  RoomSettings,
  WinOutcome,
} from './types';
import { checkWinCondition } from './winConditions';

export interface PlayerSetupInput {
  id: PlayerId;
  name: string;
  seatIndex: number;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  revealOnDeath: false,
  allowWolfSkip: false,
  allowWolfFriendlyFire: false,
  witchHealMode: 'AOE',
  witchKnowsVictim: true,
  witchWasteHealOnEmpty: false,
  allowWitchSelfHeal: true,
  tieVoteMode: 'ESCAPE',
  ghostMode: false,
  hasMayor: false,
};

/**
 * Khởi tạo GameState ban đầu từ danh sách người chơi và role đã gán.
 * Đảm bảo tính hợp lệ: 6–16 người chơi, vai trò thuộc MVP 16 roles.
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

  const players: PlayerState[] = playersInput.map((input, idx) => {
    const roleId = assignedRoleIds[idx] ?? 'villager';
    if (!isMvpRole(roleId)) {
      throw new Error(`Vai trò [${roleId}] chưa được hỗ trợ trong phiên bản Engine MVP`);
    }

    const def = ROLES_BY_ID[roleId];

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
    mayorId: null,
    pendingHunterShotPlayerId: null,
    pendingMayorSuccessionPlayerId: null,
    historyLogs: ['Khởi tạo ván chơi mới thành công.'],
  };
}

/**
 * Bắt đầu pha ban ngày (Day Phase):
 * Nếu Ngày 1 và bật hasMayor -> chuyển sang DAY_MAYOR_ELECTION;
 * Ngược lại -> chuyển sang DAY_DISCUSS.
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

  return nextState;
}

/**
 * Điều phối Pha Đêm (Pure Function):
 * Chạy phân giải đêm, chốt người chết và kiểm tra thắng thua.
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

  // Nếu có Thợ săn vừa chết trong đêm -> Mở lượt nổ súng vào sáng hôm sau trước khi chốt thắng
  if (nextState.pendingHunterShotPlayerId) {
    nextState.phase = 'HUNTER_SHOT';
    nextState.previousPhaseBeforeHunter =
      nextState.roundNumber === 1 && nextState.settings.hasMayor
        ? 'DAY_MAYOR_ELECTION'
        : 'DAY_DISCUSS';
    return { nextState, nightOutput, winOutcome: null };
  }

  // Nếu có Trưởng làng chết trong đêm
  if (nextState.pendingMayorSuccessionPlayerId) {
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
  } else {
    nextState.dayState = createInitialDayState();
    if (nextState.roundNumber === 1 && nextState.settings.hasMayor) {
      nextState.phase = 'DAY_MAYOR_ELECTION';
    } else {
      nextState.phase = 'DAY_DISCUSS';
    }
  }

  return { nextState, nightOutput, winOutcome };
}

/**
 * Điều phối Pha Biểu Quyết Ban Ngày (Day Vote Resolution) — Pure Function:
 * Xử lý Thằng ngốc lật bài thoát chết, Kẻ chán đời và Treo cổ đưa vào Death Cascade.
 */
export function executeDayVote(
  state: GameState,
  targetPlayerId: PlayerId | null
): {
  nextState: GameState;
  survivedByReveal: boolean;
  winOutcome: WinOutcome | null;
} {
  const nextState: GameState = structuredClone(state);
  nextState.phase = 'DAY_VOTE';

  if (!targetPlayerId) {
    nextState.historyLogs.push('Hòa phiếu hoặc bỏ phiếu trắng: Không ai bị treo cổ hôm nay.');
    nextState.roundNumber += 1;
    nextState.phase = 'NIGHT';
    return { nextState, survivedByReveal: false, winOutcome: checkWinCondition(nextState) };
  }

  const target = nextState.players.find((p) => p.id === targetPlayerId);
  if (!target || !target.isAlive) {
    return { nextState, survivedByReveal: false, winOutcome: checkWinCondition(nextState) };
  }

  // 1. Thằng ngốc (Village Idiot) lật bài thoát chết (mất quyền vote)
  if (target.roleId === 'village_idiot' && target.voteWeight > 0) {
    target.voteWeight = 0;
    nextState.historyLogs.push(
      `Thằng ngốc (${target.name}) lật bài thoát chết nhưng bị tước vĩnh viễn quyền bỏ phiếu!`
    );
    nextState.roundNumber += 1;
    nextState.phase = 'NIGHT';
    return { nextState, survivedByReveal: true, winOutcome: checkWinCondition(nextState) };
  }

  // 2. Treo cổ đưa vào Death Cascade
  processDeathCascade(nextState, [{ playerId: target.id, cause: 'VILLAGE_VOTE' }]);

  // Nếu có Thợ săn chết (do bị treo cổ hoặc chết chùm), mở lượt bắn trước khi xét thắng
  if (nextState.pendingHunterShotPlayerId) {
    nextState.phase = 'HUNTER_SHOT';
    nextState.previousPhaseBeforeHunter = 'NIGHT';
    return { nextState, survivedByReveal: false, winOutcome: null };
  }

  // Nếu Trưởng làng bị treo cổ, mở truyền ngôi
  if (nextState.pendingMayorSuccessionPlayerId) {
    nextState.phase = 'MAYOR_SUCCESSION';
    nextState.previousPhaseBeforeMayorSuccession = 'NIGHT';
    return { nextState, survivedByReveal: false, winOutcome: null };
  }

  const winOutcome = checkWinCondition(nextState);
  if (winOutcome) {
    nextState.phase = 'GAME_OVER';
  } else {
    nextState.roundNumber += 1;
    nextState.phase = 'NIGHT';
  }

  return { nextState, survivedByReveal: false, winOutcome };
}

/**
 * Điều phối phát súng của Thợ săn (Hunter Shot) — Pure Function.
 * Thời gian chọn 15s; timeout/disconnect là bắn trượt.
 */
export function executeHunterShot(
  state: GameState,
  targetPlayerId: PlayerId | null
): {
  nextState: GameState;
  winOutcome: WinOutcome | null;
} {
  const nextState: GameState = structuredClone(state);
  nextState.pendingHunterShotPlayerId = null;

  if (targetPlayerId) {
    const target = nextState.players.find((p) => p.id === targetPlayerId);
    if (target && target.isAlive) {
      nextState.historyLogs.push(`Thợ săn đã nổ phát súng sau cùng tiêu diệt [${target.name}]!`);
      processDeathCascade(nextState, [{ playerId: target.id, cause: 'HUNTER_SHOT' }]);
    }
  } else {
    nextState.historyLogs.push('Thợ săn không chọn ai hoặc đã bắn trượt.');
  }

  // Nếu phát súng trúng Trưởng làng, mở truyền ngôi
  if (nextState.pendingMayorSuccessionPlayerId) {
    nextState.phase = 'MAYOR_SUCCESSION';
    nextState.previousPhaseBeforeMayorSuccession =
      nextState.previousPhaseBeforeHunter ?? 'DAY_DISCUSS';
    return { nextState, winOutcome: null };
  }

  const winOutcome = checkWinCondition(nextState);
  if (winOutcome) {
    nextState.phase = 'GAME_OVER';
  } else {
    nextState.phase = nextState.previousPhaseBeforeHunter ?? 'DAY_DISCUSS';
    if (nextState.phase === 'NIGHT') {
      nextState.roundNumber += 1;
    } else if (nextState.phase === 'DAY_DISCUSS' || nextState.phase === 'DAY_MAYOR_ELECTION') {
      if (!nextState.dayState) {
        nextState.dayState = createInitialDayState();
      }
    }
  }

  return { nextState, winOutcome };
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
} {
  const nextState = passMayorTitle(
    state,
    state.pendingMayorSuccessionPlayerId ?? '',
    successorPlayerId
  );

  const winOutcome = checkWinCondition(nextState);
  if (winOutcome) {
    nextState.phase = 'GAME_OVER';
  }

  return { nextState, winOutcome };
}

/**
 * Tái đấu (Rematch) — Pure Function:
 * Tạo GameState mới sạch sẽ từ danh sách người chơi và settings hiện có, tăng generation.
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
