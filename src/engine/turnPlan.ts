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
 * Danh sách các role Ma sói có khả năng cắn đêm trực tiếp.
 * Không bao gồm minion hoặc sorcerer.
 */
export const BITING_WOLF_ROLES = new Set([
  'werewolf',
  'wolf_cub',
  'white_wolf',
  'lone_wolf',
  'big_bad_wolf',
  'wolf_accursed',
  'dire_wolf',
]);

/**
 * Kiểm tra xem có bất kỳ Ma sói cắn đêm nào đã chết hay chưa.
 * Bao gồm werewolf, wolf_cub, white_wolf, lone_wolf, big_bad_wolf, wolf_accursed, dire_wolf,
 * hoặc cursed / wild_child đã biến thành Ma Sói và chết với roleId='werewolf'.
 * Không tính minion hoặc sorcerer.
 */
export function hasAnyBitingWolfDied(state: GameState): boolean {
  return (
    state.deaths.some((d) => BITING_WOLF_ROLES.has(d.roleId)) ||
    state.players.some((p) => !p.isAlive && BITING_WOLF_ROLES.has(p.roleId))
  );
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

  // Kẻ say rượu (Drunk) còn sống ở Đêm 3+ (roundNumber >= 3) chuyển đổi sang vai thật (drunkRealRoleId)
  const effectivePlayers = state.players.map((p) => {
    if (p.isAlive && p.roleId === 'drunk' && round >= 3 && p.drunkRealRoleId) {
      const def = ROLES_BY_ID[p.drunkRealRoleId];
      return {
        ...p,
        roleId: p.drunkRealRoleId,
        faction: def?.faction ?? p.faction,
      };
    }
    return p;
  });

  const hasRole = (roleId: string) =>
    effectivePlayers.some((p) => p.initialRoleId === roleId || p.roleId === roleId);

  // 1. Thần tình yêu (Cupid) - Chỉ Đêm 1
  if (round === 1 && hasRole('cupid')) {
    const aliveCupid = effectivePlayers.find(
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

  // 1a. Nhân bản (Doppelganger) - Chỉ Đêm 1 (Priority 11)
  if (round === 1 && hasRole('doppelganger')) {
    const aliveDoppelganger = effectivePlayers.find(
      (p) => p.isAlive && p.roleId === 'doppelganger'
    );
    plan.push({
      roleId: 'doppelganger',
      turnKey: 'doppelganger',
      priority: 11,
      titleVi: 'Nhân bản',
      titleEn: 'Doppelganger',
      activePlayerIds: aliveDoppelganger ? [aliveDoppelganger.id] : [],
      isFake: !aliveDoppelganger,
      canAct: Boolean(aliveDoppelganger),
      audioKey: 'night_doppelganger',
    });
  }

  // 1b. Đứa con hoang (Wild Child) - Chỉ Đêm 1 (chọn 1 thần tượng)
  if (round === 1 && hasRole('wild_child')) {
    const aliveWildChild = effectivePlayers.find(
      (p) => p.isAlive && p.roleId === 'wild_child' && !state.villagePowerStripped
    );
    plan.push({
      roleId: 'wild_child',
      turnKey: 'wild_child',
      priority: 12,
      titleVi: 'Đứa con hoang',
      titleEn: 'Wild Child',
      activePlayerIds: aliveWildChild ? [aliveWildChild.id] : [],
      isFake: !aliveWildChild,
      canAct: Boolean(aliveWildChild),
      audioKey: 'night_wild_child',
    });
  }

  // 1c. Du côn (Hoodlum) - Chỉ Đêm 1 (chọn 2 mục tiêu)
  if (round === 1 && hasRole('hoodlum')) {
    const aliveHoodlum = effectivePlayers.find((p) => p.isAlive && p.roleId === 'hoodlum');
    plan.push({
      roleId: 'hoodlum',
      turnKey: 'hoodlum',
      priority: 13,
      titleVi: 'Du côn',
      titleEn: 'Hoodlum',
      activePlayerIds: aliveHoodlum ? [aliveHoodlum.id] : [],
      isFake: !aliveHoodlum,
      canAct: Boolean(aliveHoodlum),
      audioKey: 'night_hoodlum',
    });
  }

  // 1d. Hội Tam Điểm (Mason) - Chỉ Đêm 1 (tất cả Mason cùng thức nhận mặt nhau)
  if (round === 1 && hasRole('mason')) {
    const aliveMasons = effectivePlayers.filter(
      (p) => p.isAlive && p.roleId === 'mason' && !state.villagePowerStripped
    );
    plan.push({
      roleId: 'mason',
      turnKey: 'mason',
      priority: 14,
      titleVi: 'Hội Tam Điểm',
      titleEn: 'Mason',
      activePlayerIds: aliveMasons.map((m) => m.id),
      isFake: aliveMasons.length === 0,
      canAct: aliveMasons.length > 0,
      audioKey: 'night_mason',
    });
  }

  // 2. Kẻ phản bội (Minion) - Chỉ Đêm 1
  if (round === 1 && hasRole('minion')) {
    const aliveMinion = effectivePlayers.find((p) => p.isAlive && p.roleId === 'minion');
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

  // 2b. Sói tuyết (Dire Wolf) - Chỉ Đêm 1 (chọn 1 bạn đồng hành)
  if (round === 1 && hasRole('dire_wolf')) {
    const aliveDireWolf = effectivePlayers.find((p) => p.isAlive && p.roleId === 'dire_wolf');
    plan.push({
      roleId: 'dire_wolf',
      turnKey: 'dire_wolf',
      priority: 16,
      titleVi: 'Sói tuyết',
      titleEn: 'Dire Wolf',
      activePlayerIds: aliveDireWolf ? [aliveDireWolf.id] : [],
      isFake: !aliveDireWolf,
      canAct: Boolean(aliveDireWolf),
      audioKey: 'night_dire_wolf',
    });
  }

  // 3. Bảo vệ (Bodyguard) - Mỗi đêm
  if (hasRole('bodyguard')) {
    const aliveBg = effectivePlayers.find(
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
  const WOLF_PACK_ROLE_IDS = new Set([
    'werewolf',
    'wolf_cub',
    'dream_wolf',
    'white_wolf',
    'dire_wolf',
    'lone_wolf',
    'big_bad_wolf',
    'wolf_accursed',
  ]);
  const hasWolfPackRole = effectivePlayers.some(
    (p) =>
      WOLF_PACK_ROLE_IDS.has(p.roleId) ||
      WOLF_PACK_ROLE_IDS.has(p.initialRoleId) ||
      (p.faction === 'WEREWOLF' && p.roleId !== 'minion' && p.roleId !== 'sorcerer')
  );

  if (hasWolfPackRole) {
    const wakingWolves = effectivePlayers.filter((p) => {
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

  // 4b. Sói nguyền (wolf_accursed) - Mỗi đêm (Priority 32)
  if (hasRole('wolf_accursed')) {
    const aliveAccursedWolf = effectivePlayers.find(
      (p) => p.isAlive && p.roleId === 'wolf_accursed'
    );
    const canAct = Boolean(aliveAccursedWolf && !state.accursedWolfUsed);
    plan.push({
      roleId: 'wolf_accursed',
      turnKey: 'wolf_accursed',
      priority: 32,
      titleVi: 'Sói nguyền',
      titleEn: 'Accursed Wolf-Father',
      activePlayerIds: canAct && aliveAccursedWolf ? [aliveAccursedWolf.id] : [],
      isFake: !canAct,
      canAct,
      audioKey: 'night_wolf_accursed',
    });
  }

  // 4c. Sói đại ca (big_bad_wolf) - Mỗi đêm (Priority 33)
  if (hasRole('big_bad_wolf')) {
    const aliveBigBadWolf = effectivePlayers.find(
      (p) => p.isAlive && p.roleId === 'big_bad_wolf'
    );
    const bitingWolfDied = hasAnyBitingWolfDied(state);
    const canAct = Boolean(aliveBigBadWolf && !bitingWolfDied);
    plan.push({
      roleId: 'big_bad_wolf',
      turnKey: 'big_bad_wolf',
      priority: 33,
      titleVi: 'Sói đại ca',
      titleEn: 'Big Bad Wolf',
      activePlayerIds: canAct && aliveBigBadWolf ? [aliveBigBadWolf.id] : [],
      isFake: !canAct,
      canAct,
      audioKey: 'night_big_bad_wolf',
    });
  }

  // 5. Sói trắng (White Wolf) - Cách 1 đêm (Đêm chẵn: 2, 4, 6, ...)
  if (hasRole('white_wolf') && round % 2 === 0) {
    const aliveWhiteWolf = effectivePlayers.find((p) => p.isAlive && p.roleId === 'white_wolf');
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

  // 6. Tiên tri (Seer) & Tiên tri tập sự (Apprentice Seer) - Mỗi đêm (Priority 40)
  if (hasRole('seer') || hasRole('apprentice_seer')) {
    const hasAliveSeer = effectivePlayers.some((p) => p.isAlive && p.roleId === 'seer');
    if (hasAliveSeer) {
      const aliveSeer = effectivePlayers.find(
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
    } else {
      const aliveApprentice = effectivePlayers.find(
        (p) => p.isAlive && p.roleId === 'apprentice_seer' && !state.villagePowerStripped
      );
      plan.push({
        roleId: 'seer',
        turnKey: 'seer',
        priority: 40,
        titleVi: 'Tiên tri',
        titleEn: 'Seer',
        activePlayerIds: aliveApprentice ? [aliveApprentice.id] : [],
        isFake: !aliveApprentice,
        canAct: Boolean(aliveApprentice),
        audioKey: 'night_seer',
      });
    }
  }

  // 6b. Tiên tri hào quang (Aura Seer) - Mỗi đêm (Priority 41)
  if (hasRole('aura_seer')) {
    const aliveAuraSeer = effectivePlayers.find(
      (p) => p.isAlive && p.roleId === 'aura_seer' && !state.villagePowerStripped
    );
    plan.push({
      roleId: 'aura_seer',
      turnKey: 'aura_seer',
      priority: 41,
      titleVi: 'Tiên tri hào quang',
      titleEn: 'Aura Seer',
      activePlayerIds: aliveAuraSeer ? [aliveAuraSeer.id] : [],
      isFake: !aliveAuraSeer,
      canAct: Boolean(aliveAuraSeer),
      audioKey: 'night_aura_seer',
    });
  }

  // 6c. Thám tử (P.I.) - Dùng 1 lần (Priority 42)
  if (hasRole('pi')) {
    const alivePi = effectivePlayers.find((p) => p.isAlive && p.roleId === 'pi');
    const canAct = Boolean(alivePi && !state.villagePowerStripped && !state.piUsed);
    plan.push({
      roleId: 'pi',
      turnKey: 'pi',
      priority: 42,
      titleVi: 'Thám tử',
      titleEn: 'P.I.',
      activePlayerIds: canAct && alivePi ? [alivePi.id] : [],
      isFake: !canAct,
      canAct,
      audioKey: 'night_pi',
    });
  }

  // 6d. Con cáo (Fox) - Mỗi đêm cho đến khi mất phép (Priority 43)
  if (hasRole('fox')) {
    const aliveFox = effectivePlayers.find((p) => p.isAlive && p.roleId === 'fox');
    const canAct = Boolean(aliveFox && !state.villagePowerStripped && !state.foxLostPower);
    plan.push({
      roleId: 'fox',
      turnKey: 'fox',
      priority: 43,
      titleVi: 'Con cáo',
      titleEn: 'Fox',
      activePlayerIds: canAct && aliveFox ? [aliveFox.id] : [],
      isFake: !canAct,
      canAct,
      audioKey: 'night_fox',
    });
  }

  // 7. Pháp sư sói (Sorcerer) - Mỗi đêm
  if (hasRole('sorcerer')) {
    const aliveSorcerer = effectivePlayers.find((p) => p.isAlive && p.roleId === 'sorcerer');
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
    const aliveWitch = effectivePlayers.find(
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

  // 8b. Người phù phép (Spellcaster) - Mỗi đêm (Priority 55)
  if (hasRole('spellcaster')) {
    const aliveSpellcaster = effectivePlayers.find(
      (p) => p.isAlive && p.roleId === 'spellcaster' && !state.villagePowerStripped
    );
    plan.push({
      roleId: 'spellcaster',
      turnKey: 'spellcaster',
      priority: 55,
      titleVi: 'Người phù phép',
      titleEn: 'Spellcaster',
      activePlayerIds: aliveSpellcaster ? [aliveSpellcaster.id] : [],
      isFake: !aliveSpellcaster,
      canAct: Boolean(aliveSpellcaster),
      audioKey: 'night_spellcaster',
    });
  }

  // 8c. Kẻ phá rối (Troublemaker) - Dùng 1 lần (Priority 58)
  if (hasRole('troublemaker')) {
    const aliveTroublemaker = effectivePlayers.find(
      (p) => p.isAlive && p.roleId === 'troublemaker'
    );
    const canAct = Boolean(
      aliveTroublemaker && !state.villagePowerStripped && !state.troublemakerUsed
    );
    plan.push({
      roleId: 'troublemaker',
      turnKey: 'troublemaker',
      priority: 58,
      titleVi: 'Kẻ phá rối',
      titleEn: 'Troublemaker',
      activePlayerIds: canAct && aliveTroublemaker ? [aliveTroublemaker.id] : [],
      isFake: !canAct,
      canAct,
      audioKey: 'night_troublemaker',
    });
  }

  // 9. Người thổi sáo (Pied Piper) - Mỗi đêm (Priority 60)
  if (hasRole('pied_piper')) {
    const alivePiedPiper = effectivePlayers.find(
      (p) => p.isAlive && p.roleId === 'pied_piper'
    );
    plan.push({
      roleId: 'pied_piper',
      turnKey: 'pied_piper',
      priority: 60,
      titleVi: 'Người thổi sáo',
      titleEn: 'Pied Piper',
      activePlayerIds: alivePiedPiper ? [alivePiedPiper.id] : [],
      isFake: !alivePiedPiper,
      canAct: Boolean(alivePiedPiper),
      audioKey: 'night_pied_piper',
    });
  }

  // 10. Trưởng giáo phái (Cult Leader) - Mỗi đêm (Priority 62)
  if (hasRole('cult_leader')) {
    const aliveCultLeader = effectivePlayers.find(
      (p) => p.isAlive && p.roleId === 'cult_leader'
    );
    plan.push({
      roleId: 'cult_leader',
      turnKey: 'cult_leader',
      priority: 62,
      titleVi: 'Trưởng giáo phái',
      titleEn: 'Cult Leader',
      activePlayerIds: aliveCultLeader ? [aliveCultLeader.id] : [],
      isFake: !aliveCultLeader,
      canAct: Boolean(aliveCultLeader),
      audioKey: 'night_cult_leader',
    });
  }

  return plan.sort((a, b) => a.priority - b.priority);
}
