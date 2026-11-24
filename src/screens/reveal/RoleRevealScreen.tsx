import { useState, useRef, useEffect } from 'react';
import type { ScreenName } from '../../navigation';
import { useGameSession } from '../../adapters/useGameSession';
import { ROLES_BY_ID } from '../../engine/roles';
import './reveal.css';

type Props = {
  onNavigate?: (screen: ScreenName) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
};

type CardStage =
  | 'idle'
  | 'lifting_flipping'
  | 'settling'
  | 'settled'
  | 'sealing_pass'
  | 'emerging';

export default function RoleRevealScreen({}: Props) {
  const { state, actions } = useGameSession();

  const publicView = state.publicView;
  const privateView = state.privateView;
  const players = [...(publicView?.players ?? [])].sort((a, b) => a.seatIndex - b.seatIndex);
  const totalCount = Math.max(1, players.length);

  // Tiến trình chuyền máy một chiều (0 .. totalCount - 1)
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stage, setStage] = useState<CardStage>('idle');

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
  const timer1Ref = useRef<number | null>(null);
  const timer2Ref = useRef<number | null>(null);
  const timer3Ref = useRef<number | null>(null);
  const timer4Ref = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer1Ref.current) window.clearTimeout(timer1Ref.current);
      if (timer2Ref.current) window.clearTimeout(timer2Ref.current);
      if (timer3Ref.current) window.clearTimeout(timer3Ref.current);
      if (timer4Ref.current) window.clearTimeout(timer4Ref.current);
    };
  }, []);

  // Thông tin vai trò của người chơi đang cầm máy
  const myRoleId = privateView?.roleId ?? 'villager';
  const roleDef = ROLES_BY_ID[myRoleId] ?? {
    id: myRoleId,
    nameVi: 'Dân làng',
    nameEn: 'Villager',
    faction: 'VILLAGER' as const,
    shortDesc: 'Bạn không có kỹ năng ban đêm. Hãy dùng suy luận để tìm ra Ma Sói.',
  };

  // Lấy câu mô tả kỹ năng ngắn gọn (1 dòng)
  const conciseDesc = roleDef.shortDesc.split('.')[0] + '.';

  // Danh sách đồng đội nếu là Ma Sói hoặc Hội Tam Điểm
  const isWerewolf = roleDef.faction === 'WEREWOLF';
  const wolfPartners = isWerewolf
    ? (privateView?.teammates ?? []).map((t) => t.name)
    : [];

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
  // NHỊP 1 & 2: Chạm để lật mở -> Tự thả xuống bàn
  // =========================================================================
  const handleCardClick = () => {
    if (stage !== 'idle') return;

    // Rung xúc giác nhẹ khi chạm
    try {
      navigator.vibrate?.(25);
    } catch {
      // ignore
    }

    // Nhịp 1: Nhấc lên & Lật mở (Lift & Flip)
    setStage('lifting_flipping');

    // Sau 850ms: Lật xong, lơ lửng 0.3s -> chuyển sang Nhịp 2: Settle
    timer1Ref.current = window.setTimeout(() => {
      setStage('settling');

      // Sau 400ms: Hạ êm xuống bàn với độ nảy nhẹ, rung nhẹ như chạm mặt gỗ
      timer2Ref.current = window.setTimeout(() => {
        try {
          navigator.vibrate?.(15);
        } catch {
          // ignore
        }
        setStage('settled');
      }, 400);
    }, 850);
  };

  // =========================================================================
  // NHỊP 3: Úp bài & Chuyền máy một chiều
  // =========================================================================
  const handlePassOrStartNight = () => {
    if (stage !== 'settled') return;

    try {
      navigator.vibrate?.(35);
    } catch {
      // ignore
    }

    // Nhịp 3: Lá bài lật úp lại và chìm mờ vào bóng tối
    setStage('sealing_pass');

    timer3Ref.current = window.setTimeout(async () => {
      if (isLastPlayer) {
        // Đã xem hết -> Bắt đầu Đêm 1
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

        // Lá bài mới trồi lên từ màn sương
        setStage('emerging');

        timer4Ref.current = window.setTimeout(() => {
          setStage('idle');
        }, 500);
      }
    }, 520);
  };

  return (
    <main
      className={`ritual-screen stage-${stage}`}
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
          className="ritual-card-stage"
          onClick={handleCardClick}
          role="button"
          tabIndex={0}
          aria-label={
            stage === 'idle'
              ? `Chạm để mở bài xem vai của ${currentPlayer.name}`
              : `Lá bài vai trò của ${currentPlayer.name}`
          }
        >
          <div className="ritual-card-body">
            {/* Sương mỏng & bụi sáng bùng lên khi lật mở */}
            <div className={`ritual-mist-burst faction-${roleDef.faction}`} aria-hidden="true" />

            {/* Mặt lưng: Nhung đen huyền bí, viền vàng đồng mảnh */}
            <div className="ritual-card-face ritual-card-back">
              <div className="ritual-back-pattern">
                <span className="ritual-back-corner-top" aria-hidden="true">✦</span>
                <div className="ritual-back-crest">
                  <span className="ritual-back-emblem" aria-hidden="true">☾</span>
                </div>
                <span className="ritual-back-corner-bottom" aria-hidden="true">✦</span>
              </div>
            </div>

            {/* Mặt trước: Lật mở hiển thị vai trò */}
            <div className={`ritual-card-face ritual-card-front faction-${roleDef.faction}`}>
              <span className="ritual-faction-label">
                {roleDef.faction === 'WEREWOLF'
                  ? 'PHE MA SÓI'
                  : roleDef.faction === 'THIRD_PARTY'
                  ? 'PHE THỨ BA'
                  : 'PHE DÂN LÀNG'}
              </span>

              <div className="ritual-role-icon" aria-hidden="true">
                {getRoleIcon(myRoleId, roleDef.faction)}
              </div>

              <div className="ritual-role-info">
                <h2 className="ritual-role-name">{roleDef.nameVi}</h2>
                <p className="ritual-role-desc">{conciseDesc}</p>

                {isWerewolf && wolfPartners.length > 0 && (
                  <div className="ritual-wolf-pack">
                    Đồng đội Sói: <b>{wolfPartners.join(', ')}</b>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Mép dưới: Dòng chữ mờ khi chưa mở HOẶC Nút duy nhất khi đã mở */}
      <div className="ritual-bottom-area">
        {(stage === 'idle' || stage === 'emerging') && (
          <div className="ritual-bottom-hint">
            Chạm vào lá bài để mở
          </div>
        )}

        {stage === 'settled' && (
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
