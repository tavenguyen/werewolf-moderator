import { describe, expect, it } from 'bun:test';
import { findClockwiseAliveWolf, getAliveNeighbors } from '../seating';
import { createTestGame } from './testHelpers';

describe('Engine - Seating & Circular Topology', () => {
  it('should find alive neighbors skipping dead seats and wrapping around', () => {
    const mockPlayers = [
      { id: 'p0', seatIndex: 0, isAlive: true },
      { id: 'p1', seatIndex: 1, isAlive: false },
      { id: 'p2', seatIndex: 2, isAlive: true },
      { id: 'p3', seatIndex: 3, isAlive: false },
      { id: 'p4', seatIndex: 4, isAlive: true },
    ];

    const n0 = getAliveNeighbors(mockPlayers, 'p0');
    expect(n0).not.toBeNull();
    expect(n0!.left.id).toBe('p4');
    expect(n0!.right.id).toBe('p2');
    expect(n0!.group.map((p) => p.id)).toEqual(['p4', 'p0', 'p2']);

    const n4 = getAliveNeighbors(mockPlayers, 'p4');
    expect(n4).not.toBeNull();
    expect(n4!.left.id).toBe('p2');
    expect(n4!.right.id).toBe('p0');
  });

  it('should handle exactly 2 alive players without crashing', () => {
    const twoPlayers = [
      { id: 'a', seatIndex: 0, isAlive: true },
      { id: 'b', seatIndex: 1, isAlive: true },
    ];
    const res = getAliveNeighbors(twoPlayers, 'a');
    expect(res).not.toBeNull();
    expect(res!.left.id).toBe('b');
    expect(res!.right.id).toBe('b');
    expect(res!.group.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('should find nearest clockwise living werewolf', () => {
    const game = createTestGame([
      'villager',
      'villager',
      'werewolf',
      'werewolf',
      'seer',
      'witch',
    ]);

    // p1 is at seat 0, next clockwise living wolf is p3 at seat 2
    const wolf = findClockwiseAliveWolf(game.players, 'p1');
    expect(wolf).not.toBeNull();
    expect(wolf!.id).toBe('p3');
  });
});
