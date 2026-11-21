import { describe, expect, it } from 'bun:test';
import {
  createInitialGameState,
  executeDayVote,
  executeHunterShot,
  executeNightPhase,
  startDayPhase,
} from '../gameEngine';
import { createTestGame } from './testHelpers';

describe('Game Engine - Full Lifecycle Integration', () => {
  it('should initialize a valid game in LOBBY phase and validate bounds', () => {
    const game = createTestGame([
      'villager',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);

    expect(game.phase).toBe('LOBBY');
    expect(game.players).toHaveLength(6);
    expect(game.roundNumber).toBe(1);
    expect(game.generation).toBe(1);
  });

  it('should reject games with fewer than 6 or more than 16 players', () => {
    expect(() =>
      createTestGame(['villager', 'werewolf'])
    ).toThrow();
  });

  it('should play a multi-round game to completion with correct phase transitions', () => {
    // 6 người chơi: 1 Sói (p1), 5 Dân (p2: Tiên tri, p3: Bảo vệ, p4: Phù thủy, p5: Thợ săn, p6: Dân)
    const game = createTestGame([
      'werewolf', // p1
      'seer',     // p2
      'bodyguard',// p3
      'witch',    // p4
      'hunter',   // p5
      'villager', // p6
    ]);

    // Đêm 1:
    // - Bảo vệ p3 che chắn p2 (Tiên tri)
    // - Sói p1 cắn p6 (Dân làng)
    // - Tiên tri p2 soi p1 -> ra Sói
    // - Phù thủy p4 không dùng bình
    const night1 = executeNightPhase(game, {
      bodyguard: { targetId: 'p2' },
      wolfPack: { targets: ['p6'] },
      seer: { targetId: 'p1' },
    });

    expect(night1.nightOutput.newDeaths).toHaveLength(1);
    expect(night1.nightOutput.newDeaths[0].playerId).toBe('p6');
    expect(night1.nightOutput.infoResults.seerResult?.result).toBe('WEREWOLF');
    expect(night1.winOutcome).toBeNull();
    expect(night1.nextState.phase).toBe('DAY_DISCUSS');

    // Chuyển sang biểu quyết Ngày 1:
    // Tiên tri p2 chia sẻ thông tin, cả làng vote treo cổ Ma sói p1
    const day1Vote = executeDayVote(night1.nextState, 'p1');

    // Ma sói duy nhất p1 bị treo cổ -> Dân làng thắng ván đấu!
    expect(day1Vote.winOutcome).not.toBeNull();
    expect(day1Vote.winOutcome!.winner).toBe('VILLAGER');
    expect(day1Vote.nextState.phase).toBe('GAME_OVER');
  });

  it('should handle Hunter morning shot flow before transitioning to Day Discussion or Game Over', () => {
    const game = createTestGame([
      'werewolf', // p1
      'hunter',   // p2
      'villager', // p3
      'villager', // p4
      'seer',     // p5
      'witch',    // p6
    ]);

    // Đêm: Sói p1 cắn Thợ săn p2
    const { nextState: nightState } = executeNightPhase(game, {
      wolfPack: { targets: ['p2'] },
    });

    // Thợ săn vừa chết -> Phase phải là HUNTER_SHOT trước khi mở ngày
    expect(nightState.phase).toBe('HUNTER_SHOT');
    expect(nightState.pendingHunterShotPlayerId).toBe('p2');

    // Thợ săn p2 nổ súng bắn p3 (Dân)
    const { nextState: afterShot, winOutcome } = executeHunterShot(nightState, 'p3');

    // Ván chơi chưa kết thúc -> Chuyển sang DAY_DISCUSS và khởi tạo đầy đủ dayState
    expect(winOutcome).toBeNull();
    expect(afterShot.phase).toBe('DAY_DISCUSS');
    expect(afterShot.dayState).toBeDefined();
    expect(afterShot.dayState!.voteLocked).toBe(true);
    expect(afterShot.dayState!.discussionSecondsRemaining).toBe(180);
    expect(afterShot.players.find((p) => p.id === 'p3')!.isAlive).toBe(false);
  });
});
