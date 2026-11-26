import type { DayState, GameState, PlayerId } from './types';

export interface DayVoteOutcome {
  type: 'EXECUTE' | 'RUNOFF' | 'ESCAPE';
  targetPlayerId?: PlayerId | null;
  candidateIds?: PlayerId[];
  reason: string;
}

/**
 * Khởi tạo DayState ban đầu cho một ngày mới:
 * 180s thảo luận, 60s đếm lùi khóa vote, chưa pause, 0 lần gia hạn.
 */
export function createInitialDayState(): DayState {
  return {
    discussionSecondsRemaining: 180,
    voteLockRemainingSeconds: 60,
    voteLocked: true,
    isPaused: false,
    extensionsUsed: 0,
    ballots: {},
  };
}

/**
 * Trôi thời gian timer thảo luận (Pure Function):
 * Nếu đang pause thì không trôi; voteLockRemainingSeconds đếm lùi độc lập 60s.
 */
export function tickDayTimer(state: GameState, elapsedSeconds: number): GameState {
  const nextState: GameState = structuredClone(state);
  if (!nextState.dayState || nextState.dayState.isPaused) {
    return nextState;
  }

  const currentRemaining = nextState.dayState.discussionSecondsRemaining;
  nextState.dayState.discussionSecondsRemaining = Math.max(0, currentRemaining - elapsedSeconds);

  // Đếm lùi 60s khóa vote độc lập với thời gian thảo luận (không bị ảnh hưởng khi gia hạn +30s)
  const currentLock = nextState.dayState.voteLockRemainingSeconds;
  const newLock = Math.max(0, currentLock - elapsedSeconds);
  nextState.dayState.voteLockRemainingSeconds = newLock;

  if (newLock === 0) {
    nextState.dayState.voteLocked = false;
  }

  return nextState;
}

/**
 * Gia hạn thời gian thảo luận (+30s): Tối đa 2 lần mỗi ngày.
 * voteLockRemainingSeconds không bị kéo dài khi gia hạn.
 */
export function extendDayDiscussion(state: GameState, extraSeconds: number = 30): GameState {
  const nextState: GameState = structuredClone(state);
  if (!nextState.dayState) return nextState;

  if (nextState.dayState.extensionsUsed < 2) {
    nextState.dayState.extensionsUsed += 1;
    nextState.dayState.discussionSecondsRemaining += extraSeconds;
    nextState.historyLogs.push(
      `Đã gia hạn thêm ${extraSeconds}s thảo luận (${nextState.dayState.extensionsUsed}/2 lần)!`
    );
  }

  return nextState;
}

/**
 * Tạm dừng / Tiếp tục đếm giờ ban ngày.
 */
export function toggleDayPause(state: GameState): GameState {
  const nextState: GameState = structuredClone(state);
  if (!nextState.dayState) return nextState;

  nextState.dayState.isPaused = !nextState.dayState.isPaused;
  nextState.historyLogs.push(
    nextState.dayState.isPaused ? 'Đã tạm dừng đồng hồ thảo luận.' : 'Tiếp tục đếm giờ thảo luận.'
  );

  return nextState;
}

/**
 * Mở khóa bỏ phiếu sớm (Host chủ động mở trước khi hết 60s đầu).
 */
export function unlockVoteEarly(state: GameState): GameState {
  const nextState: GameState = structuredClone(state);
  if (!nextState.dayState) return nextState;

  nextState.dayState.voteLockRemainingSeconds = 0;
  nextState.dayState.voteLocked = false;
  return nextState;
}

/**
 * Gửi phiếu bầu Trưởng làng Ngày 1 (chỉ áp dụng khi settings.hasMayor bật).
 */
export function castMayorBallot(
  state: GameState,
  voterId: PlayerId,
  candidateId: PlayerId | null
): GameState {
  const nextState: GameState = structuredClone(state);
  if (!nextState.dayState) return nextState;

  const voter = nextState.players.find((p) => p.id === voterId && p.isAlive);
  if (!voter) return nextState;

  if (candidateId !== null) {
    const candidate = nextState.players.find((p) => p.id === candidateId && p.isAlive);
    if (!candidate) return nextState;
  }

  if (!nextState.dayState.mayorBallots) {
    nextState.dayState.mayorBallots = {};
  }

  nextState.dayState.mayorBallots[voterId] = candidateId;
  return nextState;
}

/**
 * Chốt kết quả bầu Trưởng làng Ngày 1:
 * Đa số phiếu thắng; hòa phiếu thì ván đấu không có Trưởng làng.
 */
export function tallyMayorElection(state: GameState): {
  nextState: GameState;
  electedMayorId: PlayerId | null;
} {
  const nextState: GameState = structuredClone(state);
  if (!nextState.dayState || !nextState.dayState.mayorBallots) {
    nextState.historyLogs.push('Không có ai nhận được phiếu bầu Trưởng làng. Không có Trưởng làng!');
    nextState.phase = 'DAY_DISCUSS';
    return { nextState, electedMayorId: null };
  }

  const counts = new Map<PlayerId, number>();
  for (const candidateId of Object.values(nextState.dayState.mayorBallots)) {
    if (!candidateId) continue;
    const p = nextState.players.find((pl) => pl.id === candidateId && pl.isAlive);
    if (p) {
      counts.set(candidateId, (counts.get(candidateId) ?? 0) + 1);
    }
  }

  if (counts.size === 0) {
    nextState.historyLogs.push('Không có ai nhận được phiếu bầu Trưởng làng. Không có Trưởng làng!');
    nextState.phase = 'DAY_DISCUSS';
    return { nextState, electedMayorId: null };
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const highestVotes = sorted[0][1];
  const topCandidates = sorted.filter((entry) => entry[1] === highestVotes);

  if (topCandidates.length === 1) {
    const winnerId = topCandidates[0][0];
    const mayor = nextState.players.find((p) => p.id === winnerId);
    if (mayor) {
      nextState.mayorId = winnerId;
      mayor.voteWeight = 2; // Quyền 2 phiếu áp dụng ngay Ngày 1
      nextState.historyLogs.push(`(${mayor.name}) đã đắc cử Trưởng làng với quyền lực 2 phiếu!`);
    }
    nextState.phase = 'DAY_DISCUSS';
    return { nextState, electedMayorId: winnerId };
  }

  // Hòa phiếu bầu Trưởng làng -> Không ai làm Trưởng làng
  nextState.historyLogs.push('Hòa phiếu bầu Trưởng làng. Ván đấu tiếp tục mà không có Trưởng làng!');
  nextState.phase = 'DAY_DISCUSS';
  return { nextState, electedMayorId: null };
}

/**
 * Truyền danh hiệu Trưởng làng khi Trưởng làng cũ qua đời (có 10s truyền ngôi).
 * Tự động chuyển tiếp phase về DAY_DISCUSS hoặc NIGHT nếu đang ở MAYOR_SUCCESSION.
 */
export function passMayorTitle(
  state: GameState,
  _currentMayorId: PlayerId,
  nextMayorId: PlayerId | null
): GameState {
  const nextState: GameState = structuredClone(state);
  nextState.pendingMayorSuccessionPlayerId = null;

  if (nextMayorId) {
    const successor = nextState.players.find((p) => p.id === nextMayorId && p.isAlive);
    if (successor) {
      nextState.mayorId = successor.id;
      successor.voteWeight = 2;
      nextState.historyLogs.push(
        `Trưởng làng cũ đã trao lại huy hiệu Trưởng làng cho [${successor.name}]!`
      );
    } else {
      nextState.mayorId = null;
      nextState.historyLogs.push('Hết thời gian truyền ngôi. Danh hiệu Trưởng làng chính thức biến mất vĩnh viễn!');
    }
  } else {
    nextState.mayorId = null;
    nextState.historyLogs.push('Hết thời gian truyền ngôi. Danh hiệu Trưởng làng chính thức biến mất vĩnh viễn!');
  }

  // Tự động chuyển tiếp phase nếu đang ở MAYOR_SUCCESSION
  if (nextState.phase === 'MAYOR_SUCCESSION') {
    const targetPhase = nextState.previousPhaseBeforeMayorSuccession ?? 'DAY_DISCUSS';
    nextState.phase = targetPhase;
    if (targetPhase === 'NIGHT') {
      nextState.roundNumber += 1;
    } else if (targetPhase === 'DAY_DISCUSS' || targetPhase === 'DAY_MAYOR_ELECTION') {
      if (!nextState.dayState) {
        nextState.dayState = createInitialDayState();
      }
    }
  }

  return nextState;
}

/**
 * Gửi phiếu biểu quyết treo cổ kín ban ngày.
 */
export function castDayVote(
  state: GameState,
  voterId: PlayerId,
  targetId: PlayerId | null
): GameState {
  const nextState: GameState = structuredClone(state);
  if (!nextState.dayState) return nextState;

  const voter = nextState.players.find((p) => p.id === voterId && p.isAlive);
  if (!voter || voter.voteWeight <= 0) return nextState; // Thằng ngốc lật bài không được vote

  if (targetId !== null) {
    const target = nextState.players.find((p) => p.id === targetId && p.isAlive);
    if (!target) return nextState;
  }

  nextState.dayState.ballots[voterId] = targetId;
  return nextState;
}

/**
 * Kiểm tra Host có thể chốt vote sớm hay không:
 * Chỉ chốt sớm khi tất cả người chơi còn quyền vote đã gửi ballot.
 */
export function canHostTallyEarly(state: GameState): boolean {
  if (!state.dayState) return false;

  const eligibleVoters = state.players.filter((p) => p.isAlive && p.voteWeight > 0);
  return eligibleVoters.every((v) => Object.prototype.hasOwnProperty.call(state.dayState!.ballots, v.id));
}

/**
 * Tally phiếu biểu quyết treo cổ ban ngày:
 * - Áp dụng trọng số voteWeight (Dân = 1, Mayor = 2, Thằng ngốc lật bài = 0).
 * - Người không gửi / disconnect tính là abstain.
 * - Hòa phiếu: Nếu ESCAPE -> không ai chết; Nếu RUNOFF -> vào vòng biện hộ 30s + vote lại 20s.
 */
export function tallyDayVotes(state: GameState): {
  nextState: GameState;
  outcome: DayVoteOutcome;
} {
  const nextState: GameState = structuredClone(state);
  if (!nextState.dayState) {
    return {
      nextState,
      outcome: { type: 'ESCAPE', reason: 'Không có trạng thái biểu quyết ngày' },
    };
  }

  const voteWeights = new Map<PlayerId, number>();
  const livingVoters = nextState.players.filter((p) => p.isAlive && p.voteWeight > 0);

  for (const voter of livingVoters) {
    const targetId = nextState.dayState.ballots[voter.id];
    if (!targetId) continue; // Bỏ phiếu trắng / Chưa gửi -> Abstain

    const target = nextState.players.find((p) => p.id === targetId && p.isAlive);
    if (!target) continue;

    voteWeights.set(targetId, (voteWeights.get(targetId) ?? 0) + voter.voteWeight);
  }

  if (voteWeights.size === 0) {
    return {
      nextState,
      outcome: { type: 'ESCAPE', reason: 'Không ai nhận được phiếu treo cổ hôm nay.' },
    };
  }

  const sorted = Array.from(voteWeights.entries()).sort((a, b) => b[1] - a[1]);
  const highestWeight = sorted[0][1];
  const topCandidates = sorted.filter((entry) => entry[1] === highestWeight);

  if (topCandidates.length === 1) {
    const targetPlayerId = topCandidates[0][0];

    // Kiểm tra ngưỡng quá bán (MAJORITY) nếu được bật
    if (nextState.settings.lynchThreshold === 'MAJORITY') {
      const livingCount = nextState.players.filter((p) => p.isAlive).length;
      if (highestWeight <= livingCount / 2) {
        return {
          nextState,
          outcome: {
            type: 'ESCAPE',
            reason: `Mục tiêu [${targetPlayerId}] nhận nhiều phiếu nhất (${highestWeight}) nhưng chưa đạt quá bán (> ${Math.floor(livingCount / 2)}/${livingCount} phiếu). Cả làng tha bổng hôm nay.`,
          },
        };
      }
    }

    return {
      nextState,
      outcome: {
        type: 'EXECUTE',
        targetPlayerId,
        reason: `Mục tiêu [${targetPlayerId}] nhận số phiếu cao nhất (${highestWeight} phiếu).`,
      },
    };
  }

  // Trường hợp hòa phiếu cao nhất
  const candidateIds = topCandidates.map((c) => c[0]);
  if (nextState.settings.tieVoteMode === 'RUNOFF') {
    nextState.phase = 'DAY_RUNOFF';
    nextState.dayState.runoffCandidates = candidateIds;
    nextState.dayState.runoffBallots = {};
    return {
      nextState,
      outcome: {
        type: 'RUNOFF',
        candidateIds,
        reason: `Hòa phiếu giữa ${candidateIds.length} người. Bắt đầu vòng biểu quyết Runoff!`,
      },
    };
  }

  return {
    nextState,
    outcome: {
      type: 'ESCAPE',
      reason: 'Hòa phiếu: Cả làng tha bổng, không ai bị treo cổ hôm nay.',
    },
  };
}

/**
 * Bỏ phiếu Runoff vòng 2:
 * Chỉ được chọn trong nhóm ứng viên đồng hạng cao nhất vòng 1.
 */
export function castRunoffVote(
  state: GameState,
  voterId: PlayerId,
  targetId: PlayerId | null
): GameState {
  const nextState: GameState = structuredClone(state);
  if (!nextState.dayState || !nextState.dayState.runoffCandidates) return nextState;

  const voter = nextState.players.find((p) => p.id === voterId && p.isAlive);
  if (!voter || voter.voteWeight <= 0) return nextState;

  if (targetId !== null) {
    if (!nextState.dayState.runoffCandidates.includes(targetId)) return nextState;
  }

  if (!nextState.dayState.runoffBallots) {
    nextState.dayState.runoffBallots = {};
  }

  nextState.dayState.runoffBallots[voterId] = targetId;
  return nextState;
}

/**
 * Tally phiếu Runoff vòng 2:
 * Nếu vòng 2 vẫn hòa -> Mặc định thoát án treo cổ!
 */
export function tallyRunoffVotes(state: GameState): {
  nextState: GameState;
  outcome: DayVoteOutcome;
} {
  const nextState: GameState = structuredClone(state);
  if (!nextState.dayState || !nextState.dayState.runoffBallots) {
    return {
      nextState,
      outcome: { type: 'ESCAPE', reason: 'Không có dữ liệu runoff' },
    };
  }

  const counts = new Map<PlayerId, number>();
  const livingVoters = nextState.players.filter((p) => p.isAlive && p.voteWeight > 0);

  for (const voter of livingVoters) {
    const targetId = nextState.dayState.runoffBallots[voter.id];
    if (!targetId) continue;

    counts.set(targetId, (counts.get(targetId) ?? 0) + voter.voteWeight);
  }

  if (counts.size === 0) {
    return {
      nextState,
      outcome: { type: 'ESCAPE', reason: 'Không có phiếu bầu hợp lệ ở vòng Runoff. Thoát án treo cổ!' },
    };
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const highest = sorted[0][1];
  const top = sorted.filter((e) => e[1] === highest);

  if (top.length === 1) {
    const targetPlayerId = top[0][0];
    if (nextState.settings.lynchThreshold === 'MAJORITY') {
      const livingCount = nextState.players.filter((p) => p.isAlive).length;
      if (highest <= livingCount / 2) {
        return {
          nextState,
          outcome: {
            type: 'ESCAPE',
            reason: `Mục tiêu [${targetPlayerId}] nhận nhiều phiếu nhất vòng Runoff (${highest}) nhưng chưa đạt quá bán (> ${Math.floor(livingCount / 2)}/${livingCount} phiếu). Thoát án treo cổ!`,
          },
        };
      }
    }

    return {
      nextState,
      outcome: {
        type: 'EXECUTE',
        targetPlayerId,
        reason: `Mục tiêu [${targetPlayerId}] nhận số phiếu cao nhất ở vòng Runoff (${highest} phiếu).`,
      },
    };
  }

  // Vòng 2 vẫn hòa -> Thoát án treo cổ
  return {
    nextState,
    outcome: {
      type: 'ESCAPE',
      reason: 'Vòng Runoff vẫn tiếp tục hòa phiếu: Dân làng thoát án treo cổ hôm nay!',
    },
  };
}
