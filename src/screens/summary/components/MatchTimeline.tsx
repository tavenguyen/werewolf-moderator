import { useEffect, useState } from 'react';
import {
  buildCascadeTree,
  filterMatchEvents,
  formatCrossLinkContext,
  groupMatchEventsForTimeline,
  summarizeDayCardStats,
  summarizeNightCardStats,
  type CascadeTreeNode,
  type PhaseCardStatBadge,
  type TimelineFilterMode,
} from '../../../engine/matchLog';
import { getOutcomeBadge } from '../../../engine/matchLogFormatter';
import type { MatchEvent, PlayerId } from '../../../engine/types';
import type { PostGameView, PublicRoomView } from '../../../server/types';
import TimelineFilterBar, { type TimelinePlayerChipItem } from './TimelineFilterBar';
import TimelineRichText from './TimelineRichText';

export interface MatchTimelineProps {
  postGame: PostGameView | null;
  publicView: PublicRoomView | null;
  gameKey: string;
}

function getActionCategoryIcon(event: MatchEvent): string {
  switch (event.actionType) {
    case 'ATTACK':
      return '🐺';
    case 'PROTECT':
      return '🛡️';
    case 'HEAL':
      return '🧪';
    case 'POISON':
      return '☠️';
    case 'INSPECT':
      return '🔮';
    case 'CURSE':
    case 'CURSED_TURN':
    case 'WILD_CHILD_TURN':
    case 'DOPPELGANGER_INHERIT':
    case 'DRUNK_AWAKEN':
    case 'DREAM_WOLF_AWAKEN':
    case 'ANGEL_TO_VILLAGER':
      return '🌑';
    case 'HUNTER_SHOT':
      return '🎯';
    case 'VOTE_EXECUTION':
    case 'VOTE_TALLY':
    case 'VOTE_SURVIVED_REVEAL':
    case 'VOTE_NO_EXECUTION':
      return '⚖️';
    case 'CASCADE_DEATH':
    case 'TOUGH_GUY_COLLAPSE':
    case 'TETANUS_DEATH':
      return '💔';
    case 'DAWN_SUMMARY':
      return '🌅';
    case 'BEAR_GROWL':
      return '🐻';
    case 'MUTE_ANNOUNCE':
    case 'SILENCE':
      return '🤐';
    case 'TROUBLEMAKER_ANNOUNCE':
    case 'DOUBLE_VOTE_SABOTAGE':
      return '🧨';
    case 'MAYOR_ELECTED':
    case 'MAYOR_TIE':
    case 'MAYOR_SUCCESSION':
      return '🎖️';
    case 'EMERGENCY_ELIMINATE':
      return '⚠️';
    case 'PAIR_LOVERS':
      return '💘';
    case 'WIN':
      return '🏆';
    default:
      return '•';
  }
}

function VoteBreakdownSubline({ event }: { event: MatchEvent }) {
  const voteMeta = event.metadata?.vote;
  if (!voteMeta || voteMeta.tallies.length === 0) return null;
  if (event.actionType !== 'VOTE_EXECUTION' && event.actionType !== 'VOTE_TALLY') return null;

  const parts = voteMeta.tallies.map((entry) => {
    const voterNames =
      entry.voters && entry.voters.length > 0
        ? ` (${entry.voters.map((v) => v.name).join(', ')})`
        : '';
    return `${entry.target.name}: ${entry.votes}${voterNames}`;
  });
  if (voteMeta.abstainVotes > 0) {
    parts.push(`Phiếu trắng: ${voteMeta.abstainVotes}`);
  }

  return <p className="tl-vote-breakdown">Chi tiết phiếu: {parts.join(' • ')}</p>;
}

interface CascadeNodeListProps {
  nodes: CascadeTreeNode[];
  selectedPlayerId: PlayerId | null;
  onSelectPlayer: (playerId: PlayerId) => void;
  depth?: number;
}

function CascadeNodeList({
  nodes,
  selectedPlayerId,
  onSelectPlayer,
  depth = 0,
}: CascadeNodeListProps) {
  return (
    <div className={depth === 0 ? 'tl-event-list' : 'tl-cascade-children'}>
      {nodes.map((node) => {
        const badge = getOutcomeBadge(node.event);
        return (
          <div key={node.event.id} className="tl-cascade-item">
            <article
              className={`tl-node-row${depth > 0 ? ' is-child' : ''}${
                node.event.outcome === 'SUCCESS' &&
                (node.event.actionType === 'ATTACK' ||
                  node.event.actionType === 'POISON' ||
                  node.event.actionType === 'VOTE_EXECUTION' ||
                  node.event.actionType === 'CASCADE_DEATH' ||
                  node.event.actionType === 'HUNTER_SHOT')
                  ? ' is-lethal'
                  : ''
              }`}
            >
              <span className="tl-node-icon" aria-hidden="true">
                {depth > 0 ? '↳' : getActionCategoryIcon(node.event)}
              </span>

              <div className="tl-node-body">
                {node.crossBlockParent && (
                  <p className="tl-cross-link">
                    ↳ {formatCrossLinkContext(node.crossBlockParent)}
                  </p>
                )}

                <p className="tl-node-line">
                  <TimelineRichText
                    event={node.event}
                    selectedPlayerId={selectedPlayerId}
                    onSelectPlayer={onSelectPlayer}
                  />
                </p>

                <VoteBreakdownSubline event={node.event} />
              </div>

              {badge && (
                <span className={`tl-outcome-badge tone-${badge.tone}`}>{badge.label}</span>
              )}
            </article>

            {node.children.length > 0 && (
              <CascadeNodeList
                nodes={node.children}
                selectedPlayerId={selectedPlayerId}
                onSelectPlayer={onSelectPlayer}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderStatBadges(badges: PhaseCardStatBadge[]) {
  if (badges.length === 0) return null;
  return (
    <div className="tl-card-badges">
      {badges.map((b, idx) => (
        <span key={idx} className={`tl-stat-chip tone-${b.tone}`}>
          {b.label}
        </span>
      ))}
    </div>
  );
}

export default function MatchTimeline({ postGame, publicView, gameKey }: MatchTimelineProps) {
  const [filterMode, setFilterMode] = useState<TimelineFilterMode>('all');
  const [selectedPlayerId, setSelectedPlayerId] = useState<PlayerId | null>(null);

  useEffect(() => {
    setFilterMode('all');
    setSelectedPlayerId(null);
  }, [gameKey]);

  const handleSelectPlayerFromEvent = (playerId: PlayerId) => {
    setFilterMode('player');
    setSelectedPlayerId(playerId);
  };

  const matchEvents = (postGame?.matchEvents ?? []).filter((e) => e.visibility !== 'SYSTEM_DEBUG');

  const playerChips: TimelinePlayerChipItem[] = (postGame?.allRoles ?? publicView?.players ?? []).map(
    (p) => ({
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
    })
  );

  // Fallback sang publicTimeline nếu chưa kết thúc ván hoặc ván không có matchEvents
  if (matchEvents.length === 0) {
    const publicItems = publicView?.publicTimeline ?? [];
    if (publicItems.length === 0) {
      return (
        <div className="tl-empty-state">
          <p>Chưa có diễn biến nào được ghi nhận.</p>
        </div>
      );
    }

    const roundMap = new Map<number, typeof publicItems>();
    for (const item of publicItems) {
      const list = roundMap.get(item.roundNumber) ?? [];
      list.push(item);
      roundMap.set(item.roundNumber, list);
    }

    return (
      <section className="summary-timeline" aria-label="Diễn biến công khai ván đấu">
        {Array.from(roundMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([roundNum, items]) => (
            <div key={roundNum} className="tl-phase-card tl-day-card">
              <div className="tl-card-header">
                <h3>{roundNum === 0 ? 'KHỞI ĐẦU' : `VÒNG ${roundNum}`}</h3>
              </div>
              <div className="tl-event-list">
                {items.map((item) => (
                  <article key={item.id} className="tl-node-row">
                    <span className="tl-node-icon" aria-hidden="true">
                      •
                    </span>
                    <div className="tl-node-body">
                      <p className="tl-node-line">{item.text}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
      </section>
    );
  }

  const allEventsById = new Map<string, MatchEvent>(matchEvents.map((e) => [e.id, e]));
  const rawSections = groupMatchEventsForTimeline(matchEvents);
  const rawRoundMap = new Map(rawSections.roundGroups.map((g) => [g.roundNumber, g]));

  const filteredEvents = filterMatchEvents(matchEvents, filterMode, selectedPlayerId);
  const filteredSections = groupMatchEventsForTimeline(filteredEvents);

  return (
    <section className="summary-timeline" aria-label="Dòng thời gian giải mã ván đấu">
      <TimelineFilterBar
        mode={filterMode}
        selectedPlayerId={selectedPlayerId}
        players={playerChips}
        totalCount={matchEvents.length}
        visibleCount={filteredEvents.length}
        onChangeMode={setFilterMode}
        onSelectPlayer={setSelectedPlayerId}
      />

      {filteredEvents.length === 0 ? (
        <div className="tl-empty-state">
          <p>Không có sự kiện nào khớp với bộ lọc hiện tại.</p>
          <button
            type="button"
            className="tl-empty-reset"
            onClick={() => {
              setFilterMode('all');
              setSelectedPlayerId(null);
            }}
          >
            Hiện toàn bộ nhật ký
          </button>
        </div>
      ) : (
        <div className="tl-timeline-track">
          {/* Card Khởi đầu (SETUP - Đêm 1) */}
          {filteredSections.setupEvents.length > 0 && (
            <section className="tl-phase-card tl-setup-card" aria-label="Khởi đầu Đêm 1">
              <header className="tl-card-header">
                <div className="tl-card-title-wrap">
                  <span className="tl-phase-icon" aria-hidden="true">
                    ✨
                  </span>
                  <h3>KHỞI ĐẦU — ĐÊM 1 (THIẾT LẬP)</h3>
                </div>
                <span className="tl-stat-chip tone-neutral">
                  {filteredSections.setupEvents.length} vai trò
                </span>
              </header>

              <CascadeNodeList
                nodes={buildCascadeTree(filteredSections.setupEvents, allEventsById)}
                selectedPlayerId={selectedPlayerId}
                onSelectPlayer={handleSelectPlayerFromEvent}
              />
            </section>
          )}

          {/* Các cặp Đêm N -> Ngày N */}
          {filteredSections.roundGroups.map((group) => {
            const rawGroup = rawRoundMap.get(group.roundNumber) ?? group;
            const hasNightBlock =
              group.nightActions.length > 0 ||
              group.nightIdleEvents.length > 0 ||
              group.dawnEvents.length > 0;
            const hasDayBlock = group.dayEvents.length > 0;

            return (
              <div key={group.roundNumber} className="tl-round-cluster">
                {hasNightBlock && (
                  <section
                    className="tl-phase-card tl-night-card"
                    aria-label={`Diễn biến Đêm ${group.roundNumber}`}
                  >
                    <header className="tl-card-header">
                      <div className="tl-card-title-wrap">
                        <span className="tl-phase-icon" aria-hidden="true">
                          🌙
                        </span>
                        <h3>ĐÊM {group.roundNumber}</h3>
                      </div>
                      {renderStatBadges(summarizeNightCardStats(rawGroup))}
                    </header>

                    {(group.nightActions.length > 0 || group.nightIdleEvents.length > 0) && (
                      <div className="tl-night-part">
                        <h4 className="tl-subhead">Phần 1 — Lượt hành động đêm</h4>
                        {group.nightActions.length > 0 && (
                          <CascadeNodeList
                            nodes={buildCascadeTree(group.nightActions, allEventsById)}
                            selectedPlayerId={selectedPlayerId}
                            onSelectPlayer={handleSelectPlayerFromEvent}
                          />
                        )}
                        {group.nightIdleEvents.length > 0 && (
                          <div className="tl-idle-notes">
                            {group.nightIdleEvents.map((idle) => (
                              <p key={idle.id} className="tl-idle-line">
                                <TimelineRichText
                                  event={idle}
                                  selectedPlayerId={selectedPlayerId}
                                  onSelectPlayer={handleSelectPlayerFromEvent}
                                />
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {group.dawnEvents.length > 0 && (
                      <div className="tl-dawn-callout">
                        <h4 className="tl-subhead">Phần 2 — Tổng kết bình minh</h4>
                        <CascadeNodeList
                          nodes={buildCascadeTree(group.dawnEvents, allEventsById)}
                          selectedPlayerId={selectedPlayerId}
                          onSelectPlayer={handleSelectPlayerFromEvent}
                        />
                      </div>
                    )}
                  </section>
                )}

                {hasDayBlock && (
                  <section
                    className="tl-phase-card tl-day-card"
                    aria-label={`Diễn biến Ngày ${group.roundNumber}`}
                  >
                    <header className="tl-card-header">
                      <div className="tl-card-title-wrap">
                        <span className="tl-phase-icon" aria-hidden="true">
                          ☀️
                        </span>
                        <h3>NGÀY {group.roundNumber}</h3>
                      </div>
                      {renderStatBadges(summarizeDayCardStats(rawGroup))}
                    </header>

                    <CascadeNodeList
                      nodes={buildCascadeTree(group.dayEvents, allEventsById)}
                      selectedPlayerId={selectedPlayerId}
                      onSelectPlayer={handleSelectPlayerFromEvent}
                    />
                  </section>
                )}
              </div>
            );
          })}

          {/* Card Kết thúc ván đấu (WIN / DRAW) */}
          {filteredSections.winEvent && (
            <section className="tl-phase-card tl-win-card" aria-label="Kết thúc ván đấu">
              <header className="tl-card-header">
                <div className="tl-card-title-wrap">
                  <span className="tl-phase-icon" aria-hidden="true">
                    🏆
                  </span>
                  <h3>KẾT THÚC VÁN ĐẤU</h3>
                </div>
                <span className="tl-stat-chip tone-safe">Kết cuộc</span>
              </header>
              <div className="tl-event-list">
                <article className="tl-node-row is-win-row">
                  <span className="tl-node-icon" aria-hidden="true">
                    🏁
                  </span>
                  <div className="tl-node-body">
                    <p className="tl-node-line">
                      <TimelineRichText
                        event={filteredSections.winEvent}
                        selectedPlayerId={selectedPlayerId}
                        onSelectPlayer={handleSelectPlayerFromEvent}
                      />
                    </p>
                  </div>
                </article>
              </div>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
