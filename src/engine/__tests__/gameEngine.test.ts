import { describe, expect, it } from 'bun:test';
import {
  createInitialGameState,
  executeDayVote,
  executeHunterShot,
  executeNightPhase,
  findClockwiseAliveWolf,
  getAliveNeighbors,
  type PlayerSetupInput,
} from '../index';

describe('Game Engine - Seating & Circular Topology', () => {
  const mockPlayers = [
    { id: 'p0', seatIndex: 0, isAlive: true },
    { id: 'p1', seatIndex: 1, isAlive: false }, // dead
    { id: 'p2', seatIndex: 2, isAlive: true },
    { id: 'p3', seatIndex: 3, isAlive: false }, // dead
    { id: 'p4', seatIndex: 4, isAlive: true },
  ];

  it('should find alive neighbors skipping dead seats and wrapping around', () => {
    // Alive seats: p0 (0), p2 (2), p4 (4)
    // Neighbors of p0: left is p4, right is p2
    const n0 = getAliveNeighbors(mockPlayers, 'p0');
    expect(n0).not.toBeNull();
    expect(n0!.left.id).toBe('p4');
    expect(n0!.right.id).toBe('p2');
    expect(n0!.group.map((p) => p.id)).toEqual(['p4', 'p0', 'p2']);

    // Neighbors of p4: left is p2, right is p0
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

  it('should find nearest clockwise living werewolf for Rusty Knight', () => {
    const state = createInitialGameState(
      [
        { id: 'k', name: 'Knight', seatIndex: 0 },
        { id: 'v1', name: 'Villager 1', seatIndex: 1 },
        { id: 'w1', name: 'Wolf 1', seatIndex: 2 },
        { id: 'w2', name: 'Wolf 2', seatIndex: 3 },
      ],
      ['rusty_knight', 'villager', 'werewolf', 'werewolf']
    );

    const wolf = findClockwiseAliveWolf(state.players, 'k');
    expect(wolf).not.toBeNull();
    expect(wolf!.id).toBe('w1');
  });
});

describe('Game Engine - Night Resolution & Protection', () => {
  const playersInput: PlayerSetupInput[] = [
    { id: 'p1', name: 'Player 1', seatIndex: 0 },
    { id: 'p2', name: 'Player 2', seatIndex: 1 },
    { id: 'p3', name: 'Player 3', seatIndex: 2 },
    { id: 'p4', name: 'Player 4', seatIndex: 3 },
  ];

  it('should save player when Bodyguard shields against wolf bite', () => {
    const state = createInitialGameState(
      playersInput,
      ['bodyguard', 'werewolf', 'villager', 'villager']
    );

    const { nightOutput } = executeNightPhase(state, {
      bodyguard: { targetId: 'p3' },
      wolfPack: { targets: ['p3'] },
    });

    expect(nightOutput.newDeaths).toHaveLength(0);
    expect(state.players.find((p) => p.id === 'p3')!.isAlive).toBe(true);
  });

  it('should transform Cursed into Werewolf when bitten without shield', () => {
    const state = createInitialGameState(
      playersInput,
      ['cursed', 'werewolf', 'villager', 'villager']
    );

    const { nightOutput } = executeNightPhase(state, {
      wolfPack: { targets: ['p1'] },
    });

    expect(nightOutput.newDeaths).toHaveLength(0);
    const cursed = state.players.find((p) => p.id === 'p1')!;
    expect(cursed.isAlive).toBe(true);
    expect(cursed.faction).toBe('WEREWOLF');
    expect(cursed.roleId).toBe('werewolf');
  });

  it('should allow Witch poison to bypass Elder shield and kill immediately', () => {
    const state = createInitialGameState(
      playersInput,
      ['witch', 'elder', 'werewolf', 'villager']
    );

    const { nightOutput } = executeNightPhase(state, {
      witch: { poisonTargetId: 'p2' },
    });

    expect(nightOutput.newDeaths.some((d) => d.playerId === 'p2')).toBe(true);
    expect(state.players.find((p) => p.id === 'p2')!.isAlive).toBe(false);
    // Elder killed by witch poison strips village power
    expect(state.villagePowerStripped).toBe(true);
  });
});

describe('Game Engine - Death Cascade & Special Win Conditions', () => {
  it('should cascade death to Cupid lover', () => {
    const state = createInitialGameState(
      [
        { id: 'p1', name: 'Alice', seatIndex: 0 },
        { id: 'p2', name: 'Bob', seatIndex: 1 },
        { id: 'p3', name: 'Wolf', seatIndex: 2 },
      ],
      ['villager', 'villager', 'werewolf']
    );

    state.players[0].loverId = 'p2';
    state.players[1].loverId = 'p1';

    // Alice is lynched
    executeDayVote(state, 'p1');

    expect(state.players[0].isAlive).toBe(false);
    expect(state.players[1].isAlive).toBe(false); // Bob died of heartbreak
    expect(state.deaths.some((d) => d.playerId === 'p2' && d.cause === 'COUPLE_HEARTBREAK')).toBe(true);
  });

  it('should let Tanner win immediately upon being voted out', () => {
    const state = createInitialGameState(
      [
        { id: 'tanner', name: 'Tanner', seatIndex: 0 },
        { id: 'p2', name: 'Villager', seatIndex: 1 },
        { id: 'p3', name: 'Wolf', seatIndex: 2 },
      ],
      ['tanner', 'villager', 'werewolf']
    );

    const { winOutcome } = executeDayVote(state, 'tanner');
    expect(winOutcome).not.toBeNull();
    expect(winOutcome!.winner).toBe('TANNER');
    expect(winOutcome!.winningPlayerIds).toEqual(['tanner']);
  });

  it('should let Hunter shoot and cascade death', () => {
    const state = createInitialGameState(
      [
        { id: 'hunter', name: 'Hunter', seatIndex: 0 },
        { id: 'wolf', name: 'Wolf', seatIndex: 1 },
        { id: 'villager', name: 'Villager', seatIndex: 2 },
      ],
      ['hunter', 'werewolf', 'villager']
    );

    // Wolf bites hunter at night
    executeNightPhase(state, {
      wolfPack: { targets: ['hunter'] },
    });

    expect(state.phase).toBe('HUNTER_SHOT');
    expect(state.pendingHunterShotPlayerId).toBe('hunter');

    // Hunter shoots the wolf
    const winOutcome = executeHunterShot(state, 'wolf');
    expect(state.players.find((p) => p.id === 'wolf')!.isAlive).toBe(false);
    // Villagers win because wolf is dead
    expect(winOutcome).not.toBeNull();
    expect(winOutcome!.winner).toBe('VILLAGER');
  });

  it('should let Village Idiot escape lynch and lose voting right', () => {
    const state = createInitialGameState(
      [
        { id: 'idiot', name: 'Idiot', seatIndex: 0 },
        { id: 'wolf', name: 'Wolf', seatIndex: 1 },
        { id: 'villager', name: 'Villager', seatIndex: 2 },
      ],
      ['village_idiot', 'werewolf', 'villager']
    );

    const { survivedByReveal } = executeDayVote(state, 'idiot');
    expect(survivedByReveal).toBe(true);
    const idiot = state.players.find((p) => p.id === 'idiot')!;
    expect(idiot.isAlive).toBe(true);
    expect(idiot.voteWeight).toBe(0); // lost vote privilege
  });

  it('should declare DRAW when both sides are wiped out simultaneously', () => {
    const state = createInitialGameState(
      [
        { id: 'hunter', name: 'Hunter', seatIndex: 0 },
        { id: 'wolf', name: 'Wolf', seatIndex: 1 },
      ],
      ['hunter', 'werewolf']
    );

    // Wolf bites hunter
    executeNightPhase(state, {
      wolfPack: { targets: ['hunter'] },
    });

    // Hunter shoots back at the last wolf
    const winOutcome = executeHunterShot(state, 'wolf');
    expect(winOutcome).not.toBeNull();
    expect(winOutcome!.winner).toBe('DRAW');
  });
});
