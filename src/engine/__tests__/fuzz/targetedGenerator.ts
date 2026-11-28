import { isNightHuntingWolf } from '../../presets';
import { ROLES } from '../../roles';
import type { RoomSettings } from '../../types';
import type { FuzzMatchConfig } from './generator';
import { SeededRng } from './prng';

export interface ToxicClusterSpec {
  id: string;
  description: string;
  coreRoles: string[];
  forcedSettings: Partial<RoomSettings>;
}

const ALL_ENGINE_ROLE_IDS = ROLES.filter((r) => r.implementedInEngine).map((r) => r.id);
const UNIQUE_ROLE_IDS = new Set(
  ALL_ENGINE_ROLE_IDS.filter(
    (id) => id !== 'werewolf' && id !== 'villager' && id !== 'mason' && id !== 'hunter'
  )
);

/**
 * Đồ thị phụ thuộc chéo giữa 39 vai trò -> gom thành 6 cụm "độc hại nhất"
 * nơi mỗi cụm ép 5–8 vai có chuỗi kích hoạt chéo xuất hiện đồng thời.
 */
export const TOXIC_DEPENDENCY_CLUSTERS: ToxicClusterSpec[] = [
  {
    id: 'CASCADE_INHERITANCE_STORM',
    description: 'Thợ săn + Nhân bản + Cupid + Đứa con hoang + Phù thủy AoE + Kẻ phá rối + Sói con',
    coreRoles: [
      'hunter',
      'doppelganger',
      'cupid',
      'wild_child',
      'troublemaker',
      'witch',
      'wolf_cub',
    ],
    forcedSettings: {
      witchHealMode: 'AOE',
      allowWitchBothPotionsSameNight: true,
      allowWitchSelfHeal: true,
      witchDoubleProtectKills: true,
      hunterShootsOnPoison: true,
      allowCupidSelfMatch: true,
      allowHunterSkipShot: false,
    },
  },
  {
    id: 'ARMOR_DELAY_CONTAGION',
    description: 'Già làng + Người cứng cỏi + Kỵ sĩ gỉ sắt + Sói nguyền + Sói đại ca + Sói chiêm bao + Bảo vệ + Phù thủy + Thợ săn',
    coreRoles: [
      'elder',
      'tough_guy',
      'rusty_knight',
      'wolf_accursed',
      'big_bad_wolf',
      'dream_wolf',
      'bodyguard',
      'witch',
      'hunter',
    ],
    forcedSettings: {
      witchHealMode: 'SINGLE',
      allowBodyguardSelfProtect: true,
      witchDoubleProtectKills: true,
      hunterShootsOnPoison: true,
      firstNightNoKill: false,
    },
  },
  {
    id: 'INSPECTION_MUTATION_SPOOF',
    description: 'Kẻ say rượu + Kẻ bị nguyền + Nhân bản + Người lai sói + Phản bội + Pháp sư + Tiên tri + Tập sự + Hào quang + Cáo + Thám tử + Gấu + Sói nguyền',
    coreRoles: [
      'drunk',
      'cursed',
      'doppelganger',
      'lycan',
      'minion',
      'sorcerer',
      'seer',
      'apprentice_seer',
      'aura_seer',
      'fox',
      'pi',
      'bear_tamer',
      'wolf_accursed',
    ],
    forcedSettings: {
      seerRevealMode: 'EXACT_ROLE',
      allowWolfFriendlyFire: true,
      revealOnDeath: false,
    },
  },
  {
    id: 'VOTE_IMMUNITY_PRIORITY_CLASH',
    description: 'Thằng ngốc + Hoàng tử + Nhân bản + Kẻ phá rối + Người phù phép + Kẻ chán đời + Thiên sứ + Sói cô đơn',
    coreRoles: [
      'village_idiot',
      'prince',
      'doppelganger',
      'troublemaker',
      'spellcaster',
      'tanner',
      'angel',
      'lone_wolf',
    ],
    forcedSettings: {
      hasMayor: true,
      lynchThreshold: 'MAJORITY',
      tieVoteMode: 'RUNOFF',
      allowWolfSkip: false,
    },
  },
  {
    id: 'THIRD_PARTY_CONVERSION_CLASH',
    description: 'Người thổi sáo + Trưởng giáo phái + Du côn + Cupid + Sói nguyền + Sói tuyết + Kẻ chán đời + Thiên sứ + Sói cô đơn',
    coreRoles: [
      'pied_piper',
      'cult_leader',
      'hoodlum',
      'cupid',
      'wolf_accursed',
      'dire_wolf',
      'tanner',
      'angel',
      'lone_wolf',
    ],
    forcedSettings: {
      allowCupidSelfMatch: true,
      revealOnDeath: false,
      tieVoteMode: 'ESCAPE',
    },
  },
  {
    id: 'DOUBLE_HUNTER_ELDER_WOLF_CUB',
    description: '2 Thợ săn + Già làng + Sói con + Phù thủy AoE + Kẻ phá rối + Hoàng tử + Thằng ngốc',
    coreRoles: [
      'hunter',
      'hunter',
      'elder',
      'wolf_cub',
      'witch',
      'troublemaker',
      'prince',
      'village_idiot',
    ],
    forcedSettings: {
      witchHealMode: 'AOE',
      hunterShootsOnPoison: true,
      allowHunterSkipShot: false,
      hasMayor: true,
    },
  },
];

/**
 * Sinh bàn đấu combinatorial nhắm thẳng vào một cụm phụ thuộc chéo hoặc cặp va chạm ngẫu nhiên.
 */
export function generateToxicCombinatorialConfig(
  rng: SeededRng,
  clusterIndex?: number
): { config: FuzzMatchConfig; clusterId: string } {
  const cluster =
    clusterIndex !== undefined
      ? TOXIC_DEPENDENCY_CLUSTERS[clusterIndex % TOXIC_DEPENDENCY_CLUSTERS.length]
      : rng.pick(TOXIC_DEPENDENCY_CLUSTERS);

  const minPlayers = Math.max(6, Math.min(16, cluster.coreRoles.length));
  const playerCount = rng.nextInt(minPlayers, 16);

  // Chọn tập con lõi vừa với playerCount (ưu tiên giữ ít nhất 5 vai đầu cụm khi playerCount nhỏ)
  const roleIds: string[] = [];
  const shuffledExtras = rng.shuffle(cluster.coreRoles.slice(5));
  for (const r of cluster.coreRoles.slice(0, 5)) {
    if (roleIds.length < playerCount) roleIds.push(r);
  }
  for (const r of shuffledExtras) {
    if (roleIds.length >= playerCount) break;
    if (r === 'lone_wolf' && roleIds.includes('white_wolf')) continue;
    if (r === 'white_wolf' && roleIds.includes('lone_wolf')) continue;
    roleIds.push(r);
  }

  const wolfRoles = ALL_ENGINE_ROLE_IDS.filter((id) => isNightHuntingWolf(id));
  while (roleIds.length < playerCount) {
    if (!roleIds.some((id) => isNightHuntingWolf(id))) {
      roleIds.push(rng.pick(wolfRoles));
      continue;
    }
    const cand = rng.pick(ALL_ENGINE_ROLE_IDS);
    if (UNIQUE_ROLE_IDS.has(cand) && roleIds.includes(cand)) continue;
    if (cand === 'lone_wolf' && roleIds.includes('white_wolf')) continue;
    if (cand === 'white_wolf' && roleIds.includes('lone_wolf')) continue;
    roleIds.push(cand);
  }

  if (!roleIds.some((id) => isNightHuntingWolf(id))) {
    roleIds[roleIds.length - 1] = rng.pick(wolfRoles);
  }

  const baseSettings: Partial<RoomSettings> = {
    revealOnDeath: rng.chance(0.5),
    allowWolfSkip: rng.chance(0.35),
    allowWolfFriendlyFire: rng.chance(0.45),
    witchHealMode: rng.chance(0.5) ? 'AOE' : 'SINGLE',
    witchKnowsVictim: rng.chance(0.5),
    witchWasteHealOnEmpty: rng.chance(0.5),
    allowWitchSelfHeal: rng.chance(0.5),
    allowWitchBothPotionsSameNight: rng.chance(0.5),
    witchDoubleProtectKills: rng.chance(0.5),
    tieVoteMode: rng.chance(0.5) ? 'RUNOFF' : 'ESCAPE',
    ghostMode: rng.chance(0.5),
    hasMayor: rng.chance(0.5),
    allowBodyguardSelfProtect: rng.chance(0.5),
    firstNightNoKill: rng.chance(0.25),
    seerRevealMode: rng.chance(0.5) ? 'EXACT_ROLE' : 'FACTION',
    allowCupidSelfMatch: rng.chance(0.5),
    revealVoterIdentities: rng.chance(0.5),
    lynchThreshold: rng.chance(0.5) ? 'MAJORITY' : 'PLURALITY',
    hunterShootsOnPoison: rng.chance(0.5),
    allowHunterSkipShot: rng.chance(0.5),
    ...cluster.forcedSettings,
  };

  const finalRoles = rng.shuffle(roleIds);
  const players = Array.from({ length: playerCount }, (_, idx) => ({
    id: `p${idx + 1}`,
    name: `P${idx + 1}`,
    seatIndex: idx,
  }));

  return {
    clusterId: cluster.id,
    config: {
      playerCount,
      players,
      roleIds: finalRoles,
      settings: baseSettings,
    },
  };
}
