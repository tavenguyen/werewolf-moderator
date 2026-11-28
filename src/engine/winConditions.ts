import { isBitingWolf, ROLES_BY_ID } from './roles';
import type { GameState, PlayerState, WinOutcome } from './types';

/**
 * Kiểm tra xem cặp đôi Cupid có phải là cặp đôi khác phe (Third Party) hay không.
 * Nếu cùng phe (2 Dân hoặc 2 Sói), họ giữ nguyên phe gốc và thắng theo phe gốc.
 * Nếu khác phe (Dân + Sói, Dân + Phe thứ ba, v.v.), họ tách thành Phe Thứ 3
 * và chỉ thắng khi là đúng 2 người sống sót cuối cùng trên bàn.
 */
export function isCrossFactionCouple(p1: PlayerState, p2: PlayerState): boolean {
  return p1.faction !== p2.faction;
}

/**
 * Gắn thêm Du côn (Hoodlum) vào danh sách thắng ké nếu đủ điều kiện:
 * - Phe thắng phải là 1 trong 3 phe chính: VILLAGER, WEREWOLF, hoặc COUPLE.
 * - Du côn còn sống và cả 2 mục tiêu trong hoodlumTargetIds đều đã chết.
 * - Tuyệt đối không thắng ké vai độc tôn (ANGEL, TANNER, WHITE_WOLF) hay DRAW.
 */
function attachHoodlumWin(outcome: WinOutcome, state: GameState): WinOutcome {
  if (
    outcome.winner !== 'VILLAGER' &&
    outcome.winner !== 'WEREWOLF' &&
    outcome.winner !== 'COUPLE'
  ) {
    return outcome;
  }

  const updatedWinners = [...outcome.winningPlayerIds];
  let updatedReason = outcome.reason;

  const livingHoodlums = state.players.filter((p) => p.isAlive && p.roleId === 'hoodlum');
  for (const hl of livingHoodlums) {
    if (!hl.hoodlumTargetIds || hl.hoodlumTargetIds.length < 2) continue;
    const [t1Id, t2Id] = hl.hoodlumTargetIds;
    const t1 = state.players.find((p) => p.id === t1Id);
    const t2 = state.players.find((p) => p.id === t2Id);

    if (t1 && t2 && !t1.isAlive && !t2.isAlive) {
      if (!updatedWinners.includes(hl.id)) {
        updatedWinners.push(hl.id);
      }
      updatedReason += ` Du côn (${hl.name}) đã hoàn thành mục tiêu thanh toán và cùng giành chiến thắng!`;
    }
  }

  return {
    ...outcome,
    winningPlayerIds: updatedWinners,
    reason: updatedReason,
  };
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

  // 1. Thiên sứ (Angel) bị Sói cắn Đêm 1 hoặc treo cổ Ngày 1 (roundNumber === 1)
  const angelFirstCycleWin = state.deaths.find(
    (d) =>
      d.roleId === 'angel' &&
      d.roundNumber === 1 &&
      (d.cause === 'VILLAGE_VOTE' || d.cause === 'WOLF_PACK')
  );
  if (angelFirstCycleWin) {
    const angelPlayer = state.players.find((p) => p.id === angelFirstCycleWin.playerId);
    const angelName = angelPlayer?.name ?? 'Thiên sứ';
    const reason =
      angelFirstCycleWin.cause === 'WOLF_PACK'
        ? `Thiên sứ (${angelName}) đã bị bầy Sói cắn chết ngay trong Đêm 1 và giành chiến thắng độc tôn!`
        : `Thiên sứ (${angelName}) đã bị dân làng bỏ phiếu treo cổ ngay trong Ngày 1 và giành chiến thắng độc tôn!`;

    return {
      winner: 'ANGEL',
      reason,
      winningPlayerIds: [angelFirstCycleWin.playerId],
    };
  }

  // 2. Kẻ chán đời (Tanner) bị treo cổ ban ngày (VILLAGE_VOTE)
  const tannerHanged = state.deaths.find(
    (d) => d.roleId === 'tanner' && d.cause === 'VILLAGE_VOTE'
  );
  if (tannerHanged) {
    return {
      winner: 'TANNER',
      reason: 'Kẻ chán đời đã bị cả làng đưa lên giàn treo cổ và giành chiến thắng độc tôn!',
      winningPlayerIds: [tannerHanged.playerId],
    };
  }

  // 3. Cả bàn cùng chết sạch -> Hòa cả làng (DRAW)
  if (alivePlayers.length === 0) {
    return {
      winner: 'DRAW',
      reason: 'Không còn ai sống sót sau đêm đẫm máu. Kết quả Hòa cho tất cả!',
      winningPlayerIds: [],
    };
  }

  // 4. Người thổi sáo (Pied Piper) thôi miên toàn bộ người chơi còn sống khác
  const livingPiedPiper = alivePlayers.find((p) => p.roleId === 'pied_piper');
  if (livingPiedPiper) {
    const otherAlive = alivePlayers.filter((p) => p.id !== livingPiedPiper.id);
    if (otherAlive.every((p) => p.isEnchanted === true)) {
      return {
        winner: 'PIED_PIPER',
        reason: 'Toàn bộ dân làng còn sống đã say đắm trong khúc nhạc mê hoặc. Người thổi sáo giành chiến thắng độc tôn!',
        winningPlayerIds: [livingPiedPiper.id],
      };
    }
  }

  // 5. Trưởng giáo phái (Cult Leader) kết nạp toàn bộ người chơi còn sống khác
  const livingCultLeader = alivePlayers.find((p) => p.roleId === 'cult_leader');
  if (livingCultLeader) {
    const otherAlive = alivePlayers.filter((p) => p.id !== livingCultLeader.id);
    if (otherAlive.every((p) => p.isCultMember === true)) {
      return {
        winner: 'CULT_LEADER',
        reason: 'Ánh sáng giáo phái đã quy phục toàn bộ người còn sống. Trưởng giáo phái giành chiến thắng độc tôn!',
        winningPlayerIds: [livingCultLeader.id],
      };
    }
  }

  // Deadlock Fallback: Chỉ còn đúng 2 người sống là Sói cô đơn và Sói trắng -> Sói trắng thắng độc tôn
  if (alivePlayers.length === 2) {
    const hasLoneWolf = alivePlayers.some((p) => p.roleId === 'lone_wolf');
    const hasWhiteWolf = alivePlayers.some((p) => p.roleId === 'white_wolf');
    if (hasLoneWolf && hasWhiteWolf) {
      const whiteWolf = alivePlayers.find((p) => p.roleId === 'white_wolf')!;
      return {
        winner: 'WHITE_WOLF',
        reason: 'Sói trắng và Sói cô đơn là 2 kẻ sống sót cuối cùng. Với nanh vuốt vượt trội, Sói trắng hạ gục đối thủ và giành chiến thắng độc tôn!',
        winningPlayerIds: [whiteWolf.id],
      };
    }
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

  // 3. Cặp đôi khác phe (Lover Couple) là đúng 2 người sống sót cuối cùng (hoặc cùng Du côn đã hoàn thành mục tiêu)
  if (hasLivingCrossFactionCouple) {
    const nonCoupleAlive = alivePlayers.filter((p) => !livingCouple.some((c) => c.id === p.id));
    const isOnlyLivingCoupleOrEligibleHoodlum =
      nonCoupleAlive.length === 0 ||
      nonCoupleAlive.every(
        (p) =>
          p.roleId === 'hoodlum' &&
          p.hoodlumTargetIds &&
          p.hoodlumTargetIds.length === 2 &&
          p.hoodlumTargetIds.every((tId) => state.players.find((pl) => pl.id === tId && !pl.isAlive))
      );

    if (isOnlyLivingCoupleOrEligibleHoodlum) {
      const [p1, p2] = livingCouple;
      return attachHoodlumWin(
        {
          winner: 'COUPLE',
          reason: 'Tình yêu vượt qua mọi ranh giới thù hận! Cặp đôi định mệnh là những người sống sót cuối cùng trên bàn đấu!',
          winningPlayerIds: [p1.id, p2.id],
        },
        state
      );
    }
  }

  // 4. Sói cô đơn (Lone Wolf) / Sói trắng (White Wolf) sống sót duy nhất (aliveCount === 1)
  if (alivePlayers.length === 1 && alivePlayers[0].roleId === 'lone_wolf') {
    return {
      winner: 'LONE_WOLF',
      reason: 'Sói cô đơn đã tiêu diệt toàn bộ dân làng lẫn đồng loại để trở thành kẻ sống sót duy nhất!',
      winningPlayerIds: [alivePlayers[0].id],
    };
  }

  const whiteWolfAlive = alivePlayers.some((p) => p.roleId === 'white_wolf');
  if (alivePlayers.length === 1 && alivePlayers[0].roleId === 'white_wolf') {
    return {
      winner: 'WHITE_WOLF',
      reason: 'Sói trắng đã hạ gục cả dân làng lẫn đồng loại trong đêm tối và là kẻ sống sót duy nhất!',
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
  if (whiteWolfAlive) {
    return null;
  }

  if (hasLivingCrossFactionCouple) {
    // Kiểm tra Deadlock Cặp đôi khác phe vs Dân khi đã hết sạch Sói, Sáo, Giáo phái và sát thương/biến đổi đêm:
    // Giữ trận tiếp tục nếu còn Angel Ngày 1, Drunk sắp tỉnh ở Đêm 3 mang vai nguy hiểm, Tanner/Hoodlum phá vỡ thế cân bằng,
    // hoặc một phía đạt > N/2 phiếu. Nếu không ai còn quyền vote hoặc cả 2 phía đều <= N/2 dưới MAJORITY -> Hòa.
    if (activeWolves.length === 0 && !livingPiedPiper && !livingCultLeader) {
      const hasWitchPoison =
        alivePlayers.some((p) => p.roleId === 'witch') &&
        !state.witchPoisonUsed &&
        !state.villagePowerStripped;
      const hasPendingDelayedDeath = alivePlayers.some(
        (p) =>
          Boolean(p.infectedWithTetanus) ||
          (p.roleId === 'tough_guy' && typeof p.toughGuyBittenNight === 'number')
      );
      const hasRound1Angel =
        state.roundNumber === 1 && alivePlayers.some((p) => p.roleId === 'angel');
      const hasWakingDrunkBeforeNight3 =
        state.roundNumber < 3 &&
        alivePlayers.some((p) => {
          if (p.roleId !== 'drunk' || !p.drunkRealRoleId) return false;
          if (p.drunkRealRoleId === 'witch') {
            return !state.witchPoisonUsed && !state.villagePowerStripped;
          }
          if (p.drunkRealRoleId === 'pied_piper' || p.drunkRealRoleId === 'cult_leader') {
            return true;
          }
          const realDef = ROLES_BY_ID[p.drunkRealRoleId];
          return realDef ? isBitingWolf({ faction: realDef.faction, roleId: realDef.id }) : false;
        });

      if (
        !hasWitchPoison &&
        !hasPendingDelayedDeath &&
        !hasRound1Angel &&
        !hasWakingDrunkBeforeNight3
      ) {
        const nonCoupleAlive = alivePlayers.filter(
          (p) => !livingCouple.some((c) => c.id === p.id)
        );
        const coupleWeight = livingCouple.reduce((s, p) => s + p.voteWeight, 0);
        const nonCoupleWeight = nonCoupleAlive.reduce((s, p) => s + p.voteWeight, 0);
        const totalWeight = coupleWeight + nonCoupleWeight;
        const majorityLine = alivePlayers.length / 2;

        const nonCoupleHoodlumWeight = nonCoupleAlive
          .filter((p) => p.roleId === 'hoodlum')
          .reduce((s, p) => s + p.voteWeight, 0);
        const hasHoodlumBreakCoalition = coupleWeight + nonCoupleHoodlumWeight > majorityLine;
        const hasTannerCoalition = alivePlayers.some((p) => {
          if (p.roleId !== 'tanner' || p.voteWeight <= 0) return false;
          const isTannerInCouple = livingCouple.some((c) => c.id === p.id);
          return (isTannerInCouple ? nonCoupleWeight : coupleWeight) + p.voteWeight > majorityLine;
        });

        if (
          totalWeight === 0 ||
          (state.settings.lynchThreshold === 'MAJORITY' &&
            coupleWeight <= majorityLine &&
            nonCoupleWeight <= majorityLine &&
            !hasHoodlumBreakCoalition &&
            !hasTannerCoalition)
        ) {
          return {
            winner: 'DRAW',
            reason:
              'Không còn sát thương đêm và không phe nào đủ trọng số phiếu quá bán để loại Cặp đôi khác phe. Kết quả Hòa!',
            winningPlayerIds: [],
          };
        }
      }
    }
    return null;
  }

  // 5. Phe Dân làng thắng: Toàn bộ Ma sói có khả năng cắn đã chết
  // (Minion và Sorcerer không thể cắn; khi Sói thật chết hết, Dân thắng ngay)
  if (activeWolves.length === 0 && totalVillagers.length > 0) {
    const winners = state.players.filter((p) => p.faction === 'VILLAGER').map((p) => p.id);
    return attachHoodlumWin(
      {
        winner: 'VILLAGER',
        reason: 'Bóng đêm đã bị đẩy lùi! Toàn bộ Ma Sói bị tiêu diệt, phe Dân làng bảo vệ thành công sự bình yên của ngôi làng!',
        winningPlayerIds: winners,
      },
      state
    );
  }

  // 6. Phe Ma sói thắng: Số Sói cắn >= Số người không phải Sói còn sống (và ít nhất 1 Sói cắn còn sống)
  const livingNonWolves = alivePlayers.filter(
    (p) => p.faction !== 'WEREWOLF' && p.roleId !== 'white_wolf'
  );
  if (activeWolves.length >= livingNonWolves.length && activeWolves.length > 0) {
    // Sói cô đơn (Lone Wolf): Nếu chỉ còn 1 Sói cô đơn sống và vẫn còn Dân sống,
    // hoãn kết thúc ván (trả về null) để bước tiếp vào ban đêm cho Sói cô đơn cắn nốt dân làng nhằm đạt chiến thắng độc tôn.
    if (
      activeWolves.length === 1 &&
      activeWolves[0].roleId === 'lone_wolf' &&
      livingNonWolves.length > 0
    ) {
      return null;
    }

    // Toàn bộ phe Sói (kể cả Minion, Sorcerer dù còn sống hay đã chết) đều thắng cùng bầy
    const winners = state.players.filter((p) => p.faction === 'WEREWOLF').map((p) => p.id);
    return attachHoodlumWin(
      {
        winner: 'WEREWOLF',
        reason: 'Ma Sói đã áp đảo số lượng Dân làng.',
        winningPlayerIds: winners,
      },
      state
    );
  }

  // 7. Deadlock Check: Không còn Sói săn đêm, Dân làng, Người thổi sáo hay Trưởng giáo phái nào sống sót
  // (ví dụ chỉ còn Minion / Sorcerer / Hoodlum / Tanner sau các cái chết dây chuyền -> không phe chính nào thắng được) -> Hòa (DRAW),
  // trừ Thiên sứ còn trong Ngày 1 (chờ hóa Dân) hoặc Tanner tự đủ phiếu quá bán (ví dụ giữ Trưởng làng 2/3 phiếu).
  if (
    activeWolves.length === 0 &&
    totalVillagers.length === 0 &&
    !livingPiedPiper &&
    !livingCultLeader
  ) {
    const canAngelStillTurnVillagerOnDay1 =
      state.roundNumber === 1 && alivePlayers.some((p) => p.roleId === 'angel');
    const canTannerSelfLynchUnderMajority =
      alivePlayers.length >= 2 &&
      alivePlayers.some((p) => p.roleId === 'tanner' && p.voteWeight > alivePlayers.length / 2);

    if (!canAngelStillTurnVillagerOnDay1 && !canTannerSelfLynchUnderMajority) {
      return {
        winner: 'DRAW',
        reason: 'Không còn Ma Sói săn đêm hay Dân làng sống sót để phân định chiến thắng. Kết quả Hòa!',
        winningPlayerIds: [],
      };
    }
  }

  return null;
}
