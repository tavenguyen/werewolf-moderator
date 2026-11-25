import { describe, expect, it } from 'bun:test';
import { getRoleImage, hasRoleImage, DIRECT_ROLE_IMAGES, ROLE_IMAGE_FALLBACKS } from '../index';
import { ROLES } from '../../../engine/roles';

describe('Role Images & Fallbacks', () => {
  it('trả về đúng đường dẫn /images/roles/${roleId}.webp cho các vai có icon riêng', () => {
    expect(getRoleImage('werewolf')).toBe('/images/roles/werewolf.webp');
    expect(getRoleImage('villager')).toBe('/images/roles/villager.webp');
    expect(getRoleImage('seer')).toBe('/images/roles/seer.webp');
    expect(getRoleImage('bodyguard')).toBe('/images/roles/bodyguard.webp');
    expect(getRoleImage('witch')).toBe('/images/roles/witch.webp');
    expect(getRoleImage('hunter')).toBe('/images/roles/hunter.webp');
    expect(getRoleImage('cupid')).toBe('/images/roles/cupid.webp');
    expect(getRoleImage('wolf_cub')).toBe('/images/roles/wolf_cub.webp');
    expect(getRoleImage('aura_seer')).toBe('/images/roles/aura_seer.webp');
    expect(getRoleImage('apprentice_seer')).toBe('/images/roles/apprentice_seer.webp');
    expect(getRoleImage('fox')).toBe('/images/roles/fox.webp');
    expect(getRoleImage('pi')).toBe('/images/roles/pi.webp');
    expect(getRoleImage('tanner')).toBe('/images/roles/tanner.webp');
    expect(getRoleImage('cursed')).toBe('/images/roles/cursed.webp');
    expect(getRoleImage('sorcerer')).toBe('/images/roles/sorcerer.webp');
    expect(getRoleImage('minion')).toBe('/images/roles/minion.webp');
    expect(getRoleImage('lycan')).toBe('/images/roles/lycan.webp');
    expect(getRoleImage('dream_wolf')).toBe('/images/roles/dream_wolf.webp');
    expect(getRoleImage('white_wolf')).toBe('/images/roles/white_wolf.webp');
    expect(getRoleImage('lone_wolf')).toBe('/images/roles/lone_wolf.webp');
    expect(getRoleImage('rusty_knight')).toBe('/images/roles/rusty_knight.webp');
    expect(getRoleImage('elder')).toBe('/images/roles/elder.webp');
    expect(getRoleImage('prince')).toBe('/images/roles/prince.webp');
    expect(getRoleImage('tough_guy')).toBe('/images/roles/tough_guy.webp');
    expect(getRoleImage('spellcaster')).toBe('/images/roles/spellcaster.webp');
    expect(getRoleImage('doppelganger')).toBe('/images/roles/doppelganger.webp');
    expect(getRoleImage('drunk')).toBe('/images/roles/drunk.webp');
  });

  it('hỗ trợ fallback thông minh cho các vai thể loại phụ chưa có icon riêng', () => {
    expect(getRoleImage('wolf_accursed')).toBe('/images/roles/cursed.webp');
    expect(getRoleImage('big_bad_wolf')).toBe('/images/roles/werewolf.webp');
    expect(getRoleImage('dire_wolf')).toBe('/images/roles/werewolf.webp');
    expect(getRoleImage('mason')).toBe('/images/roles/villager.webp');
    expect(getRoleImage('angel')).toBe('/images/roles/prince.webp');
    expect(getRoleImage('wild_child')).toBe('/images/roles/lycan.webp');
    expect(getRoleImage('troublemaker')).toBe('/images/roles/tanner.webp');
    expect(getRoleImage('cult_leader')).toBe('/images/roles/sorcerer.webp');
    expect(getRoleImage('pied_piper')).toBe('/images/roles/spellcaster.webp');
    expect(getRoleImage('hoodlum')).toBe('/images/roles/tough_guy.webp');
    expect(getRoleImage('village_idiot')).toBe('/images/roles/villager.webp');
  });

  it('hasRoleImage hoạt động chính xác với cả vai có icon riêng và vai fallback', () => {
    expect(hasRoleImage('werewolf')).toBe(true);
    expect(hasRoleImage('wolf_accursed')).toBe(true);
    expect(hasRoleImage('mason')).toBe(true);
    expect(hasRoleImage('non_existent_role')).toBe(false);
    expect(hasRoleImage('')).toBe(false);
  });

  it('tất cả 39 vai trong ROLES đều có ảnh (icon trực tiếp hoặc fallback hợp lệ)', () => {
    for (const role of ROLES) {
      const img = getRoleImage(role.id);
      expect(img).toBeDefined();
      expect(typeof img).toBe('string');
      expect(img?.startsWith('/images/roles/')).toBe(true);
      expect(img?.endsWith('.webp')).toBe(true);
      expect(hasRoleImage(role.id)).toBe(true);
    }
  });

  it('mọi fallback đích đều tồn tại trong danh sách DIRECT_ROLE_IMAGES', () => {
    for (const [subRole, targetRole] of Object.entries(ROLE_IMAGE_FALLBACKS)) {
      expect(DIRECT_ROLE_IMAGES[targetRole]).toBeDefined();
      expect(getRoleImage(subRole)).toBe(DIRECT_ROLE_IMAGES[targetRole]);
    }
  });
});
