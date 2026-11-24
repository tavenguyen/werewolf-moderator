import { useState } from 'react';
import type { ScreenName } from '../../navigation';
import { useGameSession } from '../../adapters/useGameSession';
import { ROLES_BY_ID } from '../../engine/roles';
import './reveal.css';

type Props = {
  onNavigate?: (screen: ScreenName) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
};

export default function RoleRevealScreen({ onOpenRules }: Props) {
  const { state, actions } = useGameSession();

  const publicView = state.publicView;
  const privateView = state.privateView;
  const players = [...(publicView?.players ?? [])].sort((a, b) => a.seatIndex - b.seatIndex);
  const totalCount = players.length;

  // Xác định người chơi hiện tại đang xem
  const activePlayerId = state.playerId || privateView?.playerId || players[0]?.id;
  const currentIndex = Math.max(
    0,
    players.findIndex((p) => p.id === activePlayerId)
  );
  const currentPlayer = players[currentIndex] ?? {
    id: 'p1',
    name: 'Người chơi 1',
    seatIndex: 1,
    isAlive: true,
  };

  // Trạng thái giữ bài để lật & bảo vệ quyền riêng tư khi chuyền máy
  const [isHolding, setIsHolding] = useState(false);
  const [isReadyForPlayer, setIsReadyForPlayer] = useState(false);
  const [viewedSeatIndices, setViewedSeatIndices] = useState<Set<number>>(new Set());

  // Thông tin vai trò
  const myRoleId = privateView?.roleId ?? 'villager';
  const roleDef = ROLES_BY_ID[myRoleId] ?? {
    id: myRoleId,
    nameVi: 'Dân làng',
    nameEn: 'Villager',
    faction: 'VILLAGER' as const,
    shortDesc: 'Bạn là dân làng lương thiện. Hãy dùng suy luận để tìm ra Ma Sói.',
  };

  const isLastPlayer = currentIndex >= totalCount - 1;
  const nextPlayer = !isLastPlayer ? players[currentIndex + 1] : null;

  // Xử lý giữ để lật bài
  const handlePointerDown = () => {
    setIsHolding(true);
    setViewedSeatIndices((prev) => new Set(prev).add(currentPlayer.seatIndex));
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(20);
      } catch {
        // ignore
      }
    }
  };

  const handlePointerUp = () => {
    setIsHolding(false);
  };

  // Chuyển sang người tiếp theo
  const handleNextPlayer = () => {
    if (nextPlayer) {
      setIsHolding(false);
      setIsReadyForPlayer(false);
      actions.setLocalActivePlayer(nextPlayer.id);
    }
  };

  // Bắt đầu Đêm 1
  const handleStartNight = async () => {
    if (actions.startFirstNight) {
      await actions.startFirstNight();
    }
  };

  // Icon đại diện theo vai
  const getRoleIcon = (roleId: string, faction: string) => {
    if (faction === 'WEREWOLF') return '🐺';
    switch (roleId) {
      case 'seer':
        return '🔮';
      case 'witch':
        return '🧪';
      case 'bodyguard':
        return '⚔️';
      case 'hunter':
        return '🎯';
      case 'cupid':
        return '🏹';
      case 'elder':
        return '👴';
      case 'village_idiot':
        return '🤡';
      case 'lycan':
        return '🐾';
      case 'mason':
        return '🏛️';
      case 'wild_child':
        return '👶';
      case 'doppelganger':
        return '👥';
      case 'drunk':
        return '🍺';
      case 'tanner':
        return '🎭';
      case 'white_wolf':
        return '🐺❄️';
      case 'pied_piper':
        return '🎵';
      case 'cult_leader':
        return '🕯️';
      default:
        return '🛡️';
    }
  };

  return (
    <main className="reveal-screen" onContextMenu={(e) => e.preventDefault()}>
      {/* Header */}
      <header className="reveal-header">
        <div className="reveal-title-group">
          <h1>Chuyền Máy Xem Vai</h1>
          <p>Lần lượt từng người xem bí mật trước khi vào Đêm 1</p>
        </div>
        <button
          type="button"
          className="reveal-rules-btn"
          onClick={() => onOpenRules?.('roles')}
          title="Xem mô tả chi tiết tất cả vai trò"
        >
          📖 Luật & Vai
        </button>
      </header>

      {/* Thanh tiến trình ghế ngồi 1..N */}
      <nav className="reveal-stepper" aria-label="Danh sách ghế người chơi">
        {players.map((p) => {
          const isCurrent = p.seatIndex === currentPlayer.seatIndex;
          const isViewed = viewedSeatIndices.has(p.seatIndex);
          return (
            <button
              key={p.id}
              type="button"
              className={`stepper-dot ${isCurrent ? 'is-current' : ''} ${
                isViewed ? 'is-viewed' : ''
              }`}
              onClick={() => {
                actions.setLocalActivePlayer(p.id);
                setIsReadyForPlayer(false);
                setIsHolding(false);
              }}
              title={`Ghế #${p.seatIndex} - ${p.name}`}
            >
              {p.seatIndex}
            </button>
          );
        })}
      </nav>

      {/* 1. Màn hình Chuyền Máy (Bảo vệ tính riêng tư) */}
      {!isReadyForPlayer ? (
        <section className="handover-shield">
          <div className="handover-icon-glow" aria-hidden="true">
            📱🔄
          </div>
          <span className="handover-lead">Hãy chuyền điện thoại cho:</span>
          <h2 className="handover-player-name">{currentPlayer.name}</h2>
          <span className="handover-seat-tag">Ghế #{currentPlayer.seatIndex}</span>

          <p className="handover-warning">
            ⚠️ <strong>Bảo mật thân phận:</strong> Những người khác vui lòng không nhìn vào màn hình
            hoặc nhắm mắt lại.
          </p>

          <button
            type="button"
            className="handover-ready-btn"
            onClick={() => setIsReadyForPlayer(true)}
          >
            Tôi là {currentPlayer.name} ➔ Sẵn sàng xem vai
          </button>
        </section>
      ) : (
        /* 2. Màn hình Lá Bài 3D (Bấm giữ để lật lên, thả ra tự úp) */
        <section className="card-section">
          <div className="card-target-banner">
            <span>Đang xem vai:</span>
            <h2>
              #{currentPlayer.seatIndex} {currentPlayer.name}
            </h2>
          </div>

          <div
            className="reveal-card-container"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
            role="button"
            tabIndex={0}
            aria-label="Nhấn giữ để lật bài xem vai"
          >
            <div className={`reveal-card-inner ${isHolding ? 'is-flipped' : ''}`}>
              {/* Mặt sau: Lá bài úp */}
              <div className="reveal-card-face reveal-card-back">
                <div className="card-back-frame">
                  <div className="card-back-crest" aria-hidden="true">
                    🌕🐺
                  </div>
                  <h3 className="card-hold-prompt">Bấm & Giữ Để Lật Bài</h3>
                  <p className="card-hold-sub">(Thả tay ra bài sẽ tự động úp lại)</p>

                  <div className="card-press-indicator">
                    <span aria-hidden="true">👆</span>
                    <span>Chạm và giữ ngón tay vào đây</span>
                  </div>
                </div>
              </div>

              {/* Mặt trước: Lá bài ngửa hiển thị vai */}
              <div className={`reveal-card-face reveal-card-front faction-${roleDef.faction}`}>
                <span className="card-front-faction-badge">
                  {roleDef.faction === 'WEREWOLF'
                    ? 'PHE MA SÓI'
                    : roleDef.faction === 'THIRD_PARTY'
                    ? 'PHE THỨ BA'
                    : 'PHE DÂN LÀNG'}
                </span>

                <div className="card-front-icon" aria-hidden="true">
                  {getRoleIcon(myRoleId, roleDef.faction)}
                </div>

                <h3 className="card-front-title">{roleDef.nameVi}</h3>
                <span className="card-front-subtitle">{roleDef.nameEn}</span>

                <p className="card-front-desc">{roleDef.shortDesc}</p>

                {/* Thông tin đặc thù bổ sung */}
                {myRoleId === 'mason' && (
                  <div className="card-front-extra">
                    <strong>HỘI TAM ĐIỂM: </strong>
                    <span>
                      {privateView?.skills?.masonPartnerIds &&
                      privateView.skills.masonPartnerIds.length > 0
                        ? privateView.skills.masonPartnerIds
                            .map((id) => {
                              const p = players.find((pl) => pl.id === id);
                              return p ? `#${p.seatIndex} ${p.name}` : id;
                            })
                            .join(', ')
                        : 'Bạn là thành viên Hội Tam Điểm duy nhất.'}
                    </span>
                  </div>
                )}

                {myRoleId === 'wild_child' && privateView?.skills?.roleModelId && (
                  <div className="card-front-extra">
                    <strong>THẦN TƯỢNG: </strong>
                    <span>
                      {(() => {
                        const idol = players.find(
                          (pl) => pl.id === privateView.skills?.roleModelId
                        );
                        return idol ? `#${idol.seatIndex} ${idol.name}` : 'Chưa chỉ định';
                      })()}
                    </span>
                  </div>
                )}

                <span className="card-front-footer-note">Thả tay ra để úp bài lại</span>
              </div>
            </div>
          </div>

          {/* Nút hành động phía dưới */}
          <div className="reveal-bottom-actions">
            {!isLastPlayer && nextPlayer ? (
              <button
                type="button"
                className="reveal-next-btn"
                onClick={handleNextPlayer}
              >
                Đã nhớ vai ➔ Chuyền cho #{nextPlayer.seatIndex} {nextPlayer.name}
              </button>
            ) : (
              <button
                type="button"
                className="reveal-next-btn start-night-btn"
                onClick={handleStartNight}
              >
                Tất cả đã ghi nhớ vai ➔ Bắt đầu Đêm 1 🌙
              </button>
            )}
            <p className="reveal-hint-text">
              {viewedSeatIndices.has(currentPlayer.seatIndex)
                ? '✓ Bạn đã xem vai trò. Hãy ghi nhớ thân phận trước khi chuyền máy.'
                : 'Hãy chạm giữ để xem bài của bạn trước khi bấm tiếp tục.'}
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
