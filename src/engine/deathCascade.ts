import type { DeathCause, DeathRecord, GameState, PlayerId } from './types';
import { findClockwiseAliveWolf } from './seating';

export interface DeathInput {
  playerId: PlayerId;
  cause: DeathCause;
}

/**
 * Xử lý chuỗi tử vong liên hoàn (Death Cascade Pipeline):
 * - Hàng đợi ổn định, chống xử lý lặp lại một người.
 * - Giải quyết triệt để Cặp đôi Cupid, Sói con, Sói chiêm bao, Già làng, Thợ săn và Trưởng làng.
 */
export function processDeathCascade(
  state: GameState,
  initialDeaths: DeathInput[],
  currentDepth: number = 0
): DeathRecord[] {
  const resolvedRecords: DeathRecord[] = [];
  const processedPlayerIds = new Set<PlayerId>();
  const pendingQueue: Array<{ playerId: PlayerId; cause: DeathCause; depth: number }> =
    initialDeaths.map((d) => ({ ...d, depth: currentDepth }));

  while (pendingQueue.length > 0) {
    const next = pendingQueue.shift()!;
    if (processedPlayerIds.has(next.playerId)) {
      continue;
    }

    const victim = state.players.find((p) => p.id === next.playerId);
    if (!victim || !victim.isAlive) {
      continue;
    }

    // 1. Đánh dấu chết và thêm vào danh sách đã xử lý
    victim.isAlive = false;
    processedPlayerIds.add(victim.id);

    const record: DeathRecord = {
      playerId: victim.id,
      roleId: victim.roleId,
      roundNumber: state.roundNumber,
      phase: state.phase,
      cause: next.cause,
      cascadeDepth: next.depth,
    };

    state.deaths.push(record);
    resolvedRecords.push(record);

    // 2. Chuỗi Cặp đôi Cupid chết chùm (Lovers Heartbreak)
    if (victim.loverId) {
      const partner = state.players.find((p) => p.id === victim.loverId);
      if (partner && partner.isAlive && !processedPlayerIds.has(partner.id)) {
        pendingQueue.push({
          playerId: partner.id,
          cause: 'COUPLE_HEARTBREAK',
          depth: next.depth + 1,
        });
      }
    }

    // 3. Sói con chết (Wolf Cub) -> Đêm tiếp theo bầy Sói được cắn 2 người
    if (victim.roleId === 'wolf_cub') {
      state.wolfCubDoubleKillNextNight = true;
      state.historyLogs.push('Sói con đã chết. Đêm tiếp theo bầy Sói được cắn 2 người!');
    }

    // 4. Kích hoạt Sói chiêm bao thức tỉnh (Dream Wolf)
    if (victim.faction === 'WEREWOLF' && victim.roleId !== 'dream_wolf') {
      const dreamWolf = state.players.find((p) => p.roleId === 'dream_wolf' && p.isAlive);
      if (dreamWolf && !state.dreamWolfAwakened) {
        state.dreamWolfAwakened = true;
        state.historyLogs.push('Một Ma sói đã ngã xuống; thế lực bóng đêm đang âm thầm trỗi dậy.');
      }
    }

    // 5. Già làng bị loại bởi bất kỳ nguyên nhân nào ngoài Sói cắn -> Toàn bộ phe Dân mất kỹ năng
    // (Bao gồm treo cổ, trúng độc, Thợ săn bắn, Sói trắng ám sát, hoặc chết chùm theo người yêu)
    if (victim.roleId === 'elder' && next.cause !== 'WOLF_PACK') {
      state.villagePowerStripped = true;
      state.historyLogs.push(
        'Già làng đã chết oan! Toàn bộ vai trò đặc biệt của phe Dân làng bị tước đoạt năng lực!'
      );
    }

    // 6. Thợ săn chết (Hunter) -> Mở lượt nổ súng
    if (victim.roleId === 'hunter') {
      state.pendingHunterShotPlayerId = victim.id;
      state.historyLogs.push(`Thợ săn (${victim.name}) đã gục xuống và chuẩn bị nổ phát súng sau cùng!`);
    }

    // 7. Trưởng làng chết (Mayor) -> Mở 10s truyền danh hiệu kế nhiệm
    if (state.mayorId === victim.id) {
      state.pendingMayorSuccessionPlayerId = victim.id;
      state.mayorId = null;
      state.historyLogs.push(`Trưởng làng (${victim.name}) đã qua đời và có cơ hội truyền lại danh hiệu!`);
    }

    // 8. Đứa con hoang (Wild Child): mất thần tượng -> biến thành Ma sói ngay lập tức
    for (const wc of state.players) {
      if (
        wc.isAlive &&
        (wc.roleId === 'wild_child' || wc.initialRoleId === 'wild_child') &&
        wc.faction !== 'WEREWOLF' &&
        wc.roleModelId === victim.id
      ) {
        wc.faction = 'WEREWOLF';
        wc.roleId = 'werewolf';
        state.historyLogs.push(`Đứa con hoang (${wc.name}) mất đi thần tượng và đã biến thành Ma sói!`);
      }
    }

    // 9. Sói tuyết (Dire Wolf): nếu người chết là bạn đồng hành -> Sói tuyết chết theo vì đau lòng
    for (const dw of state.players) {
      if (
        (dw.roleId === 'dire_wolf' || dw.initialRoleId === 'dire_wolf') &&
        dw.isAlive &&
        dw.companionId === victim.id
      ) {
        if (!processedPlayerIds.has(dw.id)) {
          pendingQueue.push({
            playerId: dw.id,
            cause: 'COMPANION_DEATH',
            depth: next.depth + 1,
          });
        }
      }
    }

    if (victim.roleId === 'rusty_knight' && next.cause === 'WOLF_PACK') {
      const infectedWolf = findClockwiseAliveWolf(state.players, victim.id);
      if (infectedWolf) {
        infectedWolf.infectedWithTetanus = true;
        infectedWolf.tetanusInfectionRound = state.roundNumber;
        state.historyLogs.push(
          'Kỵ sĩ gỉ sắt đã dùng thanh gươm gỉ gây vết thương nhiễm trùng cho một Ma sói!'
        );
      }
    }
  }

  return resolvedRecords;
}
