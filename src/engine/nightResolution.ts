import { processDeathCascade, type DeathInput } from './deathCascade';
import { appendMatchEvent, snapshotPlayer } from './matchLog';
import { ROLES_BY_ID, type SeerResult } from './roles';
import { getAliveNeighbors } from './seating';
import { hasAnyBitingWolfDied, hasAnyOtherWolfDied } from './turnPlan';
import type {
  DeathRecord,
  EventParticipantSnapshot,
  GameState,
  MatchEvent,
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

interface WolfTallyDetails {
  targets: PlayerId[];
  tieBreakRandom: boolean;
  skipWon: boolean;
  friendlyFireBlocked: boolean;
}

/**
 * Helper xác định kết quả soi của Tiên tri hào quang (Aura Seer):
 * - 'NORMAL' nếu roleId === 'villager', roleId === 'werewolf', hoặc (roleId === 'drunk' && roundNumber < 3).
 * - 'SPECIAL' cho tất cả các vai khác.
 */
export function getAuraSeerResult(
  player: PlayerState,
  roundNumber: number
): 'NORMAL' | 'SPECIAL' {
  if (player.roleId === 'drunk') {
    if (roundNumber < 3) return 'NORMAL';
    if (player.drunkRealRoleId) {
      return player.drunkRealRoleId === 'villager' || player.drunkRealRoleId === 'werewolf'
        ? 'NORMAL'
        : 'SPECIAL';
    }
    return 'SPECIAL';
  }
  if (player.roleId === 'villager' || player.roleId === 'werewolf') {
    return 'NORMAL';
  }
  return 'SPECIAL';
}

/**
 * Helper xác định một người chơi có tính là Ma sói khi Con cáo (Fox) và Thám tử (P.I.) điều tra hay không.
 */
export function isWerewolfForInvestigation(
  player: PlayerState,
  roundNumber?: number
): boolean {
  const isDrunkAwakened =
    roundNumber !== undefined &&
    roundNumber >= 3 &&
    player.roleId === 'drunk' &&
    Boolean(player.drunkRealRoleId);
  const effectiveRoleId = isDrunkAwakened ? player.drunkRealRoleId! : player.roleId;
  const effectiveFaction = isDrunkAwakened
    ? (ROLES_BY_ID[effectiveRoleId]?.faction ?? player.faction)
    : player.faction;

  if (effectiveRoleId === 'minion' || effectiveRoleId === 'sorcerer') return false;
  if (effectiveRoleId === 'lycan') return true;
  if (effectiveFaction === 'WEREWOLF' || effectiveRoleId === 'white_wolf') return true;
  return false;
}

function pickDeterministic<T>(items: T[], seed: number): T {
  if (items.length === 0) throw new Error('Cannot pick from empty array');
  const index = Math.abs(Math.floor((seed * 9301 + 49297) % 233280)) % items.length;
  return items[index];
}

function tallyWolfPackVotesDetailed(
  votes: Record<PlayerId, PlayerId | null>,
  livingWolves: PlayerState[],
  allowSkip: boolean,
  allowFriendlyFire: boolean,
  targetCount: number,
  seed: number,
  players: PlayerState[],
  multiVotes?: Record<PlayerId, PlayerId[]>
): WolfTallyDetails {
  const validVoterIds = new Set(livingWolves.map((w) => w.id));
  const voteCounts = new Map<string, number>();
  let friendlyFireBlocked = false;

  const recordTargetVote = (targetId: PlayerId | null) => {
    if (targetId === null) {
      if (allowSkip) {
        voteCounts.set('__SKIP__', (voteCounts.get('__SKIP__') ?? 0) + 1);
      }
      return;
    }

    const targetPlayer = players.find((p) => p.id === targetId && p.isAlive);
    if (!targetPlayer) return;

    const isWolfPackAlly =
      targetPlayer.faction === 'WEREWOLF' || targetPlayer.roleId === 'white_wolf';
    if (isWolfPackAlly && !allowFriendlyFire) {
      friendlyFireBlocked = true;
      return;
    }

    voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1);
  };

  if (multiVotes) {
    for (const [voterId, targetIds] of Object.entries(multiVotes)) {
      if (!validVoterIds.has(voterId)) continue;
      if (!targetIds || targetIds.length === 0) {
        recordTargetVote(null);
        continue;
      }
      const uniqueTargets = Array.from(new Set(targetIds)).slice(0, targetCount);
      for (const targetId of uniqueTargets) {
        recordTargetVote(targetId);
      }
    }
  }

  for (const [voterId, targetId] of Object.entries(votes)) {
    if (!validVoterIds.has(voterId)) continue;
    if (multiVotes && Object.prototype.hasOwnProperty.call(multiVotes, voterId)) continue;
    recordTargetVote(targetId);
  }

  if (voteCounts.size === 0) {
    return { targets: [], tieBreakRandom: false, skipWon: false, friendlyFireBlocked };
  }

  const sortedEntries = Array.from(voteCounts.entries()).sort((a, b) => b[1] - a[1]);
  const chosenTargets: PlayerId[] = [];
  let tieBreakRandom = false;
  let skipWon = false;

  for (let i = 0; i < targetCount; i++) {
    if (sortedEntries.length === 0) break;

    const highestVote = sortedEntries[0][1];
    const topTied = sortedEntries.filter((e) => e[1] === highestVote);

    let pickedKey: string;
    if (topTied.length === 1) {
      pickedKey = topTied[0][0];
    } else {
      tieBreakRandom = true;
      pickedKey = pickDeterministic(
        topTied.map((e) => e[0]),
        seed + i * 17
      );
    }

    const pickedIdx = sortedEntries.findIndex((e) => e[0] === pickedKey);
    if (pickedIdx !== -1) {
      sortedEntries.splice(pickedIdx, 1);
    }

    if (pickedKey === '__SKIP__') {
      skipWon = true;
    } else {
      chosenTargets.push(pickedKey);
    }
  }

  return { targets: chosenTargets, tieBreakRandom, skipWon, friendlyFireBlocked };
}

function getLivingBitingWolves(state: GameState): PlayerState[] {
  return state.players.filter((p) => {
    if (!p.isAlive) return false;
    if (p.faction !== 'WEREWOLF' && p.roleId !== 'white_wolf') return false;
    if (p.roleId === 'minion' || p.roleId === 'sorcerer') return false;
    if (p.roleId === 'dream_wolf' && !state.dreamWolfAwakened) return false;
    return true;
  });
}

function resolveRawWolfDetails(
  state: GameState,
  actions: NightActions,
  randomSeed: number
): WolfTallyDetails {
  const targetCount = state.wolfCubDoubleKillNextNight ? 2 : 1;

  if (!actions.wolfPack) {
    return { targets: [], tieBreakRandom: false, skipWon: false, friendlyFireBlocked: false };
  }

  if (actions.wolfPack.multiVotes || actions.wolfPack.individualVotes) {
    const livingWolves = getLivingBitingWolves(state);
    return tallyWolfPackVotesDetailed(
      actions.wolfPack.individualVotes ?? {},
      livingWolves,
      state.settings.allowWolfSkip,
      state.settings.allowWolfFriendlyFire,
      targetCount,
      randomSeed,
      state.players,
      actions.wolfPack.multiVotes
    );
  }

  if (actions.wolfPack.targets) {
    if (actions.wolfPack.isSkip && state.settings.allowWolfSkip) {
      return { targets: [], tieBreakRandom: false, skipWon: true, friendlyFireBlocked: false };
    }
    let friendlyFireBlocked = false;
    let targets = [...actions.wolfPack.targets];
    if (!state.settings.allowWolfFriendlyFire) {
      targets = targets.filter((tId) => {
        const p = state.players.find((pl) => pl.id === tId);
        const isWolf = p?.faction === 'WEREWOLF' || p?.roleId === 'white_wolf';
        if (isWolf) friendlyFireBlocked = true;
        return !isWolf;
      });
    }
    return {
      targets: targets.slice(0, targetCount),
      tieBreakRandom: false,
      skipWon: false,
      friendlyFireBlocked,
    };
  }

  return { targets: [], tieBreakRandom: false, skipWon: false, friendlyFireBlocked: false };
}

/**
 * Lấy danh sách mục tiêu cắn thô của bầy Ma Sói (và Sói đại ca nếu có và hợp lệ).
 */
export function getRawWolfTargets(
  state: GameState,
  actions: NightActions,
  randomSeed: number = 42
): PlayerId[] {
  const details = resolveRawWolfDetails(state, actions, randomSeed);
  const deduplicatedTargets = Array.from(new Set(details.targets));

  const bigBadWolfPlayer = state.players.find(
    (p) => p.isAlive && p.roleId === 'big_bad_wolf'
  );
  if (
    bigBadWolfPlayer &&
    !hasAnyBitingWolfDied(state) &&
    actions.bigBadWolf?.targetId
  ) {
    const bbTargetId = actions.bigBadWolf.targetId;
    const bbTarget = state.players.find((p) => p.id === bbTargetId && p.isAlive);
    if (bbTarget && !deduplicatedTargets.includes(bbTargetId)) {
      deduplicatedTargets.push(bbTargetId);
    }
  }

  return deduplicatedTargets;
}

/**
 * Danh sách nạn nhân xem trước của Phù thủy trong đêm.
 */
export function getWitchVictimsPreview(
  state: GameState,
  actions: NightActions,
  randomSeed: number = 42
): PlayerId[] {
  const effectiveActions =
    state.settings.firstNightNoKill && state.roundNumber === 1
      ? { ...actions, wolfPack: undefined }
      : actions;
  const rawTargets = getRawWolfTargets(state, effectiveActions, randomSeed);

  const bodyguardPlayer = state.players.find((p) => p.isAlive && p.roleId === 'bodyguard');
  const isBgSelfForbidden =
    Boolean(bodyguardPlayer) &&
    actions.bodyguard?.targetId === bodyguardPlayer!.id &&
    state.settings.allowBodyguardSelfProtect === false;
  const isProtectedValid =
    Boolean(bodyguardPlayer) &&
    !state.villagePowerStripped &&
    !isBgSelfForbidden &&
    actions.bodyguard?.targetId &&
    actions.bodyguard.targetId !== state.lastProtectedPlayerId;
  const protectedId = isProtectedValid ? actions.bodyguard?.targetId : undefined;

  const accursedAlive = state.players.some(
    (p) => p.isAlive && p.roleId === 'wolf_accursed'
  );
  const isCurseValid = accursedAlive && !state.accursedWolfUsed;
  const cursedId = isCurseValid ? actions.accursedWolf?.curseTargetId : undefined;

  return rawTargets.filter((id) => {
    if (protectedId && id === protectedId) return false;
    if (cursedId && id === cursedId) return false;
    return true;
  });
}

function getStartOfNightSnapshot(
  startState: GameState,
  playerId: PlayerId
): EventParticipantSnapshot | null {
  const p = startState.players.find((pl) => pl.id === playerId);
  if (!p) return null;
  if (p.roleId === 'drunk' && startState.roundNumber >= 3 && p.drunkRealRoleId) {
    const realDef = ROLES_BY_ID[p.drunkRealRoleId];
    return snapshotPlayer(p, {
      roleId: p.drunkRealRoleId,
      faction: realDef?.faction ?? p.faction,
    });
  }
  return snapshotPlayer(p);
}

/**
 * Phân giải ban đêm (Night Resolution Engine) — PURE FUNCTION:
 * Không sửa đổi state đầu vào, trả về nextState mới kèm kết quả chi tiết và MatchEvent có cấu trúc.
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
  const round = nextState.roundNumber;

  // =========================================================================
  // 1. KIỂM TRA SÓI CHIÊM BAO THỨC TỈNH (Đầu mỗi đêm)
  // =========================================================================
  if (!nextState.dreamWolfAwakened && hasAnyOtherWolfDied(nextState)) {
    nextState.dreamWolfAwakened = true;
    nextState.historyLogs.push('Một Ma sói đã ngã xuống; thế lực bóng đêm đang âm thầm trỗi dậy.');
    const dreamWolf = nextState.players.find((p) => p.isAlive && p.roleId === 'dream_wolf');
    if (dreamWolf) {
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'DREAM_WOLF_AWAKEN',
        visibility: 'SECRET_NIGHT',
        actor: snapshotPlayer(dreamWolf),
        targets: [],
        outcome: 'SUCCESS',
      });
    }
  }

  // 1b. KIỂM TRA UỐN VÁN (Tetanus) & NGƯỜI CỨNG CỎI SỤP ĐỔ (Tough Guy Collapse)
  for (const p of nextState.players) {
    if (
      p.isAlive &&
      p.infectedWithTetanus &&
      p.tetanusInfectionRound !== undefined &&
      round > p.tetanusInfectionRound
    ) {
      const srcRound = p.tetanusInfectionRound;
      const pSnap = snapshotPlayer(p);
      p.infectedWithTetanus = false;
      nextState.historyLogs.push('Một Ma sói đã gục ngã vì vết thương uốn ván từ Kỵ sĩ gỉ sắt!');
      const tetEvt = appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'TETANUS_DEATH',
        visibility: 'SECRET_NIGHT',
        actor: pSnap,
        targets: [pSnap],
        outcome: 'SUCCESS',
        metadata: { delayedSourceRound: srcRound },
      });
      pendingDeaths.push({ playerId: p.id, cause: 'TETANUS', parentEventId: tetEvt.id });
    }

    if (
      p.isAlive &&
      p.roleId === 'tough_guy' &&
      p.toughGuyBittenNight !== null &&
      p.toughGuyBittenNight !== undefined &&
      round > p.toughGuyBittenNight
    ) {
      const srcRound = p.toughGuyBittenNight;
      const pSnap = snapshotPlayer(p);
      p.toughGuyBittenNight = null;
      nextState.historyLogs.push('Người cứng cỏi đã kiệt sức vì vết cắn đêm trước và gục ngã!');
      const tgEvt = appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'TOUGH_GUY_COLLAPSE',
        visibility: 'SECRET_NIGHT',
        actor: pSnap,
        targets: [pSnap],
        outcome: 'SUCCESS',
        metadata: { delayedSourceRound: srcRound },
      });
      pendingDeaths.push({
        playerId: p.id,
        cause: 'TOUGH_GUY_COLLAPSE',
        parentEventId: tgEvt.id,
      });
    }
  }

  // 1c. KẺ SAY RƯỢU TỈNH RƯỢU (Drunk - roundNumber >= 3)
  if (round >= 3) {
    for (const p of nextState.players) {
      if (p.isAlive && p.roleId === 'drunk' && p.drunkRealRoleId) {
        const oldSnap = snapshotPlayer(p);
        const realRoleId = p.drunkRealRoleId;
        p.roleId = realRoleId;
        const roleDef = ROLES_BY_ID[realRoleId];
        if (roleDef) {
          p.faction = roleDef.faction;
        }
        if (realRoleId === 'elder' && p.elderHp === undefined) {
          p.elderHp = 2;
        }
        nextState.historyLogs.push(
          `Kẻ say rượu (${p.name}) đã tỉnh rượu ở Đêm 3 và nhận thức được vai trò thật của mình: [${realRoleId}]!`
        );
        appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'NIGHT',
          actionType: 'DRUNK_AWAKEN',
          visibility: 'SECRET_NIGHT',
          actor: oldSnap,
          targets: [],
          outcome: 'SUCCESS',
          metadata: {
            roleChange: {
              oldRoleId: 'drunk',
              newRoleId: realRoleId,
              oldFaction: oldSnap.faction,
              newFaction: p.faction,
              drunkRealRoleId: realRoleId,
            },
          },
        });
      }
    }
  }

  // =========================================================================
  // 2. THIẾT LẬP ĐÊM 1 (SETUP)
  // =========================================================================
  if (round === 1) {
    // 2a. Cupid
    const cupidPlayer = nextState.players.find((p) => p.isAlive && p.roleId === 'cupid');
    if (actions.cupid && !nextState.villagePowerStripped) {
      const { target1, target2 } = actions.cupid;
      const p1 = nextState.players.find((p) => p.id === target1);
      const p2 = nextState.players.find((p) => p.id === target2);
      const isSelfMatch = cupidPlayer && (target1 === cupidPlayer.id || target2 === cupidPlayer.id);

      if (isSelfMatch && nextState.settings.allowCupidSelfMatch === false) {
        nextState.historyLogs.push('Cupid tự ghép mình nhưng luật phòng cấm -> Mũi tên vô hiệu!');
        appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'SETUP',
          actionType: 'PAIR_LOVERS',
          visibility: 'SECRET_NIGHT',
          actor: cupidPlayer ? snapshotPlayer(cupidPlayer) : null,
          targets: [],
          outcome: 'NO_EFFECT',
        });
      } else if (p1 && p2 && p1.id !== p2.id && p1.isAlive && p2.isAlive) {
        p1.loverId = p2.id;
        p2.loverId = p1.id;

        const crossFaction = p1.faction !== p2.faction;
        p1.isCrossFactionCouple = crossFaction;
        p2.isCrossFactionCouple = crossFaction;

        nextState.historyLogs.push(
          'Thần tình yêu đã kết nối mũi tên định mệnh cho một cặp đôi trong làng.'
        );
        appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'SETUP',
          actionType: 'PAIR_LOVERS',
          visibility: 'SECRET_NIGHT',
          actor: cupidPlayer ? snapshotPlayer(cupidPlayer) : null,
          targets: [snapshotPlayer(p1), snapshotPlayer(p2)],
          outcome: 'SUCCESS',
          metadata: { setup: { isCrossFactionCouple: crossFaction } },
        });
      }
    } else if (cupidPlayer && !nextState.villagePowerStripped) {
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'SETUP',
        actionType: 'PAIR_LOVERS',
        visibility: 'SECRET_NIGHT',
        actor: snapshotPlayer(cupidPlayer),
        targets: [],
        outcome: 'SKIPPED',
      });
    }

    // 2b. Nhân bản (Doppelganger)
    const dgPlayer = nextState.players.find(
      (p) => (p.roleId === 'doppelganger' || p.initialRoleId === 'doppelganger') && p.isAlive
    );
    if (dgPlayer) {
      const dgTarget = actions.doppelganger?.targetId
        ? nextState.players.find((p) => p.id === actions.doppelganger!.targetId)
        : undefined;
      if (dgTarget) {
        dgPlayer.doppelgangerTargetId = dgTarget.id;
        nextState.historyLogs.push(`Nhân bản (${dgPlayer.name}) đã chọn bản sao bí mật.`);
        appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'SETUP',
          actionType: 'CHOOSE_COPY_TARGET',
          visibility: 'SECRET_NIGHT',
          actor: snapshotPlayer(dgPlayer),
          targets: [snapshotPlayer(dgTarget)],
          outcome: 'SUCCESS',
        });
      } else {
        appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'SETUP',
          actionType: 'CHOOSE_COPY_TARGET',
          visibility: 'SECRET_NIGHT',
          actor: snapshotPlayer(dgPlayer),
          targets: [],
          outcome: 'SKIPPED',
        });
      }
    }

    // 2c. Đứa con hoang (Wild Child)
    const wcPlayer = nextState.players.find(
      (p) => (p.roleId === 'wild_child' || p.initialRoleId === 'wild_child') && p.isAlive
    );
    if (wcPlayer && !nextState.villagePowerStripped) {
      const idol = actions.wildChild?.targetId
        ? nextState.players.find((p) => p.id === actions.wildChild!.targetId)
        : undefined;
      if (idol) {
        wcPlayer.roleModelId = idol.id;
        nextState.historyLogs.push(`Đứa con hoang (${wcPlayer.name}) đã chọn thần tượng bí mật.`);
        appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'SETUP',
          actionType: 'CHOOSE_IDOL',
          visibility: 'SECRET_NIGHT',
          actor: snapshotPlayer(wcPlayer),
          targets: [snapshotPlayer(idol)],
          outcome: 'SUCCESS',
        });
      } else {
        appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'SETUP',
          actionType: 'CHOOSE_IDOL',
          visibility: 'SECRET_NIGHT',
          actor: snapshotPlayer(wcPlayer),
          targets: [],
          outcome: 'SKIPPED',
        });
      }
    }

    // 2d. Du côn (Hoodlum)
    const hlPlayer = nextState.players.find(
      (p) => (p.roleId === 'hoodlum' || p.initialRoleId === 'hoodlum') && p.isAlive
    );
    if (hlPlayer) {
      const h1 = actions.hoodlum?.target1
        ? nextState.players.find((p) => p.id === actions.hoodlum!.target1)
        : undefined;
      const h2 = actions.hoodlum?.target2
        ? nextState.players.find((p) => p.id === actions.hoodlum!.target2)
        : undefined;
      if (h1 && h2) {
        hlPlayer.hoodlumTargetIds = [h1.id, h2.id];
        nextState.historyLogs.push(`Du côn (${hlPlayer.name}) đã đưa 2 mục tiêu vào tầm ngắm.`);
        appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'SETUP',
          actionType: 'CHOOSE_HOODLUM_TARGETS',
          visibility: 'SECRET_NIGHT',
          actor: snapshotPlayer(hlPlayer),
          targets: [snapshotPlayer(h1), snapshotPlayer(h2)],
          outcome: 'SUCCESS',
        });
      } else {
        appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'SETUP',
          actionType: 'CHOOSE_HOODLUM_TARGETS',
          visibility: 'SECRET_NIGHT',
          actor: snapshotPlayer(hlPlayer),
          targets: [],
          outcome: 'SKIPPED',
        });
      }
    }

    // 2e. Hội Tam Điểm (Mason)
    const aliveMasons = nextState.players.filter((p) => p.isAlive && p.roleId === 'mason');
    if (aliveMasons.length > 0 && !nextState.villagePowerStripped) {
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'SETUP',
        actionType: 'MASON_MEET',
        visibility: 'SECRET_NIGHT',
        actor: snapshotPlayer(aliveMasons[0]),
        coActors: aliveMasons.map((m) => snapshotPlayer(m)),
        targets: [],
        outcome: 'SUCCESS',
        metadata: { setup: { soloMason: aliveMasons.length === 1 } },
      });
    }

    // 2f. Kẻ phản bội (Minion)
    const aliveMinion = nextState.players.find((p) => p.isAlive && p.roleId === 'minion');
    if (aliveMinion) {
      const packWolves = nextState.players.filter(
        (p) =>
          p.id !== aliveMinion.id &&
          (p.faction === 'WEREWOLF' || p.roleId === 'white_wolf') &&
          p.roleId !== 'minion' &&
          p.roleId !== 'sorcerer'
      );
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'SETUP',
        actionType: 'MINION_REVEAL',
        visibility: 'SECRET_NIGHT',
        actor: snapshotPlayer(aliveMinion),
        targets: packWolves.map((w) => snapshotPlayer(w)),
        outcome: 'SUCCESS',
      });
    }

    // 2g. Sói tuyết (Dire Wolf)
    const dwPlayer = nextState.players.find(
      (p) => (p.roleId === 'dire_wolf' || p.initialRoleId === 'dire_wolf') && p.isAlive
    );
    if (dwPlayer) {
      const comp = actions.direWolf?.targetId
        ? nextState.players.find((p) => p.id === actions.direWolf!.targetId)
        : undefined;
      if (comp) {
        dwPlayer.companionId = comp.id;
        nextState.historyLogs.push(`Sói tuyết (${dwPlayer.name}) đã bí mật chọn bạn đồng hành.`);
        appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'SETUP',
          actionType: 'CHOOSE_COMPANION',
          visibility: 'SECRET_NIGHT',
          actor: snapshotPlayer(dwPlayer),
          targets: [snapshotPlayer(comp)],
          outcome: 'SUCCESS',
        });
      } else {
        appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'SETUP',
          actionType: 'CHOOSE_COMPANION',
          visibility: 'SECRET_NIGHT',
          actor: snapshotPlayer(dwPlayer),
          targets: [],
          outcome: 'SKIPPED',
        });
      }
    }

    // 2h. Kẻ say rượu (Drunk) Đêm 1
    const drunkPlayers = nextState.players.filter(
      (p) => p.isAlive && p.roleId === 'drunk'
    );
    for (const dp of drunkPlayers) {
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'SETUP',
        actionType: 'DRUNK_SLEEP',
        visibility: 'SECRET_NIGHT',
        actor: snapshotPlayer(dp),
        targets: [],
        outcome: 'NO_EFFECT',
        metadata: {
          setup: { drunkRealRoleId: dp.drunkRealRoleId ?? undefined },
        },
      });
    }
  }

  // =========================================================================
  // 3. KHIÊN BẢO VỆ (Bodyguard Shield) — check isAlive chống hành động sót khi bị trục xuất
  // =========================================================================
  let protectedPlayerId: PlayerId | null = null;
  let bodyguardSnap: EventParticipantSnapshot | null = null;
  let bodyguardFailedNote: string | null = null;
  let bodyguardBlockedAny = false;

  const bodyguardPlayer = nextState.players.find((p) => p.isAlive && p.roleId === 'bodyguard');
  if (bodyguardPlayer && actions.bodyguard?.targetId && !nextState.villagePowerStripped) {
    bodyguardSnap = snapshotPlayer(bodyguardPlayer);
    const target = actions.bodyguard.targetId;
    const isSelf = bodyguardPlayer.id === target;

    if (isSelf && nextState.settings.allowBodyguardSelfProtect === false) {
      nextState.historyLogs.push('Bảo vệ tự bảo vệ bản thân nhưng luật phòng cấm -> Khiên vô hiệu!');
      nextState.lastProtectedPlayerId = null;
      bodyguardFailedNote = 'tự bảo vệ bản thân nhưng luật phòng cấm (khiên vô hiệu).';
    } else if (target !== nextState.lastProtectedPlayerId) {
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
      bodyguardFailedNote = 'chọn trùng mục tiêu đêm trước (khiên vô hiệu).';
    }
  } else {
    nextState.lastProtectedPlayerId = null;
  }

  if (bodyguardFailedNote && bodyguardSnap) {
    const failedTarget = actions.bodyguard?.targetId
      ? nextState.players.find((p) => p.id === actions.bodyguard!.targetId)
      : undefined;
    appendMatchEvent(nextState, {
      roundNumber: round,
      stage: 'NIGHT',
      actionType: 'PROTECT',
      visibility: 'SECRET_NIGHT',
      actor: bodyguardSnap,
      targets: failedTarget ? [snapshotPlayer(failedTarget)] : [],
      outcome: 'NO_EFFECT',
      metadata: { note: bodyguardFailedNote },
    });
  }

  // =========================================================================
  // 4. TÍNH TOÁN ĐÒN CẮN, NGUYỀN, SÓI ĐẠI CA, SÓI TRẮNG & PHÙ THỦY
  // =========================================================================
  const targetCount = nextState.wolfCubDoubleKillNextNight ? 2 : 1;

  const isFirstNightPeace = Boolean(nextState.settings.firstNightNoKill && round === 1);
  const livingWakingWolves = getLivingBitingWolves(nextState);
  const wolfActorsSnaps = livingWakingWolves.map((w) => snapshotPlayer(w));

  const wolfVoteDetails = isFirstNightPeace
    ? { targets: [] as PlayerId[], tieBreakRandom: false, skipWon: false, friendlyFireBlocked: false }
    : resolveRawWolfDetails(nextState, actions, randomSeed);

  nextState.wolfCubDoubleKillNextNight = false;

  const deduplicatedTargets = Array.from(new Set(wolfVoteDetails.targets));
  const individualVotesMeta: NonNullable<
    NonNullable<MatchEvent['metadata']>['wolfPack']
  >['individualVotes'] = [];

  if (actions.wolfPack?.multiVotes) {
    for (const [wId, tIds] of Object.entries(actions.wolfPack.multiVotes)) {
      const wolfP = nextState.players.find((p) => p.id === wId);
      if (!wolfP) continue;
      const targetSnaps = (tIds ?? [])
        .map((id) => nextState.players.find((p) => p.id === id))
        .filter((p): p is PlayerState => Boolean(p))
        .map((p) => snapshotPlayer(p));
      individualVotesMeta.push({
        wolf: snapshotPlayer(wolfP),
        target: targetSnaps[0] ?? null,
        ...(targetSnaps.length > 0 ? { targets: targetSnaps } : {}),
      });
    }
  } else if (actions.wolfPack?.individualVotes) {
    for (const [wId, tId] of Object.entries(actions.wolfPack.individualVotes)) {
      const wolfP = nextState.players.find((p) => p.id === wId);
      if (!wolfP) continue;
      const targetP = tId ? nextState.players.find((p) => p.id === tId) : undefined;
      individualVotesMeta.push({
        wolf: snapshotPlayer(wolfP),
        target: targetP ? snapshotPlayer(targetP) : null,
      });
    }
  }

  let wolfVictims: PlayerId[] = [];
  const blockedPackTargets = new Set<PlayerId>();

  for (const tId of deduplicatedTargets) {
    if (tId === protectedPlayerId) {
      blockedPackTargets.add(tId);
      bodyguardBlockedAny = true;
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

  // 4b. SÓI NGUYỀN (Accursed Wolf)
  const accursedWolfPlayer = nextState.players.find(
    (p) => p.isAlive && p.roleId === 'wolf_accursed'
  );
  let cursedBlockedByBg = false;
  let cursedSucceededId: PlayerId | null = null;
  let cursedTargetPreSnap: EventParticipantSnapshot | null = null;

  if (
    accursedWolfPlayer &&
    !nextState.accursedWolfUsed &&
    actions.accursedWolf?.curseTargetId
  ) {
    const curseTargetId = actions.accursedWolf.curseTargetId;
    const curseTarget = nextState.players.find((p) => p.id === curseTargetId && p.isAlive);
    if (curseTarget) {
      cursedTargetPreSnap = snapshotPlayer(curseTarget);
      if (curseTargetId === protectedPlayerId) {
        cursedBlockedByBg = true;
        bodyguardBlockedAny = true;
        nextState.accursedWolfUsed = false;
        nextState.historyLogs.push(
          `Bảo vệ đã che chở cho mục tiêu [${curseTargetId}], lời nguyền của Sói nguyền bị chặn và được hoàn trả!`
        );
      } else {
        cursedSucceededId = curseTarget.id;
        nextState.accursedWolfUsed = true;
        wolfVictims = wolfVictims.filter((id) => id !== curseTargetId);
        curseTarget.faction = 'WEREWOLF';
        curseTarget.roleId = 'werewolf';
        events.push({
          type: 'AWAKENED',
          sourceRole: 'wolf_accursed',
          targetPlayerId: curseTargetId,
          isPublic: false,
          details: 'Đã bị Sói nguyền biến thành Ma sói!',
        });
        nextState.historyLogs.push(`Sói nguyền đã biến [${curseTarget.name}] thành Ma sói!`);
      }
    }
  }

  // 4c. SÓI ĐẠI CA CẮN THÊM (Big Bad Wolf)
  const bigBadWolfPlayer = nextState.players.find(
    (p) => p.isAlive && p.roleId === 'big_bad_wolf'
  );
  let bbTargetId: PlayerId | null = null;
  let bbBlockedByBg = false;

  if (
    bigBadWolfPlayer &&
    !hasAnyBitingWolfDied(nextState) &&
    actions.bigBadWolf?.targetId
  ) {
    const candId = actions.bigBadWolf.targetId;
    const bbTarget = nextState.players.find((p) => p.id === candId && p.isAlive);
    if (bbTarget) {
      bbTargetId = bbTarget.id;
      if (bbTargetId === protectedPlayerId) {
        bbBlockedByBg = true;
        bodyguardBlockedAny = true;
        nextState.historyLogs.push(
          `Bảo vệ đã đỡ trúng vết cắn của Sói đại ca nhắm vào [${bbTargetId}]!`
        );
      } else {
        if (!wolfVictims.includes(bbTargetId)) {
          wolfVictims.push(bbTargetId);
        }
        events.push({
          type: 'WOLF_ATTACK',
          sourceRole: 'big_bad_wolf',
          targetPlayerId: bbTargetId,
          isPublic: false,
        });
      }
    }
  }

  // 5. SÓI TRẮNG ÁM SÁT RIÊNG (White Wolf - Đêm chẵn)
  const whiteWolfPlayer = nextState.players.find(
    (p) => p.isAlive && p.roleId === 'white_wolf'
  );
  let whiteWolfVictim: PlayerId | null = null;
  if (round % 2 === 0 && whiteWolfPlayer && actions.whiteWolf?.targetId) {
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

  // 6. PHÙ THỦY CỨU & NÉM ĐỘC (Witch Potions) — check isAlive
  let poisonVictim: PlayerId | null = null;
  let poisonBlockedByBothRule = false;
  let poisonRequestedTargetId: PlayerId | null = null;
  const witchSavedIds = new Set<PlayerId>();
  let witchSelfHealBlockedTargetId: PlayerId | null = null;
  let witchDoubleOverdoseId: PlayerId | null = null;
  let witchBlindHealInfo: {
    triggered: boolean;
    blockedByBodyguard: boolean;
    refunded: boolean;
  } | null = null;

  const witchPlayer = nextState.players.find((p) => p.isAlive && p.roleId === 'witch');
  const witchSnap = witchPlayer ? snapshotPlayer(witchPlayer) : null;

  if (witchPlayer && !nextState.villagePowerStripped && actions.witch) {
    const disallowBoth = nextState.settings.allowWitchBothPotionsSameNight === false;
    let healUsedThisNight = false;

    if (actions.witch.heal && !nextState.witchHealUsed) {
      nextState.witchHealUsed = true;
      healUsedThisNight = true;

      const allBittenBeforeBg = new Set([
        ...deduplicatedTargets,
        ...(bbTargetId ? [bbTargetId] : []),
      ]);

      if (
        nextState.settings.witchDoubleProtectKills &&
        protectedPlayerId &&
        allBittenBeforeBg.has(protectedPlayerId)
      ) {
        const isDoubleProtected =
          nextState.settings.witchHealMode === 'AOE' ||
          actions.witch.healTargetId === protectedPlayerId;
        if (isDoubleProtected) {
          witchDoubleOverdoseId = protectedPlayerId;
          nextState.historyLogs.push(
            `Mục tiêu [${protectedPlayerId}] vừa được Bảo vệ che chắn vừa được Phù thủy cứu -> Thuốc quá liều tử vong!`
          );
        }
      }

      let eligibleHealTargets = [...wolfVictims];
      if (!nextState.settings.allowWitchSelfHeal) {
        if (eligibleHealTargets.includes(witchPlayer.id)) {
          witchSelfHealBlockedTargetId = witchPlayer.id;
        }
        eligibleHealTargets = eligibleHealTargets.filter((id) => id !== witchPlayer.id);
      }

      if (eligibleHealTargets.length > 0) {
        if (nextState.settings.witchHealMode === 'AOE') {
          wolfVictims = wolfVictims.filter((id) => !eligibleHealTargets.includes(id));
          for (const savedId of eligibleHealTargets) {
            witchSavedIds.add(savedId);
            events.push({
              type: 'WITCH_HEAL',
              sourceRole: 'witch',
              targetPlayerId: savedId,
              isPublic: false,
            });
          }
          nextState.historyLogs.push('Phù thủy dùng bình Cứu AoE giải cứu tất cả nạn nhân bị Sói cắn!');
        } else {
          const savedId =
            actions.witch.healTargetId &&
            eligibleHealTargets.includes(actions.witch.healTargetId)
              ? actions.witch.healTargetId
              : eligibleHealTargets[0];

          if (savedId) {
            wolfVictims = wolfVictims.filter((id) => id !== savedId);
            witchSavedIds.add(savedId);
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
        const blockedByBg = Boolean(
          protectedPlayerId && allBittenBeforeBg.has(protectedPlayerId)
        );
        if (!nextState.settings.witchKnowsVictim && !nextState.settings.witchWasteHealOnEmpty) {
          nextState.witchHealUsed = false;
          witchBlindHealInfo = {
            triggered: true,
            blockedByBodyguard: blockedByBg,
            refunded: true,
          };
        } else {
          nextState.historyLogs.push(
            'Phù thủy dùng bình Cứu nhưng không có ai bị Sói cắn trong đêm!'
          );
          witchBlindHealInfo = {
            triggered: true,
            blockedByBodyguard: blockedByBg,
            refunded: false,
          };
        }
      }
    }

    if (actions.witch.poisonTargetId && !nextState.witchPoisonUsed) {
      poisonRequestedTargetId = actions.witch.poisonTargetId;
      if (disallowBoth && healUsedThisNight) {
        poisonBlockedByBothRule = true;
        nextState.historyLogs.push(
          'Luật phòng cấm Phù thủy dùng 2 bình trong cùng 1 đêm -> Bình độc bị khóa lại!'
        );
      } else {
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
  }

  // =========================================================================
  // GHI NHẬN MATCH EVENTS CHO BẢO VỆ, BẦY SÓI, SÓI NGUYỀN, SÓI ĐẠI CA, SÓI TRẮNG, PHÙ THỦY
  // =========================================================================

  // 1) Bảo vệ (chỉ ghi riêng khi bảo vệ thành công mà không có Sói tấn công mục tiêu đó)
  if (protectedPlayerId && !bodyguardBlockedAny && bodyguardSnap) {
    const protTarget = nextState.players.find((p) => p.id === protectedPlayerId);
    if (protTarget) {
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'PROTECT',
        visibility: 'SECRET_NIGHT',
        actor: bodyguardSnap,
        targets: [snapshotPlayer(protTarget)],
        outcome: 'SUCCESS',
      });
    }
  }

  // Helper dùng chung giải quyết 1 vết cắn của phe Sói (wolf_pack hoặc big_bad_wolf)
  const emitAndQueueWolfBite = (
    targetId: PlayerId,
    options: {
      isBigBadWolfExtra: boolean;
      wasBlockedByBodyguard: boolean;
      wasCursedInstead: boolean;
    }
  ) => {
    const victim = nextState.players.find((p) => p.id === targetId);
    if (!victim || !victim.isAlive) return;

    const actorSnap = options.isBigBadWolfExtra && bigBadWolfPlayer
      ? snapshotPlayer(bigBadWolfPlayer)
      : (wolfActorsSnaps[0] ?? null);
    const coActors = options.isBigBadWolfExtra ? undefined : wolfActorsSnaps;
    const baseWolfMeta = {
      isDoubleKill: targetCount === 2 && !options.isBigBadWolfExtra,
      isBigBadWolfExtra: options.isBigBadWolfExtra,
      ...(individualVotesMeta.length > 0 && !options.isBigBadWolfExtra
        ? { individualVotes: individualVotesMeta }
        : {}),
      ...(wolfVoteDetails.tieBreakRandom && !options.isBigBadWolfExtra
        ? { tieBreakRandom: true }
        : {}),
    };

    if (options.wasCursedInstead) {
      // Đã xử lý bằng event CURSE bên dưới
      return;
    }

    if (options.wasBlockedByBodyguard) {
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'ATTACK',
        visibility: 'SECRET_NIGHT',
        actor: actorSnap,
        coActors,
        targets: [snapshotPlayer(victim)],
        outcome: 'BLOCKED_BY_BODYGUARD',
        involvedPlayerIds: bodyguardSnap ? [bodyguardSnap.playerId] : [],
        metadata: {
          wolfPack: baseWolfMeta,
          ...(bodyguardSnap ? { protector: bodyguardSnap } : {}),
        },
      });
      return;
    }

    if (witchSavedIds.has(victim.id)) {
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'ATTACK',
        visibility: 'SECRET_NIGHT',
        actor: actorSnap,
        coActors,
        targets: [snapshotPlayer(victim)],
        outcome: 'SAVED_BY_WITCH',
        involvedPlayerIds: witchSnap ? [witchSnap.playerId] : [],
        metadata: {
          wolfPack: baseWolfMeta,
          ...(witchSnap ? { healer: witchSnap } : {}),
        },
      });
      return;
    }

    // Nếu nạn nhân đồng thời trúng độc Phù thủy trong cùng đêm
    if (poisonVictim === victim.id && (victim.roleId === 'cursed' || victim.roleId === 'tough_guy')) {
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'ATTACK',
        visibility: 'SECRET_NIGHT',
        actor: actorSnap,
        coActors,
        targets: [snapshotPlayer(victim)],
        outcome: 'OVERRIDDEN_BY_POISON',
        metadata: { wolfPack: baseWolfMeta },
      });
      return;
    }

    // Già làng có 2 giáp trước đòn Sói
    if (victim.roleId === 'elder' && (victim.elderHp ?? 2) > 1) {
      victim.elderHp = 1;
      events.push({
        type: 'SURVIVED',
        targetPlayerId: victim.id,
        isPublic: false,
        details: 'Già làng chịu 1 vết cắn, còn 1 giáp',
      });
      nextState.historyLogs.push('Đêm qua làng có người bị tấn công nhưng đã kiên cường gượng dậy.');
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'ATTACK',
        visibility: 'SECRET_NIGHT',
        actor: actorSnap,
        coActors,
        targets: [snapshotPlayer(victim)],
        outcome: 'IMMUNE',
        metadata: { wolfPack: baseWolfMeta },
      });
      return;
    }

    // Kẻ bị nguyền hóa Sói
    if (victim.roleId === 'cursed') {
      const oldSnap = snapshotPlayer(victim);
      victim.faction = 'WEREWOLF';
      victim.roleId = 'werewolf';
      events.push({
        type: 'AWAKENED',
        targetPlayerId: victim.id,
        isPublic: false,
        details: 'Kẻ bị nguyền đã biến thành Ma sói!',
      });
      nextState.historyLogs.push('Một thế lực bóng đêm vừa trỗi dậy trong đêm...');
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'CURSED_TURN',
        visibility: 'SECRET_NIGHT',
        actor: oldSnap,
        targets: [oldSnap],
        outcome: 'SUCCESS',
        metadata: {
          wolfPack: baseWolfMeta,
          roleChange: {
            oldRoleId: 'cursed',
            newRoleId: 'werewolf',
            oldFaction: 'VILLAGER',
            newFaction: 'WEREWOLF',
          },
        },
      });
      return;
    }

    // Người cứng cỏi (Tough Guy) — guard không ghi vết thương trễ kép nếu đã nằm trong pendingDeaths!
    if (victim.roleId === 'tough_guy') {
      const alreadyDyingTonight = pendingDeaths.some((d) => d.playerId === victim.id);
      if (!alreadyDyingTonight && !victim.toughGuyBittenNight) {
        victim.toughGuyBittenNight = round;
        events.push({
          type: 'SURVIVED',
          targetPlayerId: victim.id,
          isPublic: false,
          details: 'Người cứng cỏi chịu vết cắn, sống thêm 1 ngày',
        });
        nextState.historyLogs.push('Người cứng cỏi đã bị tấn công nhưng vẫn kiên cường trụ lại.');
        appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'NIGHT',
          actionType: 'ATTACK',
          visibility: 'SECRET_NIGHT',
          actor: actorSnap,
          coActors,
          targets: [snapshotPlayer(victim)],
          outcome: 'IMMUNE',
          metadata: { wolfPack: baseWolfMeta },
        });
        return;
      }
      if (alreadyDyingTonight) {
        appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'NIGHT',
          actionType: 'ATTACK',
          visibility: 'SECRET_NIGHT',
          actor: actorSnap,
          coActors,
          targets: [snapshotPlayer(victim)],
          outcome: 'NO_EFFECT',
          metadata: {
            wolfPack: baseWolfMeta,
            note: 'nạn nhân đã kiệt sức tử vong từ vết cắn đêm trước',
          },
        });
        return;
      }
    }

    const atkEvt = appendMatchEvent(nextState, {
      roundNumber: round,
      stage: 'NIGHT',
      actionType: 'ATTACK',
      visibility: 'SECRET_NIGHT',
      actor: actorSnap,
      coActors,
      targets: [snapshotPlayer(victim)],
      outcome: 'SUCCESS',
      metadata: {
        wolfPack: baseWolfMeta,
        ...(witchSelfHealBlockedTargetId === victim.id
          ? { witch: { selfHealBlocked: true } }
          : {}),
      },
    });
    pendingDeaths.push({ playerId: victim.id, cause: 'WOLF_PACK', parentEventId: atkEvt.id });
  };

  // 2) Bầy Ma sói (wolf_pack)
  if (isFirstNightPeace && wolfActorsSnaps.length > 0) {
    nextState.historyLogs.push('Đêm 1 luật hòa bình: Ma sói chỉ nhận mặt, không có ai bị cắn chết!');
    appendMatchEvent(nextState, {
      roundNumber: round,
      stage: 'NIGHT',
      actionType: 'ATTACK',
      visibility: 'SECRET_NIGHT',
      actor: wolfActorsSnaps[0] ?? null,
      coActors: wolfActorsSnaps,
      targets: [],
      outcome: 'SKIPPED',
      metadata: { wolfPack: { firstNightPeaceRule: true } },
    });
  } else if (deduplicatedTargets.length === 0 && wolfActorsSnaps.length > 0 && actions.wolfPack) {
    appendMatchEvent(nextState, {
      roundNumber: round,
      stage: 'NIGHT',
      actionType: 'ATTACK',
      visibility: 'SECRET_NIGHT',
      actor: wolfActorsSnaps[0] ?? null,
      coActors: wolfActorsSnaps,
      targets: [],
      outcome: 'SKIPPED',
      metadata: {
        wolfPack: {
          skipWon: wolfVoteDetails.skipWon,
          friendlyFireBlocked: wolfVoteDetails.friendlyFireBlocked,
          tieBreakRandom: wolfVoteDetails.tieBreakRandom,
          ...(individualVotesMeta.length > 0 ? { individualVotes: individualVotesMeta } : {}),
        },
      },
    });
  } else {
    for (const tId of deduplicatedTargets) {
      emitAndQueueWolfBite(tId, {
        isBigBadWolfExtra: false,
        wasBlockedByBodyguard: blockedPackTargets.has(tId),
        wasCursedInstead: cursedSucceededId === tId,
      });
    }
  }

  // 3) Sói nguyền (wolf_accursed)
  if (accursedWolfPlayer && cursedTargetPreSnap) {
    if (cursedBlockedByBg) {
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'CURSE',
        visibility: 'SECRET_NIGHT',
        actor: snapshotPlayer(accursedWolfPlayer),
        targets: [cursedTargetPreSnap],
        outcome: 'BLOCKED_BY_BODYGUARD',
        involvedPlayerIds: bodyguardSnap ? [bodyguardSnap.playerId] : [],
        metadata: bodyguardSnap ? { protector: bodyguardSnap } : undefined,
      });
    } else if (cursedSucceededId) {
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'CURSE',
        visibility: 'SECRET_NIGHT',
        actor: snapshotPlayer(accursedWolfPlayer),
        targets: [cursedTargetPreSnap],
        outcome: 'SUCCESS',
      });
    }
  }

  // 4) Sói đại ca (big_bad_wolf)
  if (bigBadWolfPlayer && bbTargetId && !deduplicatedTargets.includes(bbTargetId)) {
    emitAndQueueWolfBite(bbTargetId, {
      isBigBadWolfExtra: true,
      wasBlockedByBodyguard: bbBlockedByBg,
      wasCursedInstead: false,
    });
  }

  // 5) Sói trắng (white_wolf)
  if (round % 2 === 0 && whiteWolfPlayer) {
    if (whiteWolfVictim) {
      const target = nextState.players.find((p) => p.id === whiteWolfVictim);
      if (target) {
        const wwEvt = appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'NIGHT',
          actionType: 'ATTACK',
          visibility: 'SECRET_NIGHT',
          actor: snapshotPlayer(whiteWolfPlayer),
          targets: [snapshotPlayer(target)],
          outcome: 'SUCCESS',
        });
        pendingDeaths.push({
          playerId: target.id,
          cause: 'WHITE_WOLF',
          parentEventId: wwEvt.id,
        });
      }
    } else if (actions.whiteWolf && actions.whiteWolf.targetId === null) {
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'ATTACK',
        visibility: 'SECRET_NIGHT',
        actor: snapshotPlayer(whiteWolfPlayer),
        targets: [],
        outcome: 'SKIPPED',
      });
    }
  }

  // 6) Phù thủy (Overdose / Cứu trượt / Độc)
  if (witchSnap) {
    if (witchDoubleOverdoseId) {
      const target = nextState.players.find((p) => p.id === witchDoubleOverdoseId);
      if (target) {
        const odEvt = appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'NIGHT',
          actionType: 'HEAL',
          visibility: 'SECRET_NIGHT',
          actor: witchSnap,
          targets: [snapshotPlayer(target)],
          outcome: 'OVERDOSE_DOUBLE_PROTECT',
          involvedPlayerIds: bodyguardSnap ? [bodyguardSnap.playerId] : [],
          metadata: bodyguardSnap ? { protector: bodyguardSnap } : undefined,
        });
        pendingDeaths.push({
          playerId: target.id,
          cause: 'WOLF_PACK',
          parentEventId: odEvt.id,
        });
      }
    } else if (witchBlindHealInfo?.triggered) {
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'HEAL',
        visibility: 'SECRET_NIGHT',
        actor: witchSnap,
        targets: [],
        outcome: 'NO_EFFECT',
        metadata: {
          witch: {
            mode: nextState.settings.witchHealMode,
            blockedByBodyguard: witchBlindHealInfo.blockedByBodyguard,
            refundedHeal: witchBlindHealInfo.refunded,
            wastedHeal: !witchBlindHealInfo.refunded,
          },
        },
      });
    }

    if (poisonBlockedByBothRule && poisonRequestedTargetId) {
      const target = nextState.players.find((p) => p.id === poisonRequestedTargetId);
      if (target) {
        appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'NIGHT',
          actionType: 'POISON',
          visibility: 'SECRET_NIGHT',
          actor: witchSnap,
          targets: [snapshotPlayer(target)],
          outcome: 'NO_EFFECT',
          metadata: { witch: { blockedByBothRule: true } },
        });
      }
    } else if (poisonVictim) {
      const target = nextState.players.find((p) => p.id === poisonVictim);
      if (target) {
        const overridden = witchSavedIds.has(target.id);
        const poisonEvt = appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'NIGHT',
          actionType: 'POISON',
          visibility: 'SECRET_NIGHT',
          actor: witchSnap,
          targets: [snapshotPlayer(target)],
          outcome: overridden ? 'OVERRIDDEN_BY_POISON' : 'SUCCESS',
        });
        pendingDeaths.push({
          playerId: target.id,
          cause: 'WITCH_POISON',
          parentEventId: poisonEvt.id,
        });
      }
    }
  }

  // =========================================================================
  // 7. CÁC VAI THU THẬP THÔNG TIN & CAN THIỆP
  // =========================================================================
  // 7a. Tiên tri (Seer) & Tiên tri tập sự (Apprentice Seer)
  const seerTargetId = actions.seer?.targetId ?? actions.apprenticeSeer?.targetId;
  if (seerTargetId && !nextState.villagePowerStripped) {
    const aliveSeer = nextState.players.find((p) => p.isAlive && p.roleId === 'seer');
    const aliveApprentice = nextState.players.find(
      (p) => p.isAlive && p.roleId === 'apprentice_seer'
    );
    if (aliveSeer || aliveApprentice) {
      const target = state.players.find((p) => p.id === seerTargetId);
      if (target) {
        const effectiveRoleId =
          target.roleId === 'drunk' && state.roundNumber >= 3 && target.drunkRealRoleId
            ? target.drunkRealRoleId
            : target.roleId;
        const def = ROLES_BY_ID[effectiveRoleId];
        let result: SeerResult | string = def?.seerResult ?? 'VILLAGER';
        const isExact = nextState.settings.seerRevealMode === 'EXACT_ROLE';
        if (isExact) {
          result = effectiveRoleId;
        } else {
          if (effectiveRoleId === 'lycan') result = 'WEREWOLF';
          if (effectiveRoleId === 'minion') result = 'VILLAGER';
        }

        infoResults.seerResult = {
          targetId: target.id,
          result,
        };
        if (!aliveSeer && aliveApprentice) {
          infoResults.apprenticeSeerResult = {
            targetId: target.id,
            result,
          };
        }

        const actingSeer = aliveSeer ?? aliveApprentice!;
        const targetSnap = getStartOfNightSnapshot(state, target.id);
        if (targetSnap) {
          const resultLabel = isExact
            ? (ROLES_BY_ID[String(result)]?.nameVi ?? String(result))
            : result === 'WEREWOLF'
              ? 'Ma Sói'
              : 'Dân làng';
          appendMatchEvent(nextState, {
            roundNumber: round,
            stage: 'NIGHT',
            actionType: 'INSPECT',
            visibility: 'SECRET_NIGHT',
            actor: snapshotPlayer(actingSeer),
            targets: [targetSnap],
            outcome: 'SUCCESS',
            metadata: {
              investigation: {
                kind: isExact ? 'SEER_EXACT' : 'SEER_FACTION',
                resultLabel,
                rawValue: result,
              },
            },
          });
        }
      }
    }
  }

  // 7b. Pháp sư sói (Sorcerer)
  const aliveSorcerer = nextState.players.find((p) => p.isAlive && p.roleId === 'sorcerer');
  if (aliveSorcerer && actions.sorcerer?.targetId) {
    const target = state.players.find((p) => p.id === actions.sorcerer!.targetId);
    const effectiveRoleId =
      target && target.roleId === 'drunk' && state.roundNumber >= 3 && target.drunkRealRoleId
        ? target.drunkRealRoleId
        : target?.roleId;
    const isSeer = effectiveRoleId === 'seer';
    infoResults.sorcererResult = {
      targetId: actions.sorcerer.targetId,
      isSeer,
    };

    const targetSnap = getStartOfNightSnapshot(state, actions.sorcerer.targetId);
    if (targetSnap) {
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'INSPECT',
        visibility: 'SECRET_NIGHT',
        actor: snapshotPlayer(aliveSorcerer),
        targets: [targetSnap],
        outcome: 'SUCCESS',
        metadata: {
          investigation: {
            kind: 'SORCERER',
            resultLabel: isSeer ? 'Đúng là Tiên tri' : 'Không phải Tiên tri',
            rawValue: isSeer,
          },
        },
      });
    }
  }

  // 7c. Tiên tri hào quang (Aura Seer)
  if (actions.auraSeer?.targetId && !nextState.villagePowerStripped) {
    const aliveAuraSeer = nextState.players.find(
      (p) => p.isAlive && p.roleId === 'aura_seer'
    );
    if (aliveAuraSeer) {
      const target = state.players.find((p) => p.id === actions.auraSeer!.targetId);
      if (target) {
        const result = getAuraSeerResult(target, state.roundNumber);
        infoResults.auraResult = {
          targetId: target.id,
          result,
        };
        const targetSnap = getStartOfNightSnapshot(state, target.id);
        if (targetSnap) {
          appendMatchEvent(nextState, {
            roundNumber: round,
            stage: 'NIGHT',
            actionType: 'INSPECT',
            visibility: 'SECRET_NIGHT',
            actor: snapshotPlayer(aliveAuraSeer),
            targets: [targetSnap],
            outcome: 'SUCCESS',
            metadata: {
              investigation: {
                kind: 'AURA',
                resultLabel: result === 'SPECIAL' ? 'Đặc biệt' : 'Người thường',
                rawValue: result,
              },
            },
          });
        }
      }
    }
  }

  // 7d. Thám tử (P.I.)
  const alivePi = nextState.players.find((p) => p.isAlive && p.roleId === 'pi');
  if (actions.pi?.targetId && !nextState.villagePowerStripped && !nextState.piUsed && alivePi) {
    const target = nextState.players.find((p) => p.id === actions.pi!.targetId && p.isAlive);
    if (target) {
      nextState.piUsed = true;
      const neighbors = getAliveNeighbors(nextState.players, target.id);
      const group = neighbors ? neighbors.group : [target];
      const hasWerewolf = group.some((p) => isWerewolfForInvestigation(p));
      infoResults.piResult = {
        targetId: target.id,
        hasWerewolf,
        inspectedPlayerIds: group.map((p) => p.id),
      };
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'INSPECT',
        visibility: 'SECRET_NIGHT',
        actor: snapshotPlayer(alivePi),
        targets: [snapshotPlayer(target)],
        outcome: 'SUCCESS',
        metadata: {
          investigation: {
            kind: 'GROUP_HAS_WOLF',
            resultLabel: hasWerewolf ? 'Có Ma Sói' : 'Không có Ma Sói',
            rawValue: hasWerewolf,
            inspectedPlayers: group.map((p) => snapshotPlayer(p)),
            keptPower: false,
          },
        },
      });
    }
  }

  // 7e. Con cáo (Fox)
  const aliveFox = nextState.players.find((p) => p.isAlive && p.roleId === 'fox');
  if (aliveFox && !nextState.villagePowerStripped && !nextState.foxLostPower && actions.fox) {
    if (actions.fox.isSkip) {
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'INSPECT',
        visibility: 'SECRET_NIGHT',
        actor: snapshotPlayer(aliveFox),
        targets: [],
        outcome: 'SKIPPED',
      });
    } else if (actions.fox.targetId) {
      const target = nextState.players.find((p) => p.id === actions.fox!.targetId && p.isAlive);
      if (target) {
        const neighbors = getAliveNeighbors(nextState.players, target.id);
        const group = neighbors ? neighbors.group : [target];
        const hasWerewolf = group.some((p) => isWerewolfForInvestigation(p));
        if (!hasWerewolf) {
          nextState.foxLostPower = true;
        }
        infoResults.foxResult = {
          targetId: target.id,
          hasWerewolf,
          inspectedPlayerIds: group.map((p) => p.id),
        };
        appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'NIGHT',
          actionType: 'INSPECT',
          visibility: 'SECRET_NIGHT',
          actor: snapshotPlayer(aliveFox),
          targets: [snapshotPlayer(target)],
          outcome: hasWerewolf ? 'SUCCESS' : 'LOST_POWER',
          metadata: {
            investigation: {
              kind: 'GROUP_HAS_WOLF',
              resultLabel: hasWerewolf ? 'Có Ma Sói' : 'Không có Ma Sói',
              rawValue: hasWerewolf,
              inspectedPlayers: group.map((p) => snapshotPlayer(p)),
              keptPower: hasWerewolf,
            },
          },
        });
      }
    }
  }

  // 7f. Kẻ phá rối (Troublemaker)
  const aliveTroublemaker = nextState.players.find(
    (p) => p.isAlive && p.roleId === 'troublemaker'
  );
  if (
    actions.troublemaker?.activate &&
    !nextState.villagePowerStripped &&
    !nextState.troublemakerUsed &&
    aliveTroublemaker
  ) {
    nextState.troublemakerUsed = true;
    nextState.doubleVoteDay = true;
    nextState.historyLogs.push('Kẻ phá rối đã hành động: Hôm nay làng sẽ treo cổ 2 người!');
    appendMatchEvent(nextState, {
      roundNumber: round,
      stage: 'NIGHT',
      actionType: 'DOUBLE_VOTE_SABOTAGE',
      visibility: 'SECRET_NIGHT',
      actor: snapshotPlayer(aliveTroublemaker),
      targets: [],
      outcome: 'SUCCESS',
    });
  }

  // 7g. Người phù phép (Spellcaster)
  let chosenMuteTargetId: PlayerId | null = null;
  const aliveSpellcaster = nextState.players.find(
    (p) => p.isAlive && p.roleId === 'spellcaster'
  );
  let spellcasterAttempt: {
    actor: EventParticipantSnapshot;
    target: EventParticipantSnapshot;
    invalidReason?: string;
  } | null = null;

  if (actions.spellcaster?.targetId && !nextState.villagePowerStripped && aliveSpellcaster) {
    const target = nextState.players.find((p) => p.id === actions.spellcaster!.targetId);
    if (target && target.isAlive) {
      if (target.id !== nextState.lastMutedPlayerId) {
        nextState.lastMutedPlayerId = target.id;
        chosenMuteTargetId = target.id;
        spellcasterAttempt = {
          actor: snapshotPlayer(aliveSpellcaster),
          target: snapshotPlayer(target),
        };
      } else {
        spellcasterAttempt = {
          actor: snapshotPlayer(aliveSpellcaster),
          target: snapshotPlayer(target),
          invalidReason: 'chọn trùng mục tiêu đêm trước',
        };
      }
    }
  }

  // 7h. Người thổi sáo (Pied Piper)
  const alivePiedPiper = nextState.players.find(
    (p) => p.isAlive && p.roleId === 'pied_piper'
  );
  if (actions.piedPiper?.targetIds && alivePiedPiper) {
    const newlyEnchanted: EventParticipantSnapshot[] = [];
    for (const tId of actions.piedPiper.targetIds) {
      const target = nextState.players.find((p) => p.id === tId && p.isAlive);
      if (target && !target.isEnchanted) {
        target.isEnchanted = true;
        newlyEnchanted.push(snapshotPlayer(target));
        events.push({
          type: 'AWAKENED',
          sourceRole: 'pied_piper',
          targetPlayerId: target.id,
          isPublic: false,
          details: 'Đã bị Người thổi sáo thôi miên',
        });
      }
    }
    if (newlyEnchanted.length > 0) {
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'ENCHANT',
        visibility: 'SECRET_NIGHT',
        actor: snapshotPlayer(alivePiedPiper),
        targets: newlyEnchanted,
        outcome: 'SUCCESS',
      });
    }
  }

  // 7i. Trưởng giáo phái (Cult Leader)
  const aliveCultLeader = nextState.players.find(
    (p) => p.isAlive && p.roleId === 'cult_leader'
  );
  if (actions.cultLeader?.targetId && aliveCultLeader) {
    const target = nextState.players.find(
      (p) =>
        p.id === actions.cultLeader!.targetId &&
        p.isAlive &&
        p.id !== aliveCultLeader.id
    );
    if (target && !target.isCultMember) {
      target.isCultMember = true;
      events.push({
        type: 'AWAKENED',
        sourceRole: 'cult_leader',
        targetPlayerId: target.id,
        isPublic: false,
        details: 'Đã gia nhập giáo phái của Trưởng giáo phái',
      });
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'CONVERT_CULT',
        visibility: 'SECRET_NIGHT',
        actor: snapshotPlayer(aliveCultLeader),
        targets: [snapshotPlayer(target)],
        outcome: 'SUCCESS',
      });
    }
  }

  // Gom các vai có quyền chủ động trong đêm nhưng chọn không dùng thuốc/phép vào 1 dòng mờ cuối đêm
  const idleNotes: string[] = [];
  if (
    witchSnap &&
    !nextState.villagePowerStripped &&
    !actions.witch?.heal &&
    !actions.witch?.poisonTargetId &&
    (!nextState.witchHealUsed || !nextState.witchPoisonUsed)
  ) {
    idleNotes.push(`Phù thủy ${witchSnap.name} giữ nguyên thuốc`);
  }
  if (accursedWolfPlayer && !nextState.accursedWolfUsed && !cursedBlockedByBg) {
    idleNotes.push(`Sói nguyền ${accursedWolfPlayer.name} không nguyền`);
  }
  if (
    aliveTroublemaker &&
    !nextState.villagePowerStripped &&
    !nextState.troublemakerUsed &&
    !actions.troublemaker?.activate
  ) {
    idleNotes.push(`Kẻ phá rối ${aliveTroublemaker.name} chưa kích hoạt phép`);
  }
  if (
    alivePi &&
    !nextState.villagePowerStripped &&
    !nextState.piUsed &&
    !actions.pi?.targetId
  ) {
    idleNotes.push(`Thám tử ${alivePi.name} chưa dùng lượt soi`);
  }

  // =========================================================================
  // 8. CHỐT SÁT THƯƠNG ĐÊM & CHUỖI TỬ VONG
  // =========================================================================
  const newDeaths = processDeathCascade(nextState, pendingDeaths);

  // Xử lý câm lặng của Spellcaster sau death cascade
  if (chosenMuteTargetId) {
    const targetPlayer = nextState.players.find((p) => p.id === chosenMuteTargetId);
    if (targetPlayer && targetPlayer.isAlive) {
      nextState.mutedPlayerId = chosenMuteTargetId;
      targetPlayer.isMuted = true;
      if (spellcasterAttempt) {
        appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'NIGHT',
          actionType: 'SILENCE',
          visibility: 'SECRET_NIGHT',
          actor: spellcasterAttempt.actor,
          targets: [spellcasterAttempt.target],
          outcome: 'SUCCESS',
        });
      }
    } else {
      nextState.mutedPlayerId = null;
      if (spellcasterAttempt) {
        appendMatchEvent(nextState, {
          roundNumber: round,
          stage: 'NIGHT',
          actionType: 'SILENCE',
          visibility: 'SECRET_NIGHT',
          actor: spellcasterAttempt.actor,
          targets: [spellcasterAttempt.target],
          outcome: 'NO_EFFECT',
          metadata: { note: 'nạn nhân tử vong trước bình minh' },
        });
      }
    }
  } else {
    nextState.mutedPlayerId = null;
    if (spellcasterAttempt?.invalidReason) {
      appendMatchEvent(nextState, {
        roundNumber: round,
        stage: 'NIGHT',
        actionType: 'SILENCE',
        visibility: 'SECRET_NIGHT',
        actor: spellcasterAttempt.actor,
        targets: [spellcasterAttempt.target],
        outcome: 'NO_EFFECT',
        metadata: { note: spellcasterAttempt.invalidReason },
      });
    }
  }

  for (const p of nextState.players) {
    if (p.id !== nextState.mutedPlayerId) {
      p.isMuted = false;
    }
  }

  if (idleNotes.length > 0) {
    appendMatchEvent(nextState, {
      roundNumber: round,
      stage: 'NIGHT',
      actionType: 'NIGHT_IDLE_SUMMARY',
      visibility: 'SECRET_NIGHT',
      actor: null,
      targets: [],
      outcome: 'SKIPPED',
      metadata: { idleNotes },
    });
  }

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

  // Tổng kết bình minh (DAWN_SUMMARY) luôn ghi nhận ở cuối đêm (kể cả khi kết thúc game ngay cuối đêm)
  const dawnDeaths = newDeaths
    .map((d) => {
      const p = nextState.players.find((pl) => pl.id === d.playerId);
      if (!p) return null;
      return {
        victim: snapshotPlayer(p),
        cause: d.cause,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  appendMatchEvent(nextState, {
    roundNumber: round,
    stage: 'DAY_ANNOUNCEMENT',
    actionType: 'DAWN_SUMMARY',
    visibility: 'PUBLIC',
    actor: null,
    targets: dawnDeaths.map((d) => d.victim),
    outcome: 'SUCCESS',
    metadata: { dawnDeaths },
  });

  return {
    nextState,
    output: {
      newDeaths,
      infoResults,
      events,
    },
  };
}
