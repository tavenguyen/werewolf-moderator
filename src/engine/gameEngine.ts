import { isBitingWolf, isMvpRole, ROLES_BY_ID } from './roles';
import { processDeathCascade } from './deathCascade';
import { getAliveNeighbors } from './seating';
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
  customDeck: {
    werewolf: 2,
    seer: 1,
    bodyguard: 1,
    villager: 2,
  },
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
    const def = ROLES_BY_ID[roleId];
    if (!def || !def.implementedInEngine) {
      throw new Error(`Vai trò [${roleId}] chưa được hỗ trợ trong Game Engine`);
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
    pendingMayorSuccessionPlayerId: null,
    historyLogs: ['Khởi tạo ván chơi mới thành công.'],
  };
}

/**
 * Đánh giá tiếng gầm của Gấu thuần hóa (Bear Tamer):
 * - Chỉ gầm nếu Bear Tamer còn sống và có ít nhất 1 Ma sói có khả năng cắn đêm ngồi cạnh.
 * - Nếu chính Bear Tamer bị biến thành Ma Sói (ví dụ bị nguyền), gấu ngửi thấy mùi sói và luôn gầm.
 * - Không gầm với Minion, Sorcerer hay Lycan.
 */
export function evaluateBearGrowl(state: GameState): boolean {
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
 * Bắt đầu pha ban ngày (Day Phase):
 * Nếu Ngày 1 và bật hasMayor -> chuyển sang DAY_MAYOR_ELECTION;
 * Ngược lại -> chuyển sang DAY_DISCUSS.
 */
export function startDayPhase(state: GameState): GameState {
  const nextState: GameState = structuredClone(state);
  nextState.dayState = createInitialDayState();
  nextState.bearGrowled = evaluateBearGrowl(nextState);

  if (nextState.roundNumber === 1 && nextState.settings.hasMayor) {
    nextState.phase = 'DAY_MAYOR_ELECTION';
    nextState.historyLogs.push('Bắt đầu Ngày 1: Toàn làng tiến hành bầu Trưởng làng!');
  } else {
    nextState.phase = 'DAY_DISCUSS';
    nextState.historyLogs.push(`Bắt đầu Ngày ${nextState.roundNumber}: Mở phiên thảo luận làng.`);
  }

  // Thông báo câm từ Người phù phép (Spellcaster) nếu người bị làm câm còn sống
  if (nextState.mutedPlayerId) {
    const mutedPlayer = nextState.players.find(
      (p) => p.id === nextState.mutedPlayerId && p.isAlive
    );
    if (mutedPlayer) {
      nextState.historyLogs.push(
        `[${mutedPlayer.name}] đã bị phù phép câm lặng và không được phát biểu trong hôm nay!`
      );
    } else {
      nextState.mutedPlayerId = null;
    }
  }

  if (nextState.bearGrowled) {
    nextState.historyLogs.push('Sáng sớm nay, tiếng gấu gầm dữ dội vang vọng khắp ngôi làng!');
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
  } else if (nextState.phase === 'DAY_DISCUSS' || nextState.phase === 'DAY_MAYOR_ELECTION') {
    nextState.bearGrowled = evaluateBearGrowl(nextState);
  } else {
    nextState.bearGrowled = evaluateBearGrowl(nextState);
    if (nextState.bearGrowled) {
      nextState.historyLogs.push('Sáng sớm nay, tiếng gấu gầm dữ dội vang vọng khắp ngôi làng!');
    }
    nextState.dayState = createInitialDayState();
    if (nextState.roundNumber === 1 && nextState.settings.hasMayor) {
      nextState.phase = 'DAY_MAYOR_ELECTION';
    } else {
      nextState.phase = 'DAY_DISCUSS';
    }

    if (nextState.mutedPlayerId) {
      const mutedPlayer = nextState.players.find(
        (p) => p.id === nextState.mutedPlayerId && p.isAlive
      );
      if (mutedPlayer) {
        nextState.historyLogs.push(
          `[${mutedPlayer.name}] đã bị phù phép câm lặng và không được phát biểu trong hôm nay!`
        );
      } else {
        nextState.mutedPlayerId = null;
      }
    }
  }

  return { nextState, nightOutput, winOutcome };
}

/**
 * Điều phối Pha Biểu Quyết Ban Ngày (Day Vote Resolution) — Pure Function:
 * Hỗ trợ 1 hoặc 2 mục tiêu (Troublemaker double vote),
 * xử lý Thằng ngốc / Hoàng tử lật bài thoát chết, Thiên sứ / Kẻ chán đời và Treo cổ đưa vào Death Cascade.
 */
export function executeDayVote(
  state: GameState,
  targetPlayerId: PlayerId | PlayerId[] | null
): {
  nextState: GameState;
  survivedByReveal: boolean;
  winOutcome: WinOutcome | null;
} {
  const nextState: GameState = structuredClone(state);
  nextState.phase = 'DAY_VOTE';

  const targets: PlayerId[] = (
    Array.isArray(targetPlayerId) ? targetPlayerId : [targetPlayerId]
  ).filter((id): id is PlayerId => Boolean(id));

  let survivedByReveal = false;

  // Trường hợp không có ai bị vote (bỏ phiếu trắng hoặc hòa)
  if (targets.length === 0) {
    if (state.roundNumber === 1) {
      for (const p of nextState.players) {
        if (p.isAlive && p.roleId === 'angel') {
          p.faction = 'VILLAGER';
        }
      }
    }
    nextState.historyLogs.push('Hòa phiếu hoặc bỏ phiếu trắng: Không ai bị treo cổ hôm nay.');
    nextState.doubleVoteDay = false;
    nextState.roundNumber += 1;
    nextState.phase = 'NIGHT';
    return { nextState, survivedByReveal: false, winOutcome: checkWinCondition(nextState) };
  }

  // Xử lý từng mục tiêu theo thứ tự
  for (const tId of targets) {
    const target = nextState.players.find((p) => p.id === tId);
    if (!target || !target.isAlive) continue;

    // 1. Thằng ngốc (Village Idiot) lật bài thoát chết (mất quyền vote)
    if (target.roleId === 'village_idiot' && target.voteWeight > 0) {
      target.voteWeight = 0;
      survivedByReveal = true;
      nextState.historyLogs.push(
        `Thằng ngốc (${target.name}) lật bài thoát chết nhưng bị tước vĩnh viễn quyền bỏ phiếu!`
      );
      continue;
    }

    // 1b. Hoàng tử (Prince) lật bài thoát chết (giữ nguyên quyền vote)
    if (target.roleId === 'prince' && !nextState.princeRevealed) {
      nextState.princeRevealed = true;
      survivedByReveal = true;
      nextState.historyLogs.push(
        `Hoàng tử (${target.name}) lật bài thoát chết và giữ nguyên quyền bỏ phiếu!`
      );
      continue;
    }

    // 2. Treo cổ đưa vào Death Cascade
    processDeathCascade(nextState, [{ playerId: target.id, cause: 'VILLAGE_VOTE' }]);

    // Kiểm tra kết quả thắng ngay sau mỗi mục tiêu:
    // - Ưu tiên 1: Angel thắng ngay ở Ngày 1
    // - Ưu tiên 2: Tanner thắng ngay ở mọi ngày
    const immediateWin = checkWinCondition(nextState);
    if (immediateWin) {
      nextState.phase = 'GAME_OVER';
      nextState.doubleVoteDay = false;
      return { nextState, survivedByReveal, winOutcome: immediateWin };
    }

    // Nếu có Thợ săn vừa bị treo cổ (hoặc chết chùm), mở lượt bắn
    if (nextState.pendingHunterShotPlayerId) {
      nextState.phase = 'HUNTER_SHOT';
      nextState.previousPhaseBeforeHunter = 'NIGHT';
      nextState.doubleVoteDay = false;
      return { nextState, survivedByReveal, winOutcome: null };
    }

    // Nếu Trưởng làng bị treo cổ, mở truyền ngôi
    if (nextState.pendingMayorSuccessionPlayerId) {
      nextState.phase = 'MAYOR_SUCCESSION';
      nextState.previousPhaseBeforeMayorSuccession = 'NIGHT';
      nextState.doubleVoteDay = false;
      return { nextState, survivedByReveal, winOutcome: null };
    }
  }

  // Sau khi xử lý xong toàn bộ mục tiêu trong ngày
  nextState.doubleVoteDay = false;

  // Nếu Thiên sứ (Angel) sống sót qua Ngày 1, chuyển phe thành Dân làng thường
  if (state.roundNumber === 1) {
    for (const p of nextState.players) {
      if (p.isAlive && p.roleId === 'angel') {
        p.faction = 'VILLAGER';
        nextState.historyLogs.push(
          `Thiên sứ (${p.name}) đã sống sót qua Ngày 1 và hòa mình thành Dân làng thường.`
        );
      }
    }
  }

  const finalWin = checkWinCondition(nextState);
  if (finalWin) {
    nextState.phase = 'GAME_OVER';
  } else if (nextState.phase === 'DAY_DISCUSS' || nextState.phase === 'DAY_MAYOR_ELECTION') {
    nextState.bearGrowled = evaluateBearGrowl(nextState);
  } else {
    nextState.roundNumber += 1;
    nextState.phase = 'NIGHT';
  }

  return { nextState, survivedByReveal, winOutcome: finalWin };
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
  } else if (nextState.phase === 'DAY_DISCUSS' || nextState.phase === 'DAY_MAYOR_ELECTION') {
    nextState.bearGrowled = evaluateBearGrowl(nextState);
  } else {
    nextState.phase = nextState.previousPhaseBeforeHunter ?? 'DAY_DISCUSS';
    if (nextState.phase === 'NIGHT') {
      nextState.roundNumber += 1;
    } else if (nextState.phase === 'DAY_DISCUSS' || nextState.phase === 'DAY_MAYOR_ELECTION') {
      nextState.bearGrowled = evaluateBearGrowl(nextState);
      if (nextState.bearGrowled) {
        nextState.historyLogs.push('Sáng sớm nay, tiếng gấu gầm dữ dội vang vọng khắp ngôi làng!');
      }
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
  } else if (nextState.phase === 'DAY_DISCUSS' || nextState.phase === 'DAY_MAYOR_ELECTION') {
    nextState.bearGrowled = evaluateBearGrowl(nextState);
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
