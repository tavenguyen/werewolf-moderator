import { ROLES_BY_ID } from './roles';
import type { DeathInput } from './deathCascade';
import { processDeathCascade } from './deathCascade';
import { hasAnyOtherWolfDied } from './turnPlan';
import type {
  DeathRecord,
  GameState,
  NightActions,
  NightInfoResults,
  NightResolutionEvent,
  PlayerId,
  PlayerState,
} from './types';

export interface NightResolutionOutput {
  newDeaths: DeathRecord[];
  infoResults: NightInfoResults;
  events: NightResolutionEvent[];
}

/**
 * Chọn ngẫu nhiên có seed để đảm bảo tính tất định khi hòa phiếu.
 */
function pickDeterministic<T>(items: T[], seed: number): T {
  if (items.length === 0) throw new Error('Cannot pick from empty array');
  const index = Math.abs(Math.floor((seed * 9301 + 49297) % 233280)) % items.length;
  return items[index];
}

/**
 * Tally phiếu bầu của bầy Sói từ các phiếu cá nhân.
 * Sói trắng (white_wolf) được tham gia bỏ phiếu cùng bầy.
 */
function tallyWolfPackVotes(
  votes: Record<PlayerId, PlayerId | null>,
  livingWolves: PlayerState[],
  allowSkip: boolean,
  allowFriendlyFire: boolean,
  targetCount: number,
  seed: number,
  players: PlayerState[]
): PlayerId[] {
  const validVoterIds = new Set(livingWolves.map((w) => w.id));
  const voteCounts = new Map<string, number>();

  for (const [voterId, targetId] of Object.entries(votes)) {
    if (!validVoterIds.has(voterId)) continue;

    // Bỏ cắn (Skip)
    if (targetId === null) {
      if (allowSkip) {
        voteCounts.set('__SKIP__', (voteCounts.get('__SKIP__') ?? 0) + 1);
      }
      continue;
    }

    // Kiểm tra cắn đồng đội (Friendly Fire)
    const targetPlayer = players.find((p) => p.id === targetId && p.isAlive);
    if (!targetPlayer) continue;

    const isWolfPackAlly =
      targetPlayer.faction === 'WEREWOLF' || targetPlayer.roleId === 'white_wolf';
    if (isWolfPackAlly && !allowFriendlyFire) {
      continue; // Cấm cắn đồng đội thì bỏ qua phiếu này
    }

    voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1);
  }

  if (voteCounts.size === 0) return [];

  // Tìm số phiếu cao nhất
  const sortedEntries = Array.from(voteCounts.entries()).sort((a, b) => b[1] - a[1]);
  const chosenTargets: PlayerId[] = [];

  for (let i = 0; i < targetCount; i++) {
    if (sortedEntries.length === 0) break;

    const highestVote = sortedEntries[0][1];
    const topTied = sortedEntries.filter((e) => e[1] === highestVote);

    let pickedKey: string;
    if (topTied.length === 1) {
      pickedKey = topTied[0][0];
    } else {
      pickedKey = pickDeterministic(topTied.map((e) => e[0]), seed + i * 17);
    }

    // Xóa mục tiêu đã chọn khỏi danh sách để chọn mục tiêu kế tiếp nếu cần
    const pickedIdx = sortedEntries.findIndex((e) => e[0] === pickedKey);
    if (pickedIdx !== -1) {
      sortedEntries.splice(pickedIdx, 1);
    }

    if (pickedKey !== '__SKIP__') {
      chosenTargets.push(pickedKey);
    }
  }

  return chosenTargets;
}

/**
 * Phân giải ban đêm (Night Resolution Engine) — PURE FUNCTION:
 * Không sửa đổi state đầu vào, trả về nextState mới kèm kết quả chi tiết.
 */
export function resolveNight(
  state: GameState,
  actions: NightActions,
  randomSeed: number = 42
): { nextState: GameState; output: NightResolutionOutput } {
  const nextState: GameState = structuredClone(state);
  const infoResults: NightInfoResults = {};
  const events: NightResolutionEvent[] = [];
  const pendingDeaths: DeathInput[] = [];

  // =========================================================================
  // 1. KIỂM TRA SÓI CHIÊM BAO THỨC TỈNH (Đầu mỗi đêm)
  // =========================================================================
  if (!nextState.dreamWolfAwakened && hasAnyOtherWolfDied(nextState)) {
    nextState.dreamWolfAwakened = true;
    nextState.historyLogs.push('Một Ma sói đã ngã xuống; thế lực bóng đêm đang âm thầm trỗi dậy.');
  }

  // =========================================================================
  // 2. GHÉP ĐÔI CUPID (Chỉ Đêm 1)
  // =========================================================================
  if (nextState.roundNumber === 1 && actions.cupid && !nextState.villagePowerStripped) {
    const { target1, target2 } = actions.cupid;
    const p1 = nextState.players.find((p) => p.id === target1);
    const p2 = nextState.players.find((p) => p.id === target2);

    if (p1 && p2 && p1.id !== p2.id && p1.isAlive && p2.isAlive) {
      p1.loverId = p2.id;
      p2.loverId = p1.id;

      // Cặp đôi chỉ tách thành Phe Thứ 3 nếu 2 người khác phe (Dân + Sói, v.v.)
      // Nếu cùng phe (2 Dân hoặc 2 Sói), giữ nguyên phe gốc và thắng theo phe gốc
      const crossFaction = p1.faction !== p2.faction;
      p1.isCrossFactionCouple = crossFaction;
      p2.isCrossFactionCouple = crossFaction;

      // Không log tên người chơi hay phe để tránh rò rỉ danh tính bí mật
      nextState.historyLogs.push(
        'Thần tình yêu đã kết nối mũi tên định mệnh cho một cặp đôi trong làng.'
      );
    }
  }

  // =========================================================================
  // 3. KHIÊN BẢO VỆ (Bodyguard Shield)
  // =========================================================================
  let protectedPlayerId: PlayerId | null = null;
  if (actions.bodyguard?.targetId && !nextState.villagePowerStripped) {
    const target = actions.bodyguard.targetId;
    // Quy tắc: Không bảo vệ cùng 1 người 2 đêm liên tiếp
    if (target !== nextState.lastProtectedPlayerId) {
      protectedPlayerId = target;
      nextState.lastProtectedPlayerId = target;
      events.push({
        type: 'PROTECTED',
        sourceRole: 'bodyguard',
        targetPlayerId: target,
        isPublic: false,
        details: 'Được Bảo vệ che chắn khỏi đòn cắn của bầy Sói',
      });
    } else {
      nextState.historyLogs.push('Bảo vệ chọn trùng mục tiêu đêm trước -> Khiên vô hiệu!');
      nextState.lastProtectedPlayerId = null;
    }
  } else {
    nextState.lastProtectedPlayerId = null;
  }

  // =========================================================================
  // 4. ĐÒN CẮN CỦA BẦY MA SÓI (Wolf Pack Attack)
  // =========================================================================
  const targetCount = nextState.wolfCubDoubleKillNextNight ? 2 : 1;
  nextState.wolfCubDoubleKillNextNight = false; // Reset cờ cắn 2 người

  let rawWolfTargets: PlayerId[] = [];
  if (actions.wolfPack) {
    if (actions.wolfPack.individualVotes) {
      // Sói trắng (white_wolf) cũng được thức dậy và bỏ phiếu cùng bầy
      const livingWolves = nextState.players.filter((p) => {
        if (!p.isAlive) return false;
        if (p.faction !== 'WEREWOLF' && p.roleId !== 'white_wolf') return false;
        if (p.roleId === 'minion' || p.roleId === 'sorcerer') return false;
        if (p.roleId === 'dream_wolf' && !nextState.dreamWolfAwakened) return false;
        return true;
      });

      rawWolfTargets = tallyWolfPackVotes(
        actions.wolfPack.individualVotes,
        livingWolves,
        nextState.settings.allowWolfSkip,
        nextState.settings.allowWolfFriendlyFire,
        targetCount,
        randomSeed,
        nextState.players
      );
    } else if (actions.wolfPack.targets) {
      if (!actions.wolfPack.isSkip || !nextState.settings.allowWolfSkip) {
        let targets = [...actions.wolfPack.targets];
        if (!nextState.settings.allowWolfFriendlyFire) {
          targets = targets.filter((tId) => {
            const p = nextState.players.find((pl) => pl.id === tId);
            return p?.faction !== 'WEREWOLF' && p?.roleId !== 'white_wolf';
          });
        }
        rawWolfTargets = targets.slice(0, targetCount);
      }
    }
  }

  // Khử trùng mục tiêu: Nếu bầy Sói chọn trùng 1 người trong đêm cắn 2 thì chỉ tính 1 vết cắn
  const deduplicatedTargets = Array.from(new Set(rawWolfTargets));

  let wolfVictims: PlayerId[] = [];
  for (const tId of deduplicatedTargets) {
    if (tId === protectedPlayerId) {
      nextState.historyLogs.push(`Bảo vệ đã đỡ trúng vết cắn của Sói nhắm vào [${tId}]!`);
    } else {
      wolfVictims.push(tId);
      events.push({
        type: 'WOLF_ATTACK',
        sourceRole: 'werewolf',
        targetPlayerId: tId,
        isPublic: false,
      });
    }
  }

  // =========================================================================
  // 5. SÓI TRẮNG ÁM SÁT RIÊNG (White Wolf - Đêm chẵn)
  // =========================================================================
  let whiteWolfVictim: PlayerId | null = null;
  if (nextState.roundNumber % 2 === 0 && actions.whiteWolf?.targetId) {
    const target = nextState.players.find((p) => p.id === actions.whiteWolf!.targetId);
    if (target && target.isAlive) {
      whiteWolfVictim = target.id;
      events.push({
        type: 'WHITE_WOLF_ATTACK',
        sourceRole: 'white_wolf',
        targetPlayerId: target.id,
        isPublic: false,
      });
    }
  }

  // =========================================================================
  // 6. PHÙ THỦY CỨU & NÉM ĐỘC (Witch Potions)
  // =========================================================================
  let poisonVictim: PlayerId | null = null;
  const witchPlayer = nextState.players.find((p) => p.roleId === 'witch');

  if (!nextState.villagePowerStripped && actions.witch) {
    // 6a. Dùng bình Cứu
    if (actions.witch.heal && !nextState.witchHealUsed) {
      nextState.witchHealUsed = true;

      // Kiểm tra có cấm tự cứu không
      let eligibleHealTargets = [...wolfVictims];
      if (!nextState.settings.allowWitchSelfHeal && witchPlayer) {
        eligibleHealTargets = eligibleHealTargets.filter((id) => id !== witchPlayer.id);
      }

      if (eligibleHealTargets.length > 0) {
        if (nextState.settings.witchHealMode === 'AOE') {
          // AoE cứu tất cả nạn nhân bị WOLF_PACK cắn hợp lệ (KHÔNG cứu WHITE_WOLF)
          wolfVictims = wolfVictims.filter((id) => !eligibleHealTargets.includes(id));
          for (const savedId of eligibleHealTargets) {
            events.push({
              type: 'WITCH_HEAL',
              sourceRole: 'witch',
              targetPlayerId: savedId,
              isPublic: false,
            });
          }
          nextState.historyLogs.push('Phù thủy dùng bình Cứu AoE giải cứu tất cả nạn nhân bị Sói cắn!');
        } else {
          // Cứu 1 người: Ưu tiên healTargetId nếu được chỉ định và hợp lệ
          let savedId: PlayerId | undefined;
          if (
            actions.witch.healTargetId &&
            eligibleHealTargets.includes(actions.witch.healTargetId)
          ) {
            savedId = actions.witch.healTargetId;
          } else {
            savedId = eligibleHealTargets[0];
          }

          if (savedId) {
            wolfVictims = wolfVictims.filter((id) => id !== savedId);
            events.push({
              type: 'WITCH_HEAL',
              sourceRole: 'witch',
              targetPlayerId: savedId,
              isPublic: false,
            });
            nextState.historyLogs.push(`Phù thủy dùng bình Cứu giải cứu nạn nhân [${savedId}]!`);
          }
        }
      } else {
        // Cứu mù nhưng không có nạn nhân nào
        if (!nextState.settings.witchKnowsVictim && !nextState.settings.witchWasteHealOnEmpty) {
          nextState.witchHealUsed = false; // Hoàn bình nếu tắt mất bình khi cứu trượt
        } else {
          nextState.historyLogs.push('Phù thủy dùng bình Cứu nhưng không có ai bị Sói cắn trong đêm!');
        }
      }
    }

    // 6b. Dùng bình Độc
    if (actions.witch.poisonTargetId && !nextState.witchPoisonUsed) {
      const pTarget = nextState.players.find((p) => p.id === actions.witch!.poisonTargetId);
      if (pTarget && pTarget.isAlive) {
        nextState.witchPoisonUsed = true;
        poisonVictim = pTarget.id;
        events.push({
          type: 'WITCH_POISON',
          sourceRole: 'witch',
          targetPlayerId: pTarget.id,
          isPublic: false,
        });
        nextState.historyLogs.push(`Phù thủy ném bình Độc vào mục tiêu [${poisonVictim}]!`);
      }
    }
  }

  // =========================================================================
  // 7. CÁC VAI THU THẬP THÔNG TIN (Seer, Sorcerer)
  // =========================================================================
  if (actions.seer?.targetId && !nextState.villagePowerStripped) {
    const target = nextState.players.find((p) => p.id === actions.seer!.targetId);
    if (target) {
      const def = ROLES_BY_ID[target.roleId];
      let result = def?.seerResult ?? 'VILLAGER';
      // Lycan soi ra Sói, Minion soi ra Dân
      if (target.roleId === 'lycan') result = 'WEREWOLF';
      if (target.roleId === 'minion') result = 'VILLAGER';

      infoResults.seerResult = {
        targetId: target.id,
        result,
      };
    }
  }

  if (actions.sorcerer?.targetId) {
    const target = nextState.players.find((p) => p.id === actions.sorcerer!.targetId);
    infoResults.sorcererResult = {
      targetId: actions.sorcerer.targetId,
      isSeer: target?.roleId === 'seer',
    };
  }

  // =========================================================================
  // 8. CHỐT SÁT THƯƠNG ĐÊM & CHUỖI TỬ VONG
  // =========================================================================
  // 8a. Nạn nhân của bầy Sói (WOLF_PACK)
  for (const victimId of wolfVictims) {
    const victim = nextState.players.find((p) => p.id === victimId);
    if (!victim || !victim.isAlive) continue;

    // Già làng (Elder) có 2 giáp trước đòn cắn của bầy Sói
    if (victim.roleId === 'elder') {
      if ((victim.elderHp ?? 2) > 1) {
        victim.elderHp = 1;
        events.push({
          type: 'SURVIVED',
          targetPlayerId: victim.id,
          isPublic: false,
          details: 'Già làng chịu 1 vết cắn, còn 1 giáp',
        });
        nextState.historyLogs.push('Đêm qua làng có người bị tấn công nhưng đã kiên cường gượng dậy.');
        continue;
      }
    }

    pendingDeaths.push({ playerId: victim.id, cause: 'WOLF_PACK' });
  }

  // 8b. Nạn nhân của Sói trắng (WHITE_WOLF)
  if (whiteWolfVictim) {
    pendingDeaths.push({ playerId: whiteWolfVictim, cause: 'WHITE_WOLF' });
  }

  // 8c. Nạn nhân của bình Độc (WITCH_POISON)
  // Chú ý: Độc đè Cứu — nếu mục tiêu đã được bình Cứu cứu nhưng trúng Độc, Độc vẫn giết họ!
  if (poisonVictim) {
    pendingDeaths.push({ playerId: poisonVictim, cause: 'WITCH_POISON' });
  }

  // Phân giải chuỗi chết liên hoàn
  const newDeaths = processDeathCascade(nextState, pendingDeaths);

  // Phát sinh event DEATH cho từng nạn nhân trong đêm vào resolvedEvents
  for (const death of newDeaths) {
    events.push({
      type: 'DEATH',
      targetPlayerId: death.playerId,
      sourceRole: death.cause,
      isPublic: nextState.settings.revealOnDeath,
      details: nextState.settings.revealOnDeath ? `Nạn nhân mang vai trò [${death.roleId}]` : undefined,
    });
  }

  nextState.resolvedEvents = events;

  return {
    nextState,
    output: {
      newDeaths,
      infoResults,
      events,
    },
  };
}
