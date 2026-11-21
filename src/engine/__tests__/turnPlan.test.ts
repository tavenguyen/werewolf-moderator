import { describe, expect, it } from 'bun:test';
import { generateNightTurnPlan, hasAnyOtherWolfDied } from '../turnPlan';
import { createTestGame } from './testHelpers';

describe('Engine - Night Turn Plan & Dream Wolf Awakening', () => {
  it('should generate turns in correct priority order for Night 1', () => {
    const game = createTestGame([
      'cupid',
      'minion',
      'bodyguard',
      'werewolf',
      'seer',
      'witch',
    ]);

    const plan = generateNightTurnPlan(game);
    const roleOrder = plan.map((p) => p.roleId);

    expect(roleOrder).toEqual(['cupid', 'minion', 'bodyguard', 'werewolf', 'seer', 'witch']);
    expect(plan.every((p) => p.canAct)).toBe(true);
  });

  it('should exclude Night 1 only roles (Cupid, Minion) on Night 2 and include White Wolf on even nights', () => {
    const game = createTestGame([
      'cupid',
      'minion',
      'bodyguard',
      'werewolf',
      'white_wolf',
      'seer',
    ]);
    game.roundNumber = 2; // Even night

    const plan = generateNightTurnPlan(game);
    const roleOrder = plan.map((p) => p.roleId);

    // Cupid and Minion should NOT be in Night 2 plan
    expect(roleOrder).not.toContain('cupid');
    expect(roleOrder).not.toContain('minion');

    // White wolf wakes on even night
    expect(roleOrder).toContain('white_wolf');
  });

  it('should create fake turns for dead roles to conceal death', () => {
    const game = createTestGame([
      'bodyguard',
      'werewolf',
      'seer',
      'witch',
      'villager',
      'villager',
    ]);

    // Giết Tiên tri (p3)
    game.players[2].isAlive = false;

    const plan = generateNightTurnPlan(game);
    const seerTurn = plan.find((p) => p.roleId === 'seer');

    expect(seerTurn).toBeDefined();
    expect(seerTurn!.isFake).toBe(true);
    expect(seerTurn!.canAct).toBe(false);
    expect(seerTurn!.activePlayerIds).toEqual([]);
  });

  it('should not awaken Dream Wolf on Night 1 when all wolves are alive', () => {
    const game = createTestGame([
      'werewolf',
      'dream_wolf',
      'seer',
      'witch',
      'villager',
      'villager',
    ]);

    expect(hasAnyOtherWolfDied(game)).toBe(false);
    const plan = generateNightTurnPlan(game);
    const wolfTurn = plan.find((p) => p.roleId === 'werewolf');

    expect(wolfTurn).toBeDefined();
    // Dream Wolf (p2) does NOT wake on Night 1
    expect(wolfTurn!.activePlayerIds).toEqual(['p1']);
  });

  it('should awaken Dream Wolf on next night as soon as at least 1 other wolf has died', () => {
    const game = createTestGame([
      'werewolf',
      'dream_wolf',
      'seer',
      'witch',
      'villager',
      'villager',
    ]);

    // Giả lập Ma sói (p1) chết trong Ngày 1 (ví dụ bị treo cổ)
    game.players[0].isAlive = false;
    game.deaths.push({
      playerId: 'p1',
      roleId: 'werewolf',
      roundNumber: 1,
      phase: 'DAY_VOTE',
      cause: 'VILLAGE_VOTE',
      cascadeDepth: 0,
    });

    game.roundNumber = 2; // Bước sang Đêm 2
    expect(hasAnyOtherWolfDied(game)).toBe(true);

    const plan = generateNightTurnPlan(game);
    const wolfTurn = plan.find((p) => p.roleId === 'werewolf');

    expect(wolfTurn).toBeDefined();
    // Dream Wolf (p2) nay đã thức tỉnh và được gửi action đi cắn cùng bầy (hoặc 1 mình)!
    expect(wolfTurn!.activePlayerIds).toEqual(['p2']);
    expect(wolfTurn!.canAct).toBe(true);
  });

  it('should allow White Wolf to wake and act with Wolf Pack even when all regular werewolves are dead', () => {
    const game = createTestGame([
      'white_wolf', // p1 (THIRD_PARTY)
      'werewolf',   // p2 (chết)
      'seer',
      'witch',
      'villager',
      'villager',
    ]);

    // Sói thường p2 đã chết
    game.players[1].isAlive = false;
    game.roundNumber = 3; // Đêm lẻ (Sói trắng không có lượt riêng)

    const plan = generateNightTurnPlan(game);
    const wolfPackTurn = plan.find((p) => p.roleId === 'werewolf');

    // Lượt bầy Sói vẫn phải active với Sói trắng p1, không bị biến thành fake turn!
    expect(wolfPackTurn).toBeDefined();
    expect(wolfPackTurn!.isFake).toBe(false);
    expect(wolfPackTurn!.canAct).toBe(true);
    expect(wolfPackTurn!.activePlayerIds).toEqual(['p1']);
  });
});
