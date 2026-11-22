import { ROLES, ROLES_BY_ID, type Faction, type RolePack } from '../../engine/roles';
import { getSmartPreset } from '../../engine/presets';
import type { PublicPlayerView } from '../../server/types';

export type RoleSelectionMap = Record<string, number>;

export const DEFAULT_INITIAL_ROLES: RoleSelectionMap = {
  werewolf: 2,
  seer: 1,
  bodyguard: 1,
  villager: 2,
};

export type BalanceStatus = 'BALANCED' | 'LEAN_VILLAGE' | 'LEAN_WOLF';

export const NIGHT_HUNTING_WOLF_IDS = [
  'werewolf',
  'wolf_cub',
  'dream_wolf',
  'lone_wolf',
  'big_bad_wolf',
  'wolf_accursed',
  'dire_wolf',
  'white_wolf',
] as const;

export const MUTUALLY_EXCLUSIVE_ROLES: [string, string][] = [
  ['lone_wolf', 'white_wolf'],
];

export interface DeckMetrics {
  totalCards: number;
  wolvesCount: number;
  nightHuntingWolvesCount: number;
  villagersCount: number;
  thirdPartyCount: number;
  balanceScore: number;
  balanceStatus: BalanceStatus;
  balanceLabel: string;
  hasAtLeastOneWolf: boolean;
  hasNightHuntingWolf: boolean;
  isValidCardCount: boolean; // 6 <= totalCards <= 16
  realPlayersCount: number;
  playerCardDiff: number; // realPlayersCount - totalCards
  isReadyToStart: boolean;
  statusMessage: string;
  statusType: 'success' | 'warning' | 'error';
}

export function computeDeckMetrics(
  selectedRoles: RoleSelectionMap,
  players: PublicPlayerView[],
  _isHostPlayer: boolean
): DeckMetrics {
  let totalCards = 0;
  let wolvesCount = 0;
  let nightHuntingWolvesCount = 0;
  let villagersCount = 0;
  let thirdPartyCount = 0;
  let balanceScore = 0;

  for (const [roleId, count] of Object.entries(selectedRoles)) {
    if (!count || count <= 0) continue;
    const roleDef = ROLES_BY_ID[roleId];
    if (!roleDef) continue;

    totalCards += count;
    balanceScore += roleDef.balanceWeight * count;

    if (roleDef.faction === 'WEREWOLF') {
      wolvesCount += count;
      if ((NIGHT_HUNTING_WOLF_IDS as readonly string[]).includes(roleId)) {
        nightHuntingWolvesCount += count;
      }
    } else if (roleDef.faction === 'VILLAGER') {
      villagersCount += count;
    } else {
      thirdPartyCount += count;
      if ((NIGHT_HUNTING_WOLF_IDS as readonly string[]).includes(roleId)) {
        nightHuntingWolvesCount += count;
      }
    }
  }

  let balanceStatus: BalanceStatus = 'BALANCED';
  let balanceLabel = 'Cân bằng';
  if (balanceScore > 2) {
    balanceStatus = 'LEAN_VILLAGE';
    balanceLabel = `Nghiêng phe Dân (+${balanceScore})`;
  } else if (balanceScore < -2) {
    balanceStatus = 'LEAN_WOLF';
    balanceLabel = `Nghiêng phe Sói (${balanceScore})`;
  } else {
    balanceStatus = 'BALANCED';
    balanceLabel = balanceScore === 0 ? 'Cân bằng tuyệt đối (0)' : `Cân bằng (${balanceScore > 0 ? `+${balanceScore}` : balanceScore})`;
  }

  const hasNightHuntingWolf = nightHuntingWolvesCount >= 1;
  const isValidCardCount = totalCards >= 6 && totalCards <= 16;
  const realPlayersCount = players.length;
  const playerCardDiff = realPlayersCount - totalCards;

  let isReadyToStart = false;
  let statusMessage = '';
  let statusType: 'success' | 'warning' | 'error' = 'warning';

  // Kiểm tra vai xung khắc (Mutually exclusive roles)
  const conflictingPair = MUTUALLY_EXCLUSIVE_ROLES.find(
    ([r1, r2]) => (selectedRoles[r1] ?? 0) > 0 && (selectedRoles[r2] ?? 0) > 0
  );

  if (!isValidCardCount) {
    statusType = 'error';
    if (totalCards < 6) {
      statusMessage = `Cần chọn tối thiểu 6 lá bài (hiện có ${totalCards} lá).`;
    } else {
      statusMessage = `Tổng số lá bài không được vượt quá 16 lá (hiện có ${totalCards} lá).`;
    }
  } else if (conflictingPair) {
    statusType = 'error';
    const r1Name = ROLES_BY_ID[conflictingPair[0]]?.nameVi ?? conflictingPair[0];
    const r2Name = ROLES_BY_ID[conflictingPair[1]]?.nameVi ?? conflictingPair[1];
    statusMessage = `Không thể chọn đồng thời ${r1Name} và ${r2Name} trong cùng một bộ bài.`;
  } else if (!hasNightHuntingWolf) {
    statusType = 'error';
    statusMessage = 'Bắt buộc phải có ít nhất 1 Sói săn đêm (Ma sói, Sói con hoặc Sói chiêm bao).';
  } else if (realPlayersCount < 6) {
    statusType = 'warning';
    statusMessage = `Cần tối thiểu 6 người chơi để bắt đầu (hiện có ${realPlayersCount} người).`;
  } else if (playerCardDiff < 0) {
    statusType = 'warning';
    const missing = Math.abs(playerCardDiff);
    statusMessage = `Đang chọn ${totalCards} lá bài nhưng mới có ${realPlayersCount} người chơi (Cần thêm ${missing} người hoặc bớt bài).`;
  } else if (playerCardDiff > 0) {
    statusType = 'warning';
    statusMessage = `Đang có ${realPlayersCount} người chơi nhưng mới chọn ${totalCards} lá bài (Cần chọn thêm ${playerCardDiff} lá bài).`;
  } else {
    isReadyToStart = true;
    statusType = 'success';
    statusMessage = `✓ Khớp số lượng (${realPlayersCount} người chơi — ${totalCards} lá bài). Bàn chơi đã sẵn sàng khai màn!`;
  }

  return {
    totalCards,
    wolvesCount,
    nightHuntingWolvesCount,
    villagersCount,
    thirdPartyCount,
    balanceScore,
    balanceStatus,
    balanceLabel,
    hasAtLeastOneWolf: wolvesCount >= 1,
    hasNightHuntingWolf,
    isValidCardCount,
    realPlayersCount,
    playerCardDiff,
    isReadyToStart,
    statusMessage,
    statusType,
  };
}

export function convertSelectionToRoleIds(selectedRoles: RoleSelectionMap): string[] {
  const roleIds: string[] = [];
  for (const [roleId, count] of Object.entries(selectedRoles)) {
    for (let i = 0; i < count; i++) {
      roleIds.push(roleId);
    }
  }
  return roleIds;
}

export function getPackLabel(pack: RolePack): string {
  switch (pack) {
    case 'BASIC':
      return 'Cơ bản';
    case 'DEDUCTION':
      return 'Suy luận';
    case 'CHAOS':
      return 'Mở rộng';
    default:
      return pack;
  }
}

export function getFactionLabel(faction: Faction): string {
  switch (faction) {
    case 'WEREWOLF':
      return 'Phe Ma Sói';
    case 'VILLAGER':
      return 'Phe Dân Làng';
    case 'THIRD_PARTY':
      return 'Phe Thứ Ba';
    default:
      return faction;
  }
}

export function formatDeckSummaryText(metrics: DeckMetrics): string {
  const parts = [`${metrics.totalCards} lá`, `Sói ${metrics.wolvesCount}`, `Dân ${metrics.villagersCount}`];
  if (metrics.thirdPartyCount > 0) {
    parts.push(`Thứ 3 ${metrics.thirdPartyCount}`);
  }
  let balText = '';
  if (metrics.balanceScore === 0) {
    balText = 'Cân bằng (0)';
  } else if (metrics.balanceStatus === 'BALANCED') {
    balText = `Cân bằng (${metrics.balanceScore > 0 ? `+${metrics.balanceScore}` : metrics.balanceScore})`;
  } else if (metrics.balanceStatus === 'LEAN_VILLAGE') {
    balText = `Nghiêng Dân (+${metrics.balanceScore})`;
  } else {
    balText = `Nghiêng Sói (${metrics.balanceScore})`;
  }
  parts.push(balText);
  return parts.join(' · ');
}

export function removeVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function getPresetRoleSelection(playerCount: number): RoleSelectionMap {
  const count = Math.max(6, Math.min(16, playerCount));
  const preset = getSmartPreset(count);
  if (!preset) return { ...DEFAULT_INITIAL_ROLES };
  const map: RoleSelectionMap = {};
  for (const rId of preset.roles) {
    map[rId] = (map[rId] ?? 0) + 1;
  }
  return map;
}
