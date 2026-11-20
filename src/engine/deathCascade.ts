import type { DeathCause, DeathRecord, GameState, PlayerId } from './types';
import { findClockwiseAliveWolf } from './seating';

export interface DeathInput {
  playerId: PlayerId;
  cause: DeathCause;
}

/**
 * Xử lý chuỗi tử vong liên hoàn (Death Cascade Pipeline):
 * Đảm bảo giải quyết triệt để Cặp đôi, Sói tuyết, Thợ săn, Sói con,
 * Già làng, Kỵ sĩ gỉ sắt và Biến đổi trước khi kiểm tra điều kiện thắng.
 */
export function processDeathCascade(
  state: GameState,
  initialDeaths: DeathInput[],
  currentDepth: number = 0
): DeathRecord[] {
  const resolvedRecords: DeathRecord[] = [];
  const pendingQueue: Array<{ playerId: PlayerId; cause: DeathCause; depth: number }> =
    initialDeaths.map((d) => ({ ...d, depth: currentDepth }));

  while (pendingQueue.length > 0) {
    const next = pendingQueue.shift()!;
    const victim = state.players.find((p) => p.id === next.playerId);

    if (!victim || !victim.isAlive) {
      continue;
    }

    // 1. Đánh dấu chết
    victim.isAlive = false;

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

    // 2. Chuỗi Cặp đôi Cupid chết chùm (Lovers Suicide)
    if (victim.loverId) {
      const partner = state.players.find((p) => p.id === victim.loverId);
      if (partner && partner.isAlive) {
        pendingQueue.push({
          playerId: partner.id,
          cause: 'COUPLE_HEARTBREAK',
          depth: next.depth + 1,
        });
      }
    }

    // 3. Chuỗi Sói tuyết chết theo Bạn đồng hành (Dire Wolf Companion Bond)
    const direWolf = state.players.find(
      (p) => p.roleId === 'dire_wolf' && p.isAlive && p.companionId === victim.id
    );
    if (direWolf) {
      pendingQueue.push({
        playerId: direWolf.id,
        cause: 'COMPANION_DEATH',
        depth: next.depth + 1,
      });
    }

    // 4. Kích hoạt Sói con chết (Wolf Cub) -> Đêm sau cắn 2 người
    if (victim.roleId === 'wolf_cub') {
      state.wolfCubDoubleKillNextNight = true;
      state.historyLogs.push(`Sói con (${victim.name}) đã chết. Đêm tiếp theo bầy Sói được cắn 2 người!`);
    }

    // 5. Kích hoạt Sói chiêm bao thức tỉnh (Dream Wolf)
    if (victim.faction === 'WEREWOLF' && victim.roleId !== 'dream_wolf') {
      const dreamWolf = state.players.find((p) => p.roleId === 'dream_wolf' && p.isAlive);
      if (dreamWolf && !state.dreamWolfAwakened) {
        state.dreamWolfAwakened = true;
        state.historyLogs.push(`Một Ma sói đã chết. Sói chiêm bao (${dreamWolf.name}) đã thức tỉnh!`);
      }
    }

    // 6. Kích hoạt Đứa con hoang hóa Sói (Wild Child)
    const wildChild = state.players.find(
      (p) => p.roleId === 'wild_child' && p.isAlive && p.roleModelId === victim.id
    );
    if (wildChild) {
      wildChild.faction = 'WEREWOLF';
      state.historyLogs.push(
        `Hình mẫu của Đứa con hoang (${victim.name}) đã chết. Đứa con hoang (${wildChild.name}) đã hóa Ma sói!`
      );
    }

    // 7. Kế thừa Nhân bản (Doppelganger)
    const doppel = state.players.find(
      (p) => p.roleId === 'doppelganger' && p.isAlive && p.doppelgangerTargetId === victim.id
    );
    if (doppel) {
      doppel.roleId = victim.roleId;
      doppel.faction = victim.faction;
      state.historyLogs.push(
        `Bản sao (${victim.name}) đã chết. Nhân bản (${doppel.name}) kế thừa vai trò [${victim.roleId}]!`
      );
    }

    // 8. Già làng bị loại bởi phe Dân (Treo cổ / Độc / Thợ săn bắn) -> Phạt mất năng lực
    if (
      victim.roleId === 'elder' &&
      (next.cause === 'VILLAGE_VOTE' || next.cause === 'WITCH_POISON' || next.cause === 'HUNTER_SHOT')
    ) {
      state.villagePowerStripped = true;
      state.historyLogs.push(
        `Già làng (${victim.name}) bị giết bởi phe Dân! Toàn bộ phe Dân bị tước đoạt năng lực!`
      );
    }

    // 9. Kỵ sĩ gỉ sắt lây nhiễm uốn ván cho Sói (Rusty Knight)
    if (victim.roleId === 'rusty_knight' && next.cause === 'WOLF_PACK') {
      const infectedWolf = findClockwiseAliveWolf(state.players, victim.id);
      if (infectedWolf) {
        infectedWolf.infectedWithTetanus = true;
        state.historyLogs.push(
          `Kỵ sĩ gỉ sắt bị Sói cắn. Con Sói (${infectedWolf.name}) bên trái bị nhiễm uốn ván, sẽ chết vào đêm sau!`
        );
      }
    }

    // 10. Đánh dấu Thợ săn cần nổ súng (Hunter)
    if (victim.roleId === 'hunter') {
      state.pendingHunterShotPlayerId = victim.id;
      state.historyLogs.push(`Thợ săn (${victim.name}) đã gục xuống và chuẩn bị nổ phát súng sau cùng!`);
    }
  }

  return resolvedRecords;
}
