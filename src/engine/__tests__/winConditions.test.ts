import { describe, expect, it } from 'bun:test';
import { executeDayVote, executeHunterShot, executeNightPhase } from '../gameEngine';
import { checkWinCondition } from '../winConditions';
import { createTestGame } from './testHelpers';

describe('Engine - Win Conditions & Edge Cases', () => {
  it('should let Tanner win immediately upon being voted out ban ngày', () => {
    const game = createTestGame([
      'tanner',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);

    const { winOutcome } = executeDayVote(game, 'p1');

    expect(winOutcome).not.toBeNull();
    expect(winOutcome!.winner).toBe('TANNER');
    expect(winOutcome!.winningPlayerIds).toEqual(['p1']);
  });

  it('should NOT let Tanner win if killed by wolf bite or poison', () => {
    const game = createTestGame([
      'tanner',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);

    // Tanner (p1) bị Sói cắn chết
    const { nextState, winOutcome } = executeNightPhase(game, {
      wolfPack: { targets: ['p1'] },
    });

    expect(nextState.players.find((p) => p.id === 'p1')!.isAlive).toBe(false);
    // Tanner không thắng
    expect(winOutcome?.winner).not.toBe('TANNER');
  });

  it('should require White Wolf to be sole survivor (aliveCount === 1) to win', () => {
    const game = createTestGame([
      'white_wolf',
      'villager',
      'villager',
      'werewolf',
      'seer',
      'witch',
    ]);

    // Giết toàn bộ người chơi trừ White Wolf (p1)
    for (let i = 1; i < game.players.length; i++) {
      game.players[i].isAlive = false;
    }

    const outcome = checkWinCondition(game);
    expect(outcome).not.toBeNull();
    expect(outcome!.winner).toBe('WHITE_WOLF');
    expect(outcome!.winningPlayerIds).toEqual(['p1']);
  });

  it('should block Villagers from winning while White Wolf is still alive, even if all regular wolves are dead', () => {
    const game = createTestGame([
      'white_wolf', // p1
      'werewolf',   // p2
      'villager',   // p3
      'villager',   // p4
      'seer',       // p5
      'witch',      // p6
    ]);

    // Giết Sói thường p2
    game.players[1].isAlive = false;

    // Lúc này tất cả Sói thường đã chết, nhưng Sói trắng p1 vẫn còn sống!
    const outcome = checkWinCondition(game);

    // Phe Dân KHÔNG THỂ thắng chừng nào Sói trắng còn sống!
    expect(outcome).toBeNull();

    // Giờ giết luôn Sói trắng p1 -> Dân thắng ngay
    game.players[0].isAlive = false;
    const outcomeAfterWhiteWolfDeath = checkWinCondition(game);
    expect(outcomeAfterWhiteWolfDeath).not.toBeNull();
    expect(outcomeAfterWhiteWolfDeath!.winner).toBe('VILLAGER');
  });

  it('should let same-faction Cupid lovers (2 Villagers) win with original faction', () => {
    const game = createTestGame([
      'villager', // p1
      'villager', // p2 (Lover cùng phe Dân với p1)
      'seer',     // p3
      'werewolf', // p4
      'witch',    // p5
      'hunter',   // p6
    ]);

    // Ghép đôi 2 Dân làng
    game.players[0].loverId = 'p2';
    game.players[1].loverId = 'p1';
    game.players[0].isCrossFactionCouple = false;
    game.players[1].isCrossFactionCouple = false;

    // Giết Ma sói p4
    game.players[3].isAlive = false;

    const outcome = checkWinCondition(game);
    // Cùng phe Dân nên thắng theo phe Dân làng bình thường (không phải COUPLE)
    expect(outcome).not.toBeNull();
    expect(outcome!.winner).toBe('VILLAGER');
    expect(outcome!.winningPlayerIds).toContain('p1');
    expect(outcome!.winningPlayerIds).toContain('p2');
  });

  it('should let same-faction Cupid lovers (2 Werewolves) win with Werewolf faction', () => {
    const game = createTestGame([
      'werewolf', // p1
      'werewolf', // p2 (Lover cùng phe Sói với p1)
      'villager', // p3
      'villager', // p4
      'seer',     // p5
      'witch',    // p6
    ]);

    game.players[0].loverId = 'p2';
    game.players[1].loverId = 'p1';
    game.players[0].isCrossFactionCouple = false;
    game.players[1].isCrossFactionCouple = false;

    // Giết hết phe Dân làng
    game.players[2].isAlive = false;
    game.players[3].isAlive = false;
    game.players[4].isAlive = false;
    game.players[5].isAlive = false;

    const outcome = checkWinCondition(game);
    expect(outcome).not.toBeNull();
    expect(outcome!.winner).toBe('WEREWOLF');
    expect(outcome!.winningPlayerIds).toContain('p1');
    expect(outcome!.winningPlayerIds).toContain('p2');
  });

  it('should let cross-faction Cupid lovers (Villager + Werewolf) split into Third Party and win only as last 2 alive', () => {
    const game = createTestGame([
      'villager', // p1 (Dân)
      'werewolf', // p2 (Sói)
      'villager', // p3
      'seer',     // p4
      'witch',    // p5
      'hunter',   // p6
    ]);

    // Ghép đôi khác phe (Dân + Sói)
    game.players[0].loverId = 'p2';
    game.players[1].loverId = 'p1';
    game.players[0].isCrossFactionCouple = true;
    game.players[1].isCrossFactionCouple = true;

    // Còn lại 3 người sống: p1 (Lover), p2 (Lover), p3 (Dân thường)
    game.players[3].isAlive = false;
    game.players[4].isAlive = false;
    game.players[5].isAlive = false;

    // Chưa thể thắng vì chưa phải 2 người sống sót cuối cùng
    expect(checkWinCondition(game)).toBeNull();

    // Giết luôn p3 -> Chỉ còn đúng 2 người yêu khác phe
    game.players[2].isAlive = false;
    const outcome = checkWinCondition(game);

    expect(outcome).not.toBeNull();
    expect(outcome!.winner).toBe('COUPLE');
    expect(outcome!.winningPlayerIds).toEqual(['p1', 'p2']);
  });

  it('should declare DRAW when both factions are wiped out simultaneously', () => {
    const game = createTestGame([
      'werewolf', // p1 (con Sói duy nhất)
      'hunter',   // p2 (Thợ săn)
      'villager',
      'villager',
      'seer',
      'witch',
    ]);

    // Các người khác đã chết
    game.players[2].isAlive = false;
    game.players[3].isAlive = false;
    game.players[4].isAlive = false;
    game.players[5].isAlive = false;

    // Đêm: Sói p1 cắn chết Thợ săn p2
    const { nextState } = executeNightPhase(game, {
      wolfPack: { targets: ['p2'] },
    });

    expect(nextState.phase).toBe('HUNTER_SHOT');

    // Thợ săn p2 bắn chết ngược lại con Sói duy nhất p1
    const { nextState: afterShot, winOutcome } = executeHunterShot(nextState, 'p1');

    // Cả bàn cùng chết sạch -> DRAW
    expect(afterShot.players.every((p) => !p.isAlive)).toBe(true);
    expect(winOutcome).not.toBeNull();
    expect(winOutcome!.winner).toBe('DRAW');
    expect(winOutcome!.winningPlayerIds).toEqual([]);
  });

  it('should declare Villager win when the last wolf bites itself and dies (with no third party)', () => {
    const game = createTestGame(
      ['werewolf', 'villager', 'villager', 'seer', 'witch', 'hunter'],
      { allowWolfFriendlyFire: true }
    );

    // Con Sói duy nhất p1 tự cắn chính mình và không ai cứu
    const { nextState, winOutcome } = executeNightPhase(game, {
      wolfPack: { targets: ['p1'] },
    });

    expect(nextState.players.find((p) => p.id === 'p1')!.isAlive).toBe(false);
    expect(winOutcome).not.toBeNull();
    expect(winOutcome!.winner).toBe('VILLAGER');
  });

  it('should let Village Idiot escape hanging, survive and lose voting right', () => {
    const game = createTestGame([
      'village_idiot',
      'werewolf',
      'seer',
      'witch',
      'villager',
      'villager',
    ]);

    // Làng vote treo cổ Thằng ngốc p1
    const { nextState, survivedByReveal } = executeDayVote(game, 'p1');

    expect(survivedByReveal).toBe(true);
    const idiot = nextState.players.find((p) => p.id === 'p1')!;
    expect(idiot.isAlive).toBe(true);
    expect(idiot.voteWeight).toBe(0); // Bị tước quyền biểu quyết
  });
});
