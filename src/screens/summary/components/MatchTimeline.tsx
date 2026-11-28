import { useEffect, useState } from 'react';
import {
  buildCascadeTree,
  consolidateRoundEventsForPostGame,
  filterMatchEvents,
  formatCrossLinkContext,
  formatPostGameRoleLabel,
  groupMatchEventsForTimeline,
  type CascadeTreeNode,
  type TimelineFilterMode,
} from '../../../engine/matchLog';
import { getOutcomeBadge } from '../../../engine/matchLogFormatter';
import type { MatchEvent, PlayerId, PublicMatchLogItem } from '../../../engine/types';
import type { PostGameView, PublicRoomView } from '../../../server/types';
import TimelineFilterBar, { type TimelinePlayerChipItem } from './TimelineFilterBar';
import TimelineRichText from './TimelineRichText';

export interface MatchTimelineProps {
  postGame: PostGameView | null;
  publicView: PublicRoomView | null;
  gameKey: string;
}

const VOTE_BREAKDOWN_ACTIONS = new Set<MatchEvent['actionType']>([
  'VOTE_EXECUTION',
  'VOTE_TALLY',
  'VOTE_SURVIVED_REVEAL',
  'MAYOR_ELECTED',
  'MAYOR_TIE',
]);

function VoteBreakdownSubline({ event }: { event: MatchEvent }) {
  const voteMeta = event.metadata?.vote;
  if (!voteMeta || voteMeta.tallies.length === 0) return null;
  if (!VOTE_BREAKDOWN_ACTIONS.has(event.actionType)) return null;
  if (
    (event.actionType === 'VOTE_EXECUTION' || event.actionType === 'VOTE_SURVIVED_REVEAL') &&
    voteMeta.executionStep === 2
  ) {
    return null;
  }

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
              {depth > 0 && (
                <span className="tl-node-icon" aria-hidden="true">
                  ↳
                </span>
              )}

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

  const playerChips: TimelinePlayerChipItem[] = postGame?.allRoles?.length
    ? postGame.allRoles.map((p) => ({
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
        roleId: p.finalRoleId,
        roleLabel: formatPostGameRoleLabel(p.initialRoleId, p.finalRoleId, p.drunkRealRoleId),
      }))
    : (publicView?.players ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
      }));

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

    const sortedPublicItems = [...publicItems].sort((a, b) => a.seq - b.seq);
    const publicGroupMap = new Map<
      string,
      { label: string; isNight: boolean; items: PublicMatchLogItem[] }
    >();
    for (const item of sortedPublicItems) {
      const key =
        item.roundNumber === 0
          ? 'setup-0'
          : item.stage === 'DAY_ANNOUNCEMENT'
          ? `night-${item.roundNumber}`
          : `day-${item.roundNumber}`;
      const label =
        item.roundNumber === 0
          ? 'KHỞI ĐẦU'
          : item.stage === 'DAY_ANNOUNCEMENT'
          ? `ĐÊM ${item.roundNumber}`
          : `NGÀY ${item.roundNumber}`;
      const isNight = item.roundNumber > 0 && item.stage === 'DAY_ANNOUNCEMENT';
      const existing = publicGroupMap.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        publicGroupMap.set(key, { label, isNight, items: [item] });
      }
    }

    return (
      <section className="summary-timeline" aria-label="Diễn biến công khai ván đấu">
        {Array.from(publicGroupMap.entries()).map(([groupKey, group]) => (
          <div
            key={groupKey}
            className={`tl-phase-card ${group.isNight ? 'tl-night-card' : 'tl-day-card'}`}
          >
            <div className="tl-card-header">
              <h3>{group.label}</h3>
            </div>
            <div className="tl-event-list">
              {group.items.map((item) => (
                <article key={item.id} className="tl-node-row">
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
                <h3>ĐÊM 1 · THIẾT LẬP</h3>
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
            const nightConsolidated = consolidateRoundEventsForPostGame(group);
            const hasNightBlock =
              nightConsolidated.length > 0 || group.nightIdleEvents.length > 0;
            const hasDayBlock = group.dayEvents.length > 0;

            return (
              <div key={group.roundNumber} className="tl-round-cluster">
                {hasNightBlock && (
                  <section
                    className="tl-phase-card tl-night-card"
                    aria-label={`Diễn biến Đêm ${group.roundNumber}`}
                  >
                    <header className="tl-card-header">
                      <h3>ĐÊM {group.roundNumber}</h3>
                    </header>

                    {nightConsolidated.length > 0 && (
                      <CascadeNodeList
                        nodes={buildCascadeTree(nightConsolidated, allEventsById)}
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
                  </section>
                )}

                {hasDayBlock && (
                  <section
                    className="tl-phase-card tl-day-card"
                    aria-label={`Diễn biến Ngày ${group.roundNumber}`}
                  >
                    <header className="tl-card-header">
                      <h3>NGÀY {group.roundNumber}</h3>
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
                <h3>KẾT QUẢ</h3>
              </header>
              <div className="tl-event-list">
                <article className="tl-node-row is-win-row">
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
