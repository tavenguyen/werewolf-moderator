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

  // Tiến trình chuyền máy một chiều (0 .. totalCount - 1)
  const [currentIndex, setCurrentIndex] = useState(0);

  // Trạng thái nhấn giữ lá bài để xem vai (Press & Hold)
  const [isHolding, setIsHolding] = useState(false);

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

  useEffect(() => {
    return () => {
      if (timerSealingRef.current) window.clearTimeout(timerSealingRef.current);
      if (timerEmergingRef.current) window.clearTimeout(timerEmergingRef.current);
    };
  }, []);

  // Thông tin vai trò của người chơi đang cầm máy
  // Khi ở màn hình xem vai độc lập (demo/HUD test), mặc định ưu tiên role 'werewolf' để tester/user kiểm tra ngay
  const myRoleId = (privateView?.roleId && privateView.roleId.trim() !== '')
    ? privateView.roleId
    : 'werewolf';
  const roleImage = getRoleImage(myRoleId);

  useEffect(() => {
    setImgLoadError(false);
  }, [myRoleId]);
  const roleDef = ROLES_BY_ID[myRoleId] ?? {
    id: myRoleId,
    nameVi: myRoleId === 'werewolf' ? 'Ma sói' : 'Dân làng',
    nameEn: myRoleId === 'werewolf' ? 'Werewolf' : 'Villager',
    faction: myRoleId === 'werewolf' ? ('WEREWOLF' as const) : ('VILLAGER' as const),
    shortDesc: myRoleId === 'werewolf'
      ? 'Ban ngày ẩn mình giữa dân làng, ban đêm thức dậy cùng đồng đội để chọn một người cắn chết.'
      : 'Bạn không có kỹ năng ban đêm. Hãy dùng suy luận để tìm ra Ma Sói.',
  };

  // Lấy câu mô tả kỹ năng ngắn gọn (1 dòng)
  const conciseDesc = roleDef.shortDesc.split('.')[0] + '.';

  // Danh sách đồng đội nếu là Ma Sói hoặc Hội Tam Điểm
  const isWerewolf = roleDef.faction === 'WEREWOLF';
  const isMason = myRoleId === 'mason';
  const teammates = (privateView?.teammates ?? []).map((t) => t.name);
  const wolfPartners = isWerewolf ? teammates : [];
  const masonPartners = isMason ? teammates : [];

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
  // THAO TÁC NHẤN GIỮ (PRESS & HOLD TO REVEAL)
  // Bấm giữ -> Lật lên xem vai; Thả tay -> Tự động úp bài lại
  // =========================================================================
  const handleHoldStart = (e: React.PointerEvent) => {
    // Chỉ nhận chuột trái hoặc cảm ứng
    if (e.button !== undefined && e.button !== 0) return;
    if (handoffStage !== 'idle') return;

    setIsHolding(true);
    setHasViewed(true);

    try {
      navigator.vibrate?.(25);
    } catch {
      // ignore
    }
  };

  const handleHoldEnd = () => {
    if (!isHolding) return;
    setIsHolding(false);

    try {
      navigator.vibrate?.(15);
    } catch {
      // ignore
    }
  };

  // =========================================================================
  // NÚT DUY NHẤT ĐỂ CHUYỂN NGƯỜI ("Đã nhớ · Chuyền cho..." / "Bắt đầu Đêm 1")
  // =========================================================================
  const handlePassOrStartNight = () => {
    if (handoffStage !== 'idle') return;

    try {
      navigator.vibrate?.(35);
    } catch {
      // ignore
    }

    // Úp bài và chìm mờ vào bóng tối (350ms)
    setIsHolding(false);
    setHandoffStage('sealing');

    timerSealingRef.current = window.setTimeout(async () => {
      if (isLastPlayer) {
        // Tất cả đã xem xong -> Bắt đầu Đêm 1
        if (actions.startFirstNight) {
          await actions.startFirstNight();
        }
      } else {
        // Chuyển sang người tiếp theo một chiều
        const nextIdx = currentIndex + 1;
        const nextP = players[nextIdx];
        if (nextP && actions.setLocalActivePlayer) {
          actions.setLocalActivePlayer(nextP.id);
        }
        setCurrentIndex(nextIdx);
        setHasViewed(false); // Reset để người tiếp theo bắt buộc phải nhấn giữ xem vai trước khi chuyền
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
          className={`ritual-card-stage ${isHolding ? 'is-holding' : ''} handoff-${handoffStage}`}
          onPointerDown={handleHoldStart}
          onPointerUp={handleHoldEnd}
          onPointerLeave={handleHoldEnd}
          onPointerCancel={handleHoldEnd}
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && handoffStage === 'idle') {
              e.preventDefault();
              setIsHolding(true);
              setHasViewed(true);
            }
          }}
          onKeyUp={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              setIsHolding(false);
            }
          }}
          onContextMenu={(e) => e.preventDefault()}
          role="button"
          tabIndex={0}
          aria-label={
            isHolding
              ? `Đang xem vai của ${currentPlayer.name}. Thả tay để úp bài lại.`
              : `Chạm và giữ để xem vai của ${currentPlayer.name}`
          }
        >
          <div className="ritual-card-body">
            {/* Sương mỏng & bụi sáng bùng lên khi đang giữ mở bài */}
            <div className={`ritual-mist-burst faction-${roleDef.faction} side-${roleDef.faction}`} aria-hidden="true" />

            {/* Mặt lưng: Nhung đen huyền bí, viền vàng đồng mảnh (Hiện khi buông tay) */}
            <div className="ritual-card-face ritual-card-back">
              <div className="ritual-back-pattern">
                <span className="ritual-back-corner-top" aria-hidden="true">✦</span>
                <div className="ritual-back-crest">
                  <span className="ritual-back-emblem" aria-hidden="true">☾</span>
                </div>
                <span className="ritual-back-corner-bottom" aria-hidden="true">✦</span>
              </div>
            </div>

            {/* Mặt trước: Lật mở hiển thị vai trò (Hiện khi nhấn giữ) */}
            <div className={`ritual-card-face ritual-card-front faction-${roleDef.faction} side-${roleDef.faction} ${roleImage ? 'has-art' : ''}`}>
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
                      alt={roleDef.nameVi}
                      className="ritual-portrait-img"
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

                {isWerewolf && wolfPartners.length > 0 && (
                  <div className="ritual-wolf-pack">
                    Đồng đội Sói: <b>{wolfPartners.join(', ')}</b>
                  </div>
                )}

                {isMason && masonPartners.length > 0 && (
                  <div
                    className="ritual-wolf-pack"
                    style={{
                      borderColor: 'rgba(201, 134, 56, 0.45)',
                      background: 'rgba(201, 134, 56, 0.15)',
                      color: '#ecc94b',
                    }}
                  >
                    Anh em Tam Điểm: <b>{masonPartners.join(', ')}</b>
                  </div>
                )}
              </footer>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Mép dưới: Gợi ý khi chưa xem HOẶC Nút duy nhất chuyền máy sau khi đã xem */}
      <div className="ritual-bottom-area">
        {!hasViewed && (
          <div className="ritual-bottom-hint">
            {isHolding ? 'Thả tay để úp bài lại' : 'Chạm và giữ để xem vai'}
          </div>
        )}

        {hasViewed && (
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
