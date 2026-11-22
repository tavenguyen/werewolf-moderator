import { describe, expect, it } from 'bun:test';
import {
  generateDynamicBalancedDeck,
  getPresetsForPlayerCount,
  getSmartPreset,
  isNightHuntingWolf,
  isPresetMultiDeviceOnly,
  NIGHT_HUNTING_WOLF_IDS,
  ROLE_PRESETS,
  SMART_PRESETS,
  validateRoleList,
  type PresetTheme,
} from '../presets';
import { calculateBalanceScore, ROLES_BY_ID } from '../roles';

describe('Engine - Catalog 44 Presets (6–16 Players)', () => {
  it('should define exactly 44 presets across 11 player counts and 4 themes', () => {
    expect(ROLE_PRESETS.length).toBe(44);

    const expectedThemes: PresetTheme[] = ['CLASSIC', 'DEDUCTION', 'CHAOS', 'WOLVES'];

    for (let count = 6; count <= 16; count++) {
      const presetsForCount = ROLE_PRESETS.filter((p) => p.playerCount === count);
      expect(presetsForCount.length).toBe(4);

      for (const theme of expectedThemes) {
        const p = presetsForCount.find((item) => item.theme === theme);
        expect(p).toBeDefined();
        expect(p!.id).toBe(`${count}_${theme.toLowerCase()}`);
      }
    }
  });

  it('should ensure all 44 presets satisfy 100% mathematical balance and role constraints', () => {
    for (const preset of ROLE_PRESETS) {
      // 1. Số lá bài phải khớp chính xác playerCount
      expect(preset.roles.length).toBe(preset.playerCount);

      // 2. Mọi vai trong preset phải tồn tại trong engine
      for (const roleId of preset.roles) {
        expect(ROLES_BY_ID[roleId]).toBeDefined();
        expect(ROLES_BY_ID[roleId]?.implementedInEngine).toBe(true);
      }

      // 3. Điểm cân bằng phải khớp với calculateBalanceScore và nằm trong [-2, +2]
      const calculatedScore = calculateBalanceScore(preset.roles);
      expect(preset.balanceScore).toBe(calculatedScore);
      expect(preset.balanceScore).toBeGreaterThanOrEqual(-2);
      expect(preset.balanceScore).toBeLessThanOrEqual(2);

      // 4. Luôn có ít nhất 1 Sói săn đêm
      const hasHuntingWolf = preset.roles.some((rId) => isNightHuntingWolf(rId));
      expect(hasHuntingWolf).toBe(true);

      // 5. Cấm chọn đồng thời lone_wolf và white_wolf
      const hasLoneWolf = preset.roles.includes('lone_wolf');
      const hasWhiteWolf = preset.roles.includes('white_wolf');
      expect(hasLoneWolf && hasWhiteWolf).toBe(false);

      // 6. Ràng buộc Tiên tri: apprentice_seer hoặc sorcerer CHỈ ĐƯỢC CHỌN KHI CÓ seer
      const hasSeer = preset.roles.includes('seer');
      if (preset.roles.includes('apprentice_seer') || preset.roles.includes('sorcerer')) {
        expect(hasSeer).toBe(true);
      }

      // 7. Ràng buộc Mason: nếu có mason thì số lượng phải >= 2
      const masonCount = preset.roles.filter((rId) => rId === 'mason').length;
      if (masonCount > 0) {
        expect(masonCount).toBeGreaterThanOrEqual(2);
      }

      // 8. Thuộc tính isMultiDeviceOnly phải tự động suy ra chính xác từ thuộc tính vai
      const expectedMultiDevice = isPresetMultiDeviceOnly(preset.roles);
      expect(preset.isMultiDeviceOnly).toBe(expectedMultiDevice);

      // Đảm bảo không có role nào bị undefine
      expect(preset.nameVi).toBeTruthy();
      expect(preset.theme).toBeTruthy();
    }
  });

  it('should filter presets correctly via getPresetsForPlayerCount', () => {
    // Lọc theo playerCount
    const presets8 = getPresetsForPlayerCount(8);
    expect(presets8.length).toBe(4);

    // Lọc theo theme
    const deduction8 = getPresetsForPlayerCount(8, { theme: 'DEDUCTION' });
    expect(deduction8.length).toBe(1);
    expect(deduction8[0].id).toBe('8_deduction');

    // Lọc theo singleDevice: loại bỏ các preset có isMultiDeviceOnly === true
    const singleDevice8 = getPresetsForPlayerCount(8, { isSingleDevice: true });
    for (const p of singleDevice8) {
      expect(p.isMultiDeviceOnly).toBe(false);
      expect(isPresetMultiDeviceOnly(p.roles)).toBe(false);
    }

    // Với 8 người: 8_deduction chứa 'cursed' (multiDevice) nên bị lọc bỏ
    expect(singleDevice8.some((p) => p.id === '8_deduction')).toBe(false);
  });
});

describe('Engine - Backwards Compatibility Presets API', () => {
  it('should return valid classic presets from getSmartPreset for [6, 16]', () => {
    for (let count = 6; count <= 16; count++) {
      const preset = getSmartPreset(count);
      expect(preset).not.toBeNull();
      expect(preset!.playerCount).toBe(count);
      expect(preset!.roles.length).toBe(count);
      expect(preset!.theme).toBe('CLASSIC');
      expect(preset!.balanceScore).toBeGreaterThanOrEqual(-2);
      expect(preset!.balanceScore).toBeLessThanOrEqual(2);
      // Toàn bộ CLASSIC presets đều chơi được trên single-device
      expect(preset!.isMultiDeviceOnly).toBe(false);
    }
  });

  it('should return null for counts outside [6, 16] in getSmartPreset', () => {
    expect(getSmartPreset(5)).toBeNull();
    expect(getSmartPreset(17)).toBeNull();
    expect(getSmartPreset(0)).toBeNull();
    expect(getSmartPreset(-1)).toBeNull();
  });

  it('should validate role lists correctly in validateRoleList', () => {
    const valid6 = SMART_PRESETS[6].roles;
    expect(validateRoleList(valid6).isValid).toBe(true);

    // Dưới 6 người
    expect(validateRoleList(['werewolf', 'seer']).isValid).toBe(false);

    // Vượt quá 16 người
    const tooMany = new Array(17).fill('villager');
    expect(validateRoleList(tooMany).isValid).toBe(false);

    // Chứa role không thuộc MVP
    expect(
      validateRoleList(['tough_guy', 'werewolf', 'seer', 'witch', 'villager', 'villager']).isValid
    ).toBe(false);
  });
});

describe('Engine - Dynamic Balanced Deck Generator (generateDynamicBalancedDeck)', () => {
  it('should throw an error if playerCount is outside [6, 16]', () => {
    expect(() => generateDynamicBalancedDeck({ playerCount: 5 })).toThrow();
    expect(() => generateDynamicBalancedDeck({ playerCount: 17 })).toThrow();
  });

  it('should generate valid, balanced decks across 100 consecutive randomized runs', () => {
    const themes: PresetTheme[] = ['CLASSIC', 'DEDUCTION', 'CHAOS', 'WOLVES'];

    for (let i = 0; i < 100; i++) {
      // Chọn ngẫu nhiên playerCount từ 6 đến 16
      const playerCount = 6 + (i % 11);
      // Luân phiên kiểm tra singleDevice (true/false)
      const isSingleDevice = i % 2 === 0;
      // Chọn theme ngẫu nhiên
      const theme = themes[i % themes.length];

      // Đôi khi truyền preferredRoleIds
      let preferredRoleIds: string[] | undefined;
      if (i % 4 === 0) {
        preferredRoleIds = ['werewolf', 'seer'];
      } else if (i % 4 === 1) {
        preferredRoleIds = ['mason', 'mason'];
      } else if (i % 4 === 2) {
        preferredRoleIds = ['sorcerer']; // Phải tự động bổ sung seer
      }

      const generated = generateDynamicBalancedDeck({
        playerCount,
        theme,
        isSingleDevice,
        preferredRoleIds,
      });

      // 1. Số lá bài đúng playerCount
      expect(generated.roles.length).toBe(playerCount);
      expect(generated.playerCount).toBe(playerCount);

      // 2. Điểm cân bằng nằm trong khoảng an toàn [-2, +2]
      const score = calculateBalanceScore(generated.roles);
      expect(generated.balanceScore).toBe(score);
      expect(score).toBeGreaterThanOrEqual(-2);
      expect(score).toBeLessThanOrEqual(2);

      // 3. Luôn có ít nhất 1 Sói săn đêm
      const hasHuntingWolf = generated.roles.some((rId) => isNightHuntingWolf(rId));
      expect(hasHuntingWolf).toBe(true);

      // 4. Không bao giờ chứa đồng thời lone_wolf và white_wolf
      const hasLoneWolf = generated.roles.includes('lone_wolf');
      const hasWhiteWolf = generated.roles.includes('white_wolf');
      expect(hasLoneWolf && hasWhiteWolf).toBe(false);

      // 5. Ràng buộc Tiên tri: apprentice_seer hoặc sorcerer CHỈ ĐƯỢC CHỌN KHI CÓ seer
      const hasSeer = generated.roles.includes('seer');
      if (generated.roles.includes('apprentice_seer') || generated.roles.includes('sorcerer')) {
        expect(hasSeer).toBe(true);
      }

      // 6. Ràng buộc Mason: nếu có mason thì số lượng phải >= 2
      const masonCount = generated.roles.filter((rId) => rId === 'mason').length;
      if (masonCount > 0) {
        expect(masonCount).toBeGreaterThanOrEqual(2);
      }

      // 7. Nếu isSingleDevice === true thì không được chứa bất kỳ vai multiDevice nào
      if (isSingleDevice) {
        expect(generated.isMultiDeviceOnly).toBe(false);
        for (const rId of generated.roles) {
          expect(Boolean(ROLES_BY_ID[rId]?.multiDeviceOnly)).toBe(false);
        }
      }

      // 8. Tự động suy ra isMultiDeviceOnly khớp với hàm kiểm tra
      expect(generated.isMultiDeviceOnly).toBe(isPresetMultiDeviceOnly(generated.roles));
    }
  });

  it('should auto-include seer when preferredRoleIds contains sorcerer or apprentice_seer', () => {
    const deck1 = generateDynamicBalancedDeck({
      playerCount: 8,
      preferredRoleIds: ['sorcerer'],
    });
    expect(deck1.roles.includes('sorcerer')).toBe(true);
    expect(deck1.roles.includes('seer')).toBe(true);

    const deck2 = generateDynamicBalancedDeck({
      playerCount: 8,
      preferredRoleIds: ['apprentice_seer'],
    });
    expect(deck2.roles.includes('apprentice_seer')).toBe(true);
    expect(deck2.roles.includes('seer')).toBe(true);
  });

  it('should ensure mason count is at least 2 when preferredRoleIds contains a single mason', () => {
    const deck = generateDynamicBalancedDeck({
      playerCount: 8,
      preferredRoleIds: ['mason'],
    });
    const masonCount = deck.roles.filter((id) => id === 'mason').length;
    expect(masonCount).toBeGreaterThanOrEqual(2);
  });
});
