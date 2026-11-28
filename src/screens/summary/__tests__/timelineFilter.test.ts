import { describe, expect, it } from 'bun:test';
import { createInitialGameState } from '../../../engine/gameEngine';
import {
  appendMatchEvent,
  buildCascadeTree,
  consolidateRoundEventsForPostGame,
  filterMatchEvents,
  formatCrossLinkContext,
  groupMatchEventsForTimeline,
  summarizeDayCardStats,
  summarizeNightCardStats,
} from '../../../engine/matchLog';
import { formatMatchEventText, getOutcomeBadge } from '../../../engine/matchLogFormatter';
import type { EventParticipantSnapshot, MatchEvent } from '../../../engine/types';

function snap(
  playerId: string,
  name: string,
  seatIndex: number,
  roleId: string,
  faction: EventParticipantSnapshot['faction'] = 'VILLAGER'
): EventParticipantSnapshot {
  return { playerId, name, seatIndex, roleId, faction };
}

function makeEvent(partial: Partial<MatchEvent> & Pick<MatchEvent, 'id' | 'seq' | 'roundNumber' | 'stage' | 'actionType'>): MatchEvent {
  return {
    visibility: 'SECRET_NIGHT',
    actor: null,
    targets: [],
    outcome: 'SUCCESS',
    involvedPlayerIds: [],
    ...partial,
  };
}

describe('Summary Screen - MatchTimeline Filtering, Grouping & Cascade Tree', () => {
  const pWolf = snap('p1', 'An', 0, 'werewolf', 'WEREWOLF');
  const pHunter = snap('p2', 'Bình', 1, 'hunter', 'VILLAGER');
  const pSeer = snap('p3', 'Chi', 2, 'seer', 'VILLAGER');
  const pVillager = snap('p4', 'Dũng', 3, 'villager', 'VILLAGER');
  const pCupid = snap('p5', 'Hà', 4, 'cupid', 'VILLAGER');

  const sampleEvents: MatchEvent[] = [
    makeEvent({
      id: 'e1',
      seq: 1,
      roundNumber: 1,
      stage: 'SETUP',
      actionType: 'PAIR_LOVERS',
      actor: pCupid,
      targets: [pHunter, pVillager],
      involvedPlayerIds: ['p5', 'p2', 'p4'],
    }),
    makeEvent({
      id: 'e2',
      seq: 2,
      roundNumber: 1,
      stage: 'NIGHT',
      actionType: 'INSPECT',
      actor: pSeer,
      targets: [pWolf],
      involvedPlayerIds: ['p3', 'p1'],
    }),
    makeEvent({
      id: 'e3',
      seq: 3,
      roundNumber: 1,
      stage: 'NIGHT',
      actionType: 'ATTACK',
      actor: pWolf,
      coActors: [pWolf],
      targets: [pHunter],
      involvedPlayerIds: ['p1', 'p2'],
    }),
    makeEvent({
      id: 'e4',
      seq: 4,
      roundNumber: 1,
      stage: 'DAY_ANNOUNCEMENT',
      actionType: 'DAWN_SUMMARY',
      visibility: 'PUBLIC',
      targets: [pHunter],
      involvedPlayerIds: ['p2'],
      metadata: { dawnDeaths: [{ victim: pHunter, cause: 'WOLF_PACK' }] },
    }),
    makeEvent({
      id: 'e5',
      seq: 5,
      roundNumber: 1,
      stage: 'DAY_ANNOUNCEMENT',
      actionType: 'HUNTER_SHOT',
      visibility: 'PUBLIC',
      actor: pHunter,
      targets: [pWolf],
      parentEventId: 'e3', // Cross-block parent nằm ở NIGHT trong khi HUNTER_SHOT ở DAY_ANNOUNCEMENT
      involvedPlayerIds: ['p2', 'p1'],
    }),
    makeEvent({
      id: 'e6',
      seq: 6,
      roundNumber: 1,
      stage: 'DAY_ANNOUNCEMENT',
      actionType: 'CASCADE_DEATH',
      visibility: 'PUBLIC',
      actor: pHunter,
      targets: [pVillager],
      parentEventId: 'e5', // Same-block child của e5 trong DAY_ANNOUNCEMENT
      involvedPlayerIds: ['p2', 'p4'],
      metadata: { cascadeCause: 'COUPLE_HEARTBREAK' },
    }),
    makeEvent({
      id: 'e7',
      seq: 7,
      roundNumber: 1,
      stage: 'GAME_END',
      actionType: 'WIN',
      visibility: 'PUBLIC',
      targets: [pSeer],
      involvedPlayerIds: ['p3'],
      metadata: {
        win: { winner: 'VILLAGER', winningPlayers: [pSeer], reason: 'Dân làng thắng' },
      },
    }),
  ];

  it('không dựng Card Ngày N rỗng khi ván kết thúc ngay sau Đêm 1 / Bình minh (không có DAY_VOTE)', () => {
    const sections = groupMatchEventsForTimeline(sampleEvents);
    expect(sections.setupEvents.length).toBe(1);
    expect(sections.roundGroups.length).toBe(1);
    expect(sections.roundGroups[0].dawnEvents.length).toBe(3);
    expect(sections.roundGroups[0].dayEvents.length).toBe(0);
    expect(sections.winEvent?.id).toBe('e7');
  });

  it('buildCascadeTree xử lý parentEventId xuyên khối (Night -> Dawn) và vẫn lồng con cùng khối', () => {
    const allMap = new Map(sampleEvents.map((e) => [e.id, e]));
    const sections = groupMatchEventsForTimeline(sampleEvents);
    const dawnTree = buildCascadeTree(sections.roundGroups[0].dawnEvents, allMap);

    // DAWN_SUMMARY (e4) và HUNTER_SHOT (e5) phải là root ở khối Bình minh; CASCADE_DEATH (e6) lồng dưới e5
    expect(dawnTree.length).toBe(2);
    const shotRoot = dawnTree.find((n) => n.event.id === 'e5')!;
    expect(shotRoot).toBeDefined();
    expect(shotRoot.crossBlockParent?.id).toBe('e3');
    expect(formatCrossLinkContext(shotRoot.crossBlockParent!)).toContain('Đêm 1');
    expect(shotRoot.children.length).toBe(1);
    expect(shotRoot.children[0].event.id).toBe('e6');
  });

  it('bộ lọc "lethal" ẩn hành động Setup/Soi không gây án và thăng cấp node con mất cha', () => {
    const lethalOnly = filterMatchEvents(sampleEvents, 'lethal', null);
    const lethalIds = new Set(lethalOnly.map((e) => e.id));

    expect(lethalIds.has('e1')).toBe(false); // SETUP ẩn
    expect(lethalIds.has('e2')).toBe(false); // INSPECT ẩn
    expect(lethalIds.has('e3')).toBe(true);  // ATTACK giữ
    expect(lethalIds.has('e4')).toBe(true);  // DAWN_SUMMARY có người chết giữ
    expect(lethalIds.has('e5')).toBe(true);  // HUNTER_SHOT giữ
    expect(lethalIds.has('e6')).toBe(true);  // CASCADE_DEATH giữ
    expect(lethalIds.has('e7')).toBe(true);  // WIN giữ

    const allMap = new Map(sampleEvents.map((e) => [e.id, e]));
    const sections = groupMatchEventsForTimeline(lethalOnly);
    const dawnTree = buildCascadeTree(sections.roundGroups[0].dawnEvents, allMap);
    expect(dawnTree.length).toBe(2);
    expect(dawnTree.find((n) => n.event.id === 'e5')?.crossBlockParent?.id).toBe('e3');

    // Khi cha cùng khối bị bộ lọc 'lethal' loại bỏ, buildCascadeTree phải thăng cấp node con lên root
    const sameBlockFilteredParent: MatchEvent[] = [
      makeEvent({
        id: 'p_hidden',
        seq: 1,
        roundNumber: 2,
        stage: 'NIGHT',
        actionType: 'ATTACK',
        outcome: 'SKIPPED',
        involvedPlayerIds: ['p1'],
      }),
      makeEvent({
        id: 'c_kept',
        seq: 2,
        roundNumber: 2,
        stage: 'NIGHT',
        actionType: 'CURSED_TURN',
        actor: pVillager,
        parentEventId: 'p_hidden',
        involvedPlayerIds: ['p4'],
      }),
    ];
    const promotedOnly = filterMatchEvents(sameBlockFilteredParent, 'lethal', null);
    expect(promotedOnly.map((e) => e.id)).toEqual(['c_kept']);
    const promotedSections = groupMatchEventsForTimeline(promotedOnly);
    const nightTree = buildCascadeTree(
      promotedSections.roundGroups[0].nightActions,
      new Map(sameBlockFilteredParent.map((e) => [e.id, e]))
    );
    expect(nightTree.length).toBe(1);
    expect(nightTree[0].event.id).toBe('c_kept');
    expect(nightTree[0].crossBlockParent?.id).toBe('p_hidden');
  });

  it('bộ lọc "lethal" giữ đủ cứu/đỡ/lật bài/biến đổi và ẩn SKIPPED + DAWN_SUMMARY bình yên', () => {
    const matrixEvents: MatchEvent[] = [
      makeEvent({
        id: 'm_bg',
        seq: 1,
        roundNumber: 1,
        stage: 'NIGHT',
        actionType: 'ATTACK',
        outcome: 'BLOCKED_BY_BODYGUARD',
        targets: [pVillager],
        involvedPlayerIds: ['p1', 'p4'],
      }),
      makeEvent({
        id: 'm_witch',
        seq: 2,
        roundNumber: 1,
        stage: 'NIGHT',
        actionType: 'ATTACK',
        outcome: 'SAVED_BY_WITCH',
        targets: [pSeer],
        involvedPlayerIds: ['p1', 'p3'],
      }),
      makeEvent({
        id: 'm_reveal',
        seq: 3,
        roundNumber: 1,
        stage: 'DAY_VOTE',
        actionType: 'VOTE_SURVIVED_REVEAL',
        visibility: 'PUBLIC',
        actor: snap('p6', 'Quốc Bảo', 5, 'prince', 'VILLAGER'),
        outcome: 'IMMUNE',
      }),
      makeEvent({
        id: 'm_cursed',
        seq: 4,
        roundNumber: 2,
        stage: 'NIGHT',
        actionType: 'CURSED_TURN',
        actor: pVillager,
      }),
      makeEvent({
        id: 'm_drunk',
        seq: 5,
        roundNumber: 3,
        stage: 'NIGHT',
        actionType: 'DRUNK_AWAKEN',
        actor: snap('p7', 'Nam', 6, 'drunk', 'VILLAGER'),
      }),
      makeEvent({
        id: 'm_dream',
        seq: 6,
        roundNumber: 2,
        stage: 'DAY_VOTE',
        actionType: 'DREAM_WOLF_AWAKEN',
        actor: snap('p8', 'Hùng', 7, 'dream_wolf', 'WEREWOLF'),
      }),
      makeEvent({
        id: 'm_angel',
        seq: 7,
        roundNumber: 1,
        stage: 'DAY_VOTE',
        actionType: 'ANGEL_TO_VILLAGER',
        actor: snap('p9', 'Ngọc', 8, 'angel', 'THIRD_PARTY'),
      }),
      makeEvent({
        id: 'm_piper',
        seq: 8,
        roundNumber: 2,
        stage: 'DAY_VOTE',
        actionType: 'PIED_PIPER_CLEAR',
        actor: snap('p10', 'Huy', 9, 'pied_piper', 'THIRD_PARTY'),
      }),
      makeEvent({
        id: 'm_cult',
        seq: 9,
        roundNumber: 2,
        stage: 'DAY_VOTE',
        actionType: 'CULT_DISBAND',
        actor: snap('p11', 'Sơn', 10, 'cult_leader', 'THIRD_PARTY'),
      }),
      makeEvent({
        id: 'm_skip_attack',
        seq: 10,
        roundNumber: 1,
        stage: 'NIGHT',
        actionType: 'ATTACK',
        outcome: 'SKIPPED',
      }),
      makeEvent({
        id: 'm_skip_fox',
        seq: 11,
        roundNumber: 1,
        stage: 'NIGHT',
        actionType: 'INSPECT',
        outcome: 'SKIPPED',
      }),
      makeEvent({
        id: 'm_peaceful_dawn',
        seq: 12,
        roundNumber: 1,
        stage: 'DAY_ANNOUNCEMENT',
        actionType: 'DAWN_SUMMARY',
        visibility: 'PUBLIC',
        metadata: { dawnDeaths: [] },
      }),
    ];

    const keptIds = new Set(filterMatchEvents(matrixEvents, 'lethal', null).map((e) => e.id));
    expect(keptIds.has('m_bg')).toBe(true);
    expect(keptIds.has('m_witch')).toBe(true);
    expect(keptIds.has('m_reveal')).toBe(true);
    expect(keptIds.has('m_cursed')).toBe(true);
    expect(keptIds.has('m_drunk')).toBe(true);
    expect(keptIds.has('m_dream')).toBe(true);
    expect(keptIds.has('m_angel')).toBe(true);
    expect(keptIds.has('m_piper')).toBe(true);
    expect(keptIds.has('m_cult')).toBe(true);
    expect(keptIds.has('m_skip_attack')).toBe(false);
    expect(keptIds.has('m_skip_fox')).toBe(false);
    expect(keptIds.has('m_peaceful_dawn')).toBe(false);
  });

  it('bộ lọc "player" dùng involvedPlayerIds cho Bảo vệ, Phù thủy, cụm PI/Fox và Vote (không rò người chỉ đi bầu)', () => {
    const state = createInitialGameState(
      [
        { id: 'p1', name: 'An', seatIndex: 0 },
        { id: 'p2', name: 'Bình', seatIndex: 1 },
        { id: 'p3', name: 'Chi', seatIndex: 2 },
        { id: 'p4', name: 'Dũng', seatIndex: 3 },
        { id: 'p5', name: 'Hà', seatIndex: 4 },
        { id: 'p6', name: 'Khánh', seatIndex: 5 },
      ],
      ['werewolf', 'bodyguard', 'witch', 'fox', 'villager', 'villager']
    );

    const sWolf = snap('p1', 'An', 0, 'werewolf', 'WEREWOLF');
    const sBg = snap('p2', 'Bình', 1, 'bodyguard', 'VILLAGER');
    const sWitch = snap('p3', 'Chi', 2, 'witch', 'VILLAGER');
    const sFox = snap('p4', 'Dũng', 3, 'fox', 'VILLAGER');
    const sV5 = snap('p5', 'Hà', 4, 'villager', 'VILLAGER');
    const sV6 = snap('p6', 'Khánh', 5, 'villager', 'VILLAGER');

    const bgBlockEvt = appendMatchEvent(state, {
      roundNumber: 1,
      stage: 'NIGHT',
      actionType: 'ATTACK',
      visibility: 'SECRET_NIGHT',
      actor: sWolf,
      coActors: [sWolf],
      targets: [sV5],
      outcome: 'BLOCKED_BY_BODYGUARD',
      metadata: { protector: sBg },
    });

    const witchSaveEvt = appendMatchEvent(state, {
      roundNumber: 2,
      stage: 'NIGHT',
      actionType: 'ATTACK',
      visibility: 'SECRET_NIGHT',
      actor: sWolf,
      coActors: [sWolf],
      targets: [sV6],
      outcome: 'SAVED_BY_WITCH',
      metadata: { healer: sWitch },
    });

    const foxInspectEvt = appendMatchEvent(state, {
      roundNumber: 2,
      stage: 'NIGHT',
      actionType: 'INSPECT',
      visibility: 'SECRET_NIGHT',
      actor: sFox,
      targets: [sV5],
      outcome: 'SUCCESS',
      metadata: {
        investigation: {
          kind: 'GROUP_HAS_WOLF',
          resultLabel: 'Có Ma Sói',
          rawValue: true,
          inspectedPlayers: [sWolf, sV5, sBg],
          keptPower: true,
        },
      },
    });

    const voteTallyEvt = appendMatchEvent(state, {
      roundNumber: 2,
      stage: 'DAY_VOTE',
      actionType: 'VOTE_TALLY',
      visibility: 'PUBLIC',
      actor: null,
      targets: [sWolf, sV5],
      outcome: 'TIED_RUNOFF',
      metadata: {
        vote: {
          voteKind: 'DAY',
          tallies: [
            { target: sWolf, votes: 2, voters: [sV6, sBg] },
            { target: sV5, votes: 2, voters: [sWitch, sFox] },
            { target: sWitch, votes: 0 },
          ],
          abstainVotes: 0,
          tiedCandidates: [sWolf, sV5],
        },
      },
    });

    const events = state.eventLog;

    // 1. Bảo vệ được giữ ở đòn cắn BLOCKED_BY_BODYGUARD
    expect(filterMatchEvents(events, 'player', 'p2').map((e) => e.id)).toContain(bgBlockEvt.id);
    // 2. Phù thủy được giữ ở đòn cắn SAVED_BY_WITCH
    expect(filterMatchEvents(events, 'player', 'p3').map((e) => e.id)).toContain(witchSaveEvt.id);
    // 3. Cụm 3 người của PI/Fox: cả 3 thành viên trong cụm (p1, p5, p2) + Fox (p4) đều khớp; người ngoài cụm (p6) không khớp
    expect(filterMatchEvents(events, 'player', 'p1').map((e) => e.id)).toContain(foxInspectEvt.id);
    expect(filterMatchEvents(events, 'player', 'p5').map((e) => e.id)).toContain(foxInspectEvt.id);
    expect(filterMatchEvents(events, 'player', 'p2').map((e) => e.id)).toContain(foxInspectEvt.id);
    expect(filterMatchEvents(events, 'player', 'p6').map((e) => e.id)).not.toContain(foxInspectEvt.id);
    // 4. VOTE_TALLY: giữ ứng viên có phiếu / hòa phiếu (p1, p5), loại người chỉ đi bỏ phiếu không bị vote (p6, p3)
    expect(filterMatchEvents(events, 'player', 'p1').map((e) => e.id)).toContain(voteTallyEvt.id);
    expect(filterMatchEvents(events, 'player', 'p5').map((e) => e.id)).toContain(voteTallyEvt.id);
    expect(filterMatchEvents(events, 'player', 'p6').map((e) => e.id)).not.toContain(voteTallyEvt.id);
    expect(filterMatchEvents(events, 'player', 'p3').map((e) => e.id)).not.toContain(voteTallyEvt.id);
  });

  it('bộ lọc "player" giữ đúng các sự kiện có mặt người chơi được chọn + WIN và bảo toàn crossBlockParent khi cha bị lọc', () => {
    const playerOnly = filterMatchEvents(sampleEvents, 'player', 'p4'); // Chỉ liên quan Dũng (p4)
    expect(playerOnly.map((e) => e.id)).toEqual(['e1', 'e6', 'e7']);

    const allMap = new Map(sampleEvents.map((e) => [e.id, e]));
    const sections = groupMatchEventsForTimeline(playerOnly);
    const dawnTree = buildCascadeTree(sections.roundGroups[0].dawnEvents, allMap);

    // Vì e5 (HUNTER_SHOT) bị lọc khỏi playerOnly của p4, e6 (CASCADE_DEATH) tự động thăng cấp lên root với crossBlockParent = e5
    expect(dawnTree.length).toBe(1);
    expect(dawnTree[0].event.id).toBe('e6');
    expect(dawnTree[0].crossBlockParent?.id).toBe('e5');
    expect(formatCrossLinkContext(dawnTree[0].crossBlockParent!)).toContain('Bình');
  });

  it('summarizeNightCardStats & summarizeDayCardStats đếm đúng lượt xử bị hủy và tối đa chip', () => {
    const round1 = groupMatchEventsForTimeline(sampleEvents).roundGroups[0];
    const nightBadges = summarizeNightCardStats(round1);
    expect(nightBadges[0].label).toBe('1 tử vong');

    const dayStats = summarizeDayCardStats({
      roundNumber: 1,
      nightActions: [],
      nightIdleEvents: [],
      dawnEvents: [],
      dayEvents: [
        makeEvent({
          id: 'v1',
          seq: 10,
          roundNumber: 1,
          stage: 'DAY_VOTE',
          actionType: 'VOTE_EXECUTION',
          targets: [pVillager],
          metadata: { vote: { voteKind: 'DAY', tallies: [], abstainVotes: 0, executionStep: 1 } },
        }),
        makeEvent({
          id: 'v2',
          seq: 11,
          roundNumber: 1,
          stage: 'DAY_VOTE',
          actionType: 'VOTE_EXECUTION',
          targets: [pSeer],
          outcome: 'NO_EFFECT',
          metadata: {
            vote: {
              voteKind: 'DAY',
              tallies: [],
              abstainVotes: 0,
              executionStep: 2,
              cancelledReason: 'ALREADY_DEAD',
            },
          },
        }),
      ],
    });
    expect(dayStats[0].label).toBe('1 treo cổ');
  });

  it('consolidateRoundEventsForPostGame gộp Đêm + Bình minh, khử trùng lặp loa sáng và lồng thẳng Thợ săn dưới đòn Sói cắn', () => {
    const round1 = groupMatchEventsForTimeline(sampleEvents).roundGroups[0];
    const consolidated = consolidateRoundEventsForPostGame(round1);
    const ids = consolidated.map((e) => e.id);

    // Đêm có người chết -> ẩn DAWN_SUMMARY (e4), giữ ATTACK (e3) và HUNTER_SHOT (e5) + CASCADE_DEATH (e6)
    expect(ids).not.toContain('e4');
    expect(ids).toEqual(['e2', 'e3', 'e5', 'e6']);

    // Khi gộp chung 1 khối, buildCascadeTree lồng trực tiếp e5 (HUNTER_SHOT) dưới e3 (ATTACK)
    const allMap = new Map(sampleEvents.map((e) => [e.id, e]));
    const tree = buildCascadeTree(consolidated, allMap);
    const attackNode = tree.find((n) => n.event.id === 'e3')!;
    expect(attackNode.children.map((c) => c.event.id)).toEqual(['e5']);
    expect(attackNode.children[0].children.map((c) => c.event.id)).toEqual(['e6']);

    // Đêm bình yên (0 chết): giữ DAWN_SUMMARY làm dòng chốt và định dạng "Sáng hôm sau: Không ai chết."
    const peacefulGroup = groupMatchEventsForTimeline([
      makeEvent({
        id: 'n1_sil',
        seq: 1,
        roundNumber: 1,
        stage: 'NIGHT',
        actionType: 'SILENCE',
        actor: pSeer,
        targets: [pVillager],
      }),
      makeEvent({
        id: 'd1_mute',
        seq: 2,
        roundNumber: 1,
        stage: 'DAY_ANNOUNCEMENT',
        actionType: 'MUTE_ANNOUNCE',
        visibility: 'PUBLIC',
        targets: [pVillager],
      }),
      makeEvent({
        id: 'd1_dawn',
        seq: 3,
        roundNumber: 1,
        stage: 'DAY_ANNOUNCEMENT',
        actionType: 'DAWN_SUMMARY',
        visibility: 'PUBLIC',
        metadata: { dawnDeaths: [] },
      }),
    ]).roundGroups[0];

    const peacefulConsolidated = consolidateRoundEventsForPostGame(peacefulGroup);
    expect(peacefulConsolidated.map((e) => e.id)).toEqual(['n1_sil', 'd1_dawn']);
    expect(formatMatchEventText(peacefulConsolidated[1], { mode: 'POST_GAME' })).toBe(
      'Sáng hôm sau: Không ai chết.'
    );
  });

  it('getOutcomeBadge chỉ giữ nhãn "Bị đỡ" & "Không tác dụng" và câu chữ không bị đóng ngoặc kép', () => {
    const attackKill = makeEvent({
      id: 'b1',
      seq: 1,
      roundNumber: 1,
      stage: 'NIGHT',
      actionType: 'ATTACK',
      actor: pWolf,
      targets: [pHunter],
      outcome: 'SUCCESS',
    });
    const attackBlocked = makeEvent({
      id: 'b2',
      seq: 2,
      roundNumber: 1,
      stage: 'NIGHT',
      actionType: 'ATTACK',
      actor: pWolf,
      targets: [pHunter],
      outcome: 'BLOCKED_BY_BODYGUARD',
    });
    const healMiss = makeEvent({
      id: 'b3',
      seq: 3,
      roundNumber: 1,
      stage: 'NIGHT',
      actionType: 'HEAL',
      actor: pSeer,
      targets: [],
      outcome: 'NO_EFFECT',
    });

    expect(getOutcomeBadge(attackKill)).toBeNull();
    expect(getOutcomeBadge(attackBlocked)).toEqual({ label: 'Bị đỡ', tone: 'blocked' });
    expect(getOutcomeBadge(healMiss)).toEqual({ label: 'Không tác dụng', tone: 'neutral' });

    for (const evt of sampleEvents) {
      const text = formatMatchEventText(evt, { mode: 'POST_GAME' });
      expect(text).not.toMatch(/\)\s*\(/);
    }
  });
});
