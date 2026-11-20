import { ROLES_BY_ID } from '../screens/home/roles';
import { processDeathCascade } from './deathCascade';
import { resolveNight, type NightResolutionOutput } from './nightResolution';
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
};

/**
 * Khởi tạo GameState ban đầu từ danh sách người chơi và role đã gán.
 * Tự động trích xuất lá bài dự phòng cho Drunk nếu có.
 */
export function createInitialGameState(
  playersInput: PlayerSetupInput[],
  assignedRoleIds: string[],
  settings: Partial<RoomSettings> = {},
  drunkReserveRoleId?: string
): GameState {
  const mergedSettings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS, ...settings };

  const players: PlayerState[] = playersInput.map((input, idx) => {
    const roleId = assignedRoleIds[idx] ?? 'villager';
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
      drunkRealRoleId: roleId === 'drunk' ? drunkReserveRoleId ?? 'villager' : undefined,
    };
  });

  return {
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
    pendingHunterShotPlayerId: null,
    historyLogs: ['Khởi tạo ván chơi mới thành công.'],
  };
}

/**
 * Điều phối Pha Đêm: Chạy phân giải đêm, chốt người chết và kiểm tra thắng thua.
 */
export function executeNightPhase(
  state: GameState,
  actions: NightActions
): {
  nightOutput: NightResolutionOutput;
  winOutcome: WinOutcome | null;
} {
  state.phase = 'NIGHT';
  const nightOutput = resolveNight(state, actions);

  // Nếu có Thợ săn vừa chết trong đêm, Thợ săn PHẢI được nổ súng vào sáng hôm sau trước khi chốt kết quả thắng!
  if (state.pendingHunterShotPlayerId) {
    state.phase = 'HUNTER_SHOT';
    return { nightOutput, winOutcome: null };
  }

  const winOutcome = checkWinCondition(state);
  if (winOutcome) {
    state.phase = 'GAME_OVER';
  } else {
    state.phase = 'DAY_DISCUSS';
  }

  return { nightOutput, winOutcome };
}

/**
 * Điều phối Pha Biểu Quyết Ban Ngày (Day Vote Resolution):
 * Xử lý Hoàng tử lật bài, Thằng ngốc lật bài, Kẻ chán đời và Treo cổ.
 */
export function executeDayVote(
  state: GameState,
  targetPlayerId: PlayerId | null
): {
  survivedByReveal: boolean;
  winOutcome: WinOutcome | null;
} {
  state.phase = 'DAY_VOTE';

  if (!targetPlayerId) {
    state.historyLogs.push('Hòa phiếu hoặc bỏ phiếu trắng: Không ai bị treo cổ hôm nay.');
    state.roundNumber += 1;
    state.phase = 'NIGHT';
    return { survivedByReveal: false, winOutcome: checkWinCondition(state) };
  }

  const target = state.players.find((p) => p.id === targetPlayerId);
  if (!target || !target.isAlive) {
    return { survivedByReveal: false, winOutcome: checkWinCondition(state) };
  }

  // 1. Thằng ngốc (Village Idiot) lật bài thoát chết (mất quyền vote)
  if (target.roleId === 'village_idiot' && target.voteWeight > 0) {
    target.voteWeight = 0;
    state.historyLogs.push(
      `Thằng ngốc (${target.name}) lật bài thoát chết nhưng bị tước vĩnh viễn quyền bỏ phiếu!`
    );
    state.roundNumber += 1;
    state.phase = 'NIGHT';
    return { survivedByReveal: true, winOutcome: checkWinCondition(state) };
  }

  // 2. Hoàng tử (Prince) lật bài thoát chết (giữ nguyên quyền vote)
  if (target.roleId === 'prince') {
    // Chỉ miễn tử 1 lần: chuyển vai ngầm thành 'villager' sau khi thoát để không thoát lần 2
    target.roleId = 'villager';
    state.historyLogs.push(
      `Hoàng tử (${target.name}) lật bài thoát án tử và vẫn giữ nguyên lá phiếu quyền lực!`
    );
    state.roundNumber += 1;
    state.phase = 'NIGHT';
    return { survivedByReveal: true, winOutcome: checkWinCondition(state) };
  }

  // 3. Treo cổ thông thường -> Đưa vào Death Cascade
  processDeathCascade(state, [{ playerId: target.id, cause: 'VILLAGE_VOTE' }]);

  // Nếu có Thợ săn chết (do bị treo cổ hoặc chết chùm), mở lượt bắn trước khi xét thắng
  if (state.pendingHunterShotPlayerId) {
    state.phase = 'HUNTER_SHOT';
    return { survivedByReveal: false, winOutcome: null };
  }

  const winOutcome = checkWinCondition(state);
  if (winOutcome) {
    state.phase = 'GAME_OVER';
  } else {
    state.roundNumber += 1;
    state.phase = 'NIGHT';
  }

  return { survivedByReveal: false, winOutcome };
}

/**
 * Điều phối phát súng của Thợ săn (Hunter Shot)
 */
export function executeHunterShot(
  state: GameState,
  targetPlayerId: PlayerId | null
): WinOutcome | null {
  state.pendingHunterShotPlayerId = null;

  if (targetPlayerId) {
    const target = state.players.find((p) => p.id === targetPlayerId);
    if (target && target.isAlive) {
      state.historyLogs.push(`Thợ săn đã nổ phát súng sau cùng tiêu diệt [${target.name}]!`);
      processDeathCascade(state, [{ playerId: target.id, cause: 'HUNTER_SHOT' }]);
    }
  } else {
    state.historyLogs.push('Thợ săn không chọn ai hoặc đã bắn trượt.');
  }

  const winOutcome = checkWinCondition(state);
  if (winOutcome) {
    state.phase = 'GAME_OVER';
  } else {
    state.phase = 'DAY_DISCUSS';
  }

  return winOutcome;
}

