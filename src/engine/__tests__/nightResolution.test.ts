import { describe, expect, it } from 'bun:test';
import { resolveNight } from '../nightResolution';
import { createTestGame } from './testHelpers';

describe('Engine - Night Resolution & Complex Actions', () => {
  it('should tally wolf pack votes by majority', () => {
    const game = createTestGame([
      'werewolf',
      'werewolf',
      'werewolf',
      'villager',
      'villager',
      'villager',
    ]);

    // 2 Sói chọn p4, 1 Sói chọn p5 -> p4 bị cắn
    const { nextState } = resolveNight(game, {
      wolfPack: {
        individualVotes: {
          p1: 'p4',
          p2: 'p4',
          p3: 'p5',
        },
      },
    });

    expect(nextState.players.find((p) => p.id === 'p4')!.isAlive).toBe(false);
    expect(nextState.players.find((p) => p.id === 'p5')!.isAlive).toBe(true);
  });

  it('should break wolf vote tie deterministically using seed', () => {
    const game = createTestGame([
      'werewolf',
      'werewolf',
      'seer',
      'witch',
      'villager',
      'villager',
    ]);

    // Hòa phiếu: p1 chọn p5, p2 chọn p6
    const { nextState: stateSeed1 } = resolveNight(
      game,
      {
        wolfPack: {
          individualVotes: {
            p1: 'p5',
            p2: 'p6',
          },
        },
      },
      12345
    );

    const { nextState: stateSeed1Repeat } = resolveNight(
      game,
      {
        wolfPack: {
          individualVotes: {
            p1: 'p5',
            p2: 'p6',
          },
        },
      },
      12345
    );

    // Cùng seed phải cho đúng 1 kết quả tất định
    const deadId1 = stateSeed1.deaths[0].playerId;
    const deadIdRepeat = stateSeed1Repeat.deaths[0].playerId;
    expect(deadId1).toBe(deadIdRepeat);
    expect(['p5', 'p6']).toContain(deadId1);
  });

  it('should ignore skip vote when allowWolfSkip is false', () => {
    const game = createTestGame(
      ['werewolf', 'werewolf', 'seer', 'witch', 'villager', 'villager'],
      { allowWolfSkip: false }
    );

    // p1 vote skip (null), p2 vote p5 -> p5 phải bị cắn vì skip bị cấm
    const { nextState } = resolveNight(game, {
      wolfPack: {
        individualVotes: {
          p1: null,
          p2: 'p5',
        },
      },
    });

    expect(nextState.players.find((p) => p.id === 'p5')!.isAlive).toBe(false);
  });

  it('should allow wolf skip when allowWolfSkip is true', () => {
    const game = createTestGame(
      ['werewolf', 'werewolf', 'seer', 'witch', 'villager', 'villager'],
      { allowWolfSkip: true }
    );

    const { nextState } = resolveNight(game, {
      wolfPack: {
        isSkip: true,
      },
    });

    expect(nextState.deaths).toHaveLength(0);
    expect(nextState.players.every((p) => p.isAlive)).toBe(true);
  });

  it('should allow wolf cub death to trigger double kill next night', () => {
    const game = createTestGame([
      'werewolf',
      'wolf_cub',
      'seer',
      'witch',
      'villager',
      'villager',
    ]);
    game.wolfCubDoubleKillNextNight = true; // Sói con đã chết trước đó

    const { nextState } = resolveNight(game, {
      wolfPack: {
        targets: ['p5', 'p6'],
      },
    });

    // Cả 2 nạn nhân đều bị cắn chết
    expect(nextState.players.find((p) => p.id === 'p5')!.isAlive).toBe(false);
    expect(nextState.players.find((p) => p.id === 'p6')!.isAlive).toBe(false);
    // Cờ cắn đôi được reset sau đêm đó
    expect(nextState.wolfCubDoubleKillNextNight).toBe(false);
  });

  it('should not allow bodyguard to protect the same target 2 nights in a row', () => {
    const game = createTestGame([
      'bodyguard',
      'werewolf',
      'seer',
      'witch',
      'villager',
      'villager',
    ]);
    game.lastProtectedPlayerId = 'p5'; // Đêm trước đã bảo vệ p5

    // Đêm nay tiếp tục chọn p5
    const { nextState } = resolveNight(game, {
      bodyguard: { targetId: 'p5' },
      wolfPack: { targets: ['p5'] },
    });

    // Bảo vệ thất bại -> p5 chết
    expect(nextState.players.find((p) => p.id === 'p5')!.isAlive).toBe(false);
    expect(nextState.lastProtectedPlayerId).toBeNull();
  });

  it('should save one victim when bodyguard protects one of two wolf cub targets', () => {
    const game = createTestGame([
      'bodyguard',
      'werewolf',
      'seer',
      'witch',
      'villager',
      'villager',
    ]);
    game.wolfCubDoubleKillNextNight = true;

    const { nextState } = resolveNight(game, {
      bodyguard: { targetId: 'p5' },
      wolfPack: { targets: ['p5', 'p6'] },
    });

    // p5 được bảo vệ sống, p6 không được bảo vệ nên chết
    expect(nextState.players.find((p) => p.id === 'p5')!.isAlive).toBe(true);
    expect(nextState.players.find((p) => p.id === 'p6')!.isAlive).toBe(false);
  });

  it('should allow Witch AoE heal to save all wolf victims but NOT White Wolf victim', () => {
    const game = createTestGame(
      ['witch', 'werewolf', 'white_wolf', 'villager', 'villager', 'villager'],
      { witchHealMode: 'AOE' }
    );
    game.roundNumber = 2; // Đêm chẵn cho Sói trắng hành động

    const { nextState } = resolveNight(game, {
      wolfPack: { targets: ['p4', 'p5'] },
      whiteWolf: { targetId: 'p6' },
      witch: { heal: true },
    });

    // Nạn nhân của bầy Sói (p4, p5) được bình Cứu AoE cứu sống
    expect(nextState.players.find((p) => p.id === 'p4')!.isAlive).toBe(true);
    expect(nextState.players.find((p) => p.id === 'p5')!.isAlive).toBe(true);

    // Nạn nhân của Sói trắng (p6) KHÔNG THỂ được cứu bởi bình Cứu
    expect(nextState.players.find((p) => p.id === 'p6')!.isAlive).toBe(false);
    expect(nextState.deaths.some((d) => d.playerId === 'p6' && d.cause === 'WHITE_WOLF')).toBe(true);
  });

  it('should exclude Witch from AoE heal when allowWitchSelfHeal is false', () => {
    const game = createTestGame(
      ['witch', 'werewolf', 'villager', 'villager', 'villager', 'villager'],
      { witchHealMode: 'AOE', allowWitchSelfHeal: false }
    );

    // Bầy Sói cắn cả Phù thủy (p1) lẫn Dân làng (p3)
    const { nextState } = resolveNight(game, {
      wolfPack: { targets: ['p1', 'p3'] },
      witch: { heal: true },
    });

    // Phù thủy bị cấm tự cứu nên chết, Dân làng p3 được cứu sống
    expect(nextState.players.find((p) => p.id === 'p1')!.isAlive).toBe(false);
    expect(nextState.players.find((p) => p.id === 'p3')!.isAlive).toBe(true);
  });

  it('should prioritize poison over heal: poison still kills healed target', () => {
    const game = createTestGame([
      'witch',
      'werewolf',
      'seer',
      'villager',
      'villager',
      'villager',
    ]);

    // Phù thủy vừa bấm cứu vừa ném độc vào cùng mục tiêu p4
    const { nextState } = resolveNight(game, {
      wolfPack: { targets: ['p4'] },
      witch: {
        heal: true,
        poisonTargetId: 'p4',
      },
    });

    expect(nextState.players.find((p) => p.id === 'p4')!.isAlive).toBe(false);
    expect(nextState.deaths.some((d) => d.playerId === 'p4' && d.cause === 'WITCH_POISON')).toBe(
      true
    );
  });

  it('should handle witchWasteHealOnEmpty correctly', () => {
    // Trường hợp 1: witchWasteHealOnEmpty = true -> mất bình dù cứu trượt
    const gameWaste = createTestGame(
      ['witch', 'werewolf', 'seer', 'villager', 'villager', 'villager'],
      { witchWasteHealOnEmpty: true, witchKnowsVictim: false }
    );
    const { nextState: stateWaste } = resolveNight(gameWaste, {
      wolfPack: { isSkip: true },
      witch: { heal: true },
    });
    expect(stateWaste.witchHealUsed).toBe(true);

    // Trường hợp 2: witchWasteHealOnEmpty = false và witchKnowsVictim = false -> hoàn bình
    const gameSave = createTestGame(
      ['witch', 'werewolf', 'seer', 'villager', 'villager', 'villager'],
      { witchWasteHealOnEmpty: false, witchKnowsVictim: false }
    );
    const { nextState: stateSave } = resolveNight(gameSave, {
      wolfPack: { isSkip: true },
      witch: { heal: true },
    });
    expect(stateSave.witchHealUsed).toBe(false);
  });

  it('should give Elder 2 HP against wolf bite: first bite survives, second bite kills', () => {
    const game = createTestGame([
      'elder',
      'werewolf',
      'seer',
      'witch',
      'villager',
      'villager',
    ]);

    // Đêm 1: Bị Sói cắn lần 1 -> Mất 1 giáp, vẫn sống
    const { nextState: state1 } = resolveNight(game, {
      wolfPack: { targets: ['p1'] },
    });
    const elder1 = state1.players.find((p) => p.id === 'p1')!;
    expect(elder1.isAlive).toBe(true);
    expect(elder1.elderHp).toBe(1);

    // Đêm 2: Bị Sói cắn lần 2 -> Chết thật
    const { nextState: state2 } = resolveNight(state1, {
      wolfPack: { targets: ['p1'] },
    });
    const elder2 = state2.players.find((p) => p.id === 'p1')!;
    expect(elder2.isAlive).toBe(false);
    expect(state2.deaths.some((d) => d.playerId === 'p1' && d.cause === 'WOLF_PACK')).toBe(true);
  });

  it('should allow lone White Wolf to vote and kill with Wolf Pack on odd nights', () => {
    const game = createTestGame([
      'white_wolf', // p1
      'werewolf',   // p2 (chết)
      'seer',       // p3
      'witch',      // p4
      'villager',   // p5
      'villager',   // p6
    ]);
    game.players[1].isAlive = false;
    game.roundNumber = 3; // Đêm lẻ

    const { nextState } = resolveNight(game, {
      wolfPack: {
        individualVotes: {
          p1: 'p5',
        },
      },
    });

    // Phiếu bầu của Sói trắng phải được tính và p5 phải chết
    expect(nextState.players.find((p) => p.id === 'p5')!.isAlive).toBe(false);
    expect(nextState.deaths.some((d) => d.playerId === 'p5' && d.cause === 'WOLF_PACK')).toBe(true);
  });

  it('should deduplicate wolf targets on double kill night so Elder loses only 1 HP', () => {
    const game = createTestGame([
      'werewolf',
      'seer',
      'witch',
      'elder',    // p4 (2 HP)
      'villager',
      'villager',
    ]);
    game.wolfCubDoubleKillNextNight = true;

    // Bầy Sói chọn trùng mục tiêu p4 hai lần
    const { nextState } = resolveNight(game, {
      wolfPack: {
        targets: ['p4', 'p4'],
      },
    });

    // Khử trùng mục tiêu -> p4 chỉ mất 1 HP và vẫn sống sót
    const elder = nextState.players.find((p) => p.id === 'p4')!;
    expect(elder.isAlive).toBe(true);
    expect(elder.elderHp).toBe(1);
    expect(nextState.deaths).toHaveLength(0);
  });

  it('should prioritize healTargetId for Witch in SINGLE heal mode', () => {
    const game = createTestGame(
      ['witch', 'werewolf', 'seer', 'villager', 'villager', 'villager'],
      { witchHealMode: 'SINGLE' }
    );
    game.wolfCubDoubleKillNextNight = true; // 2 nạn nhân p4 và p5

    const { nextState } = resolveNight(game, {
      wolfPack: { targets: ['p4', 'p5'] },
      witch: {
        heal: true,
        healTargetId: 'p5', // Chỉ định rõ muốn cứu p5
      },
    });

    // p5 được chỉ định cứu nên sống, p4 không được cứu nên chết
    expect(nextState.players.find((p) => p.id === 'p5')!.isAlive).toBe(true);
    expect(nextState.players.find((p) => p.id === 'p4')!.isAlive).toBe(false);
  });

  it('should not leak secret identities in historyLogs and should emit DEATH in resolvedEvents', () => {
    const game = createTestGame([
      'cupid',
      'werewolf',
      'elder',
      'villager',
      'villager',
      'villager',
    ]);

    const { nextState, output } = resolveNight(game, {
      cupid: { target1: 'p1', target2: 'p2' },
      wolfPack: { targets: ['p6'] },
    });

    // 1. historyLogs không chứa tên người chơi được ghép đôi
    const cupidLog = nextState.historyLogs.find((l) => l.includes('Thần tình yêu'));
    expect(cupidLog).toBeDefined();
    expect(cupidLog!).not.toContain('p1');
    expect(cupidLog!).not.toContain('p2');
    expect(cupidLog!).not.toContain('Player 1');
    expect(cupidLog!).not.toContain('Khác phe');

    // 2. output.events chứa sự kiện DEATH cho p6
    const deathEvent = output.events.find((e) => e.type === 'DEATH' && e.targetPlayerId === 'p6');
    expect(deathEvent).toBeDefined();
  });
});
