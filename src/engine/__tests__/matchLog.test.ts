import { describe, expect, it } from 'bun:test';
import {
  createInitialGameState,
  executeDayVote,
  executeEmergencyEliminate,
  executeHunterShot,
  executeMayorSuccession,
  executeNightPhase,
  type PlayerSetupInput,
} from '../gameEngine';
import {
  buildCascadeTree,
  buildPublicTimeline,
  filterMatchEvents,
  formatPostGameRoleLabel,
  getMorningAnnouncements,
  groupMatchEventsForTimeline,
  isLethalOrVoteEvent,
  recordWinOutcomeEvent,
  summarizeDayCardStats,
} from '../matchLog';
import { formatMatchEventText } from '../matchLogFormatter';
import { getWitchVictimsPreview, resolveNight } from '../nightResolution';
import { ROLES } from '../roles';
import type { NightActions } from '../types';
import { castMayorBallot, tallyMayorElection } from '../voting';
import { checkWinCondition } from '../winConditions';

function makePlayers(count: number): PlayerSetupInput[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `p${idx + 1}`,
    name: `Người ${idx + 1}`,
    seatIndex: idx,
  }));
}

describe('Engine - Structured MatchEvent Log & Edge Cases (39 Roles)', () => {
  it('bao phủ đủ 39 vai trò qua nhiều đêm/ngày, không rò ID thô và tích lũy liên tục theo eventSeq', () => {
    expect(ROLES.length).toBe(39);

    // Kịch bản A (16 người): tập trung Setup + Biến đổi + Sói mở rộng
    const rolesA = [
      'cupid',         // p1
      'doppelganger',  // p2
      'wild_child',    // p3
      'hoodlum',       // p4
      'dire_wolf',     // p5
      'mason',         // p6
      'mason',         // p7
      'drunk',         // p8 (ẩn villager/seer -> tỉnh Đêm 3)
      'dream_wolf',    // p9
      'lycan',         // p10
      'cursed',        // p11
      'villager',      // p12
      'villager',      // p13
      'villager',      // p14
      'werewolf',      // p15
      'wolf_cub',      // p16
    ];
    let stateA = createInitialGameState(makePlayers(16), rolesA);
    stateA.players[7].drunkRealRoleId = 'seer';

    const n1A = executeNightPhase(stateA, {
      cupid: { target1: 'p6', target2: 'p14' },
      doppelganger: { targetId: 'p14' },
      wildChild: { targetId: 'p13' },
      hoodlum: { target1: 'p13', target2: 'p14' },
      direWolf: { targetId: 'p14' },
      wolfPack: { individualVotes: { p15: 'p14', p16: 'p14' } },
    });
    stateA = n1A.nextState;

    // Treo Sói con (p16) ở Ngày 1 -> thức tỉnh Dream Wolf & kích wolf_cub double kill
    const d1A = executeDayVote(stateA, 'p16');
    stateA = d1A.nextState;
    expect(stateA.roundNumber).toBe(2);

    // Đêm 2: Bầy Sói (p15 + dream_wolf p9 thức tỉnh) cắn p11 (cursed hóa Sói) và p13 (làm wild_child hóa Sói)
    const n2A = executeNightPhase(stateA, {
      wolfPack: { targets: ['p11', 'p13'] },
    });
    stateA = n2A.nextState;

    const d2A = executeDayVote(stateA, null);
    stateA = d2A.nextState;
    expect(stateA.roundNumber).toBe(3);

    // Đêm 3: Drunk p8 tỉnh rượu thành Seer & soi Lycan p10
    const n3A = executeNightPhase(stateA, {
      wolfPack: { targets: ['p12'] },
      seer: { targetId: 'p10' },
    });
    stateA = n3A.nextState;

    const actionTypesA = new Set((stateA.eventLog ?? []).map((e) => e.actionType));
    expect(actionTypesA.has('PAIR_LOVERS')).toBe(true);
    expect(actionTypesA.has('CHOOSE_COPY_TARGET')).toBe(true);
    expect(actionTypesA.has('CHOOSE_IDOL')).toBe(true);
    expect(actionTypesA.has('CHOOSE_HOODLUM_TARGETS')).toBe(true);
    expect(actionTypesA.has('CHOOSE_COMPANION')).toBe(true);
    expect(
      stateA.eventLog.some((e) => e.actionType === 'CHOOSE_COMPANION' && e.outcome === 'SUCCESS')
    ).toBe(true);
    expect(
      stateA.eventLog.some(
        (e) => e.actionType === 'CASCADE_DEATH' && e.metadata?.cascadeCause === 'COMPANION_DEATH'
      )
    ).toBe(true);
    expect(actionTypesA.has('MASON_MEET')).toBe(true);
    expect(actionTypesA.has('DRUNK_SLEEP')).toBe(true);
    expect(actionTypesA.has('DREAM_WOLF_AWAKEN')).toBe(true);
    expect(actionTypesA.has('WOLF_CUB_ENRAGE')).toBe(true);
    expect(actionTypesA.has('CURSED_TURN')).toBe(true);
    expect(actionTypesA.has('WILD_CHILD_TURN')).toBe(true);
    expect(actionTypesA.has('DOPPELGANGER_INHERIT')).toBe(true);
    expect(actionTypesA.has('DRUNK_AWAKEN')).toBe(true);
    expect(actionTypesA.has('CASCADE_DEATH')).toBe(true);
    expect(actionTypesA.has('INSPECT')).toBe(true);

    // Kịch bản B (16 người): Bao phủ các vai còn lại của 39 roles
    const rolesB = [
      'seer',             // p1
      'apprentice_seer',  // p2
      'aura_seer',        // p3
      'sorcerer',         // p4
      'fox',              // p5
      'pi',               // p6
      'bodyguard',        // p7
      'witch',            // p8
      'spellcaster',      // p9
      'troublemaker',     // p10
      'rusty_knight',     // p11
      'tough_guy',        // p12
      'elder',            // p13
      'bear_tamer',       // p14
      'big_bad_wolf',     // p15
      'wolf_accursed',    // p16
    ];
    let stateB = createInitialGameState(makePlayers(16), rolesB);
    const n1B = executeNightPhase(stateB, {
      bodyguard: { targetId: 'p14' },
      wolfPack: { targets: ['p11'] },
      bigBadWolf: { targetId: 'p12' },
      accursedWolf: { curseTargetId: 'p1' },
      witch: { heal: false, poisonTargetId: 'p4' },
      seer: { targetId: 'p16' },
      auraSeer: { targetId: 'p5' },
      sorcerer: { targetId: 'p1' },
      pi: { targetId: 'p15' },
      fox: { targetId: 'p9' },
      spellcaster: { targetId: 'p14' },
      troublemaker: { activate: true },
    });
    stateB = n1B.nextState;

    const actionTypesB = new Set((stateB.eventLog ?? []).map((e) => e.actionType));
    expect(actionTypesB.has('CURSE')).toBe(true);
    expect(actionTypesB.has('POISON')).toBe(true);
    expect(actionTypesB.has('RUSTY_KNIGHT_INFECT')).toBe(true);
    expect(
      stateB.eventLog.some(
        (e) =>
          e.actionType === 'ATTACK' &&
          e.outcome === 'IMMUNE' &&
          e.targets[0]?.roleId === 'tough_guy'
      )
    ).toBe(true);
    expect(actionTypesB.has('SILENCE')).toBe(true);
    expect(actionTypesB.has('DOUBLE_VOTE_SABOTAGE')).toBe(true);
    expect(actionTypesB.has('BEAR_GROWL')).toBe(true);
    expect(actionTypesB.has('MUTE_ANNOUNCE')).toBe(true);
    expect(actionTypesB.has('TROUBLEMAKER_ANNOUNCE')).toBe(true);

    // Kiểm tra thêm nhóm vai Ngày / Phe thứ 3: minion, white_wolf, lone_wolf, hunter, prince, village_idiot, tanner, angel, pied_piper, cult_leader
    const rolesC = [
      'minion',       // p1
      'white_wolf',   // p2
      'lone_wolf',    // p3
      'hunter',       // p4
      'prince',       // p5
      'village_idiot',// p6
      'tanner',       // p7
      'angel',        // p8
      'pied_piper',   // p9
      'cult_leader',  // p10
    ];

    const coveredRoleIds = new Set([...rolesA, ...rolesB, ...rolesC]);
    for (const r of ROLES) {
      expect(coveredRoleIds.has(r.id)).toBe(true);
    }
    let stateC = createInitialGameState(makePlayers(10), rolesC);
    const n1C = executeNightPhase(stateC, {
      wolfPack: { targets: ['p5'] },
      piedPiper: { targetIds: ['p4', 'p6'] },
      cultLeader: { targetId: 'p10' }, // self/valid
    });
    stateC = n1C.nextState;
    expect(stateC.eventLog.some((e) => e.actionType === 'MINION_REVEAL')).toBe(true);
    expect(stateC.eventLog.some((e) => e.actionType === 'ENCHANT')).toBe(true);

    // Đêm 2 cho white_wolf hành động ám sát hunter p4
    stateC.roundNumber = 2;
    stateC.phase = 'NIGHT';
    const n2C = executeNightPhase(stateC, {
      wolfPack: { targets: ['p9'] },
      whiteWolf: { targetId: 'p4' },
    });
    stateC = n2C.nextState;
    expect(stateC.phase).toBe('HUNTER_SHOT');
    const shotRes = executeHunterShot(stateC, 'p7');
    stateC = shotRes.nextState;

    // Thứ tự seq phải tăng đơn điệu và không rò ID thô kiểu [p1] / [p14]
    for (const s of [stateA, stateB, stateC]) {
      let prevSeq = 0;
      for (const evt of s.eventLog ?? []) {
        expect(evt.seq).toBeGreaterThan(prevSeq);
        prevSeq = evt.seq;
        expect(evt.visibility).not.toBe('SYSTEM_DEBUG');
        const text = formatMatchEventText(evt, { mode: 'POST_GAME' });
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toContain('undefined');
        expect(text).not.toMatch(/\[p\d+\]/);
      }
    }
  });

  it('bắt đúng 13 edge cases & 4 bản vá engine (EMERGENCY_ELIMINATE, Doppelganger, Hunter queue, Bodyguard/Witch isAlive)', () => {
    // 1. ANGEL: thắng khi chết Đêm 1 bởi WOLF_PACK; KHÔNG thắng nếu trúng độc Phù thủy; hòa phiếu Ngày 1 -> ANGEL_TO_VILLAGER
    const angelBiteState = createInitialGameState(makePlayers(6), [
      'angel',
      'werewolf',
      'seer',
      'witch',
      'villager',
      'villager',
    ]);
    const angelNightWin = executeNightPhase(angelBiteState, {
      wolfPack: { targets: ['p1'] },
    });
    expect(angelNightWin.winOutcome?.winner).toBe('ANGEL');
    expect(angelNightWin.nextState.eventLog.some((e) => e.actionType === 'WIN')).toBe(true);

    const angelPoisonState = createInitialGameState(makePlayers(6), [
      'angel',
      'werewolf',
      'seer',
      'witch',
      'villager',
      'villager',
    ]);
    const angelPoisonRes = executeNightPhase(angelPoisonState, {
      wolfPack: { isSkip: true },
      witch: { poisonTargetId: 'p1' },
    });
    expect(angelPoisonRes.winOutcome?.winner).not.toBe('ANGEL');

    const angelAliveDay1State = createInitialGameState(makePlayers(6), [
      'angel',
      'werewolf',
      'seer',
      'witch',
      'villager',
      'villager',
    ]);
    const angelAliveAfterN1 = executeNightPhase(angelAliveDay1State, {
      wolfPack: { targets: ['p6'] },
    }).nextState;
    const angelTieDay1 = executeDayVote(angelAliveAfterN1, null);
    expect(angelTieDay1.nextState.eventLog.some((e) => e.actionType === 'ANGEL_TO_VILLAGER')).toBe(true);
    expect(angelTieDay1.nextState.players.find((p) => p.id === 'p1')!.faction).toBe('VILLAGER');

    // 2. EMERGENCY_ELIMINATE trên Tanner, Elder và Angel Ngày 1: KHÔNG thắng oan, KHÔNG mất phép Già làng
    const emergencyState = createInitialGameState(makePlayers(6), [
      'tanner',  // p1
      'elder',   // p2
      'angel',   // p3
      'werewolf',// p4
      'seer',    // p5
      'villager',// p6
    ]);
    const elimTanner = executeEmergencyEliminate(emergencyState, 'p1');
    expect(elimTanner.winOutcome).toBeNull();
    const elimElder = executeEmergencyEliminate(elimTanner.nextState, 'p2');
    expect(elimElder.nextState.villagePowerStripped).toBe(false);
    const elimAngel = executeEmergencyEliminate(elimElder.nextState, 'p3');
    expect(elimAngel.winOutcome?.winner).not.toBe('ANGEL');

    // 3. wolf_cub double kill tách 2 ATTACK độc lập (1 bị Bảo vệ chặn, 1 chết) + pendingHunterQueue giữ đủ 2 phát súng nối tiếp
    const doubleHunterState = createInitialGameState(makePlayers(7), [
      'werewolf', // p1
      'bodyguard',// p2
      'hunter',   // p3
      'hunter',   // p4
      'villager', // p5
      'villager', // p6
      'villager', // p7
    ]);
    doubleHunterState.wolfCubDoubleKillNextNight = true;
    const nightMixed = executeNightPhase(doubleHunterState, {
      bodyguard: { targetId: 'p5' },
      wolfPack: { targets: ['p3', 'p5'] },
    });
    const attackEvents = nightMixed.nextState.eventLog.filter((e) => e.actionType === 'ATTACK');
    expect(attackEvents.length).toBe(2);
    expect(attackEvents.some((e) => e.outcome === 'BLOCKED_BY_BODYGUARD')).toBe(true);
    expect(attackEvents.some((e) => e.outcome === 'SUCCESS')).toBe(true);
    expect(nightMixed.nextState.phase).toBe('HUNTER_SHOT');

    // Cho Hunter p3 bắn Hunter p4 -> hàng đợi giữ p4 lại để p4 bắn tiếp!
    const h1 = executeHunterShot(nightMixed.nextState, 'p4');
    expect(h1.nextState.phase).toBe('HUNTER_SHOT');
    expect(h1.nextState.pendingHunterShotPlayerId).toBe('p4');
    const h2 = executeHunterShot(h1.nextState, 'p6');
    expect(h2.nextState.pendingHunterShotPlayerId).toBeNull();
    const shots = h2.nextState.eventLog.filter((e) => e.actionType === 'HUNTER_SHOT');
    expect(shots.length).toBe(2);
    expect(shots[0].parentEventId).toBeDefined();
    expect(shots[1].parentEventId).toBeDefined();
    expect(shots[0].parentEventId).not.toBe(shots[1].parentEventId);

    // 4. Troublemaker executionStep 1 & 2: Tanner thắng ở Lượt 1 -> Lượt 2 bị hủy IMMEDIATE_WIN
    const tmState = createInitialGameState(makePlayers(6), [
      'tanner',
      'werewolf',
      'seer',
      'villager',
      'villager',
      'villager',
    ]);
    tmState.doubleVoteDay = true;
    const tmRes = executeDayVote(tmState, ['p1', 'p4']);
    expect(tmRes.winOutcome?.winner).toBe('TANNER');
    const voteExecs = tmRes.nextState.eventLog.filter((e) => e.actionType === 'VOTE_EXECUTION');
    expect(voteExecs.length).toBe(2);
    expect(voteExecs[1].outcome).toBe('NO_EFFECT');
    expect(voteExecs[1].metadata?.vote?.cancelledReason).toBe('IMMEDIATE_WIN');

    // Troublemaker: Lượt 1 treo Cupid (cặp đôi với người ở Lượt 2) -> Lượt 2 bị hủy ALREADY_DEAD
    const tmCoupleState = createInitialGameState(makePlayers(6), [
      'werewolf',
      'seer',
      'villager',
      'villager',
      'villager',
      'villager',
    ]);
    tmCoupleState.players[2].loverId = 'p4';
    tmCoupleState.players[3].loverId = 'p3';
    tmCoupleState.doubleVoteDay = true;
    const tmCoupleRes = executeDayVote(tmCoupleState, ['p3', 'p4']);
    const coupleExecs = tmCoupleRes.nextState.eventLog.filter(
      (e) => e.actionType === 'VOTE_EXECUTION'
    );
    expect(coupleExecs.length).toBe(2);
    expect(coupleExecs[1].metadata?.vote?.cancelledReason).toBe('ALREADY_DEAD');

    // 5. Drunk chết Đêm 1 trước Đêm 3 vẫn lưu drunkRealRoleId và format nhãn giải mã
    const drunkEarly = createInitialGameState(makePlayers(6), [
      'werewolf',
      'drunk',
      'seer',
      'villager',
      'villager',
      'villager',
    ]);
    drunkEarly.players[1].drunkRealRoleId = 'witch';
    const drunkNight = executeNightPhase(drunkEarly, { wolfPack: { targets: ['p2'] } });
    const sleepEvt = drunkNight.nextState.eventLog.find((e) => e.actionType === 'DRUNK_SLEEP');
    expect(sleepEvt?.metadata?.setup?.drunkRealRoleId).toBe('witch');
    expect(formatPostGameRoleLabel('drunk', 'drunk', 'witch')).toContain('Phù thủy');

    // 6. Bodyguard & Witch bị dead trước phân giải (do EMERGENCY_ELIMINATE giữa đêm) không được hành động
    let deadBgState = createInitialGameState(makePlayers(6), [
      'bodyguard',
      'witch',
      'werewolf',
      'seer',
      'villager',
      'villager',
    ]);
    deadBgState = executeEmergencyEliminate(deadBgState, 'p1').nextState;
    deadBgState = executeEmergencyEliminate(deadBgState, 'p2').nextState;
    const deadActorsNight = executeNightPhase(deadBgState, {
      bodyguard: { targetId: 'p5' },
      witch: { heal: true, poisonTargetId: 'p3' },
      wolfPack: { targets: ['p5'] },
    } as NightActions);
    expect(deadActorsNight.nextState.players.find((p) => p.id === 'p5')!.isAlive).toBe(false);
    expect(deadActorsNight.nextState.players.find((p) => p.id === 'p3')!.isAlive).toBe(true);

    // 7. Doppelganger kế thừa Wild Child (cả trường hợp idol === chính Doppelganger -> villager)
    const dgWcState = createInitialGameState(makePlayers(6), [
      'doppelganger', // p1
      'wild_child',   // p2
      'werewolf',     // p3
      'villager',     // p4
      'villager',     // p5
      'villager',     // p6
    ]);
    const dgSetup = executeNightPhase(dgWcState, {
      doppelganger: { targetId: 'p2' },
      wildChild: { targetId: 'p1' }, // Wild Child thần tượng chính Doppelganger!
      wolfPack: { targets: ['p2'] }, // Sói cắn Wild Child -> Doppelganger kế thừa
    });
    const dgPlayer = dgSetup.nextState.players.find((p) => p.id === 'p1')!;
    expect(dgPlayer.roleId).toBe('villager');
    expect(dgPlayer.faction).toBe('VILLAGER');

    // 8. State Snapshot: Seer soi mục tiêu bị Sói nguyền nguyền cùng đêm vẫn thấy VILLAGER
    const snapshotState = createInitialGameState(makePlayers(6), [
      'wolf_accursed',
      'seer',
      'villager',
      'villager',
      'villager',
      'villager',
    ]);
    const snapNight = executeNightPhase(snapshotState, {
      wolfPack: { targets: ['p3'] },
      accursedWolf: { curseTargetId: 'p3' },
      seer: { targetId: 'p3' },
    });
    const inspectEvt = snapNight.nextState.eventLog.find((e) => e.actionType === 'INSPECT');
    expect(inspectEvt?.targets[0]?.roleId).toBe('villager');
    expect(inspectEvt?.metadata?.investigation?.rawValue).toBe('VILLAGER');

    // 9. Public Anti-Spoiler khi revealOnDeath = false + 3 ngoại lệ lộ vai
    const publicSecrecyState = createInitialGameState(makePlayers(7), [
      'werewolf',
      'prince',
      'village_idiot',
      'hunter',
      'seer',
      'villager',
      'villager',
    ]);
    publicSecrecyState.settings.revealOnDeath = false;
    const psNight1 = executeNightPhase(publicSecrecyState, {
      wolfPack: { targets: ['p5'] }, // Seer chết đêm
    }).nextState;
    const psDay1 = executeDayVote(psNight1, 'p2').nextState; // Hoàng tử lật bài
    const psDay2Setup = executeNightPhase(psDay1, {
      wolfPack: { targets: ['p4'] }, // Thợ săn chết đêm 2
    }).nextState;
    const psShot = executeHunterShot(psDay2Setup, 'p6').nextState;

    const pubItems = buildPublicTimeline(psShot);
    const allPubText = pubItems.map((i) => i.text).join('\n');
    expect(allPubText).not.toContain('Tiên tri'); // Ẩn vai người chết khi revealOnDeath = false
    expect(allPubText).not.toContain('Ma sói');
    expect(allPubText).toContain('Hoàng tử');    // Ngoại lệ 1
    expect(allPubText).toContain('Thợ săn');     // Ngoại lệ 3

    // 10. morningAnnouncements luôn giữ DAWN_SUMMARY lên đầu dù Gấu gầm + Cấm nói + Phá rối cùng nổ
    const dawnState = createInitialGameState(makePlayers(6), [
      'werewolf',
      'bear_tamer',
      'spellcaster',
      'troublemaker',
      'villager',
      'villager',
    ]);
    const dawnRes = executeNightPhase(dawnState, {
      wolfPack: { targets: ['p5'] },
      spellcaster: { targetId: 'p6' },
      troublemaker: { activate: true },
    });
    const morningList = getMorningAnnouncements(buildPublicTimeline(dawnRes.nextState), 1);
    expect(morningList.length).toBe(4);
    expect(morningList[0].actionType).toBe('DAWN_SUMMARY');
    expect(morningList[0].text).toContain('Người 5');

    // 11. MAYOR_SUCCESSION khi Trưởng làng chết bởi EMERGENCY_ELIMINATE + NIGHT_IDLE_SUMMARY
    const mayorState = createInitialGameState(makePlayers(6), [
      'werewolf',
      'seer',
      'witch',
      'villager',
      'villager',
      'villager',
    ]);
    mayorState.mayorId = 'p4';
    const mElim = executeEmergencyEliminate(mayorState, 'p4');
    expect(mElim.nextState.phase).toBe('MAYOR_SUCCESSION');
    const mSucc = executeMayorSuccession(mElim.nextState, 'p5');
    expect(mSucc.nextState.eventLog.some((e) => e.actionType === 'MAYOR_SUCCESSION')).toBe(true);

    // 12. EMERGENCY_ELIMINATE trong các pha nhạy cảm (HUNTER_SHOT, NIGHT, DAY_RUNOFF): không soft-lock & không nhảy cóc Đêm
    const midShotState = createInitialGameState(makePlayers(7), [
      'hunter',
      'werewolf',
      'seer',
      'villager',
      'villager',
      'villager',
      'villager',
    ]);
    const hungHunter = executeDayVote(midShotState, 'p1').nextState;
    expect(hungHunter.phase).toBe('HUNTER_SHOT');
    const elimWhileShooting = executeEmergencyEliminate(hungHunter, 'p4').nextState;
    expect(elimWhileShooting.phase).toBe('HUNTER_SHOT');
    expect(elimWhileShooting.previousPhaseBeforeHunter).not.toBe('HUNTER_SHOT');
    const finishedShot = executeHunterShot(elimWhileShooting, 'p5').nextState;
    expect(finishedShot.phase).toBe('NIGHT');
    expect(finishedShot.pendingHunterShotPlayerId).toBeNull();

    // EMERGENCY_ELIMINATE giữa Đêm giết Hunter -> bắn xong quay lại Đêm hiện tại (không tăng roundNumber!)
    const midNightState = createInitialGameState(makePlayers(6), [
      'hunter',
      'werewolf',
      'seer',
      'villager',
      'villager',
      'villager',
    ]);
    midNightState.phase = 'NIGHT';
    midNightState.roundNumber = 2;
    const midNightElim = executeEmergencyEliminate(midNightState, 'p1').nextState;
    expect(midNightElim.phase).toBe('HUNTER_SHOT');
    const midNightResume = executeHunterShot(midNightElim, 'p4');
    expect(midNightResume.nextState.phase).toBe('NIGHT');
    expect(midNightResume.nextState.roundNumber).toBe(2);
    expect(midNightResume.resumedInterruptedNight).toBe(true);

    // EMERGENCY_ELIMINATE giữa DAY_RUNOFF -> bắn xong quay lại DAY_RUNOFF
    const runoffState = createInitialGameState(makePlayers(6), [
      'hunter',
      'werewolf',
      'seer',
      'villager',
      'villager',
      'villager',
    ]);
    runoffState.phase = 'DAY_RUNOFF';
    const runoffElim = executeEmergencyEliminate(runoffState, 'p1').nextState;
    expect(runoffElim.phase).toBe('HUNTER_SHOT');
    const runoffResume = executeHunterShot(runoffElim, 'p4').nextState;
    expect(runoffResume.phase).toBe('DAY_RUNOFF');

    // 13. Doppelganger kế thừa thêm cursed (đã hóa Sói), drunk (lấy drunkRealRoleId), angel (sau Ngày 1) và witch
    const dgCursed = createInitialGameState(makePlayers(6), [
      'doppelganger',
      'cursed',
      'werewolf',
      'villager',
      'villager',
      'villager',
    ]);
    let sDg = executeNightPhase(dgCursed, {
      doppelganger: { targetId: 'p2' },
      wolfPack: { targets: ['p2'] }, // cursed hóa Sói
    }).nextState;
    sDg = executeDayVote(sDg, 'p2').nextState; // cursed đã hóa Sói bị treo cổ -> DG thành werewolf
    expect(sDg.players.find((p) => p.id === 'p1')!.roleId).toBe('werewolf');
    expect(sDg.players.find((p) => p.id === 'p1')!.faction).toBe('WEREWOLF');

    const dgDrunk = createInitialGameState(makePlayers(6), [
      'doppelganger',
      'drunk',
      'werewolf',
      'villager',
      'villager',
      'villager',
    ]);
    dgDrunk.players[1].drunkRealRoleId = 'witch';
    const dgDrunkRes = executeNightPhase(dgDrunk, {
      doppelganger: { targetId: 'p2' },
      wolfPack: { targets: ['p2'] },
    }).nextState;
    expect(dgDrunkRes.players.find((p) => p.id === 'p1')!.roleId).toBe('witch');

    // 14. getWitchVictimsPreview tôn trọng firstNightNoKill Đêm 1
    const peaceState = createInitialGameState(
      makePlayers(6),
      ['witch', 'werewolf', 'seer', 'villager', 'villager', 'villager'],
      { firstNightNoKill: true, witchKnowsVictim: true }
    );
    expect(
      getWitchVictimsPreview(peaceState, { wolfPack: { targets: ['p5'] } })
    ).toEqual([]);
  });

  it('Tough Guy bị cắn lại ở Đêm 2: guard alreadyDyingTonight ngăn chết kép, chỉ 1 collapse death', () => {
    const state = createInitialGameState(makePlayers(6), [
      'tough_guy',
      'werewolf',
      'seer',
      'villager',
      'villager',
      'villager',
    ]);
    const n1 = executeNightPhase(state, { wolfPack: { targets: ['p1'] } }).nextState;
    expect(n1.players.find((p) => p.id === 'p1')!.isAlive).toBe(true);
    expect(n1.players.find((p) => p.id === 'p1')!.toughGuyBittenNight).toBe(1);

    n1.roundNumber = 2;
    n1.phase = 'NIGHT';
    const n2 = executeNightPhase(n1, { wolfPack: { targets: ['p1'] } });

    const tgDeaths = n2.nextState.deaths.filter((d) => d.playerId === 'p1');
    expect(tgDeaths).toHaveLength(1);
    expect(tgDeaths[0].cause).toBe('TOUGH_GUY_COLLAPSE');
    expect(n2.nightOutput.newDeaths.filter((d) => d.playerId === 'p1')).toHaveLength(1);

    const n2Attack = n2.nextState.eventLog.find(
      (e) => e.roundNumber === 2 && e.actionType === 'ATTACK' && e.targets[0]?.playerId === 'p1'
    );
    expect(n2Attack?.outcome).toBe('NO_EFFECT');
    expect(formatMatchEventText(n2Attack!, { mode: 'POST_GAME' })).toContain('vô hiệu');
    expect(formatMatchEventText(n2Attack!, { mode: 'POST_GAME' })).not.toContain('cắn chết');
  });

  it('NIGHT_IDLE_SUMMARY ghi nhận & format khi Witch, WolfAccursed, Troublemaker, PI giữ phép', () => {
    const state = createInitialGameState(makePlayers(6), [
      'witch',
      'wolf_accursed',
      'troublemaker',
      'pi',
      'villager',
      'villager',
    ]);
    const n1 = executeNightPhase(state, {
      wolfPack: { targets: ['p5'] },
    });

    const idleEvt = n1.nextState.eventLog.find((e) => e.actionType === 'NIGHT_IDLE_SUMMARY');
    expect(idleEvt).toBeDefined();
    expect(idleEvt?.stage).toBe('NIGHT');
    expect(idleEvt?.outcome).toBe('SKIPPED');
    const idleText = formatMatchEventText(idleEvt!, { mode: 'POST_GAME' });
    expect(idleText).toContain('Phù thủy Người 1 giữ nguyên thuốc');
    expect(idleText).toContain('Sói nguyền Người 2 không nguyền');
    expect(idleText).toContain('Kẻ phá rối Người 3 chưa kích hoạt phép');
    expect(idleText).toContain('Thám tử Người 4 chưa dùng lượt soi');

    const grouped = groupMatchEventsForTimeline(n1.nextState.eventLog);
    expect(grouped.roundGroups[0].nightIdleEvents).toHaveLength(1);
  });

  it('Bodyguard chặn wolf_accursed (CURSE -> BLOCKED_BY_BODYGUARD)', () => {
    const state = createInitialGameState(makePlayers(6), [
      'bodyguard',
      'wolf_accursed',
      'werewolf',
      'villager',
      'villager',
      'villager',
    ]);
    const res = executeNightPhase(state, {
      bodyguard: { targetId: 'p4' },
      wolfPack: { targets: ['p4'] },
      accursedWolf: { curseTargetId: 'p4' },
    });

    expect(res.nextState.accursedWolfUsed).toBe(false);
    expect(res.nextState.players.find((p) => p.id === 'p4')!.faction).toBe('VILLAGER');
    const curseEvt = res.nextState.eventLog.find((e) => e.actionType === 'CURSE');
    expect(curseEvt?.outcome).toBe('BLOCKED_BY_BODYGUARD');
    expect(curseEvt?.metadata?.protector?.playerId).toBe('p1');
    expect(curseEvt?.involvedPlayerIds).toContain('p1');
    expect(formatMatchEventText(curseEvt!, { mode: 'POST_GAME' })).toContain('hoàn trả phép');
  });

  it('bao phủ đầy đủ các edge cases của Phù thủy (overdose, cứu+độc đè, cứu mù hoàn/mất/chặn bởi BG, cấm tự cứu sole-victim, cấm dùng 2 bình)', () => {
    // 1. OVERDOSE_DOUBLE_PROTECT
    const overdoseState = createInitialGameState(
      makePlayers(6),
      ['witch', 'bodyguard', 'werewolf', 'villager', 'villager', 'villager'],
      { witchDoubleProtectKills: true, witchHealMode: 'AOE' }
    );
    const overdoseRes = executeNightPhase(overdoseState, {
      bodyguard: { targetId: 'p4' },
      wolfPack: { targets: ['p4'] },
      witch: { heal: true },
    });
    expect(overdoseRes.nextState.players.find((p) => p.id === 'p4')!.isAlive).toBe(false);
    expect(overdoseRes.nextState.witchHealUsed).toBe(true);
    const odEvt = overdoseRes.nextState.eventLog.find(
      (e) => e.actionType === 'HEAL' && e.outcome === 'OVERDOSE_DOUBLE_PROTECT'
    );
    expect(odEvt).toBeDefined();
    expect(odEvt?.metadata?.protector?.playerId).toBe('p2');
    expect(odEvt?.involvedPlayerIds).toContain('p2');
    expect(isLethalOrVoteEvent(odEvt!)).toBe(true);
    expect(formatMatchEventText(odEvt!, { mode: 'POST_GAME' })).toContain('sốc thuốc tử vong');

    // 2. SAVED_BY_WITCH + POISON OVERRIDDEN_BY_POISON
    const overrideState = createInitialGameState(makePlayers(6), [
      'witch',
      'werewolf',
      'seer',
      'villager',
      'villager',
      'villager',
    ]);
    const overrideRes = executeNightPhase(overrideState, {
      wolfPack: { targets: ['p4'] },
      witch: { heal: true, poisonTargetId: 'p4' },
    });
    expect(overrideRes.nextState.players.find((p) => p.id === 'p4')!.isAlive).toBe(false);
    const savedAtk = overrideRes.nextState.eventLog.find(
      (e) => e.actionType === 'ATTACK' && e.outcome === 'SAVED_BY_WITCH'
    );
    const overriddenPoison = overrideRes.nextState.eventLog.find(
      (e) => e.actionType === 'POISON' && e.outcome === 'OVERRIDDEN_BY_POISON'
    );
    expect(savedAtk).toBeDefined();
    expect(overriddenPoison).toBeDefined();
    expect(formatMatchEventText(overriddenPoison!, { mode: 'POST_GAME' })).toContain('đè bình cứu');

    // 3. Blind heal refunded (không ai bị cắn, witchKnowsVictim=false, witchWasteHealOnEmpty=false)
    const blindRefundState = createInitialGameState(
      makePlayers(6),
      ['witch', 'werewolf', 'seer', 'villager', 'villager', 'villager'],
      { allowWolfSkip: true, witchKnowsVictim: false, witchWasteHealOnEmpty: false }
    );
    const blindRefundRes = executeNightPhase(blindRefundState, {
      wolfPack: { isSkip: true },
      witch: { heal: true },
    });
    expect(blindRefundRes.nextState.witchHealUsed).toBe(false);
    const refundEvt = blindRefundRes.nextState.eventLog.find((e) => e.actionType === 'HEAL');
    expect(refundEvt?.outcome).toBe('NO_EFFECT');
    expect(refundEvt?.metadata?.witch?.refundedHeal).toBe(true);
    expect(formatMatchEventText(refundEvt!, { mode: 'POST_GAME' })).toContain('hoàn bình');

    // 4. Blind heal wasted (không ai bị cắn, witchWasteHealOnEmpty=true)
    const blindWasteState = createInitialGameState(
      makePlayers(6),
      ['witch', 'werewolf', 'seer', 'villager', 'villager', 'villager'],
      { allowWolfSkip: true, witchKnowsVictim: false, witchWasteHealOnEmpty: true }
    );
    const blindWasteRes = executeNightPhase(blindWasteState, {
      wolfPack: { isSkip: true },
      witch: { heal: true },
    });
    expect(blindWasteRes.nextState.witchHealUsed).toBe(true);
    const wasteEvt = blindWasteRes.nextState.eventLog.find((e) => e.actionType === 'HEAL');
    expect(wasteEvt?.outcome).toBe('NO_EFFECT');
    expect(wasteEvt?.metadata?.witch?.wastedHeal).toBe(true);
    expect(formatMatchEventText(wasteEvt!, { mode: 'POST_GAME' })).toContain('mất bình');

    // 5. Blind heal blocked by Bodyguard (bodyguard trong involvedPlayerIds & metadata.protector)
    const blindBgState = createInitialGameState(
      makePlayers(6),
      ['witch', 'bodyguard', 'werewolf', 'villager', 'villager', 'villager'],
      { witchKnowsVictim: false, witchWasteHealOnEmpty: true }
    );
    const blindBgRes = executeNightPhase(blindBgState, {
      bodyguard: { targetId: 'p4' },
      wolfPack: { targets: ['p4'] },
      witch: { heal: true },
    });
    const blindBgEvt = blindBgRes.nextState.eventLog.find((e) => e.actionType === 'HEAL');
    expect(blindBgEvt?.outcome).toBe('NO_EFFECT');
    expect(blindBgEvt?.metadata?.witch?.blockedByBodyguard).toBe(true);
    expect(blindBgEvt?.metadata?.protector?.playerId).toBe('p2');
    expect(blindBgEvt?.involvedPlayerIds).toContain('p2');
    expect(formatMatchEventText(blindBgEvt!, { mode: 'POST_GAME' })).toContain('Bảo vệ đã chặn đòn trước');

    // 6. allowWitchSelfHeal = false và Phù thủy là nạn nhân duy nhất
    const selfHealBlockedState = createInitialGameState(
      makePlayers(6),
      ['witch', 'werewolf', 'seer', 'villager', 'villager', 'villager'],
      { allowWitchSelfHeal: false, witchKnowsVictim: false, witchWasteHealOnEmpty: false }
    );
    const selfHealBlockedRes = executeNightPhase(selfHealBlockedState, {
      wolfPack: { targets: ['p1'] },
      witch: { heal: true },
    });
    expect(selfHealBlockedRes.nextState.players.find((p) => p.id === 'p1')!.isAlive).toBe(false);
    const selfHealEvt = selfHealBlockedRes.nextState.eventLog.find((e) => e.actionType === 'HEAL');
    expect(selfHealEvt?.outcome).toBe('NO_EFFECT');
    expect(selfHealEvt?.metadata?.witch?.selfHealBlocked).toBe(true);
    const selfHealText = formatMatchEventText(selfHealEvt!, { mode: 'POST_GAME' });
    expect(selfHealText).toContain('cấm tự cứu');
    expect(selfHealText).not.toContain('không có ai bị cắn');
    expect(selfHealText).not.toContain('không có nạn nhân');

    // 7. allowWitchBothPotionsSameNight = false
    const onePotionState = createInitialGameState(
      makePlayers(6),
      ['witch', 'werewolf', 'seer', 'villager', 'villager', 'villager'],
      { allowWitchBothPotionsSameNight: false }
    );
    const onePotionRes = executeNightPhase(onePotionState, {
      wolfPack: { targets: ['p4'] },
      witch: { heal: true, poisonTargetId: 'p2' },
    });
    expect(onePotionRes.nextState.players.find((p) => p.id === 'p4')!.isAlive).toBe(true);
    expect(onePotionRes.nextState.players.find((p) => p.id === 'p2')!.isAlive).toBe(true);
    const blockedPoisonEvt = onePotionRes.nextState.eventLog.find((e) => e.actionType === 'POISON');
    expect(blockedPoisonEvt?.outcome).toBe('NO_EFFECT');
    expect(blockedPoisonEvt?.metadata?.witch?.blockedByBothRule).toBe(true);
    expect(formatMatchEventText(blockedPoisonEvt!, { mode: 'POST_GAME' })).toContain('cấm dùng 2 bình');
  });

  it('Setup Đêm 1 edge cases: solo Mason, setup timeout SKIPPED, và Cupid allowCupidSelfMatch = false', () => {
    const soloAndSkipState = createInitialGameState(makePlayers(7), [
      'mason',
      'cupid',
      'doppelganger',
      'wild_child',
      'hoodlum',
      'dire_wolf',
      'werewolf',
    ]);
    const skipRes = executeNightPhase(soloAndSkipState, {});
    const soloMasonEvt = skipRes.nextState.eventLog.find((e) => e.actionType === 'MASON_MEET');
    expect(soloMasonEvt?.metadata?.setup?.soloMason).toBe(true);
    expect(formatMatchEventText(soloMasonEvt!, { mode: 'POST_GAME' })).toContain('một mình');

    for (const actionType of [
      'PAIR_LOVERS',
      'CHOOSE_COPY_TARGET',
      'CHOOSE_IDOL',
      'CHOOSE_HOODLUM_TARGETS',
      'CHOOSE_COMPANION',
    ] as const) {
      const evt = skipRes.nextState.eventLog.find((e) => e.actionType === actionType);
      expect(evt?.stage).toBe('SETUP');
      expect(evt?.outcome).toBe('SKIPPED');
      expect(formatMatchEventText(evt!, { mode: 'POST_GAME' })).toContain('hết giờ');
    }

    const cupidSelfState = createInitialGameState(
      makePlayers(6),
      ['cupid', 'werewolf', 'seer', 'villager', 'villager', 'villager'],
      { allowCupidSelfMatch: false }
    );
    const cupidSelfRes = executeNightPhase(cupidSelfState, {
      cupid: { target1: 'p1', target2: 'p4' },
    });
    const pairEvt = cupidSelfRes.nextState.eventLog.find((e) => e.actionType === 'PAIR_LOVERS');
    expect(pairEvt?.outcome).toBe('NO_EFFECT');
    expect(formatMatchEventText(pairEvt!, { mode: 'POST_GAME' })).toContain('luật phòng cấm');
  });

  it('Angel Đêm 1 chết theo COUPLE_HEARTBREAK (không thắng) và sống sót Ngày 1 khi người khác bị treo (ANGEL_TO_VILLAGER)', () => {
    // 1. Angel chết bởi COUPLE_HEARTBREAK ở Đêm 1 -> KHÔNG thắng
    const angelCoupleState = createInitialGameState(makePlayers(6), [
      'angel',
      'cupid',
      'werewolf',
      'villager',
      'villager',
      'villager',
    ]);
    const coupleNight = executeNightPhase(angelCoupleState, {
      cupid: { target1: 'p1', target2: 'p4' },
      wolfPack: { targets: ['p4'] },
    });
    expect(coupleNight.nextState.players.find((p) => p.id === 'p1')!.isAlive).toBe(false);
    expect(
      coupleNight.nextState.deaths.some(
        (d) => d.playerId === 'p1' && d.cause === 'COUPLE_HEARTBREAK'
      )
    ).toBe(true);
    expect(coupleNight.winOutcome?.winner).not.toBe('ANGEL');

    // 2. Angel sống sót qua Ngày 1 khi người khác bị treo cổ -> ANGEL_TO_VILLAGER
    const angelSurviveState = createInitialGameState(makePlayers(6), [
      'angel',
      'werewolf',
      'werewolf',
      'villager',
      'villager',
      'villager',
    ]);
    const n1 = executeNightPhase(angelSurviveState, { wolfPack: { targets: ['p4'] } }).nextState;
    const d1 = executeDayVote(n1, 'p5');
    const a2v = d1.nextState.eventLog.find((e) => e.actionType === 'ANGEL_TO_VILLAGER');
    expect(a2v).toBeDefined();
    expect(isLethalOrVoteEvent(a2v!)).toBe(true);
    expect(formatMatchEventText(a2v!, { mode: 'POST_GAME' })).toContain('hòa mình thành Dân làng');
  });

  it('bao phủ active logs còn thiếu: apprentice_seer, pi (hết phép), elder, cult_leader, fox, village_idiot, pied_piper clear/skip, wolf skip, firstNightNoKill & isLethalOrVoteEvent', () => {
    // 1. apprentice_seer + pi (hết phép) + elder (1st bite IMMUNE + unjust ELDER_CURSE_VILLAGE)
    const state1 = createInitialGameState(makePlayers(7), [
      'seer',            // p1
      'apprentice_seer', // p2
      'pi',              // p3
      'elder',           // p4
      'werewolf',        // p5
      'witch',           // p6
      'villager',        // p7
    ]);
    // Đêm 1: Sói cắn Tiên tri p1, PI soi p5
    const r1 = executeNightPhase(state1, {
      wolfPack: { targets: ['p1'] },
      pi: { targetId: 'p5' },
    }).nextState;
    const piInspect = r1.eventLog.find(
      (e) => e.actionType === 'INSPECT' && e.actor?.roleId === 'pi'
    );
    expect(formatMatchEventText(piInspect!, { mode: 'POST_GAME' })).toContain('hết phép');

    const d1 = executeDayVote(r1, null).nextState;
    // Đêm 2: Apprentice Seer kế thừa soi p5, Sói cắn Già làng p4 lần 1 (IMMUNE), Phù thủy đầu độc Già làng? Để Đêm 3 mới đầu độc để thấy IMMUNE trước!
    const r2 = executeNightPhase(d1, {
      apprenticeSeer: { targetId: 'p5' },
      wolfPack: { targets: ['p4'] },
    }).nextState;
    const appInspect = r2.eventLog.find(
      (e) => e.actionType === 'INSPECT' && e.actor?.roleId === 'apprentice_seer'
    );
    expect(appInspect).toBeDefined();
    expect(formatMatchEventText(appInspect!, { mode: 'POST_GAME' })).toContain(
      'Tiên tri tập sự Người 2 soi'
    );
    const elderShieldEvt = r2.eventLog.find(
      (e) => e.roundNumber === 2 && e.actionType === 'ATTACK' && e.outcome === 'IMMUNE'
    );
    expect(elderShieldEvt).toBeDefined();
    expect(formatMatchEventText(elderShieldEvt!, { mode: 'POST_GAME' })).toContain('mất 1 giáp');

    // Ngày 2: treo cổ Già làng p4 -> ELDER_CURSE_VILLAGE
    const d2 = executeDayVote(r2, 'p4').nextState;
    const elderCurseEvt = d2.eventLog.find((e) => e.actionType === 'ELDER_CURSE_VILLAGE');
    expect(elderCurseEvt).toBeDefined();
    expect(d2.villagePowerStripped).toBe(true);
    expect(formatMatchEventText(elderCurseEvt!, { mode: 'POST_GAME' })).toContain('chết oan');

    // 2. cult_leader (CONVERT_CULT + CULT_DISBAND), fox (giữ phép & SKIPPED), pied_piper (ENCHANT NO_EFFECT/SKIPPED + PIED_PIPER_CLEAR), village_idiot (VOTE_SURVIVED_REVEAL)
    const state2 = createInitialGameState(
      makePlayers(7),
      ['cult_leader', 'fox', 'pied_piper', 'village_idiot', 'werewolf', 'villager', 'villager'],
      { revealOnDeath: false }
    );
    const s2n1 = executeNightPhase(state2, {
      cultLeader: { targetId: 'p6' },
      fox: { targetId: 'p5' }, // p5 là werewolf -> giữ phép
      piedPiper: { targetIds: ['p6'] },
      wolfPack: { targets: ['p7'] },
    }).nextState;

    const convertEvt = s2n1.eventLog.find((e) => e.actionType === 'CONVERT_CULT');
    expect(convertEvt?.outcome).toBe('SUCCESS');
    expect(formatMatchEventText(convertEvt!, { mode: 'POST_GAME' })).toContain('kết nạp');

    const foxKeepEvt = s2n1.eventLog.find(
      (e) => e.actionType === 'INSPECT' && e.actor?.roleId === 'fox'
    );
    expect(foxKeepEvt?.outcome).toBe('SUCCESS');
    expect(formatMatchEventText(foxKeepEvt!, { mode: 'POST_GAME' })).toContain('Có Ma Sói');

    // Ngày 1: treo Thằng ngốc p4 -> VOTE_SURVIVED_REVEAL
    const s2d1 = executeDayVote(s2n1, 'p4').nextState;
    const idiotReveal = s2d1.eventLog.find((e) => e.actionType === 'VOTE_SURVIVED_REVEAL');
    expect(idiotReveal?.actor?.roleId).toBe('village_idiot');
    expect(s2d1.players.find((p) => p.id === 'p4')!.voteWeight).toBe(0);
    expect(buildPublicTimeline(s2d1).some((item) => item.text.includes('Thằng ngốc'))).toBe(true);
    const dayStats = summarizeDayCardStats(
      groupMatchEventsForTimeline(s2d1.eventLog).roundGroups[0]
    );
    expect(dayStats.some((b) => b.label === 'Thằng ngốc lật bài')).toBe(true);

    // Đêm 2: fox skip, pied_piper target đã bị thôi miên trước đó (NO_EFFECT), Sói cắn chết cult_leader p1 -> CULT_DISBAND
    const s2n2 = executeNightPhase(s2d1, {
      fox: { isSkip: true },
      piedPiper: { targetIds: ['p6'] },
      wolfPack: { targets: ['p1'] },
    }).nextState;
    const foxSkipEvt = s2n2.eventLog.find(
      (e) => e.roundNumber === 2 && e.actionType === 'INSPECT' && e.actor?.roleId === 'fox'
    );
    expect(foxSkipEvt?.outcome).toBe('SKIPPED');
    const enchantNoEffect = s2n2.eventLog.find(
      (e) => e.roundNumber === 2 && e.actionType === 'ENCHANT'
    );
    expect(enchantNoEffect?.outcome).toBe('NO_EFFECT');
    const cultDisband = s2n2.eventLog.find((e) => e.actionType === 'CULT_DISBAND');
    expect(cultDisband).toBeDefined();
    expect(isLethalOrVoteEvent(cultDisband!)).toBe(true);
    expect(s2n2.players.every((p) => !p.isCultMember)).toBe(true);

    // Ngày 2: treo pied_piper p3 -> PIED_PIPER_CLEAR; Đêm 3 bỏ qua ENCHANT -> SKIPPED
    const s2d2 = executeDayVote(s2n2, 'p3').nextState;
    const piperClear = s2d2.eventLog.find((e) => e.actionType === 'PIED_PIPER_CLEAR');
    expect(piperClear).toBeDefined();
    expect(isLethalOrVoteEvent(piperClear!)).toBe(true);
    expect(s2d2.players.every((p) => !p.isEnchanted)).toBe(true);

    // Kiểm tra ENCHANT SKIPPED khi không truyền action piedPiper
    const piperSkipState = createInitialGameState(makePlayers(6), [
      'pied_piper',
      'werewolf',
      'villager',
      'villager',
      'villager',
      'villager',
    ]);
    const piperSkipRes = executeNightPhase(piperSkipState, { wolfPack: { targets: ['p3'] } });
    const enchantSkipped = piperSkipRes.nextState.eventLog.find((e) => e.actionType === 'ENCHANT');
    expect(enchantSkipped?.outcome).toBe('SKIPPED');

    // 3. wolf_pack skip (allowWolfSkip) & firstNightNoKill
    const skipWolfState = createInitialGameState(
      makePlayers(6),
      ['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager'],
      { allowWolfSkip: true }
    );
    const skipWolfRes = executeNightPhase(skipWolfState, { wolfPack: { isSkip: true } });
    const wolfSkipEvt = skipWolfRes.nextState.eventLog.find((e) => e.actionType === 'ATTACK');
    expect(wolfSkipEvt?.outcome).toBe('SKIPPED');
    expect(wolfSkipEvt?.metadata?.wolfPack?.skipWon).toBe(true);
    expect(isLethalOrVoteEvent(wolfSkipEvt!)).toBe(false);
    expect(formatMatchEventText(wolfSkipEvt!, { mode: 'POST_GAME' })).toContain('bỏ qua không cắn');

    const skipVotesState = createInitialGameState(
      makePlayers(6),
      ['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager'],
      { allowWolfSkip: true }
    );
    const skipVotesRes = executeNightPhase(skipVotesState, {
      wolfPack: { individualVotes: { p1: null } },
    });
    const wolfSkipVotesEvt = skipVotesRes.nextState.eventLog.find(
      (e) => e.actionType === 'ATTACK'
    );
    expect(wolfSkipVotesEvt?.outcome).toBe('SKIPPED');
    expect(wolfSkipVotesEvt?.metadata?.wolfPack?.skipWon).toBe(true);

    const peaceState2 = createInitialGameState(
      makePlayers(6),
      ['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager'],
      { firstNightNoKill: true }
    );
    const peaceRes = executeNightPhase(peaceState2, { wolfPack: { targets: ['p3'] } });
    const peaceEvt = peaceRes.nextState.eventLog.find((e) => e.actionType === 'ATTACK');
    expect(peaceEvt?.metadata?.wolfPack?.firstNightPeaceRule).toBe(true);
    expect(isLethalOrVoteEvent(peaceEvt!)).toBe(false);
    expect(formatMatchEventText(peaceEvt!, { mode: 'POST_GAME' })).toContain('luật hòa bình');

    // 4. Kiểm tra isLethalOrVoteEvent giữ DRUNK_AWAKEN & DREAM_WOLF_AWAKEN
    const dummyBase = {
      id: 'evt_test',
      seq: 1,
      roundNumber: 2,
      stage: 'NIGHT' as const,
      visibility: 'SECRET_NIGHT' as const,
      actor: null,
      targets: [],
      outcome: 'SUCCESS' as const,
      involvedPlayerIds: [],
    };
    expect(isLethalOrVoteEvent({ ...dummyBase, actionType: 'DRUNK_AWAKEN' })).toBe(true);
    expect(isLethalOrVoteEvent({ ...dummyBase, actionType: 'DREAM_WOLF_AWAKEN' })).toBe(true);
    expect(isLethalOrVoteEvent({ ...dummyBase, actionType: 'ANGEL_TO_VILLAGER' })).toBe(true);
    expect(isLethalOrVoteEvent({ ...dummyBase, actionType: 'PIED_PIPER_CLEAR' })).toBe(true);
    expect(isLethalOrVoteEvent({ ...dummyBase, actionType: 'CULT_DISBAND' })).toBe(true);
  });

  it('MAYOR_ELECTED, MAYOR_TIE và MAYOR_SUCCESSION gắn parentEventId từ sự kiện cái chết gốc', () => {
    // 1. MAYOR_TIE
    const tieBase = createInitialGameState(
      makePlayers(6),
      ['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager'],
      { hasMayor: true }
    );
    let tieState = executeNightPhase(tieBase, { wolfPack: { targets: ['p6'] } }).nextState;
    tieState = castMayorBallot(tieState, 'p1', 'p2');
    tieState = castMayorBallot(tieState, 'p2', 'p3');
    const tieRes = tallyMayorElection(tieState);
    expect(tieRes.electedMayorId).toBeNull();
    const mayorTieEvt = tieRes.nextState.eventLog.find((e) => e.actionType === 'MAYOR_TIE');
    expect(mayorTieEvt).toBeDefined();
    expect(formatMatchEventText(mayorTieEvt!, { mode: 'PUBLIC' })).toContain('hòa phiếu');

    // 2. MAYOR_ELECTED + Mayor chết đêm -> MAYOR_SUCCESSION có parentEventId trỏ tới ATTACK
    const electBase = createInitialGameState(
      makePlayers(6),
      ['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager'],
      { hasMayor: true }
    );
    let s = executeNightPhase(electBase, { wolfPack: { targets: ['p6'] } }).nextState;
    s = castMayorBallot(s, 'p1', 'p2');
    s = castMayorBallot(s, 'p2', 'p2');
    const electedRes = tallyMayorElection(s);
    expect(electedRes.electedMayorId).toBe('p2');
    const mayorElectedEvt = electedRes.nextState.eventLog.find(
      (e) => e.actionType === 'MAYOR_ELECTED'
    );
    expect(mayorElectedEvt).toBeDefined();
    expect(formatMatchEventText(mayorElectedEvt!, { mode: 'PUBLIC' })).toContain('đắc cử');

    // Đêm 2: Sói cắn Trưởng làng p2 -> MAYOR_SUCCESSION gắn parentEventId về ATTACK của Đêm 2
    s = electedRes.nextState;
    s.roundNumber = 2;
    s.phase = 'NIGHT';
    const n2MayorDies = executeNightPhase(s, { wolfPack: { targets: ['p2'] } });
    expect(n2MayorDies.nextState.phase).toBe('MAYOR_SUCCESSION');
    const expectedParentId = n2MayorDies.nextState.pendingMayorDeathEventIds?.['p2'];
    expect(expectedParentId).toBeDefined();

    const succRes = executeMayorSuccession(n2MayorDies.nextState, 'p3');
    expect(succRes.nextState.pendingMayorDeathEventIds?.['p2']).toBeUndefined();
    const succEvt = succRes.nextState.eventLog.find((e) => e.actionType === 'MAYOR_SUCCESSION');
    expect(succEvt?.parentEventId).toBe(expectedParentId);
    expect(succEvt?.outcome).toBe('SUCCESS');

    const grouped = groupMatchEventsForTimeline(succRes.nextState.eventLog);
    const byId = new Map(succRes.nextState.eventLog.map((e) => [e.id, e] as const));
    const dawnTree = buildCascadeTree(grouped.roundGroups[1].dawnEvents, byId);
    const succNode = dawnTree.find((n) => n.event.actionType === 'MAYOR_SUCCESSION');
    expect(succNode?.crossBlockParent?.id).toBe(expectedParentId);
  });

  it('bao phủ đầy đủ các biến thể WIN (LONE_WOLF, WHITE_WOLF, PIED_PIPER, CULT_LEADER, TANNER, COUPLE, DRAW) & chống lặp Hoodlum co-winner', () => {
    const verifyWin = (
      roles: string[],
      setupMutate: (s: ReturnType<typeof createInitialGameState>) => void,
      expectedWinner: string
    ) => {
      const s = createInitialGameState(makePlayers(roles.length), roles);
      setupMutate(s);
      const outcome = checkWinCondition(s);
      expect(outcome?.winner).toBe(expectedWinner as NonNullable<typeof outcome>['winner']);
      const evt = recordWinOutcomeEvent(s, outcome!, s.roundNumber);
      expect(evt).not.toBeNull();
      const pubText = formatMatchEventText(evt!, { mode: 'PUBLIC' });
      const postText = formatMatchEventText(evt!, { mode: 'POST_GAME' });
      expect(pubText.length).toBeGreaterThan(0);
      expect(postText.length).toBeGreaterThan(0);
      return { evt: evt!, pubText, postText };
    };

    // LONE_WOLF
    verifyWin(
      ['lone_wolf', 'werewolf', 'villager', 'villager', 'villager', 'villager'],
      (s) => {
        s.players.slice(1).forEach((p) => (p.isAlive = false));
      },
      'LONE_WOLF'
    );

    // WHITE_WOLF
    verifyWin(
      ['white_wolf', 'werewolf', 'villager', 'villager', 'villager', 'villager'],
      (s) => {
        s.players.slice(1).forEach((p) => (p.isAlive = false));
      },
      'WHITE_WOLF'
    );

    // PIED_PIPER
    verifyWin(
      ['pied_piper', 'werewolf', 'villager', 'villager', 'villager', 'villager'],
      (s) => {
        s.players.slice(1).forEach((p) => (p.isEnchanted = true));
      },
      'PIED_PIPER'
    );

    // CULT_LEADER
    verifyWin(
      ['cult_leader', 'werewolf', 'villager', 'villager', 'villager', 'villager'],
      (s) => {
        s.players.slice(1).forEach((p) => (p.isCultMember = true));
      },
      'CULT_LEADER'
    );

    // TANNER
    const tannerBase = createInitialGameState(makePlayers(6), [
      'tanner',
      'werewolf',
      'seer',
      'villager',
      'villager',
      'villager',
    ]);
    const tannerDay = executeDayVote(tannerBase, 'p1');
    expect(tannerDay.winOutcome?.winner).toBe('TANNER');
    const tannerWinEvt = tannerDay.nextState.eventLog.find((e) => e.actionType === 'WIN')!;
    expect(formatMatchEventText(tannerWinEvt, { mode: 'POST_GAME' })).toContain('Người 1');

    // COUPLE
    verifyWin(
      ['cupid', 'werewolf', 'villager', 'villager', 'villager', 'villager'],
      (s) => {
        s.players[1].loverId = 'p3';
        s.players[2].loverId = 'p2';
        s.players[1].isCrossFactionCouple = true;
        s.players[2].isCrossFactionCouple = true;
        s.players[0].isAlive = false;
        s.players[3].isAlive = false;
        s.players[4].isAlive = false;
        s.players[5].isAlive = false;
      },
      'COUPLE'
    );

    // DRAW
    verifyWin(
      ['werewolf', 'hunter', 'villager', 'villager', 'villager', 'villager'],
      (s) => {
        s.players.forEach((p) => (p.isAlive = false));
      },
      'DRAW'
    );

    // HOODLUM co-winner anti-duplication (với VILLAGER và với COUPLE)
    const hoodlumVillager = verifyWin(
      ['hoodlum', 'werewolf', 'villager', 'villager', 'villager', 'villager'],
      (s) => {
        s.players[0].hoodlumTargetIds = ['p2', 'p6'];
        s.players[1].isAlive = false;
        s.players[5].isAlive = false;
      },
      'VILLAGER'
    );
    expect(hoodlumVillager.evt.involvedPlayerIds).toContain('p1');
    expect(hoodlumVillager.postText).toContain('Du côn (Người 1)');
    expect(hoodlumVillager.postText).not.toContain('Đồng chiến thắng');
    expect(filterMatchEvents([hoodlumVillager.evt], 'player', 'p1')).toHaveLength(1);

    const hoodlumCouple = verifyWin(
      ['hoodlum', 'werewolf', 'villager', 'villager', 'villager', 'villager'],
      (s) => {
        s.players[0].hoodlumTargetIds = ['p4', 'p5'];
        s.players[1].loverId = 'p3';
        s.players[2].loverId = 'p2';
        s.players[1].isCrossFactionCouple = true;
        s.players[2].isCrossFactionCouple = true;
        s.players[3].isAlive = false;
        s.players[4].isAlive = false;
        s.players[5].isAlive = false;
      },
      'COUPLE'
    );
    expect(hoodlumCouple.postText).toContain('Du côn (Người 1)');
    expect(hoodlumCouple.postText).not.toContain('Đồng chiến thắng');
  });

  it('tích lũy resolvedEvents qua nhiều đêm và chặn trùng tử vong TETANUS với whiteWolf / witchPoison', () => {
    const state = createInitialGameState(makePlayers(7), [
      'rusty_knight', // p1
      'werewolf',     // p2 (nhiễm TETANUS Đêm 1)
      'white_wolf',   // p3
      'witch',        // p4
      'villager',     // p5
      'villager',     // p6
      'villager',     // p7
    ]);

    // Đêm 1: Sói cắn Kỵ sĩ gỉ sắt p1 -> Sói p2 nhiễm uốn ván
    const n1 = resolveNight(state, { wolfPack: { targets: ['p1'] } });
    const countAfterN1 = n1.nextState.resolvedEvents?.length ?? 0;
    expect(countAfterN1).toBeGreaterThan(0);

    // Đêm 2: p2 sụp đổ bởi TETANUS ở đầu đêm, đồng thời Sói trắng p3 ám sát p2 và Phù thủy p4 ném độc p2
    n1.nextState.roundNumber = 2;
    const n2 = resolveNight(n1.nextState, {
      wolfPack: { targets: ['p5'] },
      whiteWolf: { targetId: 'p2' },
      witch: { poisonTargetId: 'p2' },
    });

    // resolvedEvents tích lũy cả Đêm 1 lẫn Đêm 2
    expect((n2.nextState.resolvedEvents?.length ?? 0)).toBe(
      countAfterN1 + n2.output.events.length
    );

    // p2 chỉ có 1 DeathRecord duy nhất là TETANUS
    const p2Deaths = n2.nextState.deaths.filter((d) => d.playerId === 'p2');
    expect(p2Deaths).toHaveLength(1);
    expect(p2Deaths[0].cause).toBe('TETANUS');

    // Sự kiện ATTACK của Sói trắng & POISON của Phù thủy nhắm vào p2 đều ở trạng thái NO_EFFECT
    const wwAttack = n2.nextState.eventLog.find(
      (e) => e.roundNumber === 2 && e.actionType === 'ATTACK' && e.actor?.roleId === 'white_wolf'
    );
    const witchPoison = n2.nextState.eventLog.find(
      (e) => e.roundNumber === 2 && e.actionType === 'POISON'
    );
    expect(wwAttack?.outcome).toBe('NO_EFFECT');
    expect(witchPoison?.outcome).toBe('NO_EFFECT');
    expect(formatMatchEventText(wwAttack!, { mode: 'POST_GAME' })).toContain('vô hiệu');
    expect(formatMatchEventText(witchPoison!, { mode: 'POST_GAME' })).toContain('vô hiệu');
  });

  it('HEAL NO_EFFECT có metadata.note hiển thị đúng lý do quá liều bị hủy và EMERGENCY_ELIMINATE ban ngày giữ stage DAY_VOTE cho MAYOR_SUCCESSION / HUNTER_SHOT', () => {
    // 1. Overdose bị chặn vì tough_guy đã kiệt sức gục ngã đầu đêm
    const tgOverdose = createInitialGameState(
      makePlayers(6),
      ['witch', 'bodyguard', 'werewolf', 'tough_guy', 'villager', 'villager'],
      { witchDoubleProtectKills: true }
    );
    const n1Tg = executeNightPhase(tgOverdose, {
      wolfPack: { targets: ['p4'] },
    }).nextState;
    const d1Tg = executeDayVote(n1Tg, null).nextState;
    const n2Tg = executeNightPhase(d1Tg, {
      bodyguard: { targetId: 'p4' },
      wolfPack: { targets: ['p4'] },
      witch: { heal: true },
    }).nextState;
    const healNoEffect = n2Tg.eventLog.find(
      (e) => e.roundNumber === 2 && e.actionType === 'HEAL' && e.outcome === 'NO_EFFECT'
    );
    expect(healNoEffect).toBeDefined();
    expect(healNoEffect?.metadata?.note).toContain('tử vong');
    const healText = formatMatchEventText(healNoEffect!, { mode: 'POST_GAME' });
    expect(healText).toContain('tử vong');
    expect(healText).not.toContain('không có ai bị cắn');

    // 2. EMERGENCY_ELIMINATE ban ngày (DAY_DISCUSS) giết Trưởng làng & Thợ săn có người yêu Cupid -> hậu quả giữ stage 'DAY_VOTE'
    const dayElimState = createInitialGameState(makePlayers(7), [
      'hunter',
      'werewolf',
      'seer',
      'villager',
      'villager',
      'villager',
      'villager',
    ]);
    dayElimState.phase = 'DAY_DISCUSS';
    dayElimState.roundNumber = 1;
    dayElimState.mayorId = 'p4';
    dayElimState.players[4].loverId = 'p6';
    dayElimState.players[5].loverId = 'p5';

    // Trục xuất Trưởng làng p4 -> truyền ngôi giữ stage DAY_VOTE
    const afterMayorElim = executeEmergencyEliminate(dayElimState, 'p4').nextState;
    expect(afterMayorElim.phase).toBe('MAYOR_SUCCESSION');
    const afterMayorPass = executeMayorSuccession(afterMayorElim, 'p3').nextState;
    const mayorSuccEvt = afterMayorPass.eventLog.find((e) => e.actionType === 'MAYOR_SUCCESSION');
    expect(mayorSuccEvt?.stage).toBe('DAY_VOTE');

    // Trục xuất Thợ săn p1 trong DAY_DISCUSS -> bắn chết p5 (kéo theo người yêu p6) -> HUNTER_SHOT & CASCADE_DEATH đều giữ stage DAY_VOTE
    const afterHunterElim = executeEmergencyEliminate(afterMayorPass, 'p1').nextState;
    expect(afterHunterElim.phase).toBe('HUNTER_SHOT');
    const afterHunterShot = executeHunterShot(afterHunterElim, 'p5').nextState;
    const shotEvt = afterHunterShot.eventLog.find((e) => e.actionType === 'HUNTER_SHOT');
    const cascadeEvt = afterHunterShot.eventLog.find((e) => e.actionType === 'CASCADE_DEATH');
    expect(shotEvt?.stage).toBe('DAY_VOTE');
    expect(cascadeEvt?.stage).toBe('DAY_VOTE');
  });
});
