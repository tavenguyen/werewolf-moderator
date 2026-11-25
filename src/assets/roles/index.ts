/**
 * Quản lý đường dẫn ảnh minh họa vai trò trong /images/roles/*.webp
 */

/**
 * Danh sách đầy đủ 39 vai trò có ảnh minh họa riêng trong thư mục public/images/roles/*.webp
 */
export const DIRECT_ROLE_IMAGES = {
  angel: '/images/roles/angel.webp',
  apprentice_seer: '/images/roles/apprentice_seer.webp',
  aura_seer: '/images/roles/aura_seer.webp',
  bear_tamer: '/images/roles/bear_tamer.webp',
  big_bad_wolf: '/images/roles/big_bad_wolf.webp',
  bodyguard: '/images/roles/bodyguard.webp',
  cult_leader: '/images/roles/cult_leader.webp',
  cupid: '/images/roles/cupid.webp',
  cursed: '/images/roles/cursed.webp',
  dire_wolf: '/images/roles/dire_wolf.webp',
  doppelganger: '/images/roles/doppelganger.webp',
  dream_wolf: '/images/roles/dream_wolf.webp',
  drunk: '/images/roles/drunk.webp',
  elder: '/images/roles/elder.webp',
  fox: '/images/roles/fox.webp',
  hoodlum: '/images/roles/hoodlum.webp',
  hunter: '/images/roles/hunter.webp',
  lone_wolf: '/images/roles/lone_wolf.webp',
  lycan: '/images/roles/lycan.webp',
  mason: '/images/roles/mason.webp',
  minion: '/images/roles/minion.webp',
  pi: '/images/roles/pi.webp',
  pied_piper: '/images/roles/pied_piper.webp',
  prince: '/images/roles/prince.webp',
  rusty_knight: '/images/roles/rusty_knight.webp',
  seer: '/images/roles/seer.webp',
  sorcerer: '/images/roles/sorcerer.webp',
  spellcaster: '/images/roles/spellcaster.webp',
  tanner: '/images/roles/tanner.webp',
  tough_guy: '/images/roles/tough_guy.webp',
  troublemaker: '/images/roles/troublemaker.webp',
  village_idiot: '/images/roles/village_idiot.webp',
  villager: '/images/roles/villager.webp',
  werewolf: '/images/roles/werewolf.webp',
  white_wolf: '/images/roles/white_wolf.webp',
  wild_child: '/images/roles/wild_child.webp',
  witch: '/images/roles/witch.webp',
  wolf_accursed: '/images/roles/wolf_accursed.webp',
  wolf_cub: '/images/roles/wolf_cub.webp',
} as const satisfies Readonly<Record<string, `/images/roles/${string}.webp`>>;

export type DirectRoleId = keyof typeof DIRECT_ROLE_IMAGES;

/**
 * Bảng fallback thông minh cho các biến thể turnKey, audioKey và alias của vai trò
 */
export const ROLE_IMAGE_FALLBACKS: Readonly<Record<string, DirectRoleId>> = {
  // Biến thể turn ban đêm
  night_mason: 'mason',
  night_wild_child: 'wild_child',
  night_wolf_accursed: 'wolf_accursed',
  night_big_bad_wolf: 'big_bad_wolf',
  night_dire_wolf: 'dire_wolf',
  night_hoodlum: 'hoodlum',
  night_pied_piper: 'pied_piper',
  night_cult_leader: 'cult_leader',
  night_troublemaker: 'troublemaker',
  night_aura_seer: 'aura_seer',
  night_pi: 'pi',
  night_fox: 'fox',
  night_spellcaster: 'spellcaster',
  night_doppelganger: 'doppelganger',
  night_drunk: 'drunk',

  // Biến thể nhóm, sự kiện và alias phổ biến
  wolf_pack: 'werewolf',
  wolf: 'werewolf',
  lovers: 'cupid',
  apprentice: 'apprentice_seer',
  day_bear_growl: 'bear_tamer',
  day_prince_reveal: 'prince',
  day_hunter_shoot: 'hunter',
  hunter_shot: 'hunter',
  angel_win: 'angel',
};

/**
 * Toàn bộ bản đồ vai trò -> đường dẫn ảnh minh họa (bao gồm ảnh trực tiếp và alias fallback)
 */
export const ROLE_IMAGES: Readonly<Record<string, string>> = {
  ...DIRECT_ROLE_IMAGES,
  ...Object.fromEntries(
    Object.entries(ROLE_IMAGE_FALLBACKS).map(([id, target]) => [id, DIRECT_ROLE_IMAGES[target]])
  ),
};

const NIGHT_PREFIX = 'night_';

function isDirectRoleId(key: string): key is DirectRoleId {
  return Object.hasOwn(DIRECT_ROLE_IMAGES, key);
}

function getFallbackTarget(key: string): DirectRoleId | undefined {
  return Object.hasOwn(ROLE_IMAGE_FALLBACKS, key) ? ROLE_IMAGE_FALLBACKS[key] : undefined;
}

function resolveDirectRoleId(normalizedId: string): DirectRoleId | undefined {
  if (isDirectRoleId(normalizedId)) {
    return normalizedId;
  }

  const directFallback = getFallbackTarget(normalizedId);
  if (directFallback) {
    return directFallback;
  }

  if (normalizedId.startsWith(NIGHT_PREFIX)) {
    const strippedId = normalizedId.slice(NIGHT_PREFIX.length);
    if (!strippedId) return undefined;

    if (isDirectRoleId(strippedId)) {
      return strippedId;
    }

    const strippedFallback = getFallbackTarget(strippedId);
    if (strippedFallback) {
      return strippedFallback;
    }
  }

  return undefined;
}

/**
 * Lấy đường dẫn ảnh minh họa cho vai trò (hỗ trợ cả roleId trực tiếp, alias và prefix `night_`)
 */
export function getRoleImage(roleId: string | null | undefined): string | undefined {
  if (typeof roleId !== 'string') return undefined;

  const normalized = roleId.trim().toLowerCase();
  if (!normalized) return undefined;

  const resolvedId = resolveDirectRoleId(normalized);
  return resolvedId ? DIRECT_ROLE_IMAGES[resolvedId] : undefined;
}

/**
 * Kiểm tra xem vai trò có ảnh minh họa (hoặc ảnh fallback) khả dụng không
 */
export function hasRoleImage(roleId: string | null | undefined): boolean {
  return getRoleImage(roleId) !== undefined;
}
