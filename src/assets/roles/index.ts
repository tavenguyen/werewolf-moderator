/**
 * Quản lý đường dẫn ảnh minh họa vai trò trong /images/roles/*.webp
 */

/**
 * Danh sách các vai trò có ảnh minh họa riêng trong thư mục public/images/roles/*.webp
 */
export const DIRECT_ROLE_IMAGES: Readonly<Record<string, string>> = {
  apprentice_seer: '/images/roles/apprentice_seer.webp',
  aura_seer: '/images/roles/aura_seer.webp',
  bear_tamer: '/images/roles/bear_tamer.webp',
  bodyguard: '/images/roles/bodyguard.webp',
  cupid: '/images/roles/cupid.webp',
  cursed: '/images/roles/cursed.webp',
  doppelganger: '/images/roles/doppelganger.webp',
  dream_wolf: '/images/roles/dream_wolf.webp',
  drunk: '/images/roles/drunk.webp',
  elder: '/images/roles/elder.webp',
  fox: '/images/roles/fox.webp',
  hunter: '/images/roles/hunter.webp',
  lone_wolf: '/images/roles/lone_wolf.webp',
  lycan: '/images/roles/lycan.webp',
  minion: '/images/roles/minion.webp',
  pi: '/images/roles/pi.webp',
  prince: '/images/roles/prince.webp',
  rusty_knight: '/images/roles/rusty_knight.webp',
  seer: '/images/roles/seer.webp',
  sorcerer: '/images/roles/sorcerer.webp',
  spellcaster: '/images/roles/spellcaster.webp',
  tanner: '/images/roles/tanner.webp',
  tough_guy: '/images/roles/tough_guy.webp',
  villager: '/images/roles/villager.webp',
  werewolf: '/images/roles/werewolf.webp',
  white_wolf: '/images/roles/white_wolf.webp',
  witch: '/images/roles/witch.webp',
  wolf_cub: '/images/roles/wolf_cub.webp',
};

/**
 * Bảng fallback thông minh cho các vai thể loại phụ chưa có icon riêng
 */
export const ROLE_IMAGE_FALLBACKS: Readonly<Record<string, string>> = {
  wolf_accursed: 'cursed',
  big_bad_wolf: 'werewolf',
  dire_wolf: 'werewolf',
  mason: 'villager',
  angel: 'prince',
  wild_child: 'lycan',
  troublemaker: 'tanner',
  cult_leader: 'sorcerer',
  pied_piper: 'spellcaster',
  hoodlum: 'tough_guy',
  village_idiot: 'villager',
};

/**
 * Toàn bộ bản đồ vai trò -> đường dẫn ảnh minh họa (bao gồm ảnh trực tiếp và fallback)
 */
export const ROLE_IMAGES: Record<string, string> = {
  ...DIRECT_ROLE_IMAGES,
  ...Object.fromEntries(
    Object.entries(ROLE_IMAGE_FALLBACKS).map(([id, target]) => [id, DIRECT_ROLE_IMAGES[target]!])
  ),
};

/**
 * Lấy đường dẫn ảnh minh họa cho vai trò (có hỗ trợ fallback thông minh)
 */
export function getRoleImage(roleId: string): string | undefined {
  if (!roleId) return undefined;
  if (roleId in ROLE_IMAGES) {
    return ROLE_IMAGES[roleId];
  }
  const fallbackKey = ROLE_IMAGE_FALLBACKS[roleId];
  if (fallbackKey && DIRECT_ROLE_IMAGES[fallbackKey]) {
    return DIRECT_ROLE_IMAGES[fallbackKey];
  }
  return undefined;
}

/**
 * Kiểm tra xem vai trò có ảnh minh họa (hoặc ảnh fallback) khả dụng không
 */
export function hasRoleImage(roleId: string): boolean {
  return Boolean(getRoleImage(roleId));
}
