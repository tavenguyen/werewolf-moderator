import { describe, expect, it } from 'bun:test';
import {
  buildCascadeTree,
  filterMatchEvents,
  formatCrossLinkContext,
  groupMatchEventsForTimeline,
  summarizeDayCardStats,
  summarizeNightCardStats,
} from '../../../engine/matchLog';
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
});
