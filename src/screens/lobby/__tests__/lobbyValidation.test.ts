import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_INITIAL_ROLES,
  computeDeckMetrics,
  convertSelectionToRoleIds,
  type RoleSelectionMap,
} from '../lobbyValidation';
import type { PublicPlayerView } from '../../../server/types';

function createMockPlayers(count: number): PublicPlayerView[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p_${i + 1}`,
    name: `Player ${i + 1}`,
    seatIndex: i + 1,
    isAlive: true,
    isConnected: true,
    voteWeight: 1,
    isMayor: false,
  }));
}

describe('lobbyValidation - Deck & Balance Computation', () => {
  it('tính toán chính xác cấu hình khởi tạo mặc định 6 lá với balanceScore = 0', () => {
    const players = createMockPlayers(6);
    const metrics = computeDeckMetrics(DEFAULT_INITIAL_ROLES, players, true);

    expect(metrics.totalCards).toBe(6);
    expect(metrics.wolvesCount).toBe(2);
    expect(metrics.villagersCount).toBe(4); // 2 villagers + 1 seer + 1 bodyguard
    expect(metrics.thirdPartyCount).toBe(0);
    expect(metrics.balanceScore).toBe(0); // 2*(-6) + 7 + 3 + 2*(1) = 0
    expect(metrics.balanceStatus).toBe('BALANCED');
    expect(metrics.hasAtLeastOneWolf).toBe(true);
    expect(metrics.isValidCardCount).toBe(true);
    expect(metrics.isReadyToStart).toBe(true);
    expect(metrics.statusType).toBe('success');
  });

  it('xác định chính xác các ngưỡng cân bằng [-2, +2], > +2, < -2', () => {
    const players = createMockPlayers(8);

    // Nghiêng Dân > +2: 1 Sói (-6) + 1 Tiên tri (+7) + 1 Bảo vệ (+3) + 5 Dân (+5) = +9
    const villageHeavy: RoleSelectionMap = {
      werewolf: 1,
      seer: 1,
      bodyguard: 1,
      villager: 5,
    };
    const m1 = computeDeckMetrics(villageHeavy, players, true);
    expect(m1.balanceScore).toBe(9);
    expect(m1.balanceStatus).toBe('LEAN_VILLAGE');

    // Nghiêng Sói < -2: 3 Sói (-18) + 1 Sói con (-8) + 1 Tiên tri (+7) + 3 Dân (+3) = -16
    const wolfHeavy: RoleSelectionMap = {
      werewolf: 3,
      wolf_cub: 1,
      seer: 1,
      villager: 3,
    };
    const m2 = computeDeckMetrics(wolfHeavy, players, true);
    expect(m2.balanceScore).toBe(-16);
    expect(m2.balanceStatus).toBe('LEAN_WOLF');

    // Cân bằng tại biên +2 và -2
    // balance = +2: 2 Sói (-12) + 1 Tiên tri (+7) + 1 Phù thủy (+4) + 3 Dân (+3) = +2
    const balancedPlus2: RoleSelectionMap = {
      werewolf: 2,
      seer: 1,
      witch: 1,
      villager: 3,
    };
    const m3 = computeDeckMetrics(balancedPlus2, createMockPlayers(7), true);
    expect(m3.balanceScore).toBe(2);
    expect(m3.balanceStatus).toBe('BALANCED');

    // balance = -2: 2 Sói (-12) + 1 Tiên tri (+7) + 3 Dân (+3) = -2
    const balancedMinus2: RoleSelectionMap = {
      werewolf: 2,
      seer: 1,
      villager: 3,
    };
    const m4 = computeDeckMetrics(balancedMinus2, createMockPlayers(6), true);
    expect(m4.balanceScore).toBe(-2);
    expect(m4.balanceStatus).toBe('BALANCED');
  });

  it('từ chối bắt đầu khi không có lá Sói săn đêm nào (kể cả khi có Minion hoặc Sorcerer)', () => {
    // Chỉ có Minion (phe Sói nhưng không săn đêm)
    const onlyMinionRoles: RoleSelectionMap = {
      minion: 1,
      seer: 1,
      bodyguard: 1,
      witch: 1,
      villager: 3,
    };
    const metrics1 = computeDeckMetrics(onlyMinionRoles, createMockPlayers(7), true);

    expect(metrics1.wolvesCount).toBe(1);
    expect(metrics1.nightHuntingWolvesCount).toBe(0);
    expect(metrics1.hasNightHuntingWolf).toBe(false);
    expect(metrics1.isReadyToStart).toBe(false);
    expect(metrics1.statusType).toBe('error');
    expect(metrics1.statusMessage).toContain('Bắt buộc phải có ít nhất 1 Sói săn đêm');

    // Có Sói con (wolf_cub) hợp lệ
    const cubRoles: RoleSelectionMap = {
      wolf_cub: 1,
      seer: 1,
      bodyguard: 1,
      villager: 3,
    };
    const metrics2 = computeDeckMetrics(cubRoles, createMockPlayers(6), true);
    expect(metrics2.nightHuntingWolvesCount).toBe(1);
    expect(metrics2.hasNightHuntingWolf).toBe(true);
    expect(metrics2.isReadyToStart).toBe(true);
  });

  it('từ chối bắt đầu và cảnh báo khi số bài lệch với số người chơi thật', () => {
    // 6 lá bài nhưng chỉ có 5 người
    const m1 = computeDeckMetrics(DEFAULT_INITIAL_ROLES, createMockPlayers(5), true);
    expect(m1.isReadyToStart).toBe(false);
    expect(m1.statusType).toBe('warning');
    expect(m1.statusMessage).toContain('Cần tối thiểu 6 người chơi');

    // 6 lá bài nhưng có 8 người
    const m2 = computeDeckMetrics(DEFAULT_INITIAL_ROLES, createMockPlayers(8), true);
    expect(m2.isReadyToStart).toBe(false);
    expect(m2.playerCardDiff).toBe(2);
    expect(m2.statusMessage).toContain('Đang có 8 người chơi nhưng mới chọn 6 lá bài');

    // 8 lá bài nhưng chỉ có 6 người
    const eightCards: RoleSelectionMap = {
      ...DEFAULT_INITIAL_ROLES,
      villager: 4,
    };
    const m3 = computeDeckMetrics(eightCards, createMockPlayers(6), true);
    expect(m3.isReadyToStart).toBe(false);
    expect(m3.playerCardDiff).toBe(-2);
    expect(m3.statusMessage).toContain('Đang chọn 8 lá bài nhưng mới có 6 người chơi');
  });

  it('chuyển đổi chuẩn xác RoleSelectionMap thành danh sách roleIds phẳng', () => {
    const selected: RoleSelectionMap = {
      werewolf: 2,
      seer: 1,
      villager: 3,
    };
    const roleIds = convertSelectionToRoleIds(selected);
    expect(roleIds.length).toBe(6);
    expect(roleIds.filter((id) => id === 'werewolf').length).toBe(2);
    expect(roleIds.filter((id) => id === 'seer').length).toBe(1);
    expect(roleIds.filter((id) => id === 'villager').length).toBe(3);
  });
});
