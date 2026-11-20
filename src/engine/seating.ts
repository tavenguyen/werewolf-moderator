import type { PlayerState } from './types';

/**
 * Tìm 2 người hàng xóm CÒN SỐNG ngồi sát bên (trái và phải) theo sơ đồ ghế tròn.
 * Tự động bỏ qua các ghế đã chết.
 * Dùng cho: P.I. (pi), Con cáo (fox), Gấu thuần hóa (bear_tamer).
 */
export function getAliveNeighbors<T extends { id: string; seatIndex: number; isAlive: boolean }>(
  players: T[],
  centerPlayerId: string
): { left: T; right: T; group: T[] } | null {
  const alivePlayers = players
    .filter((p) => p.isAlive)
    .sort((a, b) => a.seatIndex - b.seatIndex);

  if (alivePlayers.length < 2) return null;

  const centerIndex = alivePlayers.findIndex((p) => p.id === centerPlayerId);
  if (centerIndex === -1) return null;

  const totalAlive = alivePlayers.length;
  const leftIndex = (centerIndex - 1 + totalAlive) % totalAlive;
  const rightIndex = (centerIndex + 1) % totalAlive;

  const center = alivePlayers[centerIndex];
  const left = alivePlayers[leftIndex];
  const right = alivePlayers[rightIndex];

  // Nếu chỉ có 2 người sống, left và right là cùng 1 người
  const group = totalAlive === 2 ? [center, left] : [left, center, right];

  return { left, right, group };
}

/**
 * Tìm con Ma sói CÒN SỐNG ngồi gần nhất theo chiều kim đồng hồ (bên tay trái).
 * Dùng cho hiệu ứng lây nhiễm uốn ván của Kỵ sĩ gỉ sắt (Rusty Knight).
 */
export function findClockwiseAliveWolf(
  players: PlayerState[],
  startPlayerId: string
): PlayerState | null {
  const alivePlayers = players
    .filter((p) => p.isAlive)
    .sort((a, b) => a.seatIndex - b.seatIndex);

  if (alivePlayers.length === 0) return null;

  const startIndex = alivePlayers.findIndex((p) => p.id === startPlayerId);
  if (startIndex === -1) {
    // Nếu người bắt đầu đã chết, tìm theo seatIndex gốc trên toàn bộ danh sách
    const startPlayer = players.find((p) => p.id === startPlayerId);
    if (!startPlayer) return null;

    // Tìm người còn sống có seatIndex lớn hơn gần nhất
    const sortedAlive = [...alivePlayers].sort((a, b) => a.seatIndex - b.seatIndex);
    const nextHigher = sortedAlive.find((p) => p.seatIndex > startPlayer.seatIndex);
    const firstCandidate = nextHigher ?? sortedAlive[0];
    const candIndex = alivePlayers.indexOf(firstCandidate);

    for (let i = 0; i < alivePlayers.length; i++) {
      const idx = (candIndex + i) % alivePlayers.length;
      const p = alivePlayers[idx];
      if (p.faction === 'WEREWOLF') {
        return p;
      }
    }
    return null;
  }

  // Duyệt theo chiều kim đồng hồ bắt đầu từ người kế tiếp
  for (let i = 1; i < alivePlayers.length; i++) {
    const idx = (startIndex + i) % alivePlayers.length;
    const p = alivePlayers[idx];
    if (p.faction === 'WEREWOLF') {
      return p;
    }
  }

  return null;
}
