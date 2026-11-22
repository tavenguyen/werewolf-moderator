import { describe, expect, it } from 'bun:test';
import { processDeathCascade } from '../deathCascade';
import {
  evaluateBearGrowl,
  executeDayVote,
  executeHunterShot,
  executeNightPhase,
} from '../gameEngine';
import { getWitchVictimsPreview, resolveNight } from '../nightResolution';
import { ROLES_BY_ID } from '../roles';
import { generateNightTurnPlan } from '../turnPlan';
import { checkWinCondition, isCrossFactionCouple } from '../winConditions';
import { createTestGame } from './testHelpers';

describe('Engine - 18 Master Role Interactions (roleInteractions.test.ts)', () => {
  // =========================================================================
  // Kịch bản 1: wild_child + tough_guy
  // Thần tượng chết ở Đêm 2 -> Đứa con hoang chỉ hóa Sói từ Đêm 2.
  // =========================================================================
  it('Scenario 1: wild_child + tough_guy - Đứa con hoang chỉ hóa Sói từ Đêm 2 khi thần tượng Người cứng cỏi sụp đổ', () => {
    const game = createTestGame([
      'wild_child',
      'tough_guy',
      'werewolf',
      'villager',
      'villager',
      'villager',
    ]);
    const [wildChild, toughGuy] = game.players;

    // Đêm 1: Wild Child chọn thần tượng là Tough Guy; Bầy Sói cắn Tough Guy
    const { nextState: night1State } = executeNightPhase(game, {
      wildChild: { targetId: toughGuy.id },
      wolfPack: { targets: [toughGuy.id] },
    });

    const pToughGuyN1 = night1State.players.find((p) => p.id === toughGuy.id)!;
    const pWildChildN1 = night1State.players.find((p) => p.id === wildChild.id)!;

    // Tough Guy bị cắn nhưng chưa chết ngay đêm 1
    expect(pToughGuyN1.isAlive).toBe(true);
    expect(pToughGuyN1.toughGuyBittenNight).toBe(1);

    // Wild Child thần tượng vẫn sống -> Chưa hóa Sói
    expect(pWildChildN1.roleModelId).toBe(toughGuy.id);
    expect(pWildChildN1.faction).toBe('VILLAGER');
    expect(pWildChildN1.roleId).toBe('wild_child');

    // Tiến tới Đêm 2: Người cứng cỏi sụp đổ và gục ngã
    night1State.roundNumber = 2;
    night1State.phase = 'NIGHT';
    const { nextState: night2State } = executeNightPhase(night1State, {});

    const pToughGuyN2 = night2State.players.find((p) => p.id === toughGuy.id)!;
    const pWildChildN2 = night2State.players.find((p) => p.id === wildChild.id)!;

    // Tough Guy sụp đổ ở Đêm 2
    expect(pToughGuyN2.isAlive).toBe(false);
    // Wild Child mất thần tượng và chuyển hóa thành Ma Sói
    expect(pWildChildN2.faction).toBe('WEREWOLF');
    expect(pWildChildN2.roleId).toBe('werewolf');
  });

  // =========================================================================
  // Kịch bản 2: dire_wolf + prince
  // Hoàng tử lật bài thoát chết -> Sói tuyết không chết theo.
  // =========================================================================
  it('Scenario 2: dire_wolf + prince - Hoàng tử lật bài thoát chết -> Sói tuyết không chết theo', () => {
    const game = createTestGame([
      'dire_wolf',
      'prince',
      'villager',
      'villager',
      'werewolf',
      'villager',
    ]);
    const [direWolf, prince] = game.players;

    // Đêm 1: Sói tuyết chọn bạn đồng hành là Hoàng tử
    const { nextState: night1State } = executeNightPhase(game, {
      direWolf: { targetId: prince.id },
    });
    const pDireWolfN1 = night1State.players.find((p) => p.id === direWolf.id)!;
    expect(pDireWolfN1.companionId).toBe(prince.id);

    // Ngày 1: Làng biểu quyết treo cổ Hoàng tử
    const { nextState: day1State, survivedByReveal } = executeDayVote(night1State, prince.id);

    const pPrinceDay1 = day1State.players.find((p) => p.id === prince.id)!;
    const pDireWolfDay1 = day1State.players.find((p) => p.id === direWolf.id)!;

    // Hoàng tử lật thẻ thoát án treo cổ
    expect(survivedByReveal).toBe(true);
    expect(pPrinceDay1.isAlive).toBe(true);
    expect(day1State.princeRevealed).toBe(true);

    // Sói tuyết vẫn sống khỏe mạnh vì bạn đồng hành không chết
    expect(pDireWolfDay1.isAlive).toBe(true);
  });

  // =========================================================================
  // Kịch bản 3: wolf_accursed + bodyguard
  // Bảo vệ đỡ trúng -> Lời nguyền thất bại và được HOÀN TRẢ lượt nguyền.
  // =========================================================================
  it('Scenario 3: wolf_accursed + bodyguard - Bảo vệ đỡ trúng -> Lời nguyền thất bại và được hoàn trả', () => {
    const game = createTestGame([
      'wolf_accursed',
      'bodyguard',
      'villager',
      'werewolf',
      'villager',
      'villager',
    ]);
    const [accursedWolf, bodyguard, targetVillager] = game.players;

    // Đêm 1: Sói cắn targetVillager, Sói nguyền muốn nguyền targetVillager, nhưng Bảo vệ che chở targetVillager
    const { nextState } = executeNightPhase(game, {
      wolfPack: { targets: [targetVillager.id] },
      accursedWolf: { curseTargetId: targetVillager.id },
      bodyguard: { targetId: targetVillager.id },
    });

    const pTarget = nextState.players.find((p) => p.id === targetVillager.id)!;

    // Nạn nhân được Bảo vệ che chắn nên không bị cắn chết
    expect(pTarget.isAlive).toBe(true);
    // Vết cắn bị chặn nên lời nguyền thất bại, mục tiêu vẫn là Dân làng
    expect(pTarget.faction).toBe('VILLAGER');
    expect(pTarget.roleId).toBe('villager');
    // Quyền nguyền rủa được HOÀN TRẢ để dùng cho đêm sau
    expect(nextState.accursedWolfUsed).toBe(false);
  });

  // =========================================================================
  // Kịch bản 4: wolf_accursed + witch
  // Sói nguyền nguyền nạn nhân -> Phù thủy thấy đêm nay không có ai bị cắn qua getWitchVictimsPreview.
  // =========================================================================
  it('Scenario 4: wolf_accursed + witch - Sói nguyền nguyền nạn nhân -> Phù thủy thấy 0 nạn nhân qua preview', () => {
    const game = createTestGame([
      'wolf_accursed',
      'witch',
      'villager',
      'werewolf',
      'villager',
      'villager',
    ]);
    const targetId = game.players[2].id;

    const nightActions = {
      wolfPack: { targets: [targetId] },
      accursedWolf: { curseTargetId: targetId },
    };

    // Phù thủy xem trước danh sách nạn nhân
    const previewVictims = getWitchVictimsPreview(game, nightActions);

    // Vì nạn nhân đã bị Sói nguyền chọn chuyển hóa chứ không chết do cắn, preview trả về mảng rỗng
    expect(previewVictims).toHaveLength(0);
  });

  // =========================================================================
  // Kịch bản 5: doppelganger + drunk
  // Nhân bản sao chép Kẻ say rượu chết trước Đêm 3 -> Thừa kế vai thật trong tiềm thức.
  // =========================================================================
  it('Scenario 5: doppelganger + drunk - Nhân bản sao chép Drunk chết trước Đêm 3 -> Thừa kế vai thật tiềm thức', () => {
    const game = createTestGame([
      'doppelganger',
      'drunk',
      'werewolf',
      'villager',
      'villager',
      'villager',
    ]);
    const [doppelganger, drunk] = game.players;
    // Drunk mang vai thật tiềm thức là Tiên tri (seer)
    drunk.drunkRealRoleId = 'seer';

    // Đêm 1: Doppelganger chọn Drunk
    const { nextState: night1State } = executeNightPhase(game, {
      doppelganger: { targetId: drunk.id },
    });
    expect(night1State.players.find((p) => p.id === doppelganger.id)!.doppelgangerTargetId).toBe(drunk.id);

    // Ngày 1 (chết trước Đêm 3): Làng treo cổ Drunk
    const { nextState: day1State } = executeDayVote(night1State, drunk.id);

    const pDrunk = day1State.players.find((p) => p.id === drunk.id)!;
    const pDoppelganger = day1State.players.find((p) => p.id === doppelganger.id)!;

    expect(pDrunk.isAlive).toBe(false);
    // Doppelganger kế thừa vai thật tiềm thức 'seer'
    expect(pDoppelganger.isAlive).toBe(true);
    expect(pDoppelganger.roleId).toBe('seer');
    expect(pDoppelganger.faction).toBe('VILLAGER');
  });

  // =========================================================================
  // Kịch bản 6: doppelganger + dire_wolf
  // Sói tuyết chết do bạn đồng hành -> Nhân bản kế thừa thành Sói thường, không kế thừa bạn đồng hành đã chết.
  // =========================================================================
  it('Scenario 6: doppelganger + dire_wolf - Sói tuyết chết do bạn đồng hành -> Nhân bản hóa Sói thường không chết chùm', () => {
    const game = createTestGame([
      'doppelganger',
      'dire_wolf',
      'villager',
      'villager',
      'werewolf',
      'villager',
    ]);
    const [doppelganger, direWolf, companion] = game.players;

    // Đêm 1: Doppelganger chọn Dire Wolf; Dire Wolf chọn companion
    const { nextState: night1State } = executeNightPhase(game, {
      doppelganger: { targetId: direWolf.id },
      direWolf: { targetId: companion.id },
    });

    // Ngày 1: Companion bị treo cổ -> Dire Wolf chết theo vì đau lòng
    const { nextState: day1State } = executeDayVote(night1State, companion.id);

    const pCompanion = day1State.players.find((p) => p.id === companion.id)!;
    const pDireWolf = day1State.players.find((p) => p.id === direWolf.id)!;
    const pDoppelganger = day1State.players.find((p) => p.id === doppelganger.id)!;

    expect(pCompanion.isAlive).toBe(false);
    expect(pDireWolf.isAlive).toBe(false);

    // Doppelganger kế thừa Dire Wolf thành Sói thường ('werewolf'), không có companionId đã chết
    expect(pDoppelganger.isAlive).toBe(true);
    expect(pDoppelganger.roleId).toBe('werewolf');
    expect(pDoppelganger.faction).toBe('WEREWOLF');
    expect(pDoppelganger.companionId).toBeNull();
  });

  // =========================================================================
  // Kịch bản 7: witch AoE Heal + tough_guy
  // Phù thủy cứu AoE -> Người cứng cỏi không bị sụp đổ đêm sau.
  // =========================================================================
  it('Scenario 7: witch AoE Heal + tough_guy - Phù thủy cứu AoE -> Người cứng cỏi không bị sụp đổ đêm sau', () => {
    const game = createTestGame(
      ['tough_guy', 'witch', 'werewolf', 'villager', 'villager', 'villager'],
      { witchHealMode: 'AOE' }
    );
    const [toughGuy] = game.players;

    // Đêm 1: Bầy Sói cắn Tough Guy; Phù thủy dùng bình Cứu AoE
    const { nextState: night1State } = executeNightPhase(game, {
      wolfPack: { targets: [toughGuy.id] },
      witch: { heal: true },
    });

    const pToughGuyN1 = night1State.players.find((p) => p.id === toughGuy.id)!;
    expect(pToughGuyN1.isAlive).toBe(true);
    // Vết cắn đã được cứu, không bị gán toughGuyBittenNight
    expect(pToughGuyN1.toughGuyBittenNight).toBeFalsy();

    // Tiến tới Đêm 2: Không bị sụp đổ
    night1State.roundNumber = 2;
    night1State.phase = 'NIGHT';
    const { nextState: night2State } = executeNightPhase(night1State, {});

    const pToughGuyN2 = night2State.players.find((p) => p.id === toughGuy.id)!;
    expect(pToughGuyN2.isAlive).toBe(true);
  });

  // =========================================================================
  // Kịch bản 8: pied_piper + werewolf cùng đạt điều kiện thắng
  // Đêm cuối Sói cắn Dân cuối, Sói thổi sáo thôi miên xong cả bàn -> Người thổi sáo thắng độc tôn trước bầy Sói (Ưu tiên 4 > Ưu tiên 9).
  // =========================================================================
  it('Scenario 8: pied_piper + werewolf cùng đạt điều kiện thắng -> Người thổi sáo thắng độc tôn (Ưu tiên 4 > Ưu tiên 9)', () => {
    const game = createTestGame([
      'pied_piper',
      'werewolf',
      'werewolf',
      'villager',
      'villager',
      'villager',
    ]);
    const [piper, wolf1, wolf2, villager1, dead1, dead2] = game.players;
    dead1.isAlive = false;
    dead2.isAlive = false;
    wolf1.isEnchanted = true; // Wolf 1 đã bị bùa từ đêm trước

    // Đêm nay: Sói cắn villager1; Pied Piper thôi miên wolf2 và villager1
    const { nextState, winOutcome } = executeNightPhase(game, {
      wolfPack: { targets: [villager1.id] },
      piedPiper: { targetIds: [wolf2.id, villager1.id] },
    });

    expect(nextState.players.find((p) => p.id === villager1.id)!.isAlive).toBe(false);
    expect(nextState.players.find((p) => p.id === wolf2.id)!.isEnchanted).toBe(true);

    // 100% người sống còn lại (wolf1, wolf2) đều đã dính bùa thôi miên
    expect(winOutcome).not.toBeNull();
    expect(winOutcome!.winner).toBe('PIED_PIPER');
    expect(winOutcome!.winningPlayerIds).toEqual([piper.id]);
  });

  // =========================================================================
  // Kịch bản 9: angel bị vote Ngày 1 + cupid lover
  // Thiên sứ bị vote Ngày 1 có người yêu -> Thiên sứ thắng ván ngay lập tức (Ưu tiên 1).
  // =========================================================================
  it('Scenario 9: angel bị vote Ngày 1 + cupid lover -> Thiên sứ thắng tối thượng ngay lập tức (Ưu tiên 1)', () => {
    const game = createTestGame([
      'angel',
      'villager',
      'cupid',
      'werewolf',
      'villager',
      'villager',
    ]);
    const [angel, lover] = game.players;
    angel.loverId = lover.id;
    lover.loverId = angel.id;

    // Ngày 1: Làng bỏ phiếu treo cổ Thiên sứ
    game.roundNumber = 1;
    const { winOutcome } = executeDayVote(game, angel.id);

    expect(winOutcome).not.toBeNull();
    expect(winOutcome!.winner).toBe('ANGEL');
    expect(winOutcome!.winningPlayerIds).toEqual([angel.id]);
  });

  // =========================================================================
  // Kịch bản 10: bear_tamer ngồi cạnh Minion/Sorcerer/Lycan
  // Gấu KHÔNG gầm với Minion/Sorcerer. Ngồi cạnh Lycan -> Gấu KHÔNG gầm. Chỉ gầm khi cạnh Sói cắn thật.
  // =========================================================================
  it('Scenario 10: bear_tamer ngồi cạnh Minion/Sorcerer/Lycan -> Gấu không gầm; chỉ gầm cạnh Sói cắn thật', () => {
    // Test 10a: Ngồi cạnh Minion
    const gameMinion = createTestGame([
      'villager',
      'bear_tamer',
      'minion',
      'werewolf',
      'villager',
      'villager',
    ]);
    expect(evaluateBearGrowl(gameMinion)).toBe(false);

    // Test 10b: Ngồi cạnh Sorcerer
    const gameSorcerer = createTestGame([
      'villager',
      'bear_tamer',
      'sorcerer',
      'werewolf',
      'villager',
      'villager',
    ]);
    expect(evaluateBearGrowl(gameSorcerer)).toBe(false);

    // Test 10c: Ngồi cạnh Lycan
    const gameLycan = createTestGame([
      'villager',
      'bear_tamer',
      'lycan',
      'werewolf',
      'villager',
      'villager',
    ]);
    expect(evaluateBearGrowl(gameLycan)).toBe(false);

    // Test 10d: Ngồi cạnh Sói cắn thật (werewolf)
    const gameWerewolf = createTestGame([
      'villager',
      'bear_tamer',
      'werewolf',
      'villager',
      'villager',
      'villager',
    ]);
    expect(evaluateBearGrowl(gameWerewolf)).toBe(true);
  });

  // =========================================================================
  // Kịch bản 11: troublemaker + angel + tanner Ngày 1
  // Cả 2 cùng bị treo -> Thiên sứ thắng trước Kẻ chán đời (Ưu tiên 1 > Ưu tiên 2).
  // =========================================================================
  it('Scenario 11: troublemaker + angel + tanner Ngày 1 -> Thiên sứ thắng trước Tanner (Ưu tiên 1 > Ưu tiên 2)', () => {
    const game = createTestGame([
      'angel',
      'tanner',
      'troublemaker',
      'werewolf',
      'villager',
      'villager',
    ]);
    const [angel, tanner] = game.players;
    game.roundNumber = 1;

    // Kẻ phá rối kích hoạt treo cổ 2 người: Angel và Tanner
    const { winOutcome } = executeDayVote(game, [angel.id, tanner.id]);

    expect(winOutcome).not.toBeNull();
    expect(winOutcome!.winner).toBe('ANGEL');
    expect(winOutcome!.winningPlayerIds).toEqual([angel.id]);
  });

  // =========================================================================
  // Kịch bản 12: troublemaker + hunter
  // Phải giải quyết xong phát súng Thợ săn mới kiểm tra điều kiện thắng.
  // =========================================================================
  it('Scenario 12: troublemaker + hunter -> Phải giải quyết xong phát súng Thợ săn mới kết thúc ván', () => {
    const game = createTestGame([
      'hunter',
      'villager',
      'troublemaker',
      'werewolf',
      'villager',
      'villager',
    ]);
    const [hunter, villager1] = game.players;

    // Treo cổ Hunter và villager1
    const { nextState, winOutcome } = executeDayVote(game, [hunter.id, villager1.id]);

    // Trạng thái chuyển sang HUNTER_SHOT và hoãn kiểm tra thắng
    expect(nextState.phase).toBe('HUNTER_SHOT');
    expect(nextState.pendingHunterShotPlayerId).toBe(hunter.id);
    expect(winOutcome).toBeNull();
  });

  // =========================================================================
  // Kịch bản 13: lone_wolf + white_wolf
  // Bị chặn chọn chung tại Lobby; nếu còn 2 người sống thì Sói trắng thắng.
  // =========================================================================
  it('Scenario 13: lone_wolf + white_wolf - Nếu còn đúng 2 người sống sót thì Sói trắng thắng độc tôn', () => {
    const game = createTestGame([
      'lone_wolf',
      'white_wolf',
      'villager',
      'villager',
      'villager',
      'villager',
    ]);
    // Giết tất cả trừ lone_wolf và white_wolf
    for (let i = 2; i < game.players.length; i++) {
      game.players[i].isAlive = false;
    }

    const outcome = checkWinCondition(game);
    expect(outcome).not.toBeNull();
    expect(outcome!.winner).toBe('WHITE_WOLF');
    expect(outcome!.winningPlayerIds).toEqual([game.players[1].id]);
  });

  // =========================================================================
  // Kịch bản 14: spellcaster yểm bùa người chết
  // Không hiện banner câm vào sáng hôm sau. Không được làm câm 1 người 2 đêm liền.
  // =========================================================================
  it('Scenario 14: spellcaster yểm bùa người chết -> Không câm sáng hôm sau; không câm 2 đêm liền', () => {
    const game = createTestGame([
      'spellcaster',
      'villager',
      'villager',
      'werewolf',
      'villager',
      'villager',
    ]);
    const [spellcaster, victim, villager2] = game.players;

    // 14a. Yểm bùa người bị Sói cắn chết trong đêm
    const { nextState: night1State } = executeNightPhase(game, {
      spellcaster: { targetId: victim.id },
      wolfPack: { targets: [victim.id] },
    });
    expect(night1State.players.find((p) => p.id === victim.id)!.isAlive).toBe(false);
    expect(night1State.mutedPlayerId).toBeNull();

    // 14b. Yểm bùa villager2 thành công ở Đêm 2
    night1State.roundNumber = 2;
    night1State.phase = 'NIGHT';
    const { nextState: night2State } = executeNightPhase(night1State, {
      spellcaster: { targetId: villager2.id },
    });
    expect(night2State.mutedPlayerId).toBe(villager2.id);
    expect(night2State.lastMutedPlayerId).toBe(villager2.id);

    // 14c. Đêm 3 cố tình chọn lại villager2 -> Bị từ chối
    night2State.roundNumber = 3;
    night2State.phase = 'NIGHT';
    const { nextState: night3State } = executeNightPhase(night2State, {
      spellcaster: { targetId: villager2.id },
    });
    expect(night3State.mutedPlayerId).toBeNull();
  });

  // =========================================================================
  // Kịch bản 15: seer bị wolf_accursed nguyền -> apprentice_seer
  // Tiên tri thành Sói -> apprentice_seer tự động thức tỉnh thay thế từ đêm sau.
  // =========================================================================
  it('Scenario 15: seer bị wolf_accursed nguyền -> apprentice_seer tự động thức tỉnh từ đêm sau', () => {
    const game = createTestGame([
      'seer',
      'apprentice_seer',
      'wolf_accursed',
      'werewolf',
      'villager',
      'villager',
    ]);
    const [seer, apprentice, accursedWolf] = game.players;

    // Đêm 1: Sói cắn Seer, Sói nguyền nguyền Seer
    const { nextState: night1State } = executeNightPhase(game, {
      wolfPack: { targets: [seer.id] },
      accursedWolf: { curseTargetId: seer.id },
    });

    const pSeer = night1State.players.find((p) => p.id === seer.id)!;
    expect(pSeer.roleId).toBe('werewolf');
    expect(pSeer.faction).toBe('WEREWOLF');

    // Đêm 2: Apprentice Seer tự động thức dậy thay thế
    night1State.roundNumber = 2;
    night1State.phase = 'NIGHT';
    const turnPlan = generateNightTurnPlan(night1State);
    const seerTurn = turnPlan.find((t) => t.turnKey === 'seer');

    expect(seerTurn).toBeDefined();
    expect(seerTurn!.canAct).toBe(true);
    expect(seerTurn!.activePlayerIds).toEqual([apprentice.id]);
    expect(seerTurn!.audioKey).toBe('night_seer');
  });

  // =========================================================================
  // Kịch bản 16: cupid ghép 2 Dân -> 1 người hóa Sói -> COUPLE dynamic check
  // =========================================================================
  it('Scenario 16: cupid ghép 2 Dân -> 1 người hóa Sói -> Dynamic check chuyển thành Cặp đôi khác phe', () => {
    const game = createTestGame([
      'cupid',
      'villager',
      'cursed',
      'werewolf',
      'villager',
      'villager',
    ]);
    const [cupid, villager1, cursedPlayer] = game.players;

    // Đêm 1: Ghép villager1 và cursed (ban đầu đều phe VILLAGER)
    const { nextState: night1State } = executeNightPhase(game, {
      cupid: { target1: villager1.id, target2: cursedPlayer.id },
    });

    const pVillagerN1 = night1State.players.find((p) => p.id === villager1.id)!;
    const pCursedN1 = night1State.players.find((p) => p.id === cursedPlayer.id)!;
    expect(isCrossFactionCouple(pVillagerN1, pCursedN1)).toBe(false);

    // Đêm 2: Sói cắn Kẻ bị nguyền -> Hóa Sói
    night1State.roundNumber = 2;
    night1State.phase = 'NIGHT';
    const { nextState: night2State } = executeNightPhase(night1State, {
      wolfPack: { targets: [cursedPlayer.id] },
    });

    const pVillagerN2 = night2State.players.find((p) => p.id === villager1.id)!;
    const pCursedN2 = night2State.players.find((p) => p.id === cursedPlayer.id)!;
    expect(pCursedN2.faction).toBe('WEREWOLF');

    // Dynamic check ngay lập tức nhận diện đây là cặp đôi khác phe!
    expect(isCrossFactionCouple(pVillagerN2, pCursedN2)).toBe(true);

    // Khi chỉ còn 2 người này sống sót -> Chiến thắng COUPLE
    for (const p of night2State.players) {
      if (p.id !== villager1.id && p.id !== cursedPlayer.id) {
        p.isAlive = false;
      }
    }
    const winOutcome = checkWinCondition(night2State);
    expect(winOutcome).not.toBeNull();
    expect(winOutcome!.winner).toBe('COUPLE');
    expect(winOutcome!.winningPlayerIds).toEqual([villager1.id, cursedPlayer.id]);
  });

  // =========================================================================
  // Kịch bản 17: hunter bị doppelganger sao chép -> hunter bắn doppelganger
  // Nhân bản chết luôn, TUYỆT ĐỐI không bắn phát súng thứ 2.
  // =========================================================================
  it('Scenario 17: hunter bị doppelganger sao chép -> hunter bắn doppelganger -> Dập tắt phát súng kép', () => {
    const game = createTestGame([
      'hunter',
      'doppelganger',
      'werewolf',
      'villager',
      'villager',
      'villager',
    ]);
    const [hunter, doppelganger] = game.players;

    // Đêm 1: Doppelganger sao chép Hunter
    const { nextState: night1State } = executeNightPhase(game, {
      doppelganger: { targetId: hunter.id },
    });

    // Ngày 1: Làng treo cổ Hunter
    const { nextState: day1State } = executeDayVote(night1State, hunter.id);

    const pHunter = day1State.players.find((p) => p.id === hunter.id)!;
    const pDoppelganger = day1State.players.find((p) => p.id === doppelganger.id)!;

    expect(pHunter.isAlive).toBe(false);
    expect(pDoppelganger.roleId).toBe('hunter');

    // Hunter nổ súng bắn chính Doppelganger
    const { nextState: afterShotState } = executeHunterShot(day1State, doppelganger.id);

    const pDeadDoppelganger = afterShotState.players.find((p) => p.id === doppelganger.id)!;
    expect(pDeadDoppelganger.isAlive).toBe(false);

    // QUY TẮC DẬP TẮT PHÁT SÚNG KÉP: pendingHunterShotPlayerId KHÔNG được kích hoạt lần thứ 2!
    expect(afterShotState.pendingHunterShotPlayerId).toBeNull();
  });

  // =========================================================================
  // Kịch bản 18: big_bad_wolf + bodyguard + witch
  // Bầy Sói cắn A (Bảo vệ đỡ), Sói đại ca cắn B -> A sống, B chết (trừ khi Phù thủy cứu B).
  // =========================================================================
  it('Scenario 18: big_bad_wolf + bodyguard + witch - Bầy cắn A (được đỡ), Sói đại ca cắn B -> A sống, B chết hoặc được cứu', () => {
    const game = createTestGame([
      'bodyguard',
      'big_bad_wolf',
      'werewolf',
      'villager',
      'villager',
      'witch',
    ]);
    const [bodyguard, bbw, wolf, victimA, victimB, witch] = game.players;

    // 18a: Phù thủy không cứu -> A sống nhờ Bảo vệ, B chết vì Sói đại ca
    const { nextState: stateWithoutHeal } = executeNightPhase(game, {
      wolfPack: { targets: [victimA.id] },
      bodyguard: { targetId: victimA.id },
      bigBadWolf: { targetId: victimB.id },
    });

    expect(stateWithoutHeal.players.find((p) => p.id === victimA.id)!.isAlive).toBe(true);
    expect(stateWithoutHeal.players.find((p) => p.id === victimB.id)!.isAlive).toBe(false);

    // 18b: Phù thủy dùng bình Cứu chỉ định cho B -> Cả A và B đều sống
    const { nextState: stateWithHeal } = executeNightPhase(game, {
      wolfPack: { targets: [victimA.id] },
      bodyguard: { targetId: victimA.id },
      bigBadWolf: { targetId: victimB.id },
      witch: { heal: true, healTargetId: victimB.id },
    });

    expect(stateWithHeal.players.find((p) => p.id === victimA.id)!.isAlive).toBe(true);
    expect(stateWithHeal.players.find((p) => p.id === victimB.id)!.isAlive).toBe(true);
  });
});
