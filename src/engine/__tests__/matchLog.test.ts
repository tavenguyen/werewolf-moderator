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
  buildPublicTimeline,
  formatPostGameRoleLabel,
  getMorningAnnouncements,
} from '../matchLog';
import { formatMatchEventText } from '../matchLogFormatter';
import { getWitchVictimsPreview } from '../nightResolution';
import { ROLES } from '../roles';
import type { NightActions } from '../types';

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
});
