import type { TimelineFilterMode } from '../../../engine/matchLog';
import type { PlayerId } from '../../../engine/types';

export interface TimelinePlayerChipItem {
  id: PlayerId;
  name: string;
  seatIndex: number;
  roleId?: string;
  roleLabel?: string;
}

export interface TimelineFilterBarProps {
  mode: TimelineFilterMode;
  selectedPlayerId: PlayerId | null;
  players: TimelinePlayerChipItem[];
  totalCount: number;
  visibleCount: number;
  onChangeMode: (mode: TimelineFilterMode) => void;
  onSelectPlayer: (playerId: PlayerId | null) => void;
}

export default function TimelineFilterBar({
  mode,
  selectedPlayerId,
  players,
  totalCount,
  visibleCount,
  onChangeMode,
  onSelectPlayer,
}: TimelineFilterBarProps) {
  const sortedPlayers = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
  const activePlayer = selectedPlayerId
    ? sortedPlayers.find((p) => p.id === selectedPlayerId)
    : undefined;

  return (
    <div className="tl-filter-wrap">
      <div className="tl-filter-bar" role="group" aria-label="Bộ lọc nhật ký ván đấu">
        <button
          type="button"
          className={`tl-filter-pill${mode === 'all' ? ' is-active' : ''}`}
          aria-pressed={mode === 'all'}
          onClick={() => {
            onChangeMode('all');
            onSelectPlayer(null);
          }}
        >
          <span>Tất cả</span>
          <span className="tl-filter-count">{totalCount}</span>
        </button>

        <button
          type="button"
          className={`tl-filter-pill${mode === 'lethal' ? ' is-active' : ''}`}
          aria-pressed={mode === 'lethal'}
          onClick={() => {
            onChangeMode('lethal');
            onSelectPlayer(null);
          }}
        >
          <span>Chỉ án mạng &amp; Treo cổ</span>
        </button>

        <button
          type="button"
          className={`tl-filter-pill${mode === 'player' ? ' is-active' : ''}`}
          aria-pressed={mode === 'player'}
          onClick={() => {
            if (mode === 'player') {
              onChangeMode('all');
              onSelectPlayer(null);
            } else {
              onChangeMode('player');
              if (!selectedPlayerId && sortedPlayers[0]) {
                onSelectPlayer(sortedPlayers[0].id);
              }
            }
          }}
        >
          <span>
            {mode === 'player' && activePlayer ? `Người: ${activePlayer.name}` : 'Theo người chơi'}
          </span>
        </button>
      </div>

      {mode === 'player' && sortedPlayers.length > 0 && (
        <div className="tl-player-chips" role="listbox" aria-label="Chọn người chơi để lọc">
          {sortedPlayers.map((p) => {
            const isSelected = selectedPlayerId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`tl-player-chip${isSelected ? ' is-active' : ''}`}
                onClick={() => onSelectPlayer(p.id)}
              >
                <span className="tl-chip-seat">#{String(p.seatIndex).padStart(2, '0')}</span>
                <span>{p.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {mode !== 'all' && (
        <div className="tl-filter-status">
          <span>
            Hiển thị {visibleCount}/{totalCount} sự kiện
          </span>
          <button
            type="button"
            className="tl-filter-reset"
            title="Bấm để xóa bộ lọc"
            onClick={() => {
              onChangeMode('all');
              onSelectPlayer(null);
            }}
          >
            {mode === 'player' && activePlayer
              ? `Đang lọc: ${activePlayer.name}${activePlayer.roleLabel ? ` (${activePlayer.roleLabel})` : ''} ×`
              : mode === 'lethal'
              ? 'Đang lọc: Chỉ án mạng & Treo cổ ×'
              : 'Đang lọc: Theo người chơi ×'}
          </button>
        </div>
      )}
    </div>
  );
}
