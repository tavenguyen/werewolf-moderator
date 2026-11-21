import { describe, expect, it } from 'bun:test';
import {
  createRematchGameState,
  executeDayVote,
  executeHunterShot,
  executeNightPhase,
} from '../gameEngine';
import {
  castDayVote,
  castMayorBallot,
  createInitialDayState,
  extendDayDiscussion,
  passMayorTitle,
  tallyDayVotes,
  tallyMayorElection,
  tickDayTimer,
  toggleDayPause,
} from '../voting';
import { createTestGame } from './testHelpers';

describe('Engine - Pure Functions & State Immutability', () => {
  it('executeNightPhase and resolveNight should not mutate the input GameState', () => {
    const original = createTestGame([
      'bodyguard',
      'werewolf',
      'seer',
      'witch',
      'villager',
      'villager',
    ]);
    const snapshotBefore = JSON.stringify(original);

    const { nextState } = executeNightPhase(original, {
      bodyguard: { targetId: 'p5' },
      wolfPack: { targets: ['p5'] },
      seer: { targetId: 'p2' },
      witch: { poisonTargetId: 'p6' },
    });

    const snapshotAfter = JSON.stringify(original);
    // Input state must remain completely identical
    expect(snapshotAfter).toBe(snapshotBefore);

    // Next state must reflect changes
    expect(nextState.deaths.length).toBeGreaterThan(0);
  });

  it('executeDayVote should not mutate the input GameState', () => {
    const original = createTestGame([
      'villager',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);
    const snapshotBefore = JSON.stringify(original);

    const { nextState } = executeDayVote(original, 'p1');

    const snapshotAfter = JSON.stringify(original);
    expect(snapshotAfter).toBe(snapshotBefore);
    expect(nextState.players.find((p) => p.id === 'p1')!.isAlive).toBe(false);
  });

  it('executeHunterShot should not mutate the input GameState', () => {
    const original = createTestGame([
      'hunter',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);
    original.pendingHunterShotPlayerId = 'p1';
    const snapshotBefore = JSON.stringify(original);

    const { nextState } = executeHunterShot(original, 'p4');

    const snapshotAfter = JSON.stringify(original);
    expect(snapshotAfter).toBe(snapshotBefore);
    expect(nextState.players.find((p) => p.id === 'p4')!.isAlive).toBe(false);
  });

  it('voting operations (timer, extension, ballots, mayor) should not mutate input GameState', () => {
    const original = createTestGame(
      ['villager', 'villager', 'villager', 'werewolf', 'seer', 'witch'],
      { hasMayor: true }
    );
    original.dayState = createInitialDayState();
    const snapshotBefore = JSON.stringify(original);

    // 1. tickDayTimer: original is unchanged
    const s1 = tickDayTimer(original, 60);
    expect(JSON.stringify(original)).toBe(snapshotBefore);
    expect(s1.dayState!.discussionSecondsRemaining).toBe(120);

    // 2. extendDayDiscussion: s1 is unchanged
    const snapshotS1 = JSON.stringify(s1);
    const s2 = extendDayDiscussion(s1, 30);
    expect(JSON.stringify(s1)).toBe(snapshotS1);
    expect(s2.dayState!.discussionSecondsRemaining).toBe(150);

    // 3. toggleDayPause: s2 is unchanged
    const snapshotS2 = JSON.stringify(s2);
    const s3 = toggleDayPause(s2);
    expect(JSON.stringify(s2)).toBe(snapshotS2);
    expect(s3.dayState!.isPaused).toBe(true);
    expect(s2.dayState!.isPaused).toBe(false);

    // 4. castMayorBallot & tally: s3 is unchanged
    const snapshotS3 = JSON.stringify(s3);
    const s4 = castMayorBallot(s3, 'p1', 'p1');
    expect(JSON.stringify(s3)).toBe(snapshotS3);
    const snapshotS4 = JSON.stringify(s4);
    const { nextState: s5 } = tallyMayorElection(s4);
    expect(JSON.stringify(s4)).toBe(snapshotS4);
    expect(s5.mayorId).toBe('p1');
    expect(s4.mayorId).toBeNull();

    // 5. castDayVote & tally: s5 is unchanged
    const snapshotS5 = JSON.stringify(s5);
    const s6 = castDayVote(s5, 'p1', 'p4');
    expect(JSON.stringify(s5)).toBe(snapshotS5);
    const snapshotS6 = JSON.stringify(s6);
    const { outcome } = tallyDayVotes(s6);
    expect(JSON.stringify(s6)).toBe(snapshotS6);
    expect(outcome.type).toBe('EXECUTE');
    expect(outcome.targetPlayerId).toBe('p4');

    // 6. passMayorTitle: s5 is unchanged
    const s8 = passMayorTitle(s5, 'p1', 'p2');
    expect(JSON.stringify(s5)).toBe(snapshotS5);
    expect(s8.mayorId).toBe('p2');
  });

  it('createRematchGameState should return a new generation without altering previous state', () => {
    const original = createTestGame([
      'villager',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);
    const snapshotBefore = JSON.stringify(original);

    const rematchState = createRematchGameState(original, [
      'werewolf',
      'werewolf',
      'seer',
      'witch',
      'villager',
      'villager',
    ]);

    expect(JSON.stringify(original)).toBe(snapshotBefore);
    expect(rematchState.generation).toBe(original.generation + 1);
    expect(rematchState.players[0].roleId).toBe('werewolf');
  });
});
