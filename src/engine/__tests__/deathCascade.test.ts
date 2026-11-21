import { describe, expect, it } from 'bun:test';
import { processDeathCascade } from '../deathCascade';
import { executeHunterShot } from '../gameEngine';
import { createTestGame } from './testHelpers';

describe('Engine - Death Cascade & Cascading Effects', () => {
  it('should cascade death to Cupid lover upon partner death', () => {
    const game = createTestGame([
      'cupid',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);

    // p2 và p3 là cặp đôi
    game.players[1].loverId = 'p3';
    game.players[2].loverId = 'p2';

    // p2 bị treo cổ
    const newDeaths = processDeathCascade(game, [{ playerId: 'p2', cause: 'VILLAGE_VOTE' }]);

    expect(newDeaths).toHaveLength(2);
    expect(game.players.find((p) => p.id === 'p2')!.isAlive).toBe(false);
    expect(game.players.find((p) => p.id === 'p3')!.isAlive).toBe(false);

    const heartbreakDeath = newDeaths.find((d) => d.playerId === 'p3');
    expect(heartbreakDeath).toBeDefined();
    expect(heartbreakDeath!.cause).toBe('COUPLE_HEARTBREAK');
    expect(heartbreakDeath!.cascadeDepth).toBe(1);
  });

  it('should strip village powers when Elder dies by anything other than wolf bite', () => {
    // 1. Chết do treo cổ
    const gameVote = createTestGame([
      'elder',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);
    processDeathCascade(gameVote, [{ playerId: 'p1', cause: 'VILLAGE_VOTE' }]);
    expect(gameVote.villagePowerStripped).toBe(true);

    // 2. Chết do trúng độc Phù thủy
    const gamePoison = createTestGame([
      'elder',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);
    processDeathCascade(gamePoison, [{ playerId: 'p1', cause: 'WITCH_POISON' }]);
    expect(gamePoison.villagePowerStripped).toBe(true);

    // 3. Chết do Thợ săn bắn
    const gameShot = createTestGame([
      'elder',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);
    processDeathCascade(gameShot, [{ playerId: 'p1', cause: 'HUNTER_SHOT' }]);
    expect(gameShot.villagePowerStripped).toBe(true);

    // 4. Chết do Sói cắn (WOLF_PACK) -> KHÔNG bị phạt tước năng lực!
    const gameWolf = createTestGame([
      'elder',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);
    processDeathCascade(gameWolf, [{ playerId: 'p1', cause: 'WOLF_PACK' }]);
    expect(gameWolf.villagePowerStripped).toBe(false);
  });

  it('should chain Cupid heartbreak into Hunter shot into another kill', () => {
    const game = createTestGame([
      'villager', // p1
      'hunter',   // p2 (Lover của p1)
      'werewolf', // p3
      'seer',     // p4
      'witch',    // p5
      'villager', // p6
    ]);

    // p1 và p2 (Thợ săn) là cặp đôi
    game.players[0].loverId = 'p2';
    game.players[1].loverId = 'p1';

    // p1 bị Ma sói cắn chết
    processDeathCascade(game, [{ playerId: 'p1', cause: 'WOLF_PACK' }]);

    // p2 chết theo do heartbreak và kích hoạt pendingHunterShotPlayerId
    expect(game.players.find((p) => p.id === 'p1')!.isAlive).toBe(false);
    expect(game.players.find((p) => p.id === 'p2')!.isAlive).toBe(false);
    expect(game.pendingHunterShotPlayerId).toBe('p2');

    // Thợ săn nổ phát súng sau cùng tiêu diệt Ma sói p3
    const { nextState } = executeHunterShot(game, 'p3');
    expect(nextState.players.find((p) => p.id === 'p3')!.isAlive).toBe(false);
    expect(nextState.deaths.some((d) => d.playerId === 'p3' && d.cause === 'HUNTER_SHOT')).toBe(
      true
    );
  });

  it('should handle Hunter timeout/null as missed shot', () => {
    const game = createTestGame([
      'hunter',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);

    processDeathCascade(game, [{ playerId: 'p1', cause: 'VILLAGE_VOTE' }]);
    expect(game.pendingHunterShotPlayerId).toBe('p1');

    // Hết 15s không bắn ai (targetId = null)
    const { nextState } = executeHunterShot(game, null);
    expect(nextState.pendingHunterShotPlayerId).toBeNull();
    // Không có ai khác chết thêm
    expect(nextState.deaths).toHaveLength(1);
  });

  it('should not process the same player twice in a cascade loop', () => {
    const game = createTestGame([
      'villager',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);

    game.players[0].loverId = 'p2';
    game.players[1].loverId = 'p1';

    // Đưa cả 2 người yêu vào danh sách chết ban đầu
    const records = processDeathCascade(game, [
      { playerId: 'p1', cause: 'WOLF_PACK' },
      { playerId: 'p2', cause: 'WOLF_PACK' },
    ]);

    // Mỗi người chỉ có đúng 1 DeathRecord, không bị lặp vô tận
    expect(records).toHaveLength(2);
    expect(records.filter((r) => r.playerId === 'p1')).toHaveLength(1);
    expect(records.filter((r) => r.playerId === 'p2')).toHaveLength(1);
  });
});
