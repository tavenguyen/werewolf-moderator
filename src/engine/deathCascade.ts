import { appendMatchEvent, resolveFollowupEventStage, snapshotPlayer } from './matchLog';
import { ROLES_BY_ID } from './roles';
import { findClockwiseAliveWolf } from './seating';
import type {
  DeathCause,
  DeathRecord,
  EventParticipantSnapshot,
  GameState,
  MatchLogStage,
  MatchLogVisibility,
  PlayerId,
} from './types';

export interface DeathInput {
  playerId: PlayerId;
  cause: DeathCause;
  parentEventId?: string | null;
  causePlayerSnapshot?: EventParticipantSnapshot | null;
}

function getCascadeContext(
  state: GameState,
  cause: DeathCause,
  parentEventId?: string | null
): { stage: MatchLogStage; visibility: MatchLogVisibility } {
  if (
    cause === 'EMERGENCY_ELIMINATE' ||
    state.phase === 'DAY_VOTE' ||
    state.phase === 'DAY_DISCUSS' ||
    state.phase === 'DAY_RUNOFF' ||
    state.phase === 'DAY_MAYOR_ELECTION'
  ) {
    return { stage: 'DAY_VOTE', visibility: 'PUBLIC' };
  }

  if (state.phase === 'HUNTER_SHOT') {
    const stage = resolveFollowupEventStage(
      state,
      state.previousPhaseBeforeHunter,
      parentEventId
    );
    return {
      stage,
      visibility: 'PUBLIC',
    };
  }

  return { stage: 'NIGHT', visibility: 'SECRET_NIGHT' };
}

function queuePendingHunter(
  state: GameState,
  hunterId: PlayerId,
  deathEventId?: string | null
): void {
  if (!state.pendingHunterQueue) {
    state.pendingHunterQueue = state.pendingHunterShotPlayerId
      ? [state.pendingHunterShotPlayerId]
      : [];
  }
  if (!state.pendingHunterQueue.includes(hunterId)) {
    state.pendingHunterQueue.push(hunterId);
  }
  state.pendingHunterShotPlayerId = state.pendingHunterQueue[0] ?? null;

  if (deathEventId) {
    if (!state.pendingHunterDeathEventIds) {
      state.pendingHunterDeathEventIds = {};
    }
    state.pendingHunterDeathEventIds[hunterId] = deathEventId;
  }
}

/**
 * Xử lý chuỗi tử vong liên hoàn (Death Cascade Pipeline):
 * - Hàng đợi ổn định, chống xử lý lặp lại một người.
 * - Giải quyết triệt để Cặp đôi Cupid, Sói con, Sói chiêm bao, Già làng, Thợ săn (queue nhiều Thợ săn),
 *   Trưởng làng, Đứa con hoang, Sói tuyết, Kỵ sĩ gỉ sắt, Người thổi sáo, Trưởng giáo phái và Nhân bản.
 */
export function processDeathCascade(
  state: GameState,
  initialDeaths: DeathInput[],
  currentDepth: number = 0
): DeathRecord[] {
  const resolvedRecords: DeathRecord[] = [];
  const processedPlayerIds = new Set<PlayerId>();
  const pendingQueue: Array<{
    playerId: PlayerId;
    cause: DeathCause;
    depth: number;
    parentEventId?: string | null;
    causePlayerSnapshot?: EventParticipantSnapshot | null;
  }> = initialDeaths.map((d) => ({ ...d, depth: currentDepth }));

  while (pendingQueue.length > 0) {
    const next = pendingQueue.shift()!;
    if (processedPlayerIds.has(next.playerId)) {
      continue;
    }

    const victim = state.players.find((p) => p.id === next.playerId);
    if (!victim || !victim.isAlive) {
      continue;
    }

    const { stage: cascadeStage, visibility: cascadeVisibility } = getCascadeContext(
      state,
      next.cause,
      next.parentEventId
    );

    // 1. Đánh dấu chết và thêm vào danh sách đã xử lý
    victim.isAlive = false;
    processedPlayerIds.add(victim.id);
    const victimSnap = snapshotPlayer(victim);

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

    let deathCauseEventId: string | null = next.parentEventId ?? null;
    if (next.cause === 'COUPLE_HEARTBREAK' || next.cause === 'COMPANION_DEATH') {
      const cascadeEvt = appendMatchEvent(state, {
        roundNumber: state.roundNumber,
        stage: cascadeStage,
        actionType: 'CASCADE_DEATH',
        visibility: cascadeVisibility,
        actor: next.causePlayerSnapshot ?? null,
        targets: [victimSnap],
        outcome: 'SUCCESS',
        parentEventId: next.parentEventId ?? null,
        metadata: {
          cascadeCause: next.cause,
        },
      });
      deathCauseEventId = cascadeEvt.id;
    }

    // 2. Chuỗi Cặp đôi Cupid chết chùm (Lovers Heartbreak)
    if (victim.loverId) {
      const partner = state.players.find((p) => p.id === victim.loverId);
      if (partner && partner.isAlive && !processedPlayerIds.has(partner.id)) {
        pendingQueue.push({
          playerId: partner.id,
          cause: 'COUPLE_HEARTBREAK',
          depth: next.depth + 1,
          parentEventId: deathCauseEventId,
          causePlayerSnapshot: victimSnap,
        });
      }
    }

    // 3. Sói con chết (Wolf Cub) -> Đêm tiếp theo bầy Sói được cắn 2 người
    if (victim.roleId === 'wolf_cub') {
      state.wolfCubDoubleKillNextNight = true;
      state.historyLogs.push('Sói con đã chết. Đêm tiếp theo bầy Sói được cắn 2 người!');
      appendMatchEvent(state, {
        roundNumber: state.roundNumber,
        stage: cascadeStage,
        actionType: 'WOLF_CUB_ENRAGE',
        visibility: 'SECRET_NIGHT',
        actor: victimSnap,
        targets: [],
        outcome: 'SUCCESS',
        parentEventId: deathCauseEventId,
      });
    }

    // 4. Kích hoạt Sói chiêm bao thức tỉnh (Dream Wolf)
    if (victim.faction === 'WEREWOLF' && victim.roleId !== 'dream_wolf') {
      const dreamWolf = state.players.find((p) => p.roleId === 'dream_wolf' && p.isAlive);
      if (dreamWolf && !state.dreamWolfAwakened) {
        state.dreamWolfAwakened = true;
        state.historyLogs.push('Một Ma sói đã ngã xuống; thế lực bóng đêm đang âm thầm trỗi dậy.');
        appendMatchEvent(state, {
          roundNumber: state.roundNumber,
          stage: cascadeStage,
          actionType: 'DREAM_WOLF_AWAKEN',
          visibility: 'SECRET_NIGHT',
          actor: snapshotPlayer(dreamWolf),
          targets: [victimSnap],
          outcome: 'SUCCESS',
          parentEventId: deathCauseEventId,
        });
      }
    }

    // 5. Già làng bị loại bởi nguyên nhân ngoài Sói cắn & ngoài Trục xuất khẩn cấp -> Dân mất kỹ năng
    if (
      victim.roleId === 'elder' &&
      next.cause !== 'WOLF_PACK' &&
      next.cause !== 'EMERGENCY_ELIMINATE'
    ) {
      state.villagePowerStripped = true;
      state.historyLogs.push(
        'Già làng đã chết oan! Toàn bộ vai trò đặc biệt của phe Dân làng bị tước đoạt năng lực!'
      );
      appendMatchEvent(state, {
        roundNumber: state.roundNumber,
        stage: cascadeStage,
        actionType: 'ELDER_CURSE_VILLAGE',
        visibility: 'SECRET_NIGHT',
        actor: victimSnap,
        targets: [],
        outcome: 'LOST_POWER',
        parentEventId: deathCauseEventId,
      });
    }

    // 6. Thợ săn chết (Hunter) -> Đưa vào hàng đợi nổ súng
    if (victim.roleId === 'hunter') {
      if (victim.initialRoleId === 'doppelganger' && next.cause === 'HUNTER_SHOT') {
        state.historyLogs.push(
          `Nhân bản (${victim.name}) bị Thợ săn bắn chết và không được nổ phát súng thứ 2!`
        );
        appendMatchEvent(state, {
          roundNumber: state.roundNumber,
          stage: cascadeStage,
          actionType: 'HUNTER_SHOT',
          visibility: 'SECRET_NIGHT',
          actor: victimSnap,
          targets: [],
          outcome: 'NO_EFFECT',
          parentEventId: deathCauseEventId,
          metadata: { noShotReason: 'DOPPELGANGER_HUNTER_BY_HUNTER' },
        });
      } else if (next.cause === 'WITCH_POISON' && state.settings.hunterShootsOnPoison === false) {
        state.historyLogs.push(
          `Thợ săn (${victim.name}) chết vì trúng độc của Phù thủy trong giấc ngủ và không thể nổ súng!`
        );
        appendMatchEvent(state, {
          roundNumber: state.roundNumber,
          stage: cascadeStage,
          actionType: 'HUNTER_SHOT',
          visibility: 'SECRET_NIGHT',
          actor: victimSnap,
          targets: [],
          outcome: 'NO_EFFECT',
          parentEventId: deathCauseEventId,
          metadata: { noShotReason: 'POISON_BLOCKED' },
        });
      } else {
        queuePendingHunter(state, victim.id, deathCauseEventId);
        state.historyLogs.push(
          `Thợ săn (${victim.name}) đã gục xuống và chuẩn bị nổ phát súng sau cùng!`
        );
      }
    }

    // 7. Trưởng làng chết (Mayor) -> Mở 10s truyền danh hiệu kế nhiệm
    if (state.mayorId === victim.id) {
      state.pendingMayorSuccessionPlayerId = victim.id;
      if (deathCauseEventId) {
        if (!state.pendingMayorDeathEventIds) {
          state.pendingMayorDeathEventIds = {};
        }
        state.pendingMayorDeathEventIds[victim.id] = deathCauseEventId;
      }
      state.mayorId = null;
      state.historyLogs.push(
        `Trưởng làng (${victim.name}) đã qua đời và có cơ hội truyền lại danh hiệu!`
      );
    }

    // 8. Đứa con hoang (Wild Child): mất thần tượng -> biến thành Ma sói ngay lập tức
    for (const wc of state.players) {
      if (
        wc.isAlive &&
        (wc.roleId === 'wild_child' || wc.initialRoleId === 'wild_child') &&
        wc.faction !== 'WEREWOLF' &&
        wc.roleModelId === victim.id
      ) {
        const oldSnap = snapshotPlayer(wc);
        wc.faction = 'WEREWOLF';
        wc.roleId = 'werewolf';
        state.historyLogs.push(
          `Đứa con hoang (${wc.name}) mất đi thần tượng và đã biến thành Ma sói!`
        );
        appendMatchEvent(state, {
          roundNumber: state.roundNumber,
          stage: cascadeStage,
          actionType: 'WILD_CHILD_TURN',
          visibility: 'SECRET_NIGHT',
          actor: oldSnap,
          targets: [victimSnap],
          outcome: 'SUCCESS',
          parentEventId: deathCauseEventId,
          metadata: {
            roleChange: {
              oldRoleId: oldSnap.roleId,
              newRoleId: 'werewolf',
              oldFaction: oldSnap.faction,
              newFaction: 'WEREWOLF',
            },
          },
        });
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
            parentEventId: deathCauseEventId,
            causePlayerSnapshot: victimSnap,
          });
        }
      }
    }

    // 9b. Kỵ sĩ gỉ sắt (Rusty Knight): chết do Sói cắn -> lây nhiễm con Sói gần nhất theo chiều kim đồng hồ
    if (victim.roleId === 'rusty_knight' && next.cause === 'WOLF_PACK') {
      const infectedWolf = findClockwiseAliveWolf(state.players, victim.id);
      if (infectedWolf) {
        infectedWolf.infectedWithTetanus = true;
        infectedWolf.tetanusInfectionRound = state.roundNumber;
        state.historyLogs.push(
          'Kỵ sĩ gỉ sắt đã dùng thanh gươm gỉ gây vết thương nhiễm trùng cho một Ma sói!'
        );
        appendMatchEvent(state, {
          roundNumber: state.roundNumber,
          stage: cascadeStage,
          actionType: 'RUSTY_KNIGHT_INFECT',
          visibility: 'SECRET_NIGHT',
          actor: victimSnap,
          targets: [snapshotPlayer(infectedWolf)],
          outcome: 'SUCCESS',
          parentEventId: deathCauseEventId,
        });
      }
    }

    // 10. Người thổi sáo chết: Quét toàn bộ người chơi và reset isEnchanted = false
    if (victim.roleId === 'pied_piper') {
      for (const p of state.players) {
        p.isEnchanted = false;
      }
      state.historyLogs.push('Người thổi sáo đã chết! Toàn bộ bùa mê trên dân làng tan biến!');
      appendMatchEvent(state, {
        roundNumber: state.roundNumber,
        stage: cascadeStage,
        actionType: 'PIED_PIPER_CLEAR',
        visibility: 'SECRET_NIGHT',
        actor: victimSnap,
        targets: [],
        outcome: 'LOST_POWER',
        parentEventId: deathCauseEventId,
      });
    }

    // 11. Trưởng giáo phái chết: Quét toàn bộ người chơi và reset isCultMember = false
    if (victim.roleId === 'cult_leader') {
      for (const p of state.players) {
        p.isCultMember = false;
      }
      state.historyLogs.push('Trưởng giáo phái đã qua đời! Toàn bộ giáo phái giải tán!');
      appendMatchEvent(state, {
        roundNumber: state.roundNumber,
        stage: cascadeStage,
        actionType: 'CULT_DISBAND',
        visibility: 'SECRET_NIGHT',
        actor: victimSnap,
        targets: [],
        outcome: 'LOST_POWER',
        parentEventId: deathCauseEventId,
      });
    }

    // 12. Nhân bản kế thừa khi bản sao chết
    for (const dg of state.players) {
      if (
        dg.isAlive &&
        !processedPlayerIds.has(dg.id) &&
        dg.roleId === 'doppelganger' &&
        dg.doppelgangerTargetId === victim.id
      ) {
        const dgBeforeSnap = snapshotPlayer(dg);
        let note: string | undefined;
        let drunkRealRoleId: string | undefined;

        if (victim.roleId === 'dire_wolf') {
          // Sao chép dire_wolf: Trở thành Sói thường, TUYỆT ĐỐI không kế thừa companionId đã chết
          dg.roleId = 'werewolf';
          dg.faction = 'WEREWOLF';
          dg.companionId = null;
          state.historyLogs.push(
            `Nhân bản (${dg.name}) kế thừa Sói tuyết và hóa thành Ma sói thường!`
          );
        } else if (victim.roleId === 'drunk' || victim.initialRoleId === 'drunk') {
          // Sao chép drunk: Thừa kế vai thật tiềm thức drunkRealRoleId
          const realRoleId = victim.drunkRealRoleId || 'villager';
          drunkRealRoleId = realRoleId;
          dg.roleId = realRoleId;
          dg.faction = ROLES_BY_ID[realRoleId]?.faction ?? 'VILLAGER';
          if (realRoleId === 'elder') {
            dg.elderHp = 2;
          }
          state.historyLogs.push(
            `Nhân bản (${dg.name}) sao chép Kẻ say rượu và thức tỉnh vai thật [${realRoleId}]!`
          );
        } else if (victim.roleId === 'pied_piper' || victim.roleId === 'cult_leader') {
          // Sao chép pied_piper hoặc cult_leader: Reset toàn bộ bùa cũ về false, Nhân bản bắt đầu lại từ 0
          for (const p of state.players) {
            p.isEnchanted = false;
            p.isCultMember = false;
          }
          dg.roleId = victim.roleId;
          dg.faction = 'THIRD_PARTY';
          state.historyLogs.push(
            `Nhân bản (${dg.name}) kế thừa [${victim.roleId}], toàn bộ bùa chú cũ tan biến và bắt đầu lại từ 0!`
          );
          note = 'bắt đầu lại từ 0';
        } else if (victim.roleId === 'wild_child') {
          // Wild Child chưa hóa Sói: nếu thần tượng trùng chính Nhân bản hoặc đã chết -> xử lý an toàn
          if (!victim.roleModelId || victim.roleModelId === dg.id) {
            dg.roleId = 'villager';
            dg.faction = 'VILLAGER';
            dg.roleModelId = null;
            note = 'thần tượng là chính Nhân bản nên hóa Dân làng';
          } else {
            const idol = state.players.find((p) => p.id === victim.roleModelId);
            if (!idol || !idol.isAlive) {
              dg.roleId = 'werewolf';
              dg.faction = 'WEREWOLF';
              note = 'thần tượng đã chết nên hóa Ma sói';
            } else {
              dg.roleId = 'wild_child';
              dg.faction = 'VILLAGER';
              dg.roleModelId = victim.roleModelId;
            }
          }
          state.historyLogs.push(
            `Nhân bản (${dg.name}) kế thừa vai trò [${dg.roleId}] từ [${victim.name}]!`
          );
        } else {
          // Trường hợp chung: dùng victim.roleId hiện hành (giữ nguyên trạng thái đã hóa werewolf của cursed/wild_child)
          const inheritedRoleId = victim.roleId;
          dg.roleId = inheritedRoleId;
          dg.faction =
            inheritedRoleId === 'angel'
              ? victim.faction
              : (ROLES_BY_ID[inheritedRoleId]?.faction ?? victim.faction);
          if (inheritedRoleId === 'elder') {
            dg.elderHp = 2;
          }
          if (
            inheritedRoleId === 'seer' &&
            state.players.some((p) => p.isAlive && p.roleId === 'apprentice_seer')
          ) {
            note = 'thế chỗ Tiên tri';
          }
          state.historyLogs.push(
            `Nhân bản (${dg.name}) đã kế thừa vai trò [${inheritedRoleId}] từ [${victim.name}]!`
          );
        }

        appendMatchEvent(state, {
          roundNumber: state.roundNumber,
          stage: cascadeStage,
          actionType: 'DOPPELGANGER_INHERIT',
          visibility: 'SECRET_NIGHT',
          actor: dgBeforeSnap,
          targets: [victimSnap],
          outcome: 'SUCCESS',
          parentEventId: deathCauseEventId,
          metadata: {
            roleChange: {
              oldRoleId: dgBeforeSnap.roleId,
              newRoleId: dg.roleId,
              oldFaction: dgBeforeSnap.faction,
              newFaction: dg.faction,
              ...(drunkRealRoleId ? { drunkRealRoleId } : {}),
              ...(dg.roleId === 'witch'
                ? {
                    inheritedWitchHealUsed: state.witchHealUsed,
                    inheritedWitchPoisonUsed: state.witchPoisonUsed,
                  }
                : {}),
              inheritedFrom: victimSnap,
            },
            ...(note ? { note } : {}),
          },
        });
      }
    }
  }

  return resolvedRecords;
}
