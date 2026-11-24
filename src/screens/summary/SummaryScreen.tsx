import { useState } from 'react';
import type { ScreenName } from '../../navigation';
import { useGameSession } from '../../adapters/useGameSession';
import { ROLES_BY_ID } from '../../engine/roles';
import './summary.css';

type SummaryScreenProps = {
  onNavigate?: (screen: ScreenName) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
};

interface RoleDisplayItem {
  id: string;
  name: string;
  seatIndex: number;
  initialRoleName: string;
  finalRoleName: string;
  symbol: string;
  status: string;
  side: 'wolf' | 'village' | 'third';
  sideName: string;
  isAlive: boolean;
}

export default function SummaryScreen({ onNavigate }: SummaryScreenProps) {
  const { state, actions } = useGameSession();

  const postGame = state.postGameView;
  const publicView = state.publicView;
  const roomCode = state.roomCode || '7290';

  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'cards' | 'timeline'>('cards');
  const [notice, setNotice] = useState('');

  // Chuẩn bị danh sách vai trò người chơi
  const rolesList: RoleDisplayItem[] = (() => {
    if (postGame && postGame.allRoles && postGame.allRoles.length > 0) {
      return postGame.allRoles.map((p) => {
        const initDef = ROLES_BY_ID[p.initialRoleId];
        const finalDef = ROLES_BY_ID[p.finalRoleId];
        const side =
          p.faction === 'WEREWOLF' ? 'wolf' : p.faction === 'THIRD_PARTY' ? 'third' : 'village';
        const sideName = side === 'wolf' ? 'Phe Ma Sói' : side === 'third' ? 'Phe Thứ 3' : 'Phe Dân Làng';
        const symbol =
          side === 'wolf' ? '🐺' : p.finalRoleId === 'seer' ? '🔮' : p.finalRoleId === 'witch' ? '🧪' : p.finalRoleId === 'hunter' ? '🎯' : '🛡️';
        return {
          id: p.id,
          name: p.name,
          seatIndex: p.seatIndex,
          initialRoleName: initDef?.nameVi ?? p.initialRoleId,
          finalRoleName: finalDef?.nameVi ?? p.finalRoleId,
          symbol,
          status: p.isAlive ? 'CÒN SỐNG' : 'ĐÃ TỬ VONG',
          side,
          sideName,
          isAlive: p.isAlive,
        };
      });
    }

    // Fallback nếu chưa kết thúc ván
    const currentPlayers = publicView?.players ?? [];
    return currentPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
      initialRoleName: 'Chưa công bố',
      finalRoleName: 'Chưa công bố',
      symbol: '❓',
      status: p.isAlive ? 'CÒN SỐNG' : 'ĐÃ TỬ VONG',
      side: 'village' as const,
      sideName: 'Bí Mật',
      isAlive: p.isAlive,
    }));
  })();

  const winner = postGame?.winOutcome?.winner;
  const isWolfWin = winner === 'WEREWOLF';
  const isCoupleWin = winner === 'COUPLE';

  const flip = (id: string) => {
    setOpenCards((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const revealAll = () => {
    if (openCards.size < rolesList.length) {
      setOpenCards(new Set(rolesList.map((p) => p.id)));
    } else {
      setOpenCards(new Set());
    }
  };

  const allRevealed = openCards.size === rolesList.length;

  const handleRematch = async () => {
    if (!state.isHost) {
      setNotice('Chỉ Quản trò (Host) mới có quyền bấm Tái đấu.');
      return;
    }

    try {
      await actions.hostRematch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi khởi động ván mới';
      setNotice(msg);
    }
  };

  const handleExit = async () => {
    await actions.leaveRoom();
    onNavigate?.('home');
  };

  return (
    <main className="summary-screen">
      <header className="summary-header">
        <div className="summary-header-title">
          <i aria-hidden="true" />
          <strong>GIẢI MÃ VÁN ĐẤU <span>• PHÒNG #{roomCode}</span></strong>
        </div>
        <span className="summary-badge-complete">HOÀN TẤT VÁN ĐẤU</span>
      </header>

      <div className="summary-content">
        {/* Victory Banner */}
        <section className={`summary-winner ${isWolfWin ? 'wolf-victory' : isCoupleWin ? 'couple-victory' : 'village-victory'}`}>
          <div className="summary-trophy-wrap" aria-hidden="true">
            <span className="summary-trophy">{isWolfWin ? '🐺' : isCoupleWin ? '💘' : '☀️'}</span>
          </div>
          <div className="summary-winner-copy">
            <span className="winner-eyebrow">PHE CHIẾN THẮNG CHUNG CUỘC</span>
            <h1>
              {isWolfWin
                ? 'BẦY MA SÓI THỐNG TRỊ!'
                : isCoupleWin
                ? 'CẶP ĐÔI TÌNH YÊU CHIẾN THẮNG!'
                : 'THÔN BẢN TOÀN THẮNG!'}
            </h1>
            <p>
              {postGame?.winOutcome?.reason ||
                'Ván đấu kết thúc. Toàn bộ bí mật bóng đêm đã được đưa ra ánh sáng.'}
            </p>
          </div>
          <button className="summary-reveal-all" onClick={revealAll}>
            {allRevealed ? 'ÚP TOÀN BÀN' : 'LẬT TOÀN BÀN ✦'}
          </button>
        </section>

        {notice && <p className="screen-notice" role="status" style={{ margin: '12px auto' }}>{notice}</p>}

        {/* Tabs */}
        <div className="summary-tabs" role="tablist" aria-label="Nội dung tổng kết">
          <button
            role="tab"
            aria-selected={tab === 'cards'}
            className={tab === 'cards' ? 'active' : ''}
            onClick={() => setTab('cards')}
          >
            <span aria-hidden="true">🎴</span>
            <span>THẺ BÀI HUYỀN BÍ ({openCards.size}/{rolesList.length})</span>
          </button>
          <button
            role="tab"
            aria-selected={tab === 'timeline'}
            className={tab === 'timeline' ? 'active' : ''}
            onClick={() => setTab('timeline')}
          >
            <span aria-hidden="true">📜</span>
            <span>BIÊN NIÊN SỬ VÁN ĐẤU</span>
          </button>
        </div>

        {tab === 'cards' ? (
          <section className="summary-cards" aria-label="Vai trò người chơi">
            {rolesList.map((player, index) => {
              const isOpen = openCards.has(player.id);
              return (
                <button
                  key={player.id}
                  className={`summary-card ${isOpen ? 'is-open' : ''}`}
                  onClick={() => flip(player.id)}
                  aria-pressed={isOpen}
                  aria-label={`${isOpen ? 'Ẩn' : 'Lật'} thẻ bài của ${player.name}`}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <span className="summary-card-inner">
                    {/* Front Face: Rustic Tarot Card Back */}
                    <span className="summary-card-face summary-card-front">
                      <div className="tarot-card-border">
                        <span className="tarot-corner tl" />
                        <span className="tarot-corner tr" />
                        <span className="tarot-corner bl" />
                        <span className="tarot-corner br" />
                        <small className="card-seat-tag">GHẾ #{String(player.seatIndex).padStart(2, '0')}</small>
                        <div className="tarot-emblem" aria-hidden="true">☾</div>
                        <b className="card-player-name">{player.name}</b>
                        <small className="summary-card-hint">CHẠM ĐỂ GIẢI MÃ</small>
                      </div>
                    </span>

                    {/* Back Face: Revealed Secret Role */}
                    <span className={`summary-card-face summary-card-back side-${player.side}`}>
                      <div className="role-revealed-wrap">
                        <span className="role-side-tag">{player.sideName}</span>
                        <div className="role-symbol-display" aria-hidden="true">
                          {player.symbol}
                        </div>
                        <b className="role-title-display">{player.finalRoleName}</b>
                        {player.initialRoleName !== player.finalRoleName && (
                          <small className="initial-role-tag">Ban đầu: {player.initialRoleName}</small>
                        )}
                        <span className={`status-pill ${player.isAlive ? 'status-alive' : 'status-dead'}`}>
                          {player.status}
                        </span>
                      </div>
                    </span>
                  </span>
                </button>
              );
            })}
          </section>
        ) : (
          <section className="summary-timeline" aria-label="Diễn biến ván đấu">
            {(postGame?.historyLogs ?? publicView?.publicLogs ?? []).map((log, index) => (
              <article key={index} className="timeline-event">
                <i className="timeline-dot night-dot" aria-hidden="true" />
                <div className="timeline-heading">
                  <strong>SỰ KIỆN #{index + 1}</strong>
                </div>
                <p>{log}</p>
              </article>
            ))}
          </section>
        )}
      </div>

      <footer className="summary-footer">
        {state.isHost ? (
          <button className="summary-rematch" onClick={handleRematch}>
            <span className="rematch-icon" aria-hidden="true">🎲</span>
            <span>ĐẢO BÀI &amp; TÁI ĐẤU (REMATCH)</span>
          </button>
        ) : (
          <span className="summary-waiting-rematch">Đang đợi Host bắt đầu ván mới...</span>
        )}
        <button
          className="summary-exit"
          onClick={handleExit}
          aria-label="Rời phòng về cổng làng"
          title="Rời phòng về cổng làng"
        >
          ⟵
        </button>
      </footer>
    </main>
  );
}
