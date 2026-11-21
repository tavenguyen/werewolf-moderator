import { calculateBalanceScore, isMvpRole, type MvpRoleId } from './roles';

export interface SmartPreset {
  playerCount: number;
  roles: MvpRoleId[];
  balanceScore: number;
}

export const SMART_PRESETS: Record<number, SmartPreset> = {
  6: {
    playerCount: 6,
    roles: ['werewolf', 'dream_wolf', 'seer', 'witch', 'villager', 'villager'],
    balanceScore: 2,
  },
  7: {
    playerCount: 7,
    roles: ['werewolf', 'minion', 'seer', 'bodyguard', 'hunter', 'villager', 'villager'],
    balanceScore: 3,
  },
  8: {
    playerCount: 8,
    roles: ['werewolf', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager', 'villager', 'tanner'],
    balanceScore: 2,
  },
  9: {
    playerCount: 9,
    roles: ['werewolf', 'werewolf', 'seer', 'bodyguard', 'witch', 'hunter', 'cupid', 'lycan', 'villager'],
    balanceScore: 2,
  },
  10: {
    playerCount: 10,
    roles: ['werewolf', 'werewolf', 'dream_wolf', 'seer', 'bodyguard', 'witch', 'hunter', 'elder', 'tanner', 'villager'],
    balanceScore: 3,
  },
  11: {
    playerCount: 11,
    roles: ['werewolf', 'werewolf', 'wolf_cub', 'sorcerer', 'seer', 'bodyguard', 'witch', 'hunter', 'elder', 'village_idiot', 'villager'],
    balanceScore: 1,
  },
  12: {
    playerCount: 12,
    roles: ['werewolf', 'werewolf', 'white_wolf', 'seer', 'bodyguard', 'witch', 'hunter', 'elder', 'cupid', 'village_idiot', 'villager', 'villager'],
    balanceScore: 1,
  },
  13: {
    playerCount: 13,
    roles: ['werewolf', 'werewolf', 'wolf_cub', 'sorcerer', 'seer', 'bodyguard', 'witch', 'hunter', 'elder', 'cupid', 'village_idiot', 'villager', 'villager'],
    balanceScore: -1,
  },
  14: {
    playerCount: 14,
    roles: ['werewolf', 'werewolf', 'white_wolf', 'seer', 'bodyguard', 'witch', 'hunter', 'elder', 'cupid', 'village_idiot', 'lycan', 'villager', 'villager', 'villager'],
    balanceScore: 1,
  },
  15: {
    playerCount: 15,
    roles: ['werewolf', 'werewolf', 'wolf_cub', 'minion', 'seer', 'bodyguard', 'witch', 'hunter', 'elder', 'cupid', 'village_idiot', 'villager', 'villager', 'villager', 'villager'],
    balanceScore: -2,
  },
  16: {
    playerCount: 16,
    roles: ['werewolf', 'werewolf', 'dream_wolf', 'white_wolf', 'seer', 'bodyguard', 'witch', 'hunter', 'elder', 'cupid', 'village_idiot', 'villager', 'villager', 'villager', 'villager', 'villager'],
    balanceScore: -1,
  },
};

export function getSmartPreset(playerCount: number): SmartPreset | null {
  if (playerCount < 6 || playerCount > 16) return null;
  return SMART_PRESETS[playerCount] ?? null;
}

export function validateRoleList(roleIds: string[]): { isValid: boolean; reason?: string } {
  if (roleIds.length < 6 || roleIds.length > 16) {
    return { isValid: false, reason: `Số người chơi phải từ 6 đến 16 (hiện tại: ${roleIds.length})` };
  }

  for (const roleId of roleIds) {
    if (!isMvpRole(roleId)) {
      return { isValid: false, reason: `Vai trò [${roleId}] chưa được hỗ trợ trong engine MVP` };
    }
  }

  return { isValid: true };
}
