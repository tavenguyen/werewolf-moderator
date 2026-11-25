import { describe, expect, it } from 'bun:test';
import { existsSync, statSync } from 'node:fs';
import { ROLES } from '../../../engine/roles';
import {
  DIRECT_ROLE_IMAGES,
  ROLE_IMAGE_FALLBACKS,
  ROLE_IMAGES,
  getRoleImage,
  hasRoleImage,
} from '../index';

const PUBLIC_ROLE_IMAGES_DIR = new URL('../../../../public/images/roles/', import.meta.url);

describe('Role Images & Fallbacks', () => {
  it('DIRECT_ROLE_IMAGES chứa đầy đủ 39 vai trò trỏ tới /images/roles/${role.id}.webp', () => {
    expect(ROLES).toHaveLength(39);
    expect(Object.keys(DIRECT_ROLE_IMAGES)).toHaveLength(39);

    for (const role of ROLES) {
      const expectedPath = `/images/roles/${role.id}.webp`;
      expect(Object.hasOwn(DIRECT_ROLE_IMAGES, role.id)).toBe(true);
      expect(getRoleImage(role.id)).toBe(expectedPath);
      expect(ROLE_IMAGES[role.id]).toBe(expectedPath);
      expect(hasRoleImage(role.id)).toBe(true);
    }
  });

  it('tệp ảnh vật lý tương ứng trong public/images/roles/${role.id}.webp tồn tại trên ổ đĩa cho cả 39 vai trò', () => {
    for (const role of ROLES) {
      const imageFileUrl = new URL(`${role.id}.webp`, PUBLIC_ROLE_IMAGES_DIR);
      expect(existsSync(imageFileUrl)).toBe(true);
      expect(statSync(imageFileUrl).size).toBeGreaterThan(0);
    }
  });

  it('hỗ trợ fallback thông minh cho các biến thể prefix night_, alias và tên vai chuẩn hóa', () => {
    expect(getRoleImage('night_mason')).toBe('/images/roles/mason.webp');
    expect(getRoleImage('night_wild_child')).toBe('/images/roles/wild_child.webp');
    expect(getRoleImage('night_wolf_accursed')).toBe('/images/roles/wolf_accursed.webp');
    expect(getRoleImage('night_big_bad_wolf')).toBe('/images/roles/big_bad_wolf.webp');
    expect(getRoleImage('night_dire_wolf')).toBe('/images/roles/dire_wolf.webp');
    expect(getRoleImage('night_seer')).toBe('/images/roles/seer.webp');
    expect(getRoleImage('night_witch')).toBe('/images/roles/witch.webp');
    expect(getRoleImage('night_white_wolf')).toBe('/images/roles/white_wolf.webp');

    expect(getRoleImage('wolf_pack')).toBe('/images/roles/werewolf.webp');
    expect(getRoleImage('lovers')).toBe('/images/roles/cupid.webp');
    expect(getRoleImage('apprentice')).toBe('/images/roles/apprentice_seer.webp');
    expect(getRoleImage('night_apprentice')).toBe('/images/roles/apprentice_seer.webp');
    expect(getRoleImage('day_bear_growl')).toBe('/images/roles/bear_tamer.webp');
    expect(getRoleImage('hunter_shot')).toBe('/images/roles/hunter.webp');
    expect(getRoleImage('  SEER  ')).toBe('/images/roles/seer.webp');
  });

  it('mọi fallback đích đều tồn tại trong danh sách DIRECT_ROLE_IMAGES', () => {
    for (const [alias, targetRole] of Object.entries(ROLE_IMAGE_FALLBACKS)) {
      expect(DIRECT_ROLE_IMAGES[targetRole]).toBeDefined();
      expect(getRoleImage(alias)).toBe(DIRECT_ROLE_IMAGES[targetRole]);
      expect(hasRoleImage(alias)).toBe(true);
    }
  });

  it('trả về undefined và false với roleId không hợp lệ hoặc không phải vai trò', () => {
    const invalidIds = [
      '',
      '   ',
      'non_existent_role',
      'night_',
      'night_start',
      'night_end',
      'toString',
      '__proto__',
      null,
      undefined,
    ];

    for (const invalidId of invalidIds) {
      expect(getRoleImage(invalidId)).toBeUndefined();
      expect(hasRoleImage(invalidId)).toBe(false);
    }
  });
});
