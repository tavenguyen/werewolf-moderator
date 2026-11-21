import { describe, expect, it } from 'bun:test';
import { getSmartPreset, SMART_PRESETS, validateRoleList } from '../presets';
import { calculateBalanceScore, isMvpRole, ROLES_BY_ID } from '../roles';

describe('Engine - Smart Presets (6–16 players)', () => {
  it('should define deterministic presets for every player count from 6 to 16', () => {
    for (let count = 6; count <= 16; count++) {
      const preset = getSmartPreset(count);
      expect(preset).not.toBeNull();
      expect(preset!.playerCount).toBe(count);
      expect(preset!.roles.length).toBe(count);

      // Mọi role trong preset đều thuộc 16 role MVP và có implementedInEngine === true
      for (const roleId of preset!.roles) {
        expect(isMvpRole(roleId)).toBe(true);
        expect(ROLES_BY_ID[roleId]?.implementedInEngine).toBe(true);
      }

      // Điểm cân bằng phải khớp với calculateBalanceScore và nằm trong khoảng cân bằng [-4, +4]
      const calculatedScore = calculateBalanceScore(preset!.roles);
      expect(preset!.balanceScore).toBe(calculatedScore);
      expect(Math.abs(calculatedScore)).toBeLessThanOrEqual(4);
    }
  });

  it('should return null for counts outside [6, 16]', () => {
    expect(getSmartPreset(5)).toBeNull();
    expect(getSmartPreset(17)).toBeNull();
    expect(getSmartPreset(0)).toBeNull();
  });

  it('should validate role lists correctly', () => {
    const valid6 = SMART_PRESETS[6].roles;
    expect(validateRoleList(valid6).isValid).toBe(true);

    // Dưới 6 người
    expect(validateRoleList(['werewolf', 'seer']).isValid).toBe(false);

    // Chứa role chưa implement trong engine (ví dụ: tough_guy hoặc cursed)
    expect(
      validateRoleList(['tough_guy', 'werewolf', 'seer', 'witch', 'villager', 'villager']).isValid
    ).toBe(false);
  });
});
