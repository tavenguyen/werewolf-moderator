import { canHostTallyEarly } from '../engine/voting';
import { checkWinCondition } from '../engine/winConditions';
import { SEANCE_QUESTIONS } from '../engine/lunarEvents';
import { getRawWolfTargets, getWitchVictimsPreview } from '../engine/nightResolution';
import { buildPublicTimeline, getMorningAnnouncements } from '../engine/matchLog';
import { ROLES_BY_ID } from '../engine/roles';
import type {
  HostBoardView,
  PlayerPrivateView,
  PostGameView,
  PublicLunarView,
  PublicPlayerView,
  PublicRoomView,
  RoomPlayer,
  RoomState,
} from './types';
import type { DeathCause, PlayerId, SeanceQuestionId } from '../engine/types';

const PUBLIC_WITNESSED_DEATH_CAUSES = new Set<DeathCause>([
  'VILLAGE_VOTE',
  'HUNTER_SHOT',
  'EMERGENCY_ELIMINATE',
]);

/**
 * Tạo PublicRoomView:
 * Dữ liệu công khai dành cho bảng trung tâm, màn hình chiếu hoặc thông tin chung.
 * TUYỆT ĐỐI không bao gồm role, faction hay thông tin nhạy cảm của người chơi còn sống.
 */
export function createPublicRoomView(room: RoomState): PublicRoomView {
  const gameState = room.gameState;

  const publicPlayers: PublicPlayerView[] = Array.from(room.players.values())
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((p: RoomPlayer) => {
      const pState = gameState?.players.find((pl) => pl.id === p.id);
      return {
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
        isAlive: pState ? pState.isAlive : p.isAlive,
        isConnected: p.isConnected,
        voteWeight: pState ? pState.voteWeight : 1,
        isMayor: gameState ? gameState.mayorId === p.id : false,
      };
    });

  let currentTurnInfo: PublicRoomView['currentTurnInfo'] = undefined;
  if (gameState?.phase === 'NIGHT' && room.nightTurnPlan.length > 0) {
    const currentTurn = room.nightTurnPlan[room.currentNightTurnIndex];
    if (currentTurn) {
      const nextTurn = room.nightTurnPlan[room.currentNightTurnIndex + 1];
      currentTurnInfo = {
        turnKey: currentTurn.turnKey,
        titleVi: currentTurn.titleVi,
        titleEn: currentTurn.titleEn,
        turnIndex: room.currentNightTurnIndex + 1,
        totalTurns: room.nightTurnPlan.length,
        nextTurnTitleVi: nextTurn ? nextTurn.titleVi : null,
      };
    }
  }

  // Nếu revealOnDeath = false thì giấu vai trò, nguyên nhân ngầm và độ sâu chuỗi chết cho đến khi GAME_OVER
  // Ngoại lệ: Trăng Máu (bloodMoonRevealedPlayerIds) vẫn công bố roleId của nạn nhân đêm đó
  const bloodMoonRevealedIds = gameState?.lunarState?.bloodMoonRevealedPlayerIds ?? [];
  const deaths = (gameState?.deaths ?? []).map((d) => {
    if (room.settings.revealOnDeath) {
      return d;
    }
    const isBloodMoonRevealed = bloodMoonRevealedIds.includes(d.playerId);
    return {
      playerId: d.playerId,
      roleId: isBloodMoonRevealed ? d.roleId : 'unknown',
      roundNumber: d.roundNumber,
      phase: d.phase,
      cause: PUBLIC_WITNESSED_DEATH_CAUSES.has(d.cause) ? d.cause : ('UNKNOWN' as const),
    };
  });

  let voteProgress: PublicRoomView['voteProgress'] = null;
  if (
    gameState &&
    (gameState.phase === 'DAY_DISCUSS' ||
      gameState.phase === 'DAY_RUNOFF' ||
      gameState.phase === 'DAY_MAYOR_ELECTION')
  ) {
    const eligibleTotal = gameState.players.filter(
      (p) => p.isAlive && (gameState.phase === 'DAY_MAYOR_ELECTION' || p.voteWeight > 0)
    ).length;
    const ballotMap =
      gameState.phase === 'DAY_MAYOR_ELECTION'
        ? gameState.dayState?.mayorBallots
        : gameState.phase === 'DAY_RUNOFF'
        ? gameState.dayState?.runoffBallots
        : gameState.dayState?.ballots;
    const submitted = ballotMap ? Object.keys(ballotMap).length : 0;
    voteProgress = { submitted, total: eligibleTotal };
  }

  const timelineState =
    gameState && room.settings.revealOnDeath !== gameState.settings.revealOnDeath
      ? {
          ...gameState,
          settings: {
            ...gameState.settings,
            revealOnDeath: room.settings.revealOnDeath,
          },
        }
      : gameState;
  const publicTimeline = timelineState ? buildPublicTimeline(timelineState) : [];
  const morningAnnouncements = gameState
    ? getMorningAnnouncements(publicTimeline, gameState.roundNumber)
    : [];
  const operationalNotices =
    gameState?.phase === 'DAY_DISCUSS'
      ? Array.from(
          new Set(
            (room.publicHistoryLogs ?? []).filter(
              (msg) => msg === 'Quản trò đã mở hòm phiếu sớm!'
            )
          )
        )
      : [];
  const publicLogs = gameState
    ? [...publicTimeline.map((item) => item.text), ...operationalNotices]
    : (room.publicHistoryLogs ?? []);

  const lunarState = gameState?.lunarState;
  const lunarView: PublicLunarView | null = lunarState
    ? {
        currentDayEvent: lunarState.currentDayEvent ?? null,
        lastEchoPermanentActive: Boolean(lunarState.lastEchoPermanentActive),
        neighborsFuryPlayerIds: lunarState.neighborsFuryPlayerIds ?? [],
        flashTrialActiveToday: Boolean(lunarState.flashTrialActiveToday),
        openBallotActiveToday: Boolean(lunarState.openBallotActiveToday),
        todayPenaltyVotes: lunarState.todayPenaltyVotes ?? {},
        seance: lunarState.seanceState
          ? {
              stage: lunarState.seanceState.stage,
              mediumPlayerId: lunarState.seanceState.mediumPlayerId,
              targetDeadPlayerId: lunarState.seanceState.targetDeadPlayerId,
              selectedQuestionId: lunarState.seanceState.selectedQuestionId,
              selectedQuestionText: lunarState.seanceState.selectedQuestionText ?? null,
              answer: lunarState.seanceState.answer,
            }
          : null,
        activeLastEchoExecutorId: lunarState.lastEchoState?.activeExecutorId ?? null,
      }
    : null;

  return {
    roomCode: room.roomCode,
    gameGeneration: room.gameGeneration,
    phase: gameState?.phase ?? 'LOBBY',
    roundNumber: gameState?.roundNumber ?? 0,
    players: publicPlayers,
    deadlineAt: room.timers.deadlineAt,
    isPaused: room.timers.isPaused,
    pausedRemainingSeconds:
      room.timers.isPaused && room.timers.remainingBeforePause != null
        ? Math.max(0, Math.ceil(room.timers.remainingBeforePause / 1000))
        : null,
    voteLocked: gameState?.dayState?.voteLocked ?? false,
    voteLockRemainingSeconds: gameState?.dayState?.voteLockRemainingSeconds ?? null,
    extensionsUsed: gameState?.dayState?.extensionsUsed ?? 0,
    settings: room.settings,
    deaths,
    publicLogs,
    publicTimeline,
    morningAnnouncements,
    currentTurnInfo,
    lastVoteTally: room.lastVoteTally,
    bearGrowled: gameState?.players.some((p) => p.roleId === 'bear_tamer')
      ? gameState.bearGrowled
      : undefined,
    princeRevealed: gameState?.princeRevealed,
    mutedPlayerId: gameState?.mutedPlayerId ?? null,
    doubleVoteDay: Boolean(gameState?.doubleVoteDay),
    runoffCandidates:
      gameState?.phase === 'DAY_RUNOFF' ? (gameState.dayState?.runoffCandidates ?? []) : undefined,
    activeHunterPlayerId:
      gameState?.phase === 'HUNTER_SHOT' ? (gameState.pendingHunterShotPlayerId ?? null) : null,
    voteProgress,
    lunarView,
  };
}

/**
 * Tạo HostBoardView:
 * Dành riêng cho màn hình Host / Bảng điều khiển quản trị.
 * Kế thừa publicRoomView và bổ sung metadata quyền thao tác.
 * TUYỆT ĐỐI không hiển thị vai trò người chơi còn sống nếu Host là bảng trung tâm.
 */
export function createHostBoardView(room: RoomState): HostBoardView {
  const publicRoom = createPublicRoomView(room);
  const gameState = room.gameState;
  const playerCount = room.players.size;

  const canStart = !gameState && playerCount >= 6 && playerCount <= 16;
  const isDayPhase =
    gameState?.phase === 'DAY_DISCUSS' || gameState?.phase === 'DAY_MAYOR_ELECTION';
  const canPause = Boolean(gameState && isDayPhase && !room.timers.isPaused);
  const canResume = Boolean(gameState && room.timers.isPaused);
  const canExtend = Boolean(
    gameState &&
      gameState.phase === 'DAY_DISCUSS' &&
      (gameState.dayState?.extensionsUsed ?? 0) < 2
  );
  const canTallyEarlyCheck = Boolean(
    gameState &&
      gameState.phase === 'DAY_DISCUSS' &&
      !gameState.dayState?.voteLocked &&
      canHostTallyEarly(gameState)
  );

  const connectedPlayerCount = Array.from(room.players.values()).filter(
    (p) => p.isConnected
  ).length;

  return {
    publicRoom,
    isHostPlayer: room.host.isPlayer,
    hostPlayerId: room.host.playerId ?? null,
    canStart,
    canPause,
    canResume,
    canExtend,
    canTallyEarly: canTallyEarlyCheck,
    connectedPlayerCount,
  };
}

/**
 * Tạo PlayerPrivateView:
 * Góc nhìn riêng tư trên thiết bị của từng người chơi.
 * Chỉ phát vai trò của chính người chơi, mục tiêu hợp lệ, và đồng đội được phép thấy.
 */
export function createPlayerPrivateView(
  room: RoomState,
  playerId: PlayerId
): PlayerPrivateView | null {
  const roomPlayer = room.players.get(playerId);
  if (!roomPlayer) return null;

  const gameState = room.gameState;
  if (!gameState) {
    // Trạng thái LOBBY trước khi bắt đầu ván
    return {
      playerId: roomPlayer.id,
      seatIndex: roomPlayer.seatIndex,
      isAlive: true,
      roleId: '',
      initialRoleId: '',
      faction: 'VILLAGER',
      isMayor: false,
      canActCurrentTurn: false,
      turnKey: null,
      validTargets: [],
      skills: {},
      teammates: [],
      investigationResult: null,
      lunarActions: null,
    };
  }

  const pState = gameState.players.find((p) => p.id === playerId);
  if (!pState) return null;

  let canActCurrentTurn = false;
  let turnKey: string | null = null;
  let validTargets: PlayerId[] = [];

  const getEffectiveIdentity = (pl: (typeof gameState.players)[number]) => {
    if (pl.roleId === 'drunk' && gameState.roundNumber >= 3 && pl.drunkRealRoleId) {
      return {
        roleId: pl.drunkRealRoleId,
        faction: ROLES_BY_ID[pl.drunkRealRoleId]?.faction ?? pl.faction,
      };
    }
    return { roleId: pl.roleId, faction: pl.faction };
  };

  const isDrunkAwakened =
    pState.roleId === 'drunk' && gameState.roundNumber >= 3 && Boolean(pState.drunkRealRoleId);
  const effectiveRoleId = isDrunkAwakened ? pState.drunkRealRoleId! : pState.roleId;
  const effectiveFaction = isDrunkAwakened
    ? (ROLES_BY_ID[pState.drunkRealRoleId!]?.faction ?? pState.faction)
    : pState.faction;

  const usedHealThisNight = Boolean(room.nightActionsAccumulator.witch?.heal);
  const usedPoisonThisNight = Boolean(room.nightActionsAccumulator.witch?.poisonTargetId);
  const disallowBothPotions = room.settings.allowWitchBothPotionsSameNight === false;
  const effectiveWitchHealUsed = Boolean(
    gameState.witchHealUsed || usedHealThisNight || (disallowBothPotions && usedPoisonThisNight)
  );
  const effectiveWitchPoisonUsed = Boolean(
    gameState.witchPoisonUsed ||
      usedPoisonThisNight ||
      (disallowBothPotions && usedHealThisNight)
  );

  const skills: PlayerPrivateView['skills'] = {
    witchHealUsed: effectiveWitchHealUsed,
    witchPoisonUsed: effectiveWitchPoisonUsed,
    lastProtectedPlayerId: gameState.lastProtectedPlayerId,
    elderHp: pState.elderHp ?? (isDrunkAwakened && effectiveRoleId === 'elder' ? 2 : undefined),
    accursedWolfUsed: gameState.accursedWolfUsed,
    isMuted: pState.id === gameState.mutedPlayerId || Boolean(pState.isMuted),
    foxLostPower: Boolean(gameState.foxLostPower),
    piUsed: Boolean(gameState.piUsed),
    troublemakerUsed: Boolean(gameState.troublemakerUsed),
    isEnchanted: Boolean(pState.isEnchanted),
    isCultMember: Boolean(pState.isCultMember),
    doppelgangerTargetId:
      pState.doppelgangerTargetId ?? (room.nightActionsAccumulator.doppelganger?.targetId ?? null),
    drunkRealRoleId:
      (pState.roleId === 'drunk' || pState.initialRoleId === 'drunk') && gameState.roundNumber >= 3
        ? (pState.drunkRealRoleId ?? null)
        : undefined,
    silverShieldActiveTonight: Boolean(gameState.lunarState?.silverShieldActiveTonight),
    mistyMoonActiveTonight: Boolean(gameState.lunarState?.mistyMoonActiveTonight),
  };

  if (effectiveRoleId === 'mason' || pState.initialRoleId === 'mason') {
    skills.masonPartnerIds = gameState.players
      .filter((p) => {
        const otherRole =
          p.roleId === 'drunk' && gameState.roundNumber >= 3 && p.drunkRealRoleId
            ? p.drunkRealRoleId
            : p.roleId;
        return (p.initialRoleId === 'mason' || otherRole === 'mason') && p.id !== playerId;
      })
      .map((p) => p.id);
  }

  if (effectiveRoleId === 'wild_child' || pState.initialRoleId === 'wild_child') {
    skills.roleModelId =
      pState.roleModelId ?? (room.nightActionsAccumulator.wildChild?.targetId ?? null);
  }

  if (effectiveRoleId === 'dire_wolf' || pState.initialRoleId === 'dire_wolf') {
    skills.companionId =
      pState.companionId ?? (room.nightActionsAccumulator.direWolf?.targetId ?? null);
  }

  if (effectiveRoleId === 'hoodlum' || pState.initialRoleId === 'hoodlum') {
    skills.hoodlumTargetIds =
      pState.hoodlumTargetIds ??
      (room.nightActionsAccumulator.hoodlum
        ? [
            room.nightActionsAccumulator.hoodlum.target1,
            room.nightActionsAccumulator.hoodlum.target2,
          ]
        : null);
  }

  let investigationResult: PlayerPrivateView['investigationResult'] = null;
  let lunarActions: PlayerPrivateView['lunarActions'] = null;

  // Xử lý theo từng pha game
  if (gameState.phase === 'NIGHT' && room.nightTurnPlan.length > 0) {
    const currentTurn = room.nightTurnPlan[room.currentNightTurnIndex];
    if (currentTurn) {
      const isMyTurn = currentTurn.activePlayerIds.includes(playerId);
      if (isMyTurn && currentTurn.canAct && pState.isAlive) {
        canActCurrentTurn = !room.nightActionAcks.has(playerId);
        turnKey = currentTurn.turnKey;

        // Tính mục tiêu hợp lệ cho từng lượt
        validTargets = calculateNightValidTargets(room, playerId, currentTurn.turnKey);

        // Lưu thông tin nạn nhân bầy Sói cho Sói nguyền và Phù thủy
        if (
          currentTurn.turnKey === 'wolf_accursed' ||
          currentTurn.turnKey === 'night_wolf_accursed' ||
          (currentTurn.turnKey === 'witch' && room.settings.witchKnowsVictim)
        ) {
          skills.wolfPackVictimId = getRawWolfPackVictim(room);
        }

        if (currentTurn.turnKey === 'wolf_pack' && gameState.wolfCubDoubleKillNextNight) {
          skills.wolfCubDoubleKillNextNight = true;
        }

        // Nếu Phù thủy biết nạn nhân bị cắn đêm nay (đã lọc qua Bảo vệ và Sói nguyền)
        if (currentTurn.turnKey === 'witch' && room.settings.witchKnowsVictim) {
          const victims = getWolfPackVictimCandidates(room);
          skills.witchVictimIds = victims;
          skills.witchVictimId = victims[0] ?? null;
        }
      }
    }

    if (effectiveRoleId === 'seer' && room.seerInvestigationResult) {
      investigationResult = room.seerInvestigationResult;
    } else if (
      effectiveRoleId === 'apprentice_seer' &&
      room.seerInvestigationResult &&
      !gameState.players.some((p) => p.isAlive && getEffectiveIdentity(p).roleId === 'seer')
    ) {
      investigationResult = room.seerInvestigationResult;
    } else if (effectiveRoleId === 'sorcerer' && room.sorcererInvestigationResult) {
      investigationResult = {
        targetId: room.sorcererInvestigationResult.targetId,
        result: room.sorcererInvestigationResult.mistyMoon
          ? Boolean(room.sorcererInvestigationResult.hasWerewolf)
          : room.sorcererInvestigationResult.isSeer,
        hasWerewolf: room.sorcererInvestigationResult.hasWerewolf,
        inspectedPlayerIds: room.sorcererInvestigationResult.inspectedPlayerIds,
        mistyMoon: room.sorcererInvestigationResult.mistyMoon,
      };
    } else if (
      (effectiveRoleId === 'aura_seer' || pState.initialRoleId === 'aura_seer') &&
      room.auraInvestigationResult
    ) {
      investigationResult = room.auraInvestigationResult;
    } else if (
      (effectiveRoleId === 'fox' || pState.initialRoleId === 'fox') &&
      room.foxInvestigationResult
    ) {
      investigationResult = {
        targetId: room.foxInvestigationResult.targetId,
        result: room.foxInvestigationResult.hasWerewolf,
        hasWerewolf: room.foxInvestigationResult.hasWerewolf,
        inspectedPlayerIds: room.foxInvestigationResult.inspectedPlayerIds,
        keptPower: room.foxInvestigationResult.keptPower,
      };
    } else if (
      (effectiveRoleId === 'pi' || pState.initialRoleId === 'pi') &&
      room.piInvestigationResult
    ) {
      investigationResult = {
        targetId: room.piInvestigationResult.targetId,
        result: room.piInvestigationResult.hasWerewolf,
        hasWerewolf: room.piInvestigationResult.hasWerewolf,
        inspectedPlayerIds: room.piInvestigationResult.inspectedPlayerIds,
      };
    }
  } else if (gameState.phase === 'DAY_MAYOR_ELECTION') {
    if (pState.isAlive) {
      const alreadyVoted = Object.prototype.hasOwnProperty.call(
        gameState.dayState?.mayorBallots ?? {},
        playerId
      );
      canActCurrentTurn = !alreadyVoted;
      turnKey = 'mayor_election';
      validTargets = gameState.players.filter((p) => p.isAlive).map((p) => p.id);
    }
  } else if (gameState.phase === 'DAY_DISCUSS') {
    const isLocked = gameState.dayState?.voteLocked ?? true;
    const alreadyVoted = Object.prototype.hasOwnProperty.call(
      gameState.dayState?.ballots ?? {},
      playerId
    );
    if (pState.isAlive && pState.voteWeight > 0 && !isLocked && !alreadyVoted) {
      canActCurrentTurn = true;
      turnKey = 'day_vote';
      validTargets = gameState.players
        .filter((p) => p.isAlive && p.id !== playerId)
        .map((p) => p.id);
    }
  } else if (gameState.phase === 'DAY_RUNOFF') {
    const candidates = gameState.dayState?.runoffCandidates ?? [];
    const alreadyVoted = Object.prototype.hasOwnProperty.call(
      gameState.dayState?.runoffBallots ?? {},
      playerId
    );
    if (pState.isAlive && pState.voteWeight > 0 && !alreadyVoted) {
      canActCurrentTurn = true;
      turnKey = 'runoff_vote';
      validTargets = candidates;
    }
  } else if (gameState.phase === 'HUNTER_SHOT') {
    if (gameState.pendingHunterShotPlayerId === playerId) {
      canActCurrentTurn = true;
      turnKey = 'hunter_shot';
      validTargets = gameState.players
        .filter((p) => p.isAlive && p.id !== playerId)
        .map((p) => p.id);
    }
  } else if (gameState.phase === 'MAYOR_SUCCESSION') {
    if (gameState.pendingMayorSuccessionPlayerId === playerId) {
      canActCurrentTurn = true;
      turnKey = 'mayor_succession';
      validTargets = gameState.players
        .filter((p) => p.isAlive && p.id !== playerId)
        .map((p) => p.id);
    }
  } else if (gameState.phase === 'LUNAR_SEANCE' && gameState.lunarState?.seanceState) {
    const seance = gameState.lunarState.seanceState;
    const canPickSeanceQuestion =
      seance.stage === 'PICK_QUESTION' && seance.mediumPlayerId === playerId;
    const canAnswerSeance =
      seance.stage === 'WAIT_ANSWER' && seance.targetDeadPlayerId === playerId;
    if (canPickSeanceQuestion || canAnswerSeance) {
      canActCurrentTurn = true;
      turnKey = canPickSeanceQuestion ? 'lunar_seance_pick' : 'lunar_seance_answer';
    }
    lunarActions = {
      canPickSeanceQuestion,
      canAnswerSeance,
      canMarkLastEcho: false,
      seanceQuestions: canPickSeanceQuestion
        ? (Object.entries(SEANCE_QUESTIONS) as Array<[SeanceQuestionId, string]>).map(
            ([id, text]) => ({ id, text })
          )
        : undefined,
    };
  } else if (gameState.phase === 'LAST_ECHO_MARK') {
    const activeExecutorId = gameState.lunarState?.lastEchoState?.activeExecutorId ?? null;
    if (activeExecutorId === playerId) {
      canActCurrentTurn = true;
      turnKey = 'last_echo_mark';
      validTargets = gameState.players.filter((p) => p.isAlive).map((p) => p.id);
    }
    lunarActions = {
      canPickSeanceQuestion: false,
      canAnswerSeance: false,
      canMarkLastEcho: activeExecutorId === playerId,
    };
  }

  // Đồng đội (Teammates):
  // 1. Sói thấy nhau (bao gồm White Wolf; Dream Wolf chỉ thấy khi đã thức tỉnh)
  // 2. Kẻ phản bội (Minion) chỉ thấy Sói ở Đêm 1
  const teammates: PlayerPrivateView['teammates'] = [];

  const isWolfMember = effectiveFaction === 'WEREWOLF' || effectiveRoleId === 'white_wolf';

  if (isWolfMember && (effectiveRoleId !== 'dream_wolf' || gameState.dreamWolfAwakened)) {
    for (const pl of gameState.players) {
      if (pl.id === playerId) continue;
      const other = getEffectiveIdentity(pl);
      const isOtherWolf = other.faction === 'WEREWOLF' || other.roleId === 'white_wolf';
      if (isOtherWolf && other.roleId !== 'minion' && other.roleId !== 'sorcerer') {
        // Sói thường chỉ thấy Sói trắng là 'werewolf' bình thường để bảo mật danh tính
        const displayedRoleId =
          other.roleId === 'white_wolf' && effectiveRoleId !== 'white_wolf'
            ? 'werewolf'
            : other.roleId;

        teammates.push({
          id: pl.id,
          name: pl.name,
          roleId: displayedRoleId,
        });
      }
    }
  } else if (effectiveRoleId === 'minion' && gameState.roundNumber === 1) {
    // Minion thấy ai là Sói ở Đêm 1 (Sói trắng cũng hiển thị là 'werewolf')
    for (const pl of gameState.players) {
      if (pl.id === playerId) continue;
      const other = getEffectiveIdentity(pl);
      const isOtherWolf = other.faction === 'WEREWOLF' || other.roleId === 'white_wolf';
      if (isOtherWolf && other.roleId !== 'minion' && other.roleId !== 'sorcerer') {
        const displayedRoleId = other.roleId === 'white_wolf' ? 'werewolf' : other.roleId;

        teammates.push({
          id: pl.id,
          name: pl.name,
          roleId: displayedRoleId,
        });
      }
    }
  }

  // 3. Hội Tam Điểm (Mason) nhận diện anh em
  if (effectiveRoleId === 'mason' || pState.initialRoleId === 'mason') {
    for (const pl of gameState.players) {
      if (pl.id === playerId) continue;
      const other = getEffectiveIdentity(pl);
      if (pl.initialRoleId === 'mason' || other.roleId === 'mason') {
        teammates.push({
          id: pl.id,
          name: pl.name,
          roleId: 'mason',
        });
      }
    }
  }

  return {
    playerId: pState.id,
    seatIndex: pState.seatIndex,
    isAlive: pState.isAlive,
    roleId: effectiveRoleId,
    initialRoleId: pState.initialRoleId,
    faction: effectiveFaction,
    isMayor: gameState.mayorId === playerId,
    loverId: pState.loverId ?? null,
    isCrossFactionCouple: pState.isCrossFactionCouple,
    canActCurrentTurn,
    turnKey,
    validTargets,
    skills,
    teammates,
    investigationResult,
    lunarActions,
  };
}

/**
 * Tính toán danh sách target hợp lệ cho từng lượt đêm.
 */
function calculateNightValidTargets(
  room: RoomState,
  playerId: PlayerId,
  turnKey: string
): PlayerId[] {
  const gameState = room.gameState;
  if (!gameState) return [];

  const livingPlayers = gameState.players.filter((p) => p.isAlive);

  switch (turnKey) {
    case 'cupid':
      return room.settings.allowCupidSelfMatch === false
        ? livingPlayers.filter((p) => p.id !== playerId).map((p) => p.id)
        : livingPlayers.map((p) => p.id);

    case 'bodyguard':
      // Không được bảo vệ cùng 1 người 2 đêm liên tiếp (trừ khi Khiên Bạc đang hiệu lực)
      if (gameState.lunarState?.silverShieldActiveTonight) {
        return livingPlayers.map((p) => p.id);
      }
      return livingPlayers
        .filter((p) => p.id !== gameState.lastProtectedPlayerId)
        .map((p) => p.id);

    case 'wolf_pack':
      if (room.settings.allowWolfFriendlyFire) {
        return livingPlayers.map((p) => p.id);
      }
      return livingPlayers
        .filter((p) => p.faction !== 'WEREWOLF' && p.roleId !== 'white_wolf')
        .map((p) => p.id);

    case 'white_wolf':
      // Sói trắng cắn các Sói khác
      return livingPlayers
        .filter((p) => p.id !== playerId && (p.faction === 'WEREWOLF' || p.roleId === 'werewolf'))
        .map((p) => p.id);

    case 'seer':
    case 'sorcerer':
      // Soi người khác còn sống
      return livingPlayers.filter((p) => p.id !== playerId).map((p) => p.id);

    case 'witch':
      return livingPlayers.map((p) => p.id);

    case 'wild_child':
    case 'night_wild_child':
    case 'dire_wolf':
    case 'night_dire_wolf':
    case 'hoodlum':
    case 'night_hoodlum':
      return livingPlayers.filter((p) => p.id !== playerId).map((p) => p.id);

    case 'mason':
    case 'night_mason':
      return [];

    case 'aura_seer':
    case 'night_aura_seer':
      return livingPlayers.filter((p) => p.id !== playerId).map((p) => p.id);

    case 'fox':
    case 'night_fox':
    case 'pi':
    case 'night_pi':
      return livingPlayers.map((p) => p.id);

    case 'spellcaster':
    case 'night_spellcaster':
      return livingPlayers
        .filter((p) => !gameState.lastMutedPlayerId || p.id !== gameState.lastMutedPlayerId)
        .map((p) => p.id);

    case 'troublemaker':
    case 'night_troublemaker':
      return [];

    case 'big_bad_wolf':
    case 'night_big_bad_wolf': {
      const packVictims = new Set(getWolfPackVictimCandidates(room));
      return livingPlayers
        .filter((p) => {
          if (p.id === playerId) return false;
          if (packVictims.has(p.id)) return false;
          if (!room.settings.allowWolfFriendlyFire) {
            if (p.faction === 'WEREWOLF' || p.roleId === 'white_wolf') {
              return false;
            }
          }
          return true;
        })
        .map((p) => p.id);
    }

    case 'wolf_accursed':
    case 'night_wolf_accursed': {
      const victimId = getRawWolfPackVictim(room);
      if (victimId) {
        const victimPlayer = gameState.players.find((p) => p.id === victimId);
        if (victimPlayer && victimPlayer.isAlive) {
          return [victimId];
        }
      }
      return [];
    }

    case 'doppelganger':
    case 'night_doppelganger':
      return livingPlayers.filter((p) => p.id !== playerId).map((p) => p.id);

    case 'pied_piper':
    case 'night_pied_piper':
      return livingPlayers.filter((p) => p.id !== playerId && !p.isEnchanted).map((p) => p.id);

    case 'cult_leader':
    case 'night_cult_leader':
      return livingPlayers.filter((p) => p.id !== playerId && !p.isCultMember).map((p) => p.id);

    default:
      return [];
  }
}

/**
 * Lấy mục tiêu thô bầy sói đã vote cắn (chưa kiểm tra bảo vệ hay lời nguyền).
 */
export function getRawWolfPackVictim(room: RoomState): PlayerId | null {
  if (room.gameState) {
    const rawTargets = getRawWolfTargets(
      room.gameState,
      room.nightActionsAccumulator,
      room.currentNightSeed
    );
    return rawTargets[0] ?? null;
  }

  const wolfActions = room.nightActionsAccumulator.wolfPack;
  if (wolfActions && !wolfActions.isSkip) {
    if (wolfActions.targets && wolfActions.targets.length > 0) {
      return wolfActions.targets[0];
    }

    // Fallback: Tally trực tiếp từ individualVotes nếu targets chưa được gán
    if (wolfActions.individualVotes) {
      const counts = new Map<PlayerId, number>();
      for (const targetId of Object.values(wolfActions.individualVotes)) {
        if (targetId) {
          counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
        }
      }
      if (counts.size > 0) {
        const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
        return sorted[0][0];
      }
    }
  }

  if (room.nightActionsAccumulator.bigBadWolf?.targetId) {
    return room.nightActionsAccumulator.bigBadWolf.targetId;
  }

  return null;
}

/**
 * Lấy toàn bộ danh sách nạn nhân sói cắn tạm thời để gửi cho Phù thủy biết.
 * Nhất quán với getWitchVictimsPreview (xử lý big_bad_wolf, wolfCubDoubleKillNextNight,
 * bảo vệ trùng đêm trước, villagePowerStripped và lời nguyền Sói nguyền).
 */
export function getWolfPackVictimCandidates(room: RoomState): PlayerId[] {
  if (room.gameState) {
    return getWitchVictimsPreview(
      room.gameState,
      room.nightActionsAccumulator,
      room.currentNightSeed
    );
  }

  const rawVictim = getRawWolfPackVictim(room);
  if (!rawVictim) return [];

  const protectedId = room.nightActionsAccumulator.bodyguard?.targetId;
  const cursedId = room.nightActionsAccumulator.accursedWolf?.curseTargetId;

  if (rawVictim === protectedId || rawVictim === cursedId) {
    return [];
  }

  return [rawVictim];
}

/**
 * Lấy mục tiêu sói cắn đầu tiên tạm thời để gửi cho Phù thủy biết (tương thích ngược).
 */
export function getWolfPackVictimCandidate(room: RoomState): PlayerId | null {
  return getWolfPackVictimCandidates(room)[0] ?? null;
}

/**
 * Tạo PostGameView:
 * Chỉ công bố toàn bộ vai trò và timeline giải mã khi ván chơi kết thúc (GAME_OVER).
 */
export function createPostGameView(room: RoomState): PostGameView | null {
  const gameState = room.gameState;
  if (!gameState || gameState.phase !== 'GAME_OVER') {
    return null;
  }

  const winOutcome = checkWinCondition(gameState);

  const allRoles = gameState.players.map((p) => ({
    id: p.id,
    name: p.name,
    seatIndex: p.seatIndex,
    initialRoleId: p.initialRoleId,
    finalRoleId: p.roleId,
    drunkRealRoleId: p.drunkRealRoleId ?? null,
    faction: p.faction,
    isAlive: p.isAlive,
  }));

  return {
    winOutcome,
    allRoles,
    deaths: gameState.deaths,
    historyLogs: gameState.historyLogs,
    timeline: gameState.resolvedEvents ?? [],
    matchEvents: (gameState.eventLog ?? []).filter((e) => e.visibility !== 'SYSTEM_DEBUG'),
  };
}
