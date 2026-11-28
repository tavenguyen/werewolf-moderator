import { describe, expect, it } from 'bun:test';
import {
  createInitialGameState,
  executeDayVote,
  executeHunterShot,
  executeNightPhase,
  evaluateBearGrowl,
  type PlayerSetupInput,
} from '../gameEngine';
import { resolveNight } from '../nightResolution';
import { checkWinCondition } from '../winConditions';
import type { GameState, NightActions } from '../types';

function create6PlayerSetup(): PlayerSetupInput[] {
  return [
    { id: 'p1', name: 'Alice', seatIndex: 0 },
    { id: 'p2', name: 'Bob', seatIndex: 1 },
    { id: 'p3', name: 'Charlie', seatIndex: 2 },
    { id: 'p4', name: 'David', seatIndex: 3 },
    { id: 'p5', name: 'Eve', seatIndex: 4 },
    { id: 'p6', name: 'Frank', seatIndex: 5 },
  ];
}

describe('Phase 1 Roles - Passive & Day Event Roles', () => {
  // =========================================================================
  // 1. HOÀNG TỬ (Prince)
  // =========================================================================
  describe('Hoàng tử (Prince)', () => {
    it('lần đầu bị vote treo cổ sẽ lật bài thoát chết, giữ nguyên voteWeight = 1, và kết thúc ngày', () => {
      const setup = create6PlayerSetup();
      const roles = ['prince', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'];
      const state = createInitialGameState(setup, roles);

      // Chuyển sang DAY_VOTE và vote treo cổ Hoàng tử (p1)
      const { nextState, survivedByReveal, winOutcome } = executeDayVote(state, 'p1');

      expect(survivedByReveal).toBe(true);
      expect(nextState.princeRevealed).toBe(true);
      const prince = nextState.players.find((p) => p.id === 'p1')!;
      expect(prince.isAlive).toBe(true);
      expect(prince.voteWeight).toBe(1); // Hoàng tử giữ nguyên quyền vote (khác Thằng ngốc = 0)
      expect(nextState.phase).toBe('NIGHT');
      expect(nextState.roundNumber).toBe(2);
      expect(winOutcome).toBeNull();
      expect(nextState.deaths.length).toBe(0);
    });

    it('bị vote treo cổ lần thứ 2 sau khi đã lật thẻ thì chết thật', () => {
      const setup = create6PlayerSetup();
      const roles = ['prince', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'];
      const state = createInitialGameState(setup, roles);
      state.princeRevealed = true; // Đã từng lật thẻ trước đó

      const { nextState, survivedByReveal } = executeDayVote(state, 'p1');

      expect(survivedByReveal).toBe(false);
      const prince = nextState.players.find((p) => p.id === 'p1')!;
      expect(prince.isAlive).toBe(false);
      expect(nextState.deaths.some((d) => d.playerId === 'p1' && d.cause === 'VILLAGE_VOTE')).toBe(true);
    });

    it('chết ban đêm do Sói cắn hoặc Độc bình thường không kích hoạt lật thẻ', () => {
      const setup = create6PlayerSetup();
      const roles = ['prince', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'];
      const state = createInitialGameState(setup, roles);
      state.phase = 'NIGHT';

      const actions: NightActions = {
        wolfPack: { targets: ['p1'] },
      };

      const { nextState } = resolveNight(state, actions);
      const prince = nextState.players.find((p) => p.id === 'p1')!;
      expect(prince.isAlive).toBe(false);
      expect(nextState.princeRevealed).toBeFalsy();
    });
  });

  // =========================================================================
  // 2. NGƯỜI CỨNG CỎI (Tough Guy)
  // =========================================================================
  describe('Người cứng cỏi (Tough Guy)', () => {
    it('bị Sói cắn đêm không chết ngay, sống qua ngày và sụp đổ ở cuối đêm hôm sau', () => {
      const setup = create6PlayerSetup();
      const roles = ['tough_guy', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'];
      const state = createInitialGameState(setup, roles);
      state.phase = 'NIGHT';
      state.roundNumber = 1;

      // Đêm 1: Sói cắn Người cứng cỏi (p1)
      const actionsNight1: NightActions = {
        wolfPack: { targets: ['p1'] },
      };
      const { nextState: stateAfterNight1, output: outputNight1 } = resolveNight(state, actionsNight1);

      const toughGuyN1 = stateAfterNight1.players.find((p) => p.id === 'p1')!;
      expect(toughGuyN1.isAlive).toBe(true);
      expect(toughGuyN1.toughGuyBittenNight).toBe(1);
      expect(outputNight1.newDeaths.length).toBe(0);
      expect(outputNight1.events.some((e) => e.type === 'SURVIVED' && e.targetPlayerId === 'p1')).toBe(true);

      // Đêm 2: Sói cắn người khác (p6)
      stateAfterNight1.roundNumber = 2;
      const actionsNight2: NightActions = {
        wolfPack: { targets: ['p6'] },
      };
      const { nextState: stateAfterNight2, output: outputNight2 } = resolveNight(stateAfterNight1, actionsNight2);

      const toughGuyN2 = stateAfterNight2.players.find((p) => p.id === 'p1')!;
      expect(toughGuyN2.isAlive).toBe(false);
      expect(outputNight2.newDeaths.some((d) => d.playerId === 'p1' && d.cause === 'TOUGH_GUY_COLLAPSE')).toBe(true);
      expect(outputNight2.newDeaths.some((d) => d.playerId === 'p6' && d.cause === 'WOLF_PACK')).toBe(true);
    });

    it('được Phù thủy cứu trong đêm bị cắn thì vết thương được hóa giải hoàn toàn', () => {
      const setup = create6PlayerSetup();
      const roles = ['tough_guy', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'];
      const state = createInitialGameState(setup, roles);
      state.phase = 'NIGHT';
      state.roundNumber = 1;

      const actions: NightActions = {
        wolfPack: { targets: ['p1'] },
        witch: { heal: true, healTargetId: 'p1' },
      };

      const { nextState } = resolveNight(state, actions);
      const toughGuy = nextState.players.find((p) => p.id === 'p1')!;
      expect(toughGuy.isAlive).toBe(true);
      expect(toughGuy.toughGuyBittenNight).toBeFalsy();
    });

    it('bị Phù thủy ném độc thì chết ngay lập tức không được trì hoãn', () => {
      const setup = create6PlayerSetup();
      const roles = ['tough_guy', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'];
      const state = createInitialGameState(setup, roles);
      state.phase = 'NIGHT';
      state.roundNumber = 1;

      const actions: NightActions = {
        wolfPack: { targets: ['p1'] },
        witch: { poisonTargetId: 'p1' },
      };

      const { nextState, output } = resolveNight(state, actions);
      const toughGuy = nextState.players.find((p) => p.id === 'p1')!;
      expect(toughGuy.isAlive).toBe(false);
      expect(output.newDeaths.some((d) => d.playerId === 'p1' && d.cause === 'WITCH_POISON')).toBe(true);
    });

    it('bị treo cổ vào ban ngày sau đêm bị cắn thì chết vì VILLAGE_VOTE ngay', () => {
      const setup = create6PlayerSetup();
      const roles = ['tough_guy', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'];
      const state = createInitialGameState(setup, roles);
      const tg = state.players.find((p) => p.id === 'p1')!;
      tg.toughGuyBittenNight = 1;

      const { nextState } = executeDayVote(state, 'p1');
      const tgAfter = nextState.players.find((p) => p.id === 'p1')!;
      expect(tgAfter.isAlive).toBe(false);
      expect(nextState.deaths.some((d) => d.playerId === 'p1' && d.cause === 'VILLAGE_VOTE')).toBe(true);
    });
  });

  // =========================================================================
  // 3. KẺ BỊ NGUYỀN (Cursed)
  // =========================================================================
  describe('Kẻ bị nguyền (Cursed)', () => {
    it('bị Sói cắn không chết mà biến thành Ma Sói (faction = WEREWOLF, roleId = werewolf)', () => {
      const setup = create6PlayerSetup();
      const roles = ['cursed', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'];
      const state = createInitialGameState(setup, roles);
      state.phase = 'NIGHT';
      state.roundNumber = 1;

      const actions: NightActions = {
        wolfPack: { targets: ['p1'] },
      };

      const { nextState, output } = resolveNight(state, actions);
      const cursedPlayer = nextState.players.find((p) => p.id === 'p1')!;

      expect(cursedPlayer.isAlive).toBe(true);
      expect(cursedPlayer.faction).toBe('WEREWOLF');
      expect(cursedPlayer.roleId).toBe('werewolf');
      expect(output.newDeaths.length).toBe(0);
      expect(output.events.some((e) => e.type === 'AWAKENED' && e.targetPlayerId === 'p1')).toBe(true);
    });

    it('được Bảo vệ che chắn thì không bị cắn và không biến thành Sói', () => {
      const setup = create6PlayerSetup();
      const roles = ['cursed', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'];
      const state = createInitialGameState(setup, roles);
      state.phase = 'NIGHT';

      const actions: NightActions = {
        bodyguard: { targetId: 'p1' },
        wolfPack: { targets: ['p1'] },
      };

      const { nextState } = resolveNight(state, actions);
      const cursedPlayer = nextState.players.find((p) => p.id === 'p1')!;

      expect(cursedPlayer.isAlive).toBe(true);
      expect(cursedPlayer.faction).toBe('VILLAGER');
      expect(cursedPlayer.roleId).toBe('cursed');
    });

    it('Tiên tri soi trúng Cursed trong đêm bị cắn thì vẫn thấy VILLAGER', () => {
      const setup = create6PlayerSetup();
      const roles = ['cursed', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'];
      const state = createInitialGameState(setup, roles);
      state.phase = 'NIGHT';

      const actions: NightActions = {
        wolfPack: { targets: ['p1'] },
        seer: { targetId: 'p1' },
      };

      const { output } = resolveNight(state, actions);
      expect(output.infoResults.seerResult?.result).toBe('VILLAGER');
    });

    it('bị Phù thủy ném độc thì chết luôn, không biến thành Sói', () => {
      const setup = create6PlayerSetup();
      const roles = ['cursed', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'];
      const state = createInitialGameState(setup, roles);
      state.phase = 'NIGHT';

      const actions: NightActions = {
        wolfPack: { targets: ['p1'] },
        witch: { poisonTargetId: 'p1' },
      };

      const { nextState, output } = resolveNight(state, actions);
      const cursedPlayer = nextState.players.find((p) => p.id === 'p1')!;

      expect(cursedPlayer.isAlive).toBe(false);
      expect(output.newDeaths.some((d) => d.playerId === 'p1' && d.cause === 'WITCH_POISON')).toBe(true);
    });
  });

  // =========================================================================
  // 4. KỴ SĨ GỈ SẮT (Rusty Knight)
  // =========================================================================
  describe('Kỵ sĩ gỉ sắt (Rusty Knight)', () => {
    it('khi bị Sói cắn chết, con Sói cắn gần nhất theo chiều kim đồng hồ bị nhiễm uốn ván và chết đêm sau', () => {
      // Vòng tròn ghế:
      // p1: rusty_knight (seat 0)
      // p2: minion (seat 1) -> Không cắn, phải bỏ qua
      // p3: werewolf (seat 2) -> Sói cắn gần nhất bên tay trái
      // p4: bodyguard (seat 3)
      // p5: witch (seat 4)
      // p6: seer (seat 5)
      const setup = create6PlayerSetup();
      const roles = ['rusty_knight', 'minion', 'werewolf', 'bodyguard', 'witch', 'seer'];
      const state = createInitialGameState(setup, roles);
      state.phase = 'NIGHT';
      state.roundNumber = 1;

      // Đêm 1: Bầy Sói cắn Rusty Knight (p1)
      const actionsN1: NightActions = {
        wolfPack: { targets: ['p1'] },
      };
      const { nextState: stateN1, output: outN1 } = resolveNight(state, actionsN1);

      expect(stateN1.players.find((p) => p.id === 'p1')!.isAlive).toBe(false);
      // Minion (p2) không bị lây nhiễm
      expect(stateN1.players.find((p) => p.id === 'p2')!.infectedWithTetanus).toBeFalsy();
      // Werewolf (p3) bị lây nhiễm uốn ván
      const wolfP3 = stateN1.players.find((p) => p.id === 'p3')!;
      expect(wolfP3.infectedWithTetanus).toBe(true);
      expect(wolfP3.tetanusInfectionRound).toBe(1);

      // Đêm 2: Sói p3 chết vì TETANUS vào cuối đêm
      stateN1.roundNumber = 2;
      const actionsN2: NightActions = {};
      const { nextState: stateN2, output: outN2 } = resolveNight(stateN1, actionsN2);

      expect(stateN2.players.find((p) => p.id === 'p3')!.isAlive).toBe(false);
      expect(outN2.newDeaths.some((d) => d.playerId === 'p3' && d.cause === 'TETANUS')).toBe(true);
    });

    it('nếu Rusty Knight chết vì treo cổ ban ngày thì không ai bị lây nhiễm', () => {
      const setup = create6PlayerSetup();
      const roles = ['rusty_knight', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'];
      const state = createInitialGameState(setup, roles);

      const { nextState } = executeDayVote(state, 'p1');
      const wolf = nextState.players.find((p) => p.id === 'p2')!;
      expect(wolf.infectedWithTetanus).toBeFalsy();
    });
  });

  // =========================================================================
  // 5. GẤU THUẦN HÓA (Bear Tamer)
  // =========================================================================
  describe('Gấu thuần hóa (Bear Tamer)', () => {
    it('gấu gầm khi có Ma Sói cắn đêm ngồi cạnh (trái hoặc phải)', () => {
      // p1: villager (seat 0)
      // p2: bear_tamer (seat 1) -> hàng xóm là p1 (seat 0) và p3 (seat 2)
      // p3: werewolf (seat 2)
      const setup = create6PlayerSetup();
      const roles = ['villager', 'bear_tamer', 'werewolf', 'bodyguard', 'witch', 'seer'];
      const state = createInitialGameState(setup, roles);

      expect(evaluateBearGrowl(state)).toBe(true);
    });

    it('gấu KHÔNG gầm khi hai bên cạnh là Dân làng bình thường', () => {
      // p1: villager (seat 0)
      // p2: bear_tamer (seat 1)
      // p3: seer (seat 2)
      // p4: werewolf (seat 3) -> Sói ngồi xa, không sát bên
      const setup = create6PlayerSetup();
      const roles = ['villager', 'bear_tamer', 'seer', 'werewolf', 'witch', 'bodyguard'];
      const state = createInitialGameState(setup, roles);

      expect(evaluateBearGrowl(state)).toBe(false);
    });

    it('gấu KHÔNG gầm khi ngồi cạnh Minion, Sorcerer hoặc Lycan', () => {
      // p1: minion (seat 0)
      // p2: bear_tamer (seat 1)
      // p3: lycan (seat 2)
      // p4: werewolf (seat 3)
      const setup = create6PlayerSetup();
      const roles = ['minion', 'bear_tamer', 'lycan', 'werewolf', 'witch', 'bodyguard'];
      const state = createInitialGameState(setup, roles);

      expect(evaluateBearGrowl(state)).toBe(false);
    });

    it('gấu tự động bỏ qua người chơi đã chết để kiểm tra người sống tiếp theo', () => {
      // p1: villager (seat 0) - CHẾT
      // p6: werewolf (seat 5) - CÒN SỐNG bên trái của p2 sau khi p1 chết
      // p2: bear_tamer (seat 1)
      // p3: seer (seat 2)
      const setup = create6PlayerSetup();
      const roles = ['villager', 'bear_tamer', 'seer', 'villager', 'witch', 'werewolf'];
      const state = createInitialGameState(setup, roles);

      // Ban đầu p1 (villager) và p3 (seer) ngồi cạnh p2 -> Gấu không gầm
      expect(evaluateBearGrowl(state)).toBe(false);

      // p1 chết -> người sống bên trái p2 trở thành p6 (werewolf)
      state.players.find((p) => p.id === 'p1')!.isAlive = false;
      expect(evaluateBearGrowl(state)).toBe(true);
    });

    it('nếu chính Bear Tamer bị biến thành Ma Sói (faction = WEREWOLF), gấu luôn gầm', () => {
      const setup = create6PlayerSetup();
      const roles = ['villager', 'bear_tamer', 'seer', 'villager', 'witch', 'werewolf'];
      const state = createInitialGameState(setup, roles);
      const bt = state.players.find((p) => p.id === 'p2')!;
      bt.faction = 'WEREWOLF'; // Bị nhiễm hoặc nguyền

      expect(evaluateBearGrowl(state)).toBe(true);
    });
  });

  // =========================================================================
  // 6. THIÊN SỨ (Angel)
  // =========================================================================
  describe('Thiên sứ (Angel)', () => {
    it('bị treo cổ ở Ngày 1 (roundNumber = 1) giành chiến thắng tối thượng ngay lập tức', () => {
      const setup = create6PlayerSetup();
      const roles = ['angel', 'werewolf', 'werewolf', 'seer', 'witch', 'villager'];
      const state = createInitialGameState(setup, roles);
      state.roundNumber = 1;

      const { winOutcome } = executeDayVote(state, 'p1');

      expect(winOutcome).not.toBeNull();
      expect(winOutcome?.winner).toBe('ANGEL');
      expect(winOutcome?.winningPlayerIds).toEqual(['p1']);
    });

    it('nếu có người yêu Cupid, Thiên sứ bị vote Ngày 1 vẫn thắng độc tôn (Ưu tiên 1)', () => {
      const setup = create6PlayerSetup();
      const roles = ['angel', 'werewolf', 'werewolf', 'seer', 'witch', 'villager'];
      const state = createInitialGameState(setup, roles);
      state.roundNumber = 1;
      // Ghép đôi Angel (p1) và Werewolf (p2)
      state.players[0].loverId = 'p2';
      state.players[1].loverId = 'p1';
      state.players[0].isCrossFactionCouple = true;
      state.players[1].isCrossFactionCouple = true;

      const { winOutcome } = executeDayVote(state, 'p1');

      // Angel thắng độc tôn (Ưu tiên 1), không tính Couple thắng
      expect(winOutcome?.winner).toBe('ANGEL');
      expect(winOutcome?.winningPlayerIds).toEqual(['p1']);
    });

    it('sống sót qua Ngày 1 thì trở thành Dân làng thường, bị treo ở Ngày 2 không được thắng', () => {
      const setup = create6PlayerSetup();
      const roles = ['angel', 'werewolf', 'werewolf', 'seer', 'witch', 'villager'];
      const state = createInitialGameState(setup, roles);

      // Ngày 1 vote người khác (p6)
      const day1 = executeDayVote(state, 'p6');
      expect(day1.winOutcome).toBeNull();
      expect(day1.nextState.roundNumber).toBe(2);

      // Ngày 2 vote treo cổ Thiên sứ (p1)
      const day2 = executeDayVote(day1.nextState, 'p1');
      // Không được thắng với tư cách ANGEL nữa
      expect(day2.winOutcome?.winner).not.toBe('ANGEL');
    });

    it('bị Sói cắn chết ở Đêm 1 (roundNumber = 1) cũng thắng tối thượng; chết bởi độc Phù thủy Đêm 1 thì KHÔNG thắng', () => {
      const setup = create6PlayerSetup();
      const roles = ['angel', 'werewolf', 'werewolf', 'seer', 'witch', 'villager'];

      // 1. Sói cắn chết Angel Đêm 1 -> thắng ANGEL
      const stateBite = createInitialGameState(setup, roles);
      const nightBite = executeNightPhase(stateBite, {
        wolfPack: { targets: ['p1'] },
      });
      expect(nightBite.winOutcome?.winner).toBe('ANGEL');
      expect(nightBite.winOutcome?.winningPlayerIds).toEqual(['p1']);

      // 2. Trúng độc Phù thủy Đêm 1 -> không kích hoạt thắng ANGEL
      const statePoison = createInitialGameState(setup, roles);
      const nightPoison = executeNightPhase(statePoison, {
        wolfPack: { isSkip: true },
        witch: { poisonTargetId: 'p1' },
      });
      expect(nightPoison.winOutcome?.winner).not.toBe('ANGEL');
    });

    it('Thiên sứ và Thợ săn cùng bị bầy Sói cắn chết Đêm 1: mở HUNTER_SHOT trước, ghi DAWN_SUMMARY trước WIN, và sau phát súng vẫn thắng ANGEL', () => {
      const setup = create6PlayerSetup();
      const roles = ['angel', 'hunter', 'werewolf', 'big_bad_wolf', 'villager', 'villager'];
      const state = createInitialGameState(setup, roles);

      const nightRes = executeNightPhase(state, {
        wolfPack: { targets: ['p1'] },
        bigBadWolf: { targetId: 'p2' },
      });

      expect(nightRes.winOutcome).toBeNull();
      expect(nightRes.nextState.phase).toBe('HUNTER_SHOT');
      expect(nightRes.nextState.pendingHunterShotPlayerId).toBe('p2');

      const dawnIdx = nightRes.nextState.eventLog.findIndex((e) => e.actionType === 'DAWN_SUMMARY');
      expect(dawnIdx).toBeGreaterThanOrEqual(0);
      expect(nightRes.nextState.eventLog.some((e) => e.actionType === 'WIN')).toBe(false);

      const shotRes = executeHunterShot(nightRes.nextState, 'p3');
      expect(shotRes.winOutcome?.winner).toBe('ANGEL');
      expect(shotRes.winOutcome?.winningPlayerIds).toEqual(['p1']);
      expect(shotRes.nextState.phase).toBe('GAME_OVER');

      const shotIdx = shotRes.nextState.eventLog.findIndex((e) => e.actionType === 'HUNTER_SHOT');
      const winIdx = shotRes.nextState.eventLog.findIndex((e) => e.actionType === 'WIN');
      expect(dawnIdx).toBeLessThan(shotIdx);
      expect(shotIdx).toBeLessThan(winIdx);
    });
  });
});
