import type { GameState, PlayerState, WinOutcome } from './types';

/**
 * Kiểm tra xem cặp đôi Cupid có phải là cặp đôi khác phe (Third Party) hay không.
 * Nếu cùng phe (2 Dân hoặc 2 Sói), họ giữ nguyên phe gốc và thắng theo phe gốc.
 * Nếu khác phe (Dân + Sói, Dân + Phe thứ ba, v.v.), họ tách thành Phe Thứ 3
 * và chỉ thắng khi là đúng 2 người sống sót cuối cùng trên bàn.
 */
export function isCrossFactionCouple(p1: PlayerState, p2: PlayerState): boolean {
  if (p1.isCrossFactionCouple !== undefined) return p1.isCrossFactionCouple;
  return p1.faction !== p2.faction;
}

/**
 * Kiểm tra điều kiện Thắng / Thua / Hòa theo thứ tự ưu tiên tuyệt đối:
 * 1. Kẻ chán đời (Tanner) bị treo cổ ban ngày.
 * 2. Cả bàn cùng chết sạch trong chuỗi -> Hòa (DRAW).
 * 3. Cặp đôi khác phe (Lover Couple) là đúng 2 người sống sót cuối cùng.
 * 4. Sói trắng (White Wolf) là người sống sót duy nhất (aliveCount === 1).
 * 5. Phe Dân làng thắng (toàn bộ Ma sói bị tiêu diệt, và KHÔNG còn Sói trắng hay cặp đôi khác phe).
 * 6. Phe Ma sói thắng (số Sói cắn >= số Dân, và KHÔNG còn Sói trắng hay cặp đôi khác phe).
 */
export function checkWinCondition(state: GameState): WinOutcome | null {
  const alivePlayers = state.players.filter((p) => p.isAlive);

  // 1. Kẻ chán đời (Tanner) bị treo cổ ban ngày (VILLAGE_VOTE)
  const tannerHanged = state.deaths.find(
    (d) => d.roleId === 'tanner' && d.cause === 'VILLAGE_VOTE'
  );
  if (tannerHanged) {
    return {
      winner: 'TANNER',
      reason: 'Kẻ chán đời (Tanner) đã bị cả làng bỏ phiếu treo cổ và giành chiến thắng độc tôn!',
      winningPlayerIds: [tannerHanged.playerId],
    };
  }

  // 2. Cả bàn cùng chết sạch -> Hòa cả làng (DRAW)
  if (alivePlayers.length === 0) {
    return {
      winner: 'DRAW',
      reason: 'Tất cả người chơi đã ngã xuống trong cùng một chuỗi sự kiện. Kết quả Hòa cả làng!',
      winningPlayerIds: [],
    };
  }

  // Kiểm tra sự tồn tại của cặp đôi khác phe còn sống
  const livingCouple = alivePlayers.filter((p) => p.loverId);
  let hasLivingCrossFactionCouple = false;
  if (livingCouple.length === 2) {
    const [c1, c2] = livingCouple;
    if (c1.loverId === c2.id && c2.loverId === c1.id && isCrossFactionCouple(c1, c2)) {
      hasLivingCrossFactionCouple = true;
    }
  }

  // 3. Cặp đôi khác phe (Lover Couple) là đúng 2 người sống sót cuối cùng
  if (alivePlayers.length === 2 && hasLivingCrossFactionCouple) {
    const [p1, p2] = alivePlayers;
    return {
      winner: 'COUPLE',
      reason: 'Tình yêu vượt qua ranh giới phe phái! Cặp đôi định mệnh là những người sống sót cuối cùng!',
      winningPlayerIds: [p1.id, p2.id],
    };
  }

  // 4. Sói trắng (White Wolf) sống sót duy nhất (aliveCount === 1)
  const whiteWolfAlive = alivePlayers.some((p) => p.roleId === 'white_wolf');
  if (alivePlayers.length === 1 && alivePlayers[0].roleId === 'white_wolf') {
    return {
      winner: 'WHITE_WOLF',
      reason: 'Sói trắng đã tiêu diệt cả dân làng lẫn đồng loại và là kẻ sống sót duy nhất!',
      winningPlayerIds: [alivePlayers[0].id],
    };
  }

  // Phân loại người chơi còn sống:
  // - activeWolves: Sói có khả năng cắn (không tính Minion và Sorcerer)
  // - totalWolves: toàn bộ người chơi phe WEREWOLF
  // - totalVillagers: người chơi phe VILLAGER
  const activeWolves = alivePlayers.filter(
    (p) => p.faction === 'WEREWOLF' && p.roleId !== 'minion' && p.roleId !== 'sorcerer'
  );
  const totalVillagers = alivePlayers.filter((p) => p.faction === 'VILLAGER');

  // Chừng nào Sói trắng còn sống hoặc còn Cặp đôi khác phe sống cản trở,
  // cả phe Dân lẫn phe Sói thường đều CHƯA thể thắng!
  if (whiteWolfAlive || hasLivingCrossFactionCouple) {
    return null;
  }

  // 5. Phe Dân làng thắng: Toàn bộ Ma sói có khả năng cắn đã chết
  // (Minion và Sorcerer không thể cắn; khi Sói thật chết hết, Dân thắng ngay)
  if (activeWolves.length === 0 && totalVillagers.length > 0) {
    const winners = state.players.filter((p) => p.faction === 'VILLAGER').map((p) => p.id);
    return {
      winner: 'VILLAGER',
      reason: 'Toàn bộ Ma sói đã bị tiêu diệt! Phe Dân làng đã bảo vệ được ngôi làng bình yên!',
      winningPlayerIds: winners,
    };
  }

  // 6. Phe Ma sói thắng: Số Sói cắn >= Số Dân (và ít nhất 1 Sói cắn còn sống)
  if (activeWolves.length >= totalVillagers.length && activeWolves.length > 0) {
    // Toàn bộ phe Sói (kể cả Minion, Sorcerer dù còn sống hay đã chết) đều thắng cùng bầy
    const winners = state.players.filter((p) => p.faction === 'WEREWOLF').map((p) => p.id);
    return {
      winner: 'WEREWOLF',
      reason: 'Ma sói đã áp đảo hoàn toàn dân làng. Ngôi làng chìm trong bóng đêm vĩnh hằng!',
      winningPlayerIds: winners,
    };
  }

  return null;
}
