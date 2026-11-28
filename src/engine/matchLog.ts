import {
  formatMatchEventText,
  getRoleNameVi,
  type FormatMatchEventOptions,
} from './matchLogFormatter';
import type {
  EventParticipantSnapshot,
  GameState,
  MatchActionType,
  MatchEvent,
  MatchEventMetadata,
  MatchEventOutcome,
  MatchLogStage,
  MatchLogVisibility,
  PlayerId,
  PlayerState,
  PublicMatchLogItem,
  WinOutcome,
} from './types';

export type TimelineFilterMode = 'all' | 'lethal' | 'player';

export interface CascadeTreeNode {
  event: MatchEvent;
  children: CascadeTreeNode[];
  crossBlockParent: MatchEvent | null;
}

export interface TimelineRoundGroup {
  roundNumber: number;
  nightActions: MatchEvent[];
  nightIdleEvents: MatchEvent[];
  dawnEvents: MatchEvent[];
  dayEvents: MatchEvent[];
}

export interface TimelineSections {
  setupEvents: MatchEvent[];
  roundGroups: TimelineRoundGroup[];
  winEvent: MatchEvent | null;
}

export interface PhaseCardStatBadge {
  label: string;
  tone: 'danger' | 'safe' | 'warn' | 'transform' | 'neutral';
}

export interface AppendMatchEventInput {
  roundNumber: number;
  stage: MatchLogStage;
  actionType: MatchActionType;
  visibility: MatchLogVisibility;
  actor: EventParticipantSnapshot | null;
  coActors?: EventParticipantSnapshot[];
  targets: EventParticipantSnapshot[];
  outcome: MatchEventOutcome;
  parentEventId?: string | null;
  involvedPlayerIds?: PlayerId[];
  metadata?: MatchEventMetadata;
}

/**
 * Chụp lại trạng thái vai trò & phe của một người chơi tại đúng thời điểm sự kiện diễn ra.
 */
export function snapshotPlayer(
  player: PlayerState,
  overrides?: { roleId?: string; faction?: PlayerState['faction'] }
): EventParticipantSnapshot {
  return {
    playerId: player.id,
    name: player.name,
    seatIndex: player.seatIndex,
    roleId: overrides?.roleId ?? player.roleId,
    faction: overrides?.faction ?? player.faction,
    ...(player.drunkRealRoleId ? { drunkRealRoleId: player.drunkRealRoleId } : {}),
  };
}

function collectInvolvedPlayerIds(input: AppendMatchEventInput): PlayerId[] {
  const ids = new Set<PlayerId>();

  if (input.actor) ids.add(input.actor.playerId);
  for (const co of input.coActors ?? []) ids.add(co.playerId);
  for (const t of input.targets) ids.add(t.playerId);
  for (const extra of input.involvedPlayerIds ?? []) ids.add(extra);

  if (input.metadata?.protector) ids.add(input.metadata.protector.playerId);
  if (input.metadata?.healer) ids.add(input.metadata.healer.playerId);
  for (const p of input.metadata?.investigation?.inspectedPlayers ?? []) {
    ids.add(p.playerId);
  }
  for (const d of input.metadata?.dawnDeaths ?? []) {
    ids.add(d.victim.playerId);
  }
  for (const w of input.metadata?.win?.winningPlayers ?? []) {
    ids.add(w.playerId);
  }
  for (const cw of input.metadata?.win?.coWinners ?? []) {
    ids.add(cw.playerId);
  }
  if (input.metadata?.vote) {
    for (const tally of input.metadata.vote.tallies) {
      if (tally.votes > 0) ids.add(tally.target.playerId);
    }
    for (const c of input.metadata.vote.tiedCandidates ?? []) {
      ids.add(c.playerId);
    }
  }

  return Array.from(ids);
}

/**
 * Ghi thêm một MatchEvent có cấu trúc vào GameState.eventLog với seq và ID tất định.
 */
export function appendMatchEvent(
  state: GameState,
  input: AppendMatchEventInput
): MatchEvent {
  if (!Array.isArray(state.eventLog)) {
    state.eventLog = [];
  }
  const nextSeq = (state.eventSeq ?? 0) + 1;
  state.eventSeq = nextSeq;

  const event: MatchEvent = {
    id: `evt_${input.roundNumber}_${nextSeq}`,
    seq: nextSeq,
    roundNumber: input.roundNumber,
    stage: input.stage,
    actionType: input.actionType,
    visibility: input.visibility,
    actor: input.actor,
    ...(input.coActors && input.coActors.length > 0 ? { coActors: input.coActors } : {}),
    targets: input.targets,
    outcome: input.outcome,
    ...(input.parentEventId ? { parentEventId: input.parentEventId } : {}),
    involvedPlayerIds: collectInvolvedPlayerIds(input),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };

  state.eventLog.push(event);
  return event;
}

/**
 * Tạo danh sách PublicMatchLogItem an toàn để hiển thị trên màn hình Ngày & Bảng Host.
 * Loại bỏ hoàn toàn SECRET_NIGHT và SYSTEM_DEBUG, đồng thời tuân thủ revealOnDeath + 3 ngoại lệ lộ vai.
 */
export function buildPublicTimeline(state: GameState): PublicMatchLogItem[] {
  const options: FormatMatchEventOptions = {
    mode: 'PUBLIC',
    revealOnDeath: state.settings.revealOnDeath,
  };

  const items: PublicMatchLogItem[] = [];
  for (const evt of state.eventLog ?? []) {
    if (evt.visibility !== 'PUBLIC') continue;
    if (
      evt.stage !== 'DAY_ANNOUNCEMENT' &&
      evt.stage !== 'DAY_VOTE' &&
      evt.stage !== 'GAME_END'
    ) {
      continue;
    }

    const isHighlight =
      evt.actionType === 'DAWN_SUMMARY' ||
      evt.actionType === 'VOTE_EXECUTION' ||
      evt.actionType === 'VOTE_SURVIVED_REVEAL' ||
      evt.actionType === 'HUNTER_SHOT' ||
      evt.actionType === 'WIN';

    items.push({
      id: evt.id,
      seq: evt.seq,
      roundNumber: evt.roundNumber,
      stage: evt.stage,
      actionType: evt.actionType,
      text: formatMatchEventText(evt, options),
      isHighlight,
    });
  }

  return items;
}

const ANNOUNCEMENT_PRIORITY: Partial<Record<MatchActionType, number>> = {
  DAWN_SUMMARY: 0,
  BEAR_GROWL: 1,
  MUTE_ANNOUNCE: 2,
  TROUBLEMAKER_ANNOUNCE: 3,
};

/**
 * Lấy toàn bộ bản tin bình minh (DAY_ANNOUNCEMENT) của vòng hiện tại.
 * Luôn đặt DAWN_SUMMARY lên đầu để không bao giờ bị Gấu gầm hay Cấm nói ghi đè.
 */
export function getMorningAnnouncements(
  publicTimeline: PublicMatchLogItem[],
  roundNumber: number
): PublicMatchLogItem[] {
  return publicTimeline
    .filter((item) => item.stage === 'DAY_ANNOUNCEMENT' && item.roundNumber === roundNumber)
    .sort((a, b) => {
      const pa = ANNOUNCEMENT_PRIORITY[a.actionType] ?? 99;
      const pb = ANNOUNCEMENT_PRIORITY[b.actionType] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.seq - b.seq;
    });
}

/**
 * Kiểm tra xem sự kiện có thuộc nhóm "Án mạng & Treo cổ" cho bộ lọc nhanh hay không.
 */
export function isLethalOrVoteEvent(event: MatchEvent): boolean {
  switch (event.actionType) {
    case 'ATTACK':
      return event.outcome !== 'SKIPPED' && !event.metadata?.wolfPack?.firstNightPeaceRule;
    case 'CURSE':
      return true;
    case 'POISON':
      return event.outcome !== 'NO_EFFECT';
    case 'HEAL':
      return event.outcome === 'OVERDOSE_DOUBLE_PROTECT';
    case 'DAWN_SUMMARY':
      return (event.metadata?.dawnDeaths?.length ?? 0) > 0;
    case 'HUNTER_SHOT':
      return event.outcome === 'SUCCESS';
    case 'VOTE_EXECUTION':
    case 'VOTE_SURVIVED_REVEAL':
    case 'CASCADE_DEATH':
    case 'EMERGENCY_ELIMINATE':
    case 'TOUGH_GUY_WOUNDED':
    case 'TOUGH_GUY_COLLAPSE':
    case 'RUSTY_KNIGHT_INFECT':
    case 'TETANUS_DEATH':
    case 'ELDER_SHIELD_HIT':
    case 'ELDER_CURSE_VILLAGE':
    case 'WOLF_CUB_ENRAGE':
    case 'CURSED_TURN':
    case 'WILD_CHILD_TURN':
    case 'DOPPELGANGER_INHERIT':
    case 'WIN':
      return true;
    default:
      return false;
  }
}

/**
 * Lọc danh sách sự kiện trên Timeline theo chế độ đã chọn.
 */
export function filterMatchEvents(
  events: MatchEvent[],
  mode: TimelineFilterMode,
  selectedPlayerId: PlayerId | null
): MatchEvent[] {
  const safeEvents = events.filter((e) => e.visibility !== 'SYSTEM_DEBUG');

  if (mode === 'lethal') {
    return safeEvents.filter(isLethalOrVoteEvent);
  }

  if (mode === 'player' && selectedPlayerId) {
    return safeEvents.filter(
      (e) => e.actionType === 'WIN' || e.involvedPlayerIds.includes(selectedPlayerId)
    );
  }

  return safeEvents;
}

/**
 * Gom nhóm toàn bộ MatchEvent thành cấu trúc các chương dọc trên Timeline.
 * Chỉ tạo Card Ngày N khi vòng N có ít nhất 1 sự kiện DAY_VOTE (tránh card Ngày rỗng khi kết thúc Đêm 1).
 */
export function groupMatchEventsForTimeline(events: MatchEvent[]): TimelineSections {
  const setupEvents: MatchEvent[] = [];
  let winEvent: MatchEvent | null = null;
  const roundMap = new Map<number, TimelineRoundGroup>();

  const getOrCreateRound = (roundNumber: number): TimelineRoundGroup => {
    let group = roundMap.get(roundNumber);
    if (!group) {
      group = {
        roundNumber,
        nightActions: [],
        nightIdleEvents: [],
        dawnEvents: [],
        dayEvents: [],
      };
      roundMap.set(roundNumber, group);
    }
    return group;
  };

  for (const evt of events) {
    if (evt.visibility === 'SYSTEM_DEBUG') continue;

    if (evt.stage === 'SETUP') {
      setupEvents.push(evt);
      continue;
    }

    if (evt.stage === 'GAME_END' || evt.actionType === 'WIN') {
      winEvent = evt;
      continue;
    }

    const group = getOrCreateRound(evt.roundNumber);
    if (evt.stage === 'NIGHT') {
      if (evt.actionType === 'NIGHT_IDLE_SUMMARY') {
        group.nightIdleEvents.push(evt);
      } else {
        group.nightActions.push(evt);
      }
    } else if (evt.stage === 'DAY_ANNOUNCEMENT') {
      group.dawnEvents.push(evt);
    } else if (evt.stage === 'DAY_VOTE') {
      group.dayEvents.push(evt);
    }
  }

  const roundGroups = Array.from(roundMap.values()).sort(
    (a, b) => a.roundNumber - b.roundNumber
  );

  return { setupEvents, roundGroups, winEvent };
}

/**
 * Dựng cây quan hệ nhân – quả trong cùng một khối hiển thị.
 * Nếu parentEventId nằm ngoài khối hiện tại (xuyên khối hoặc bị lọc), tự động đẩy node lên làm root kèm crossBlockParent.
 */
export function buildCascadeTree(
  blockEvents: MatchEvent[],
  allEventsById: Map<string, MatchEvent>
): CascadeTreeNode[] {
  const visibleIds = new Set(blockEvents.map((e) => e.id));
  const nodeMap = new Map<string, CascadeTreeNode>();

  for (const evt of blockEvents) {
    nodeMap.set(evt.id, {
      event: evt,
      children: [],
      crossBlockParent: null,
    });
  }

  const roots: CascadeTreeNode[] = [];
  for (const evt of blockEvents) {
    const node = nodeMap.get(evt.id)!;
    if (evt.parentEventId && visibleIds.has(evt.parentEventId)) {
      const parentNode = nodeMap.get(evt.parentEventId);
      if (parentNode) {
        parentNode.children.push(node);
        continue;
      }
    }

    if (evt.parentEventId) {
      node.crossBlockParent = allEventsById.get(evt.parentEventId) ?? null;
    }
    roots.push(node);
  }

  return roots;
}

/**
 * Tạo nhãn liên kết ngắn khi một sự kiện con được hiển thị ở khối khác với sự kiện cha.
 */
export function formatCrossLinkContext(parent: MatchEvent): string {
  switch (parent.actionType) {
    case 'ATTACK':
      return parent.roundNumber > 0
        ? `Kích hoạt sau đòn cắn Đêm ${parent.roundNumber}`
        : 'Kích hoạt sau đòn cắn';
    case 'POISON':
      return `Kích hoạt sau khi trúng độc Đêm ${parent.roundNumber}`;
    case 'TOUGH_GUY_COLLAPSE':
      return `Kích hoạt sau khi kiệt sức Đêm ${parent.roundNumber}`;
    case 'TETANUS_DEATH':
      return `Kích hoạt sau khi chết vì uốn ván Đêm ${parent.roundNumber}`;
    case 'VOTE_EXECUTION':
      return `Kích hoạt sau án treo cổ Ngày ${parent.roundNumber}`;
    case 'HUNTER_SHOT':
      return parent.actor
        ? `Kéo theo từ phát súng của ${parent.actor.name}`
        : 'Kéo theo từ phát súng Thợ săn';
    case 'CASCADE_DEATH':
      return parent.actor
        ? `Kéo theo từ cái chết của ${parent.actor.name}`
        : 'Kéo theo từ cái chết dây chuyền';
    case 'EMERGENCY_ELIMINATE':
      return `Kích hoạt sau khi trục xuất Ngày ${parent.roundNumber}`;
    default:
      return `Liên quan sự kiện vòng ${parent.roundNumber}`;
  }
}

/**
 * Tạo tối đa 2-3 chip tóm tắt ngắn cho header Card Đêm N (dựa trên dữ liệu gốc chưa lọc).
 */
export function summarizeNightCardStats(
  roundGroup: TimelineRoundGroup
): PhaseCardStatBadge[] {
  const badges: PhaseCardStatBadge[] = [];
  const dawnSummary = roundGroup.dawnEvents.find((e) => e.actionType === 'DAWN_SUMMARY');
  const deathCount = dawnSummary?.metadata?.dawnDeaths?.length ?? 0;

  let blockCount = 0;
  let healCount = 0;
  let transformCount = 0;

  for (const evt of roundGroup.nightActions) {
    if (evt.outcome === 'BLOCKED_BY_BODYGUARD') blockCount += 1;
    if (evt.actionType === 'ATTACK' && evt.outcome === 'SAVED_BY_WITCH') healCount += 1;
    if (
      evt.actionType === 'CURSED_TURN' ||
      evt.actionType === 'DRUNK_AWAKEN' ||
      evt.actionType === 'DREAM_WOLF_AWAKEN' ||
      evt.actionType === 'DOPPELGANGER_INHERIT' ||
      evt.actionType === 'WILD_CHILD_TURN'
    ) {
      transformCount += 1;
    }
  }

  if (deathCount > 0) {
    badges.push({ label: `${deathCount} tử vong`, tone: 'danger' });
  } else {
    badges.push({ label: 'Đêm bình yên', tone: 'safe' });
  }

  if (blockCount > 0) {
    badges.push({ label: `${blockCount} bị chặn`, tone: 'warn' });
  }
  if (healCount > 0 && badges.length < 3) {
    badges.push({ label: `${healCount} được cứu`, tone: 'safe' });
  }
  if (transformCount > 0 && badges.length < 3) {
    badges.push({ label: `${transformCount} biến đổi`, tone: 'transform' });
  }

  return badges.slice(0, 3);
}

/**
 * Tạo tối đa 2 chip tóm tắt ngắn cho header Card Ngày N.
 */
export function summarizeDayCardStats(
  roundGroup: TimelineRoundGroup
): PhaseCardStatBadge[] {
  const badges: PhaseCardStatBadge[] = [];
  const actualExecutions = roundGroup.dayEvents.filter(
    (e) => e.actionType === 'VOTE_EXECUTION' && !e.metadata?.vote?.cancelledReason
  ).length;
  const survivedReveals = roundGroup.dayEvents.filter(
    (e) => e.actionType === 'VOTE_SURVIVED_REVEAL'
  );
  const hunterKills = roundGroup.dayEvents.filter(
    (e) => e.actionType === 'HUNTER_SHOT' && e.outcome === 'SUCCESS'
  ).length;

  if (actualExecutions > 0) {
    badges.push({ label: `${actualExecutions} treo cổ`, tone: 'danger' });
  } else if (survivedReveals.length > 0) {
    const firstRole = survivedReveals[0].actor?.roleId;
    badges.push({
      label: firstRole === 'prince' ? 'Hoàng tử lật bài' : 'Thằng ngốc lật bài',
      tone: 'safe',
    });
  } else if (roundGroup.dayEvents.some((e) => e.outcome === 'TIED_ESCAPE' || e.outcome === 'TIED_RUNOFF')) {
    badges.push({ label: 'Hòa phiếu', tone: 'neutral' });
  } else if (roundGroup.dayEvents.some((e) => e.actionType === 'VOTE_NO_EXECUTION')) {
    badges.push({ label: 'Không treo ai', tone: 'neutral' });
  }

  if (hunterKills > 0 && badges.length < 2) {
    badges.push({ label: 'Thợ săn nổ súng', tone: 'warn' });
  }

  return badges.slice(0, 2);
}

/**
 * Ghi nhận sự kiện chiến thắng / hòa (WIN) khi ván đấu chuyển sang GAME_OVER.
 * Chống ghi trùng nếu event WIN đã tồn tại trong GameState.eventLog.
 */
export function recordWinOutcomeEvent(
  state: GameState,
  winOutcome: WinOutcome,
  roundOverride?: number
): MatchEvent | null {
  if (!winOutcome.winner) return null;

  const alreadyRecorded = (state.eventLog ?? []).some((e) => e.actionType === 'WIN');
  if (alreadyRecorded) return null;

  const winningSet = new Set(winOutcome.winningPlayerIds);
  const allWinningSnapshots = state.players
    .filter((p) => winningSet.has(p.id))
    .map((p) => snapshotPlayer(p));

  const coWinners = allWinningSnapshots.filter(
    (s) =>
      s.roleId === 'hoodlum' &&
      (winOutcome.winner === 'VILLAGER' ||
        winOutcome.winner === 'WEREWOLF' ||
        winOutcome.winner === 'COUPLE')
  );
  const mainWinners = allWinningSnapshots.filter(
    (s) => !coWinners.some((cw) => cw.playerId === s.playerId)
  );

  const eventRound = roundOverride ?? state.roundNumber;

  const evt = appendMatchEvent(state, {
    roundNumber: eventRound,
    stage: 'GAME_END',
    actionType: 'WIN',
    visibility: 'PUBLIC',
    actor: mainWinners[0] ?? null,
    targets: mainWinners,
    outcome: 'SUCCESS',
    metadata: {
      win: {
        winner: winOutcome.winner,
        winningPlayers: mainWinners,
        ...(coWinners.length > 0 ? { coWinners } : {}),
        reason: winOutcome.reason,
      },
    },
  });

  state.historyLogs.push(winOutcome.reason);
  return evt;
}

/**
 * Format nhanh mô tả vai trò kèm vai ẩn nếu là Kẻ say rượu.
 */
export function formatPostGameRoleLabel(
  initialRoleId: string,
  finalRoleId: string,
  drunkRealRoleId?: string | null
): string {
  const finalName = getRoleNameVi(finalRoleId);
  if (initialRoleId === 'drunk' && finalRoleId === 'drunk' && drunkRealRoleId) {
    return `${finalName} (vai ẩn: ${getRoleNameVi(drunkRealRoleId)})`;
  }
  return finalName;
}
