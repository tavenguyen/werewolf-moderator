import { describe, expect, it } from 'bun:test';
import {
  canHostTallyEarly,
  castDayVote,
  castMayorBallot,
  castRunoffVote,
  createInitialDayState,
  extendDayDiscussion,
  passMayorTitle,
  tallyDayVotes,
  tallyMayorElection,
  tallyRunoffVotes,
  tickDayTimer,
  toggleDayPause,
  unlockVoteEarly,
} from '../voting';
import { executeMayorSuccession } from '../gameEngine';
import { createTestGame } from './testHelpers';

describe('Engine - Day Phase, Voting & Mayor System', () => {
  it('should initialize DayState with 180s and voteLocked = true, unlocking at <= 120s', () => {
    const game = createTestGame([
      'villager',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);
    game.dayState = createInitialDayState();

    expect(game.dayState.discussionSecondsRemaining).toBe(180);
    expect(game.dayState.voteLocked).toBe(true);

    // Trôi 30s -> còn 150s -> vẫn bị khóa vote
    const s1 = tickDayTimer(game, 30);
    expect(s1.dayState!.discussionSecondsRemaining).toBe(150);
    expect(s1.dayState!.voteLocked).toBe(true);

    // Trôi thêm 30s -> còn 120s -> mở khóa vote (đủ 60s tranh luận đầu)
    const s2 = tickDayTimer(s1, 30);
    expect(s2.dayState!.discussionSecondsRemaining).toBe(120);
    expect(s2.dayState!.voteLocked).toBe(false);
  });

  it('should allow extending discussion by +30s at most 2 times', () => {
    const game = createTestGame([
      'villager',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);
    game.dayState = createInitialDayState();

    // Lần 1: 180 + 30 = 210
    const s1 = extendDayDiscussion(game, 30);
    expect(s1.dayState!.discussionSecondsRemaining).toBe(210);
    expect(s1.dayState!.extensionsUsed).toBe(1);

    // Lần 2: 210 + 30 = 240
    const s2 = extendDayDiscussion(s1, 30);
    expect(s2.dayState!.discussionSecondsRemaining).toBe(240);
    expect(s2.dayState!.extensionsUsed).toBe(2);

    // Lần 3: Đã hết lượt gia hạn -> không tăng
    const s3 = extendDayDiscussion(s2, 30);
    expect(s3.dayState!.discussionSecondsRemaining).toBe(240);
    expect(s3.dayState!.extensionsUsed).toBe(2);
  });

  it('should freeze timer when paused and allow host early unlock', () => {
    const game = createTestGame([
      'villager',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);
    game.dayState = createInitialDayState();

    const paused = toggleDayPause(game);
    expect(paused.dayState!.isPaused).toBe(true);

    // Trôi thời gian khi pause -> remaining không đổi
    const afterTick = tickDayTimer(paused, 50);
    expect(afterTick.dayState!.discussionSecondsRemaining).toBe(180);

    // Host chủ động mở khóa vote sớm
    const unlocked = unlockVoteEarly(game);
    expect(unlocked.dayState!.voteLocked).toBe(false);
  });

  it('should elect Mayor on Day 1 and grant 2 votes immediately', () => {
    const game = createTestGame(
      ['villager', 'villager', 'villager', 'werewolf', 'seer', 'witch'],
      { hasMayor: true }
    );
    game.dayState = createInitialDayState();

    // Bầu cử: p1 nhận 3 phiếu (từ p1, p2, p3), p4 nhận 2 phiếu
    let state = castMayorBallot(game, 'p1', 'p1');
    state = castMayorBallot(state, 'p2', 'p1');
    state = castMayorBallot(state, 'p3', 'p1');
    state = castMayorBallot(state, 'p4', 'p4');
    state = castMayorBallot(state, 'p5', 'p4');

    const { nextState, electedMayorId } = tallyMayorElection(state);
    expect(electedMayorId).toBe('p1');
    expect(nextState.mayorId).toBe('p1');

    // p1 được gán voteWeight = 2 ngay trong Ngày 1!
    const mayor = nextState.players.find((p) => p.id === 'p1')!;
    expect(mayor.voteWeight).toBe(2);
  });

  it('should have no Mayor if election ties', () => {
    const game = createTestGame(
      ['villager', 'villager', 'villager', 'werewolf', 'seer', 'witch'],
      { hasMayor: true }
    );
    game.dayState = createInitialDayState();

    // p1 nhận 2 phiếu, p2 nhận 2 phiếu
    let state = castMayorBallot(game, 'p3', 'p1');
    state = castMayorBallot(state, 'p4', 'p1');
    state = castMayorBallot(state, 'p5', 'p2');
    state = castMayorBallot(state, 'p6', 'p2');

    const { nextState, electedMayorId } = tallyMayorElection(state);
    expect(electedMayorId).toBeNull();
    expect(nextState.mayorId).toBeNull();
  });

  it('should apply Mayor 2-vote weight in hanging vote to break or determine outcome', () => {
    const game = createTestGame([
      'villager',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);
    game.dayState = createInitialDayState();

    // p1 là Trưởng làng với quyền 2 phiếu
    game.mayorId = 'p1';
    game.players[0].voteWeight = 2;

    // p1 (Mayor, 2 phiếu) vote p4.
    // p2 và p3 (mỗi người 1 phiếu) vote p5.
    // p4, p5, p6 bỏ phiếu trắng / abstain.
    let state = castDayVote(game, 'p1', 'p4');
    state = castDayVote(state, 'p2', 'p5');
    state = castDayVote(state, 'p3', 'p5');

    // Tally: p4 có 2 phiếu (từ Mayor), p5 có 2 phiếu (từ p2+p3) -> Hòa phiếu
    const { outcome } = tallyDayVotes(state);
    expect(outcome.type).toBe('ESCAPE');

    // Nếu Mayor đổi vote sang p6: p6 có 2 phiếu, p5 có 2 phiếu
    // Bây giờ cho thêm p6 vote p4 -> p4: 1 phiếu, p5: 2 phiếu, p6: 2 phiếu.
    // Thử trường hợp Mayor vote quyết định:
    let state2 = castDayVote(game, 'p1', 'p4'); // Mayor 2 phiếu cho p4
    state2 = castDayVote(state2, 'p2', 'p4'); // p2 1 phiếu cho p4 -> p4 có 3 phiếu
    state2 = castDayVote(state2, 'p3', 'p5'); // p5 có 2 phiếu (từ p3 và p6)
    state2 = castDayVote(state2, 'p6', 'p5');

    const { outcome: outcome2 } = tallyDayVotes(state2);
    expect(outcome2.type).toBe('EXECUTE');
    expect(outcome2.targetPlayerId).toBe('p4');
  });

  it('should support Runoff tieVoteMode: enter runoff, vote round 2, escape if round 2 ties', () => {
    const game = createTestGame(
      ['villager', 'villager', 'villager', 'werewolf', 'seer', 'witch'],
      { tieVoteMode: 'RUNOFF' }
    );
    game.dayState = createInitialDayState();

    // Hòa phiếu vòng 1 giữa p4 và p5 (mỗi người 2 phiếu)
    let state = castDayVote(game, 'p1', 'p4');
    state = castDayVote(state, 'p2', 'p4');
    state = castDayVote(state, 'p3', 'p5');
    state = castDayVote(state, 'p6', 'p5');

    const { nextState, outcome } = tallyDayVotes(state);
    expect(outcome.type).toBe('RUNOFF');
    expect(outcome.candidateIds).toEqual(['p4', 'p5']);
    expect(nextState.phase).toBe('DAY_RUNOFF');

    // Vòng Runoff: Nếu vẫn hòa (p1 vote p4, p2 vote p5) -> Thoát án
    let runoffState = castRunoffVote(nextState, 'p1', 'p4');
    runoffState = castRunoffVote(runoffState, 'p2', 'p5');

    const { outcome: runoffOutcome } = tallyRunoffVotes(runoffState);
    expect(runoffOutcome.type).toBe('ESCAPE');

    // Nếu vòng Runoff có người thắng (p3 vote thêm p4) -> p4 bị execute
    let runoffState2 = castRunoffVote(runoffState, 'p3', 'p4');
    const { outcome: runoffOutcome2 } = tallyRunoffVotes(runoffState2);
    expect(runoffOutcome2.type).toBe('EXECUTE');
    expect(runoffOutcome2.targetPlayerId).toBe('p4');
  });

  it('should allow host early tally check only when all eligible voters submit', () => {
    const game = createTestGame([
      'villager',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);
    game.dayState = createInitialDayState();

    expect(canHostTallyEarly(game)).toBe(false);

    let state = game;
    for (let i = 1; i <= 6; i++) {
      state = castDayVote(state, `p${i}`, 'p4');
    }

    expect(canHostTallyEarly(state)).toBe(true);
  });

  it('should handle Mayor succession and title loss on timeout', () => {
    const game = createTestGame([
      'villager',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);
    game.mayorId = 'p1';
    game.pendingMayorSuccessionPlayerId = 'p1';

    // Trường hợp 1: Truyền ngôi thành công cho p2
    const s1 = passMayorTitle(game, 'p1', 'p2');
    expect(s1.mayorId).toBe('p2');
    expect(s1.players.find((p) => p.id === 'p2')!.voteWeight).toBe(2);
    expect(s1.pendingMayorSuccessionPlayerId).toBeNull();

    // Trường hợp 2: Hết 10s không truyền (null) -> Mất danh hiệu
    const s2 = passMayorTitle(game, 'p1', null);
    expect(s2.mayorId).toBeNull();
    expect(s2.pendingMayorSuccessionPlayerId).toBeNull();
  });

  it('should unlock vote after exactly 60s even when +30s extension is used during the first 60s', () => {
    const game = createTestGame([
      'villager',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);
    game.dayState = createInitialDayState();

    // Trôi 20s -> còn 40s lock, 160s thảo luận
    const s1 = tickDayTimer(game, 20);
    expect(s1.dayState!.voteLocked).toBe(true);

    // Gia hạn thêm 30s thảo luận -> thảo luận tăng lên 190s, nhưng voteLockRemainingSeconds vẫn là 40s
    const s2 = extendDayDiscussion(s1, 30);
    expect(s2.dayState!.discussionSecondsRemaining).toBe(190);
    expect(s2.dayState!.voteLockRemainingSeconds).toBe(40);
    expect(s2.dayState!.voteLocked).toBe(true);

    // Trôi thêm 40s -> tổng thời gian thực trôi qua = 60s -> vote PHẢI mở khóa!
    const s3 = tickDayTimer(s2, 40);
    expect(s3.dayState!.voteLockRemainingSeconds).toBe(0);
    expect(s3.dayState!.voteLocked).toBe(false);
    // Thời gian thảo luận vẫn còn 150s
    expect(s3.dayState!.discussionSecondsRemaining).toBe(150);
  });

  it('should transition cleanly from MAYOR_SUCCESSION back to DAY_DISCUSS or NIGHT', () => {
    const game = createTestGame([
      'villager',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);
    game.phase = 'MAYOR_SUCCESSION';
    game.mayorId = 'p1';
    game.pendingMayorSuccessionPlayerId = 'p1';
    game.previousPhaseBeforeMayorSuccession = 'NIGHT';

    // Thực hiện truyền ngôi qua executeMayorSuccession
    const { nextState } = executeMayorSuccession(game, 'p2');

    // Chuyển về NIGHT và tăng roundNumber
    expect(nextState.phase).toBe('NIGHT');
    expect(nextState.roundNumber).toBe(2);
    expect(nextState.mayorId).toBe('p2');
    expect(nextState.pendingMayorSuccessionPlayerId).toBeNull();
  });

  it('should transition tallyMayorElection to DAY_DISCUSS when 0 ballots are cast', () => {
    const game = createTestGame(
      ['villager', 'villager', 'villager', 'werewolf', 'seer', 'witch'],
      { hasMayor: true }
    );
    game.phase = 'DAY_MAYOR_ELECTION';
    game.dayState = createInitialDayState();
    // mayorBallots chưa được khởi tạo (0 phiếu)
    expect(game.dayState.mayorBallots).toBeUndefined();

    const { nextState, electedMayorId } = tallyMayorElection(game);
    expect(electedMayorId).toBeNull();
    expect(nextState.mayorId).toBeNull();
    expect(nextState.phase).toBe('DAY_DISCUSS');
  });
});
