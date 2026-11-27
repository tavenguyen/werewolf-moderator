import { useState, useRef, useEffect } from 'react';
import type { ScreenName } from '../../navigation';
import { useGameSession } from '../../adapters/useGameSession';
import { ROLES_BY_ID } from '../../engine/roles';
import { getRoleImage } from '../../assets/roles';
import './reveal.css';

type Props = {
  onNavigate?: (screen: ScreenName) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
};

type HandoffStage = 'idle' | 'sealing' | 'emerging';

export default function RoleRevealScreen({}: Props) {
  const { state, actions } = useGameSession();

  const publicView = state.publicView;
  const privateView = state.privateView;
  const players = [...(publicView?.players ?? [])].sort((a, b) => a.seatIndex - b.seatIndex);
  const totalCount = Math.max(1, players.length);
  const revealStorageKey = publicView?.roomCode
    ? `werewolf_reveal_idx_${publicView.roomCode}_${publicView.gameGeneration ?? 0}`
    : null;

  // Tiến trình chuyền máy một chiều (0 .. totalCount - 1)
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (!revealStorageKey || players.length === 0) return 0;
    try {
      const saved = localStorage.getItem(revealStorageKey);
      if (saved !== null) {
        const idx = Number.parseInt(saved, 10);
        if (Number.isInteger(idx) && idx >= 0 && idx < players.length) {
          return idx;
        }
      }
    } catch {
      // ignore storage errors
    }
    return 0;
  });
  const [restoredKey, setRestoredKey] = useState<string | null>(() =>
    revealStorageKey && players.length > 0 ? revealStorageKey : null
  );

  // Khôi phục currentIndex nếu publicView / players tải sau khi mount
  useEffect(() => {
    if (!revealStorageKey || players.length === 0) return;
    if (restoredKey === revealStorageKey) return;
    try {
      const saved = localStorage.getItem(revealStorageKey);
      if (saved !== null) {
        const idx = Number.parseInt(saved, 10);
        if (Number.isInteger(idx) && idx >= 0 && idx < players.length) {
          setCurrentIndex(idx);
        } else {
          setCurrentIndex(0);
          setIsConfirmedReady(false);
          setHasViewed(false);
          setCanUndoPass(false);
          setIsHolding(false);
        }
      } else {
        setCurrentIndex(0);
        setIsConfirmedReady(false);
        setHasViewed(false);
        setCanUndoPass(false);
        setIsHolding(false);
      }
    } catch {
      // ignore storage errors
    }
    setRestoredKey(revealStorageKey);
  }, [revealStorageKey, players.length, restoredKey]);

  // Lưu currentIndex vào localStorage khi thay đổi
  useEffect(() => {
    if (!revealStorageKey || restoredKey !== revealStorageKey) return;
    try {
      localStorage.setItem(revealStorageKey, String(currentIndex));
    } catch {
      // ignore storage errors
    }
  }, [revealStorageKey, currentIndex, restoredKey]);

  // Trạng thái nhấn giữ lá bài để xem vai (Press & Hold)
  const [isHolding, setIsHolding] = useState(false);

  // Bước đệm xác nhận danh tính trước khi mở khóa vùng nhấn giữ
  const [isConfirmedReady, setIsConfirmedReady] = useState(false);

  // Cho phép người vừa bấm "Đã nhớ" lùi lại nếu người kế tiếp chưa xác nhận
  const [canUndoPass, setCanUndoPass] = useState(false);

  // Đã xem vai ít nhất 1 lần trong lượt này -> mở khóa nút chuyền máy
  const [hasViewed, setHasViewed] = useState(false);

  // Fallback hiển thị icon nếu ảnh bị lỗi tải
  const [imgLoadError, setImgLoadError] = useState(false);

  // Trạng thái chuyển giao khi bấm nút "Đã nhớ · Chuyền cho..."
  const [handoffStage, setHandoffStage] = useState<HandoffStage>('idle');

  const currentPlayer = players[currentIndex] ?? {
    id: 'player_1',
    name: 'Người chơi 1',
    seatIndex: 1,
    isAlive: true,
  };

  const isLastPlayer = currentIndex >= totalCount - 1;
  const nextPlayer = !isLastPlayer ? players[currentIndex + 1] : null;

  // Đồng bộ người chơi active với engine khi đổi lượt
  useEffect(() => {
    if (currentPlayer && actions.setLocalActivePlayer) {
      actions.setLocalActivePlayer(currentPlayer.id);
    }
  }, [currentIndex, currentPlayer.id]);

  // Timers tham chiếu để dọn dẹp khi unmount
  const timerSealingRef = useRef<number | null>(null);
  const timerEmergingRef = useRef<number | null>(null);
  const holdDelayTimerRef = useRef<number | null>(null);

  const clearHoldDelayTimer = () => {
    if (holdDelayTimerRef.current !== null) {
      window.clearTimeout(holdDelayTimerRef.current);
      holdDelayTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearHoldDelayTimer();
      if (timerSealingRef.current) window.clearTimeout(timerSealingRef.current);
      if (timerEmergingRef.current) window.clearTimeout(timerEmergingRef.current);
    };
  }, []);

  // Thông tin vai trò của người chơi đang cầm máy (không fallback sang vai khác khi chưa tải xong)
  const rawRoleId = privateView?.roleId?.trim() ?? '';
  const isRoleReady = rawRoleId.length > 0;
  const myRoleId = isRoleReady ? rawRoleId : null;
  const roleImage = myRoleId ? getRoleImage(myRoleId) : undefined;

  useEffect(() => {
    setImgLoadError(false);
  }, [myRoleId, currentIndex]);

  const roleDef = myRoleId
    ? (ROLES_BY_ID[myRoleId] ?? {
        id: myRoleId,
        nameVi: myRoleId,
        nameEn: myRoleId,
        faction: 'VILLAGER' as const,
        shortDesc: 'Vai trò bí mật.',
      })
    : null;

  // Lấy câu mô tả kỹ năng ngắn gọn (1 dòng)
  const conciseDesc = roleDef ? roleDef.shortDesc.split('.')[0] + '.' : '';
  const isCardLocked = handoffStage !== 'idle' || !isConfirmedReady || !isRoleReady;

  // Icon nghệ thuật theo vai
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

  // =========================================================================
  // THAO TÁC NHẤN GIỮ (PRESS & HOLD TO REVEAL — TỐI THIỂU 250ms)
  // Giữ >= 250ms -> Lật lên xem vai; Thả tay -> Tự động úp bài lại
  // =========================================================================
  const startHoldWithDelay = () => {
    if (isCardLocked) return;
    clearHoldDelayTimer();
    holdDelayTimerRef.current = window.setTimeout(() => {
      holdDelayTimerRef.current = null;
      setIsHolding(true);
      setHasViewed(true);
    }, 250);
  };

  const stopHold = () => {
    clearHoldDelayTimer();
    setIsHolding(false);
  };

  const handleHoldStart = (e: React.PointerEvent) => {
    // Chỉ nhận chuột trái hoặc cảm ứng
    if (e.button !== undefined && e.button !== 0) return;
    startHoldWithDelay();
  };

  const handleHoldEnd = () => {
    stopHold();
  };

  const handleConfirmReady = () => {
    if (handoffStage !== 'idle') return;
    setIsConfirmedReady(true);
    setCanUndoPass(false);
  };

  const handleUndoPass = () => {
    if (!canUndoPass || currentIndex <= 0 || handoffStage !== 'idle') return;
    stopHold();
    const prevIdx = currentIndex - 1;
    const prevP = players[prevIdx];
    if (prevP && actions.setLocalActivePlayer) {
      actions.setLocalActivePlayer(prevP.id);
    }
    setCurrentIndex(prevIdx);
    setIsConfirmedReady(true);
    setHasViewed(true);
    setCanUndoPass(false);
  };

  // =========================================================================
  // NÚT DUY NHẤT ĐỂ CHUYỂN NGƯỜI ("Đã nhớ · Chuyền cho..." / "Bắt đầu Đêm 1")
  // =========================================================================
  const handlePassOrStartNight = () => {
    if (handoffStage !== 'idle') return;

    // Úp bài và chìm mờ vào bóng tối (350ms)
    stopHold();
    setHandoffStage('sealing');

    timerSealingRef.current = window.setTimeout(async () => {
      if (isLastPlayer) {
        // Tất cả đã xem xong -> Bắt đầu Đêm 1
        if (actions.startFirstNight) {
          await actions.startFirstNight();
        }
        if (revealStorageKey) {
          try {
            localStorage.removeItem(revealStorageKey);
          } catch {
            // ignore storage errors
          }
        }
      } else {
        // Chuyển sang người tiếp theo một chiều
        const nextIdx = currentIndex + 1;
        const nextP = players[nextIdx];
        if (nextP && actions.setLocalActivePlayer) {
          actions.setLocalActivePlayer(nextP.id);
        }
        setCurrentIndex(nextIdx);
        setIsConfirmedReady(false);
        setHasViewed(false); // Reset để người tiếp theo bắt buộc phải xác nhận & nhấn giữ xem vai
        setCanUndoPass(true);
        setHandoffStage('emerging');

        timerEmergingRef.current = window.setTimeout(() => {
          setHandoffStage('idle');
        }, 320);
      }
    }, 350);
  };

  return (
    <main
      className="ritual-screen"
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Xem vai bí mật"
    >
      {/* Quầng sáng mờ ảo ở tâm như ánh trăng/nến */}
      <div className="ritual-ambient-glow" aria-hidden="true" />

      {/* 1. Tiến độ nhỏ ở mép trên: 1 / 6 (mờ, không gây xao nhãng) */}
      <div className="ritual-progress" aria-hidden="true">
        {currentIndex + 1} / {totalCount}
      </div>

      {/* 2. Trung tâm: Tên người nhận + Lá bài 2:3 */}
      <div className="ritual-center-container">
        <div className="ritual-recipient-name">
          {currentPlayer.name}
        </div>

        <div
          className={`ritual-card-stage ${isHolding ? 'is-holding' : ''} ${isCardLocked ? 'is-locked' : ''} handoff-${handoffStage}`}
          onPointerDown={handleHoldStart}
          onPointerUp={handleHoldEnd}
          onPointerLeave={handleHoldEnd}
          onPointerCancel={handleHoldEnd}
          onBlur={handleHoldEnd}
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !isCardLocked) {
              e.preventDefault();
              if (isHolding) {
                stopHold();
              } else {
                clearHoldDelayTimer();
                setIsHolding(true);
                setHasViewed(true);
              }
            } else if (e.key === 'Escape' && isHolding) {
              e.preventDefault();
              stopHold();
            }
          }}
          onContextMenu={(e) => e.preventDefault()}
          role="button"
          tabIndex={isCardLocked ? -1 : 0}
          aria-disabled={isCardLocked}
          aria-pressed={isHolding}
          aria-label={
            !isConfirmedReady
              ? `Vui lòng xác nhận bạn là ${currentPlayer.name} trước khi xem vai`
              : !isRoleReady
              ? 'Đang chia lá bài'
              : isHolding
              ? `Đang xem vai của ${currentPlayer.name}. Thả tay hoặc nhấn Enter/Space để úp bài lại.`
              : `Nhấn giữ 250ms hoặc nhấn Enter/Space để xem vai của ${currentPlayer.name}`
          }
        >
          {/* Sương mỏng & bụi sáng bùng lên phía sau thẻ khi đang giữ mở bài */}
          {roleDef && (
            <div className={`ritual-mist-burst faction-${roleDef.faction} side-${roleDef.faction}`} aria-hidden="true" />
          )}

          <div className="ritual-card-body">
            {/* Mặt lưng: Nhung đen huyền bí, viền vàng đồng mảnh (Hiện khi buông tay) */}
            <div className="ritual-card-face ritual-card-back" aria-hidden={isHolding}>
              <div className="ritual-back-pattern">
                <span className="ritual-back-corner-top" aria-hidden="true">✦</span>
                <div className="ritual-back-crest">
                  <span className="ritual-back-emblem" aria-hidden="true">☾</span>
                </div>
                <span className="ritual-back-corner-bottom" aria-hidden="true">✦</span>
              </div>
            </div>

            {/* Mặt trước: Lật mở hiển thị vai trò (Chỉ render khi đã có roleId thực) */}
            {roleDef && myRoleId && (
              <div
                className={`ritual-card-face ritual-card-front faction-${roleDef.faction} side-${roleDef.faction} ${roleImage && !imgLoadError ? 'has-art' : ''}`}
                aria-hidden={!isHolding}
              >
                {/* 1. Vùng trên (15% chiều cao): Badge phe độc lập, thoáng đãng */}
                <header className="ritual-card-header">
                  <span className="ritual-faction-label">
                    {roleDef.faction === 'WEREWOLF'
                      ? 'PHE MA SÓI'
                      : roleDef.faction === 'THIRD_PARTY'
                      ? 'PHE THỨ BA'
                      : 'PHE DÂN LÀNG'}
                  </span>
                </header>

                {/* 2. Vùng giữa (50%–55% chiều cao): Chân dung nhân vật 75%–80% chiều rộng, đáy mờ dần */}
                <div className="ritual-card-art-zone" aria-hidden="true">
                  {roleImage && !imgLoadError ? (
                    <div className="ritual-portrait-frame">
                      <img
                        src={roleImage}
                        alt=""
                        className="ritual-portrait-img"
                        decoding="async"
                        draggable={false}
                        onError={() => setImgLoadError(true)}
                      />
                      <div className="ritual-portrait-fade" />
                    </div>
                  ) : (
                    <div className="ritual-role-icon">
                      <span>{getRoleIcon(myRoleId, roleDef.faction)}</span>
                    </div>
                  )}
                </div>

                {/* 3. Vùng dưới (30% chiều cao): Tên vai và mô tả trên nền tối sạch sẽ */}
                <footer className="ritual-role-info">
                  <h2 className="ritual-role-name">{roleDef.nameVi}</h2>
                  <p className="ritual-role-desc">{conciseDesc}</p>
                </footer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Mép dưới: Bước xác nhận / Gợi ý giữ bài / Nút chuyền máy */}
      <div className="ritual-bottom-area">
        {!isConfirmedReady ? (
          <div className="ritual-confirm-actions">
            <button
              type="button"
              className="ritual-pass-btn"
              onClick={handleConfirmReady}
              disabled={handoffStage !== 'idle'}
            >
              Tôi là {currentPlayer.name} · Sẵn sàng xem vai
            </button>

            {canUndoPass && currentIndex > 0 && handoffStage === 'idle' && (
              <button
                type="button"
                className="ritual-undo-btn"
                onClick={handleUndoPass}
              >
                Xem lại vai vừa rồi
              </button>
            )}
          </div>
        ) : !isRoleReady ? (
          <div className="ritual-bottom-hint" role="status">
            Đang chia lá bài...
          </div>
        ) : !hasViewed ? (
          <div className="ritual-bottom-hint">
            {isHolding ? 'Thả tay để úp bài lại' : 'Nhấn giữ lá bài để xem vai'}
          </div>
        ) : (
          <button
            type="button"
            className={`ritual-pass-btn ${isLastPlayer ? 'is-final' : ''}`}
            onClick={handlePassOrStartNight}
          >
            {isLastPlayer
              ? 'Tất cả đã nhớ vai · Bắt đầu Đêm 1 🌙'
              : `Đã nhớ · Chuyền cho ${nextPlayer?.name}`}
          </button>
        )}
      </div>
    </main>
  );
}
