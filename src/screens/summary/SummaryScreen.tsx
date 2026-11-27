import { useEffect, useRef, useState } from 'react';
import type { ScreenName } from '../../navigation';
import { useGameSession } from '../../adapters/useGameSession';
import { ROLES_BY_ID } from '../../engine/roles';
import { getRoleImage } from '../../assets/roles';
import type { WinOutcome } from '../../engine/types';
import './summary.css';

interface WinnerBannerConfig {
  className: string;
  icon: string;
  eyebrow: string;
  title: string;
}

const WINNER_BANNER_MAP: Record<NonNullable<WinOutcome['winner']>, WinnerBannerConfig> = {
  WEREWOLF: {
    className: 'wolf-victory',
    icon: '🐺',
    eyebrow: 'PHE THẮNG CUỘC',
    title: 'PHE MA SÓI CHIẾN THẮNG!',
  },
  VILLAGER: {
    className: 'village-victory',
    icon: '☀️',
    eyebrow: 'PHE THẮNG CUỘC',
    title: 'PHE DÂN LÀNG CHIẾN THẮNG!',
  },
  COUPLE: {
    className: 'couple-victory',
    icon: '💘',
    eyebrow: 'PHE THẮNG CUỘC',
    title: 'CẶP ĐÔI CHIẾN THẮNG!',
  },
  TANNER: {
    className: 'third-victory',
    icon: '🎭',
    eyebrow: 'PHE THỨ 3 THẮNG CUỘC',
    title: 'KẺ CHÁN ĐỜI CHIẾN THẮNG!',
  },
  PIED_PIPER: {
    className: 'third-victory',
    icon: '🎵',
    eyebrow: 'PHE THỨ 3 THẮNG CUỘC',
    title: 'NGƯỜI THỔI SÁO CHIẾN THẮNG!',
  },
  CULT_LEADER: {
    className: 'third-victory',
    icon: '🕯️',
    eyebrow: 'PHE THỨ 3 THẮNG CUỘC',
    title: 'CHỦ GIÁO PHÁI CHIẾN THẮNG!',
  },
  ANGEL: {
    className: 'third-victory',
    icon: '👼',
    eyebrow: 'PHE THỨ 3 THẮNG CUỘC',
    title: 'THIÊN THẦN CHIẾN THẮNG!',
  },
  WHITE_WOLF: {
    className: 'third-victory',
    icon: '🐺❄️',
    eyebrow: 'PHE THỨ 3 THẮNG CUỘC',
    title: 'SÓI TRẮNG CHIẾN THẮNG!',
  },
  LONE_WOLF: {
    className: 'third-victory',
    icon: '🐺🌙',
    eyebrow: 'PHE THỨ 3 THẮNG CUỘC',
    title: 'SÓI CÔ ĐỘC CHIẾN THẮNG!',
  },
  HOODLUM: {
    className: 'third-victory',
    icon: '🗡️',
    eyebrow: 'PHE THỨ 3 THẮNG CUỘC',
    title: 'CÔN ĐỒ CHIẾN THẮNG!',
  },
  DRAW: {
    className: 'draw-victory',
    icon: '⚖️',
    eyebrow: 'KẾT QUẢ VÁN ĐẤU',
    title: 'HÒA CẢ LÀNG!',
  },
};

const DEFAULT_WINNER_BANNER: WinnerBannerConfig = {
  className: 'draw-victory',
  icon: '🏁',
  eyebrow: 'KẾT QUẢ VÁN ĐẤU',
  title: 'VÁN ĐẤU ĐÃ KẾT THÚC',
};

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
  finalRoleId: string;
  symbol: string;
  status: string;
  side: 'wolf' | 'village' | 'third';
  sideName: string;
  isAlive: boolean;
}

export default function SummaryScreen({ onNavigate, onOpenRules }: SummaryScreenProps) {
  const { state, actions } = useGameSession();

  const postGame = state.postGameView;
  const publicView = state.publicView;
  const roomCode = state.roomCode || '7290';

  const enteredAtRef = useRef(Date.now());
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'cards' | 'timeline'>('cards');
  const [notice, setNotice] = useState('');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [showEarlyRematchConfirm, setShowEarlyRematchConfirm] = useState(false);
  const [isRematching, setIsRematching] = useState(false);

  useEffect(() => {
    if (!showEarlyRematchConfirm) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isRematching) {
        setShowEarlyRematchConfirm(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showEarlyRematchConfirm, isRematching]);

  // Chuẩn bị danh sách vai trò người chơi
  const rolesList: RoleDisplayItem[] = (() => {
    if (postGame && postGame.allRoles && postGame.allRoles.length > 0) {
      return postGame.allRoles.map((p) => {
        const initDef = ROLES_BY_ID[p.initialRoleId];
        const finalDef = ROLES_BY_ID[p.finalRoleId];
        const side =
          p.faction === 'WEREWOLF' ? 'wolf' : p.faction === 'THIRD_PARTY' ? 'third' : 'village';
        const sideName = side === 'wolf' ? 'Phe Ma Sói' : side === 'third' ? 'Phe Thứ 3' : 'Phe Dân làng';
        const symbol =
          side === 'wolf'
            ? '🐺'
            : side === 'third'
            ? p.finalRoleId === 'white_wolf'
              ? '🐺❄️'
              : p.finalRoleId === 'tanner'
              ? '🎭'
              : '🕯️'
            : p.finalRoleId === 'seer'
            ? '🔮'
            : p.finalRoleId === 'witch'
            ? '🧪'
            : p.finalRoleId === 'hunter'
            ? '🎯'
            : '🛡️';
        return {
          id: p.id,
          name: p.name,
          seatIndex: p.seatIndex,
          initialRoleName: initDef?.nameVi ?? p.initialRoleId,
          finalRoleName: finalDef?.nameVi ?? p.finalRoleId,
          finalRoleId: p.finalRoleId,
          symbol,
          status: p.isAlive ? 'Còn sống' : 'Đã chết',
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
      finalRoleId: '',
      symbol: '❓',
      status: p.isAlive ? 'Còn sống' : 'Đã chết',
      side: 'village' as const,
      sideName: 'Bí mật',
      isAlive: p.isAlive,
    }));
  })();

  const winner = postGame?.winOutcome?.winner;
  const winnerBanner = winner ? WINNER_BANNER_MAP[winner] : DEFAULT_WINNER_BANNER;

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

  const executeRematch = async () => {
    if (isRematching) return;
    setIsRematching(true);
    setNotice('');
    try {
      await actions.hostRematch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể bắt đầu ván mới lúc này';
      setNotice(msg);
      setIsRematching(false);
    } finally {
      setShowEarlyRematchConfirm(false);
    }
  };

  const handleRematch = async () => {
    if (!state.isHost) {
      setNotice('Chỉ quản trò mới có thể bắt đầu ván mới.');
      return;
    }

    if (Date.now() - enteredAtRef.current < 5000) {
      setShowEarlyRematchConfirm(true);
      return;
    }

    await executeRematch();
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
          <strong>KẾT QUẢ VÁN ĐẤU <span>• PHÒNG #{roomCode}</span></strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {onOpenRules && (
            <button
              type="button"
              onClick={() => onOpenRules('roles')}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.16)',
                color: '#e2e8f0',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              📜 Luật &amp; Vai trò
            </button>
          )}
          <span className="summary-badge-complete">VÁN ĐÃ KẾT THÚC</span>
        </div>
      </header>

      <div className="summary-content">
        {/* Victory Banner */}
        <section className={`summary-winner ${winnerBanner.className}`}>
          <div className="summary-trophy-wrap" aria-hidden="true">
            <span className="summary-trophy">{winnerBanner.icon}</span>
          </div>
          <div className="summary-winner-copy">
            <span className="winner-eyebrow">{winnerBanner.eyebrow}</span>
            <h1>{winnerBanner.title}</h1>
            <p>
              {postGame?.winOutcome?.reason ||
                'Ván đấu đã kết thúc. Toàn bộ vai trò trong làng đã được hé lộ.'}
            </p>
          </div>
          <button className="summary-reveal-all" onClick={revealAll}>
            {allRevealed ? 'ÚP TẤT CẢ' : 'LẬT TẤT CẢ ✦'}
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
            <span>THẺ BÀI ({openCards.size}/{rolesList.length})</span>
          </button>
          <button
            role="tab"
            aria-selected={tab === 'timeline'}
            className={tab === 'timeline' ? 'active' : ''}
            onClick={() => setTab('timeline')}
          >
            <span aria-hidden="true">📜</span>
            <span>DIỄN BIẾN VÁN ĐẤU</span>
          </button>
        </div>

        {tab === 'cards' ? (
          <section className="summary-cards" aria-label="Vai trò người chơi">
            {rolesList.map((player, index) => {
              const isOpen = openCards.has(player.id);
              const roleImage = player.finalRoleId ? getRoleImage(player.finalRoleId) : undefined;
              const imgErrorKey = `${player.id}:${player.finalRoleId}`;
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
                    <span className="summary-card-face summary-card-front" aria-hidden={isOpen}>
                      <span className="tarot-card-border">
                        <span className="tarot-corner tl" />
                        <span className="tarot-corner tr" />
                        <span className="tarot-corner bl" />
                        <span className="tarot-corner br" />
                        <small className="card-seat-tag">GHẾ #{String(player.seatIndex).padStart(2, '0')}</small>
                        <span className="tarot-emblem" aria-hidden="true">☾</span>
                        <b className="card-player-name">{player.name}</b>
                        <small className="summary-card-hint">CHẠM ĐỂ LẬT BÀI</small>
                      </span>
                    </span>

                    {/* Back Face: Revealed Secret Role */}
                    <span className={`summary-card-face summary-card-back side-${player.side}`} aria-hidden={!isOpen}>
                      <span className="role-revealed-wrap">
                        <span className="role-side-tag">{player.sideName}</span>
                        <span className="role-symbol-display" aria-hidden="true">
                          {roleImage && !failedImages[imgErrorKey] ? (
                            <img
                              src={roleImage}
                              alt=""
                              className="summary-role-img"
                              loading="lazy"
                              decoding="async"
                              draggable={false}
                              onError={() =>
                                setFailedImages((prev) =>
                                  prev[imgErrorKey] ? prev : { ...prev, [imgErrorKey]: true }
                                )
                              }
                            />
                          ) : (
                            player.symbol
                          )}
                        </span>
                        <b className="role-title-display">{player.finalRoleName}</b>
                        {player.initialRoleName !== player.finalRoleName && (
                          <small className="initial-role-tag">Ban đầu: {player.initialRoleName}</small>
                        )}
                        <span className={`status-pill ${player.isAlive ? 'status-alive' : 'status-dead'}`}>
                          {player.status}
                        </span>
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </section>
        ) : (
          <section className="summary-timeline" aria-label="Diễn biến ván đấu">
            {(() => {
              const logs = postGame?.historyLogs ?? publicView?.publicLogs ?? [];
              const groups: Array<{ label: string; items: string[] }> = [];
              for (const log of logs) {
                const phaseMatch = log.match(/(Đêm\s+(?:thứ\s+)?\d+|Ngày\s+(?:thứ\s+)?\d+)/i);
                const groupLabel = phaseMatch ? phaseMatch[1].toUpperCase() : null;
                if (groupLabel && (groups.length === 0 || groups[groups.length - 1].label !== groupLabel)) {
                  groups.push({ label: groupLabel, items: [log] });
                } else {
                  if (groups.length === 0) {
                    groups.push({ label: 'KHỞI ĐẦU VÁN ĐẤU', items: [] });
                  }
                  groups[groups.length - 1].items.push(log);
                }
              }
              return groups.map((group, gIdx) => (
                <div key={`${group.label}-${gIdx}`} className="timeline-round-group" style={{ marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '12px', letterSpacing: '0.08em', color: '#d4af37', margin: '0 0 8px' }}>
                    {group.label}
                  </h3>
                  {group.items.map((log, lIdx) => (
                    <article key={lIdx} className="timeline-event">
                      <i className="timeline-dot night-dot" aria-hidden="true" />
                      <div className="timeline-heading">
                        <strong>SỰ KIỆN #{lIdx + 1}</strong>
                      </div>
                      <p>{log}</p>
                    </article>
                  ))}
                </div>
              ));
            })()}
          </section>
        )}
      </div>

      <footer className="summary-footer">
        {state.isHost ? (
          <button
            type="button"
            className="summary-rematch"
            disabled={isRematching}
            onClick={() => void handleRematch()}
          >
            <span className="rematch-icon" aria-hidden="true">🎲</span>
            <span>{isRematching ? 'ĐANG QUAY LẠI LOBBY...' : 'CHƠI VÁN MỚI (VỀ LOBBY)'}</span>
          </button>
        ) : (
          <span className="summary-waiting-rematch">Đang đợi quản trò đưa cả bàn về phòng chờ...</span>
        )}
        <button
          type="button"
          className="summary-exit"
          onClick={handleExit}
          aria-label="Rời phòng"
          title="Rời phòng"
        >
          ⟵
        </button>
      </footer>

      {showEarlyRematchConfirm && (
        <div
          role="presentation"
          onClick={() => {
            if (!isRematching) setShowEarlyRematchConfirm(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 900,
            background: 'rgba(6, 8, 12, 0.82)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="early-rematch-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '360px',
              background: '#131720',
              border: '1px solid rgba(212, 175, 55, 0.35)',
              borderRadius: '14px',
              padding: '20px',
              color: '#e2e8f0',
              boxShadow: '0 18px 48px rgba(0, 0, 0, 0.75)',
            }}
          >
            <h2 id="early-rematch-title" style={{ margin: '0 0 10px', fontSize: '16px', color: '#f8fafc' }}>
              Quay lại Phòng chờ ngay?
            </h2>
            <p style={{ margin: '0 0 18px', fontSize: '13.5px', lineHeight: 1.5, color: '#cbd5e1' }}>
              Bạn vừa xem bảng tổng kết chưa đầy 5 giây. Quay lại Phòng chờ ngay?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                disabled={isRematching}
                onClick={() => setShowEarlyRematchConfirm(false)}
                style={{
                  minHeight: '40px',
                  padding: '0 14px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  background: 'transparent',
                  color: '#cbd5e1',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Ở lại xem tiếp
              </button>
              <button
                type="button"
                disabled={isRematching}
                onClick={() => void executeRematch()}
                style={{
                  minHeight: '40px',
                  padding: '0 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(212, 175, 55, 0.55)',
                  background: 'linear-gradient(135deg, #b8732a, #d69343)',
                  color: '#0d0f13',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {isRematching ? 'Đang chuyển...' : 'Về Phòng chờ'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
