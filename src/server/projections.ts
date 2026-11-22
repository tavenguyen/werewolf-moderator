import { canHostTallyEarly } from '../engine/voting';
import { checkWinCondition } from '../engine/winConditions';
import type {
  HostBoardView,
  PlayerPrivateView,
  PostGameView,
  PublicPlayerView,
  PublicRoomView,
  RoomPlayer,
  RoomState,
} from './types';
import type { PlayerId } from '../engine/types';

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
      currentTurnInfo = {
        turnKey: currentTurn.turnKey,
        titleVi: currentTurn.titleVi,
        titleEn: currentTurn.titleEn,
      };
    }
  }

  // Nếu revealOnDeath = false thì giấu vai trò người chết cho đến khi GAME_OVER
  const deaths = (gameState?.deaths ?? []).map((d) => ({
    ...d,
    roleId: room.settings.revealOnDeath ? d.roleId : 'unknown',
  }));

  return {
    roomCode: room.roomCode,
    gameGeneration: room.gameGeneration,
    phase: gameState?.phase ?? 'LOBBY',
    roundNumber: gameState?.roundNumber ?? 0,
    players: publicPlayers,
    deadlineAt: room.timers.deadlineAt,
    isPaused: room.timers.isPaused,
    voteLocked: gameState?.dayState?.voteLocked ?? false,
    voteLockRemainingSeconds: gameState?.dayState?.voteLockRemainingSeconds ?? null,
    extensionsUsed: gameState?.dayState?.extensionsUsed ?? 0,
    settings: room.settings,
    deaths,
    publicLogs: room.publicHistoryLogs ?? [],
    currentTurnInfo,
    lastVoteTally: room.lastVoteTally,
    bearGrowled: gameState?.bearGrowled,
    princeRevealed: gameState?.princeRevealed,
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
    };
  }

  const pState = gameState.players.find((p) => p.id === playerId);
  if (!pState) return null;

  let canActCurrentTurn = false;
  let turnKey: string | null = null;
  let validTargets: PlayerId[] = [];

  const skills: PlayerPrivateView['skills'] = {
    witchHealUsed: gameState.witchHealUsed,
    witchPoisonUsed: gameState.witchPoisonUsed,
    lastProtectedPlayerId: gameState.lastProtectedPlayerId,
    elderHp: pState.elderHp,
  };

  if (pState.roleId === 'mason' || pState.initialRoleId === 'mason') {
    skills.masonPartnerIds = gameState.players
      .filter((p) => p.initialRoleId === 'mason' && p.id !== playerId)
      .map((p) => p.id);
  }

  if (pState.roleId === 'wild_child' || pState.initialRoleId === 'wild_child') {
    skills.roleModelId =
      pState.roleModelId ?? (room.nightActionsAccumulator.wildChild?.targetId ?? null);
  }

  if (pState.roleId === 'dire_wolf' || pState.initialRoleId === 'dire_wolf') {
    skills.companionId =
      pState.companionId ?? (room.nightActionsAccumulator.direWolf?.targetId ?? null);
  }

  if (pState.roleId === 'hoodlum' || pState.initialRoleId === 'hoodlum') {
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

        // Nếu Phù thủy biết nạn nhân bị cắn đêm nay
        if (currentTurn.turnKey === 'witch' && room.settings.witchKnowsVictim) {
          skills.witchVictimId = getWolfPackVictimCandidate(room);
        }
      }
    }

    if (pState.roleId === 'seer' && room.seerInvestigationResult) {
      investigationResult = room.seerInvestigationResult;
    } else if (pState.roleId === 'sorcerer' && room.sorcererInvestigationResult) {
      investigationResult = {
        targetId: room.sorcererInvestigationResult.targetId,
        result: room.sorcererInvestigationResult.isSeer,
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
  }

  // Đồng đội (Teammates):
  // 1. Sói thấy nhau (bao gồm White Wolf; Dream Wolf chỉ thấy khi đã thức tỉnh)
  // 2. Kẻ phản bội (Minion) chỉ thấy Sói ở Đêm 1
  const teammates: PlayerPrivateView['teammates'] = [];
  const isWolfMember = pState.faction === 'WEREWOLF' || pState.roleId === 'white_wolf';

  if (isWolfMember && (pState.roleId !== 'dream_wolf' || gameState.dreamWolfAwakened)) {
    for (const pl of gameState.players) {
      if (pl.id === playerId) continue;
      const isOtherWolf = pl.faction === 'WEREWOLF' || pl.roleId === 'white_wolf';
      if (isOtherWolf && pl.roleId !== 'minion' && pl.roleId !== 'sorcerer') {
        // Sói thường chỉ thấy Sói trắng là 'werewolf' bình thường để bảo mật danh tính
        const displayedRoleId =
          pl.roleId === 'white_wolf' && pState.roleId !== 'white_wolf'
            ? 'werewolf'
            : pl.roleId;

        teammates.push({
          id: pl.id,
          name: pl.name,
          roleId: displayedRoleId,
        });
      }
    }
  } else if (pState.roleId === 'minion' && gameState.roundNumber === 1) {
    // Minion thấy ai là Sói ở Đêm 1 (Sói trắng cũng hiển thị là 'werewolf')
    for (const pl of gameState.players) {
      if (pl.id === playerId) continue;
      const isOtherWolf = pl.faction === 'WEREWOLF' || pl.roleId === 'white_wolf';
      if (isOtherWolf && pl.roleId !== 'minion' && pl.roleId !== 'sorcerer') {
        const displayedRoleId = pl.roleId === 'white_wolf' ? 'werewolf' : pl.roleId;

        teammates.push({
          id: pl.id,
          name: pl.name,
          roleId: displayedRoleId,
        });
      }
    }
  } else if (pState.roleId === 'mason' || pState.initialRoleId === 'mason') {
    for (const pl of gameState.players) {
      if (pl.id === playerId) continue;
      if (pl.initialRoleId === 'mason') {
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
    roleId: pState.roleId,
    initialRoleId: pState.initialRoleId,
    faction: pState.faction,
    isMayor: gameState.mayorId === playerId,
    loverId: pState.loverId ?? null,
    isCrossFactionCouple: pState.isCrossFactionCouple,
    canActCurrentTurn,
    turnKey,
    validTargets,
    skills,
    teammates,
    investigationResult,
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
      return livingPlayers.map((p) => p.id);

    case 'bodyguard':
      // Không được bảo vệ cùng 1 người 2 đêm liên tiếp
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

    default:
      return [];
  }
}

/**
 * Lấy mục tiêu sói cắn tạm thời để gửi cho Phù thủy biết.
 */
function getWolfPackVictimCandidate(room: RoomState): PlayerId | null {
  const wolfActions = room.nightActionsAccumulator.wolfPack;
  if (!wolfActions || wolfActions.isSkip) return null;

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

  return null;
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
    faction: p.faction,
    isAlive: p.isAlive,
  }));

  return {
    winOutcome,
    allRoles,
    deaths: gameState.deaths,
    historyLogs: gameState.historyLogs,
    timeline: gameState.resolvedEvents ?? [],
  };
}
