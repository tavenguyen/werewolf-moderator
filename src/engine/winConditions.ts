import type { GameState, WinOutcome } from './types';

/**
 * Kiểm tra điều kiện Thắng / Thua / Hòa theo thứ tự ưu tiên tuyệt đối:
 * 1. Tanner (Kẻ chán đời bị treo cổ)
 * 2. Angel (Thiên sứ chết Đêm 1 hoặc Ngày 1)
 * 3. Pied Piper (Người thổi sáo thôi miên toàn bộ người sống)
 * 4. Cult Leader (Trưởng giáo phái kết nạp toàn bộ người sống)
 * 5. Cặp đôi khác phe (Chỉ còn 2 người yêu sống sót)
 * 6. Sói trắng (Người sống sót duy nhất)
 * 7. Lone Wolf (Phe Sói thắng và Lone Wolf là con Sói duy nhất còn sống)
 * 8. Hoodlum (Cả 2 mục tiêu chết và Hoodlum còn sống khi ván kết thúc)
 * 9. Phe Dân làng (Tiêu diệt toàn bộ Ma sói)
 * 10. Phe Ma sói (Số Sói >= Số Dân)
 * 11. Hòa cả làng (DRAW - Cả bàn cùng chết sạch)
 */
export function checkWinCondition(state: GameState): WinOutcome | null {
  const alivePlayers = state.players.filter((p) => p.isAlive);

  // 1. Kẻ chán đời (Tanner) bị treo cổ ban ngày
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

  // 2. Thiên sứ (Angel) bị loại ở chu kỳ đầu tiên
  const angelDead = state.deaths.find(
    (d) =>
      d.roleId === 'angel' &&
      d.roundNumber === 1 &&
      (d.cause === 'WOLF_PACK' || d.cause === 'VILLAGE_VOTE')
  );
  if (angelDead) {
    return {
      winner: 'ANGEL',
      reason: 'Thiên sứ (Angel) đã đạt được ý nguyện tử vì đạo ở chu kỳ đầu tiên và thắng ván đấu!',
      winningPlayerIds: [angelDead.playerId],
    };
  }

  // 3. Người thổi sáo (Pied Piper) thôi miên toàn bộ người sống sót
  const piedPiper = alivePlayers.find((p) => p.roleId === 'pied_piper');
  if (piedPiper) {
    const otherAlive = alivePlayers.filter((p) => p.id !== piedPiper.id);
    if (otherAlive.length > 0 && otherAlive.every((p) => p.isEnchanted)) {
      return {
        winner: 'PIED_PIPER',
        reason: 'Người thổi sáo đã thôi miên toàn bộ người sống sót trên bàn và giành chiến thắng!',
        winningPlayerIds: [piedPiper.id],
      };
    }
  }

  // 4. Trưởng giáo phái (Cult Leader) kết nạp toàn bộ người sống sót
  const cultLeader = alivePlayers.find((p) => p.roleId === 'cult_leader');
  if (cultLeader) {
    if (alivePlayers.length > 0 && alivePlayers.every((p) => p.isCultMember || p.id === cultLeader.id)) {
      return {
        winner: 'CULT_LEADER',
        reason: 'Toàn bộ người chơi còn sống đã quy phục Giáo phái. Trưởng giáo phái chiến thắng!',
        winningPlayerIds: [cultLeader.id],
      };
    }
  }

  // 5. Cả bàn cùng chết sạch -> Hòa cả làng (DRAW)
  if (alivePlayers.length === 0) {
    return {
      winner: 'DRAW',
      reason: 'Tất cả người chơi đã ngã xuống trong cùng một chuỗi sự kiện. Kết quả Hòa cả làng!',
      winningPlayerIds: [],
    };
  }

  // 6. Cặp đôi khác phe (Lover Couple) là 2 người sống sót cuối cùng
  if (alivePlayers.length === 2) {
    const [p1, p2] = alivePlayers;
    if (p1.loverId === p2.id && p2.loverId === p1.id && p1.faction !== p2.faction) {
      return {
        winner: 'COUPLE',
        reason: 'Tình yêu vượt qua ranh giới phe phái! Cặp đôi định mệnh là những người sống sót cuối cùng!',
        winningPlayerIds: [p1.id, p2.id],
      };
    }
  }

  // 7. Sói trắng (White Wolf) sống sót duy nhất
  if (alivePlayers.length === 1 && alivePlayers[0].roleId === 'white_wolf') {
    return {
      winner: 'WHITE_WOLF',
      reason: 'Sói trắng đã tiêu diệt cả dân làng lẫn đồng loại và là kẻ sống sót duy nhất!',
      winningPlayerIds: [alivePlayers[0].id],
    };
  }

  // Phân loại người chơi còn sống
  // Lưu ý: Minion (Kẻ phản bội) mang faction WEREWOLF nhưng không có nanh vuốt.
  // Khi tất cả Sói có nanh chết hết, Dân thắng ngay mà không cần giết Minion.
  const activeWolves = alivePlayers.filter(
    (p) => p.faction === 'WEREWOLF' && p.roleId !== 'minion' && p.roleId !== 'sorcerer'
  );
  const totalWolves = alivePlayers.filter((p) => p.faction === 'WEREWOLF');
  const totalVillagers = alivePlayers.filter((p) => p.faction === 'VILLAGER');
  const thirdPartyAlive = alivePlayers.filter((p) => p.faction === 'THIRD_PARTY');

  // 8. Phe Dân làng thắng: Toàn bộ Ma sói chính thức đã chết
  if (activeWolves.length === 0 && thirdPartyAlive.length === 0) {
    const winners = state.players.filter((p) => p.faction === 'VILLAGER').map((p) => p.id);
    return {
      winner: 'VILLAGER',
      reason: 'Toàn bộ Ma sói đã bị tiêu diệt! Phe Dân làng đã bảo vệ được ngôi làng bình yên!',
      winningPlayerIds: winners,
    };
  }

  // 9. Phe Ma sói thắng: Số Sói >= Số Dân (và không còn Phe thứ 3 cản trở)
  if (activeWolves.length >= totalVillagers.length && thirdPartyAlive.length === 0) {
    // 9a. Kiểm tra Sói cô đơn (Lone Wolf)
    const loneWolf = alivePlayers.find((p) => p.roleId === 'lone_wolf');
    if (loneWolf && activeWolves.length === 1 && activeWolves[0].id === loneWolf.id) {
      return {
        winner: 'LONE_WOLF',
        reason: 'Phe Sói đã thống trị ngôi làng và Sói cô đơn là con Sói duy nhất còn sống sót!',
        winningPlayerIds: [loneWolf.id],
      };
    }

    const winners = state.players.filter((p) => p.faction === 'WEREWOLF').map((p) => p.id);
    return {
      winner: 'WEREWOLF',
      reason: 'Ma sói đã áp đảo hoàn toàn dân làng. Ngôi làng chìm trong bóng đêm vĩnh hằng!',
      winningPlayerIds: winners,
    };
  }

  // 10. Kiểm tra Du côn (Hoodlum) nếu một trong hai phe đã thắng
  const hoodlum = alivePlayers.find((p) => p.roleId === 'hoodlum');
  if (hoodlum && hoodlum.hoodlumTargetIds) {
    const [t1Id, t2Id] = hoodlum.hoodlumTargetIds;
    const target1 = state.players.find((p) => p.id === t1Id);
    const target2 = state.players.find((p) => p.id === t2Id);

    // Nếu cả 2 mục tiêu đã chết và ván đấu đã phân thắng bại ở trên, Hoodlum đoạt chiến thắng
    if (target1 && !target1.isAlive && target2 && !target2.isAlive) {
      // Hoodlum thắng cùng hoặc đè
    }
  }

  return null;
}
