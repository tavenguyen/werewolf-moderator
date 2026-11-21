import { ROLES_BY_ID } from './roles';
import type { GameState, PlayerId } from './types';

export interface NightTurnPlanItem {
  roleId: string;
  turnKey: string;
  priority: number;
  titleVi: string;
  titleEn: string;
  activePlayerIds: PlayerId[];
  isFake: boolean;
  canAct: boolean;
  audioKey: string | null;
}

/**
 * Kiểm tra xem có ít nhất một Ma sói khác (ngoài chính dream_wolf) đã chết hay chưa.
 * Bao gồm chết do treo cổ, trúng độc, tự cắn, Thợ săn bắn hoặc Sói trắng giết.
 */
export function hasAnyOtherWolfDied(state: GameState): boolean {
  return state.deaths.some((d) => {
    if (d.roleId === 'dream_wolf') return false;
    const def = ROLES_BY_ID[d.roleId];
    return def?.faction === 'WEREWOLF';
  });
}

/**
 * Tạo danh sách lượt ban đêm (NightTurnPlan) theo thứ tự priority cố định.
 * Bao gồm cả lượt gọi giả (fake turn) cho vai đã chết để giữ nhịp độ và chống lộ thông tin.
 */
export function generateNightTurnPlan(state: GameState): NightTurnPlanItem[] {
  const plan: NightTurnPlanItem[] = [];
  const round = state.roundNumber;

  // Cập nhật trạng thái thức tỉnh của Sói chiêm bao ở đầu đêm nếu có Sói khác đã chết
  const dreamWolfAwakened = state.dreamWolfAwakened || hasAnyOtherWolfDied(state);

  const hasRole = (roleId: string) =>
    state.players.some((p) => p.initialRoleId === roleId || p.roleId === roleId);

  // 1. Thần tình yêu (Cupid) - Chỉ Đêm 1
  if (round === 1 && hasRole('cupid')) {
    const aliveCupid = state.players.find(
      (p) => p.isAlive && p.roleId === 'cupid' && !state.villagePowerStripped
    );
    plan.push({
      roleId: 'cupid',
      turnKey: 'cupid',
      priority: 10,
      titleVi: 'Thần tình yêu',
      titleEn: 'Cupid',
      activePlayerIds: aliveCupid ? [aliveCupid.id] : [],
      isFake: !aliveCupid,
      canAct: Boolean(aliveCupid),
      audioKey: 'night_cupid',
    });
  }

  // 2. Kẻ phản bội (Minion) - Chỉ Đêm 1
  if (round === 1 && hasRole('minion')) {
    const aliveMinion = state.players.find((p) => p.isAlive && p.roleId === 'minion');
    plan.push({
      roleId: 'minion',
      turnKey: 'minion',
      priority: 15,
      titleVi: 'Kẻ phản bội',
      titleEn: 'Minion',
      activePlayerIds: aliveMinion ? [aliveMinion.id] : [],
      isFake: !aliveMinion,
      canAct: Boolean(aliveMinion),
      audioKey: 'night_minion',
    });
  }

  // 3. Bảo vệ (Bodyguard) - Mỗi đêm
  if (hasRole('bodyguard')) {
    const aliveBg = state.players.find(
      (p) => p.isAlive && p.roleId === 'bodyguard' && !state.villagePowerStripped
    );
    plan.push({
      roleId: 'bodyguard',
      turnKey: 'bodyguard',
      priority: 20,
      titleVi: 'Bảo vệ',
      titleEn: 'Bodyguard',
      activePlayerIds: aliveBg ? [aliveBg.id] : [],
      isFake: !aliveBg,
      canAct: Boolean(aliveBg),
      audioKey: 'night_bodyguard',
    });
  }

  // 4. Bầy Ma sói (Werewolf Pack) - Mỗi đêm
  const hasWolfPackRole = state.players.some(
    (p) =>
      p.roleId === 'werewolf' ||
      p.roleId === 'wolf_cub' ||
      p.roleId === 'dream_wolf' ||
      p.roleId === 'white_wolf' ||
      p.initialRoleId === 'werewolf' ||
      p.initialRoleId === 'wolf_cub' ||
      p.initialRoleId === 'dream_wolf' ||
      p.initialRoleId === 'white_wolf'
  );

  if (hasWolfPackRole) {
    const wakingWolves = state.players.filter((p) => {
      if (!p.isAlive) return false;
      if (p.faction !== 'WEREWOLF' && p.roleId !== 'white_wolf') return false;
      // Minion và Sorcerer không cắn cùng bầy
      if (p.roleId === 'minion' || p.roleId === 'sorcerer') return false;
      // Dream wolf chỉ thức khi đã thức tỉnh
      if (p.roleId === 'dream_wolf' && !dreamWolfAwakened) return false;
      return true;
    });

    plan.push({
      roleId: 'werewolf',
      turnKey: 'wolf_pack',
      priority: 30,
      titleVi: 'Bầy Ma sói',
      titleEn: 'Werewolves',
      activePlayerIds: wakingWolves.map((w) => w.id),
      isFake: wakingWolves.length === 0,
      canAct: wakingWolves.length > 0,
      audioKey: 'night_werewolf',
    });
  }

  // 5. Sói trắng (White Wolf) - Cách 1 đêm (Đêm chẵn: 2, 4, 6, ...)
  if (hasRole('white_wolf') && round % 2 === 0) {
    const aliveWhiteWolf = state.players.find((p) => p.isAlive && p.roleId === 'white_wolf');
    plan.push({
      roleId: 'white_wolf',
      turnKey: 'white_wolf',
      priority: 35,
      titleVi: 'Sói trắng',
      titleEn: 'White Wolf',
      activePlayerIds: aliveWhiteWolf ? [aliveWhiteWolf.id] : [],
      isFake: !aliveWhiteWolf,
      canAct: Boolean(aliveWhiteWolf),
      audioKey: 'night_white_wolf',
    });
  }

  // 6. Tiên tri (Seer) - Mỗi đêm
  if (hasRole('seer')) {
    const aliveSeer = state.players.find(
      (p) => p.isAlive && p.roleId === 'seer' && !state.villagePowerStripped
    );
    plan.push({
      roleId: 'seer',
      turnKey: 'seer',
      priority: 40,
      titleVi: 'Tiên tri',
      titleEn: 'Seer',
      activePlayerIds: aliveSeer ? [aliveSeer.id] : [],
      isFake: !aliveSeer,
      canAct: Boolean(aliveSeer),
      audioKey: 'night_seer',
    });
  }

  // 7. Pháp sư sói (Sorcerer) - Mỗi đêm
  if (hasRole('sorcerer')) {
    const aliveSorcerer = state.players.find((p) => p.isAlive && p.roleId === 'sorcerer');
    plan.push({
      roleId: 'sorcerer',
      turnKey: 'sorcerer',
      priority: 45,
      titleVi: 'Pháp sư sói',
      titleEn: 'Sorcerer',
      activePlayerIds: aliveSorcerer ? [aliveSorcerer.id] : [],
      isFake: !aliveSorcerer,
      canAct: Boolean(aliveSorcerer),
      audioKey: 'night_sorcerer',
    });
  }

  // 8. Phù thủy (Witch) - Mỗi đêm
  if (hasRole('witch')) {
    const aliveWitch = state.players.find(
      (p) => p.isAlive && p.roleId === 'witch' && !state.villagePowerStripped
    );
    plan.push({
      roleId: 'witch',
      turnKey: 'witch',
      priority: 50,
      titleVi: 'Phù thủy',
      titleEn: 'Witch',
      activePlayerIds: aliveWitch ? [aliveWitch.id] : [],
      isFake: !aliveWitch,
      canAct: Boolean(aliveWitch),
      audioKey: 'night_witch',
    });
  }

  return plan.sort((a, b) => a.priority - b.priority);
}
