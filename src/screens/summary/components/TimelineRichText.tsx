import { formatMatchEventSegments, getFactionTone, getRoleNameVi } from '../../../engine/matchLogFormatter';
import type { MatchEvent, PlayerId } from '../../../engine/types';

export interface TimelineRichTextProps {
  event: MatchEvent;
  selectedPlayerId?: PlayerId | null;
  onSelectPlayer?: (playerId: PlayerId) => void;
}

export default function TimelineRichText({
  event,
  selectedPlayerId,
  onSelectPlayer,
}: TimelineRichTextProps) {
  const segments = formatMatchEventSegments(event, { mode: 'POST_GAME' });

  return (
    <span className="tl-rich-text">
      {segments.map((seg, idx) => {
        if (seg.type === 'text') {
          return <span key={idx}>{seg.value}</span>;
        }

        if (seg.type === 'player') {
          const factionTone = getFactionTone(seg.faction);
          const isSelected = Boolean(selectedPlayerId && selectedPlayerId === seg.playerId);
          const roleText = seg.showRole && seg.roleId ? getRoleNameVi(seg.roleId) : null;

          if (onSelectPlayer) {
            return (
              <button
                key={`${seg.playerId}-${idx}`}
                type="button"
                aria-pressed={isSelected}
                className={`tl-player-btn tl-faction-${factionTone}${isSelected ? ' is-selected-player' : ''}`}
                onClick={() => onSelectPlayer(seg.playerId)}
                title={`Lọc nhật ký theo ${seg.name}`}
              >
                <span className="tl-player-name">{seg.name}</span>
                {roleText && <span className="tl-player-role">({roleText})</span>}
              </button>
            );
          }

          return (
            <span
              key={`${seg.playerId}-${idx}`}
              className={`tl-player-btn is-static tl-faction-${factionTone}`}
            >
              <span className="tl-player-name">{seg.name}</span>
              {roleText && <span className="tl-player-role">({roleText})</span>}
            </span>
          );
        }

        return (
          <span key={idx} className={`tl-emphasis tl-tone-${seg.tone ?? 'muted'}`}>
            {seg.value}
          </span>
        );
      })}
    </span>
  );
}
