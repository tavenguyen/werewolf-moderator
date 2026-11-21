import { useEffect, useRef, useState } from 'react';
import type { ScreenName } from '../../navigation';
import RulesAndRolesDrawer from '../../components/RulesAndRolesDrawer';
import DayNightAtmosphereCanvas from './DayNightAtmosphereCanvas';
import forestBg from '../../assets/dark-forest.jpg';
import { useGameSession } from '../../adapters/useGameSession';
import './home.css';

type Props = {
  onNavigate?: (screen: ScreenName) => void;
  onPlayerJoined?: (name: string) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
  isRulesOpen?: boolean;
};

// Security: Strip ASCII control characters and zero-width spaces
function sanitizeNickname(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .slice(0, 24);
}

export default function HomeScreen({ onNavigate, onPlayerJoined, onOpenRules, isRulesOpen }: Props) {
  const { state, actions, setDeviceMode } = useGameSession();

  const [activeModal, setActiveModal] = useState<'join' | 'create' | null>(null);
  const [fallbackDrawerOpen, setFallbackDrawerOpen] = useState(false);
  const [isTestingSpeaker, setIsTestingSpeaker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Camera Dolly-in transition state
  const [isDollyIn, setIsDollyIn] = useState(false);

  // Day / Night Atmosphere Factor (0.0 = Sáng nắng ấm, 1.0 = Đêm trăng lạnh)
  const [dayNightFactor, setDayNightFactor] = useState(0.88);

  // Cursor & Parallax Coordinates
  const [cursorPos, setCursorPos] = useState({
    x: typeof window !== 'undefined' ? window.innerWidth * 0.5 : 800,
    y: typeof window !== 'undefined' ? window.innerHeight * 0.45 : 400,
    active: false,
  });

  const [parallaxOffset, setParallaxOffset] = useState({ x: 0, y: 0 });
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });

  // Remember username from previous play session (sanitize legacy demo name 'Minh Khang')
  const [nickname, setNickname] = useState(() => {
    try {
      const saved = localStorage.getItem('werewolf_nickname');
      if (saved === 'Minh Khang') {
        localStorage.removeItem('werewolf_nickname');
        return '';
      }
      return saved || '';
    } catch {
      return '';
    }
  });

  const modalCloseBtn = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const navigationTimer = useRef<number | undefined>(undefined);
  const [roomCode, setRoomCode] = useState('');
  const [notice, setNotice] = useState('');
  const [deviceSelection, setDeviceSelection] = useState<'multi' | 'shared'>('multi');
  const [hostRoleSelection, setHostRoleSelection] = useState<'player' | 'board'>('player');

  // Background Wake-Up Ping: Đánh thức server miễn phí (Render cold-start) ngay khi mở HomeScreen
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const envUrl = (import.meta as unknown as { env?: { VITE_SERVER_URL?: string } }).env?.VITE_SERVER_URL;
      const targetOrigin = envUrl || window.location.origin;
      void fetch(`${targetOrigin}/`, { mode: 'no-cors' }).catch(() => {
        // silent wake-up error
      });
    } catch {
      // ignore
    }
  }, []);

  // Auto-fill mã phòng từ URL Query (?room=xxxx) & Dọn sạch URL query param
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const queryRoom = params.get('room');
      if (queryRoom) {
        const cleanCode = queryRoom.replace(/\D/g, '').slice(0, 4);
        if (cleanCode.length === 4) {
          setRoomCode(cleanCode);
          setActiveModal('join');
          // Dọn sạch query param khỏi thanh URL để tránh F5/rời phòng bị bật lại modal
          window.history.replaceState({}, document.title, window.location.pathname);
          setTimeout(() => {
            nameInputRef.current?.focus();
          }, 150);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => () => {
    window.clearTimeout(navigationTimer.current);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // Keyboard shortcut listener (Escape closes modals)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (activeModal) {
          setActiveModal(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModal]);

  // Mobile Gyroscope Parallax (DeviceOrientationEvent)
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        const nx = Math.max(-1, Math.min(1, e.gamma / 22));
        const ny = Math.max(-1, Math.min(1, (e.beta - 42) / 22));
        setParallaxOffset({ x: nx, y: ny });
        setTilt({ rotateX: -ny * 5, rotateY: nx * 6 });
        const gyroFactor = Math.min(Math.max((nx + 1) / 2, 0), 1);
        setDayNightFactor(gyroFactor);
      }
    };

    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', handleOrientation);
    }
    return () => {
      if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
        window.removeEventListener('deviceorientation', handleOrientation);
      }
    };
  }, []);

  // Desktop Pointer Parallax & Torch Tracking
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const x = e.clientX;
    const y = e.clientY;
    const w = window.innerWidth;
    const h = window.innerHeight;

    setCursorPos({ x, y, active: true });

    const nx = (x / w - 0.5) * 2;
    const ny = (y / h - 0.5) * 2;
    setParallaxOffset({ x: nx, y: ny });
    setTilt({ rotateX: -ny * 4.5, rotateY: nx * 5.5 });

    const factor = Math.min(Math.max((x - w * 0.12) / (w * 0.76), 0), 1);
    setDayNightFactor(factor);
  };

  const handlePointerLeave = () => {
    setCursorPos((prev) => ({ ...prev, active: false }));
    setParallaxOffset({ x: 0, y: 0 });
    setTilt({ rotateX: 0, rotateY: 0 });
  };

  const handleButtonPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const bx = e.clientX - rect.left;
    const by = e.clientY - rect.top;
    e.currentTarget.style.setProperty('--spotlight-x', `${bx}px`);
    e.currentTarget.style.setProperty('--spotlight-y', `${by}px`);
  };

  const triggerHaptic = () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(12);
      } catch {
        // ignore
      }
    }
  };

  const handleOpenRules = () => {
    triggerHaptic();
    if (onOpenRules) {
      onOpenRules('roles');
    } else {
      setFallbackDrawerOpen(true);
    }
  };

  // Reconnect immediately to active game session with Camera Dolly-in
  const handleReconnect = async () => {
    triggerHaptic();
    setIsLoading(true);
    setNotice('');
    const ok = await actions.resumeSession();
    setIsLoading(false);
    if (ok) {
      setActiveModal(null);
      setIsDollyIn(true);
      window.clearTimeout(navigationTimer.current);
      navigationTimer.current = window.setTimeout(() => {
        onNavigate?.('lobby');
      }, 580);
    } else {
      setNotice('Bàn chơi cũ đã kết thúc hoặc không còn tồn tại.');
    }
  };

  // Test Speaker button logic (SpeechSynthesis + Web Audio fallback)
  const handleTestSpeaker = () => {
    triggerHaptic();
    if (isTestingSpeaker) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsTestingSpeaker(false);
      return;
    }

    setIsTestingSpeaker(true);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance('Loa quản trò hoạt động tốt. Sẵn sàng bắt đầu ván đấu.');
      utterance.lang = 'vi-VN';
      utterance.rate = 0.95;
      utterance.onend = () => setIsTestingSpeaker(false);
      utterance.onerror = () => setIsTestingSpeaker(false);
      window.speechSynthesis.speak(utterance);
    } else {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        osc.start();
        setTimeout(() => {
          osc.stop();
          ctx.close();
          setIsTestingSpeaker(false);
        }, 800);
      } catch {
        setIsTestingSpeaker(false);
      }
    }
  };

  // Enter lobby with cinematic Camera Dolly-in
  const enterLobby = async (action: 'join' | 'create') => {
    triggerHaptic();
    const cleanCode = roomCode.replace(/\D/g, '').slice(0, 4);
    if (action === 'join' && cleanCode.length !== 4) {
      setNotice('Vui lòng nhập đủ 4 chữ số mã bàn.');
      return;
    }
    const cleanName = sanitizeNickname(nickname);
    if (!cleanName && (action === 'join' || hostRoleSelection === 'player')) {
      setNotice('Vui lòng nhập tên của bạn.');
      return;
    }

    try {
      localStorage.setItem('werewolf_nickname', cleanName);
    } catch {
      // ignore
    }

    setIsLoading(true);
    setNotice('');

    try {
      if (action === 'join') {
        setDeviceMode('MULTI_DEVICE');
        await actions.joinRoom(cleanCode, cleanName);
      } else {
        const isSingle = deviceSelection === 'shared';
        const isPlayer = hostRoleSelection === 'player';
        const chosenMode = isSingle ? 'SINGLE_DEVICE' : 'MULTI_DEVICE';
        setDeviceMode(chosenMode);

        await actions.createRoom({
          isPlayer,
          username: isPlayer ? cleanName : undefined,
          deviceMode: chosenMode,
          hostMode: isPlayer ? 'PLAYER_HOST' : 'CENTER_BOARD',
        });
      }

      onPlayerJoined?.(cleanName);
      setActiveModal(null);
      setIsDollyIn(true);
      window.clearTimeout(navigationTimer.current);
      navigationTimer.current = window.setTimeout(() => {
        onNavigate?.('lobby');
      }, 580);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể thực hiện thao tác';
      setNotice(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const isModalOpen = activeModal !== null || fallbackDrawerOpen || Boolean(isRulesOpen);
  const atmosphereClass = dayNightFactor < 0.5 ? 'atmosphere-day' : 'atmosphere-night';

  return (
    <div
      className={`home-page ${atmosphereClass} ${isModalOpen ? 'is-modal-active' : ''} ${
        isDollyIn ? 'is-dolly-in' : ''
      }`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {/* Midground Forest Backdrop with Parallax */}
      <div
        className="home-forest-backdrop"
        style={{
          transform: `scale(1.08) translate(${parallaxOffset.x * -20}px, ${parallaxOffset.y * -14}px)`,
        }}
        aria-hidden="true"
      >
        <img
          src={forestBg}
          alt=""
          className="home-forest-img"
        />
        <div className="home-forest-vignette" />
      </div>

      {/* Celestial & Ambient Particles */}
      <DayNightAtmosphereCanvas
        dayNightFactor={dayNightFactor}
        cursorPos={cursorPos}
        parallaxOffset={parallaxOffset}
      />

      {/* Camera Dolly-in curtain */}
      <div className="home-dolly-curtain" aria-hidden="true" />

      {/* Central Interactive Screen */}
      <main className="home-main home-main-stage">
        <div
          className="home-center-stage"
          style={{
            transform: `perspective(900px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
          }}
        >
          {/* Staggered Mist Title: MA SÓI */}
          <h1 className="center-hero-title" aria-label="MA SÓI">
            {['M', 'A', ' ', 'S', 'Ó', 'I'].map((char, index) =>
              char === ' ' ? (
                <span key={index} className="stagger-space" aria-hidden="true">&nbsp;</span>
              ) : (
                <span
                  key={index}
                  className="stagger-char"
                  style={{ animationDelay: `${0.08 + index * 0.08}s` }}
                  aria-hidden="true"
                >
                  {char}
                </span>
              )
            )}
          </h1>

          <p className="home-hero-subtitle">
            Đêm xuống, ai là người còn sống?
          </p>

          {/* Central Hero Actions */}
          <div className="home-hero-actions-container">
            <div className="home-hero-actions-primary">
              <button
                type="button"
                className={`hero-action-btn btn-join-hero ${activeModal === 'join' ? 'is-active' : ''}`}
                onPointerMove={handleButtonPointerMove}
                onClick={() => {
                  triggerHaptic();
                  setActiveModal('join');
                  setNotice('');
                }}
              >
                <span className="btn-text">Vào bàn</span>
              </button>

              <button
                type="button"
                className={`hero-action-btn btn-create-hero ${activeModal === 'create' ? 'is-active' : ''}`}
                onPointerMove={handleButtonPointerMove}
                onClick={() => {
                  triggerHaptic();
                  setActiveModal('create');
                  setNotice('');
                }}
              >
                <span className="btn-text">Lập bàn</span>
              </button>
            </div>

            <button
              type="button"
              className="hero-action-sub-btn"
              onClick={handleOpenRules}
              title="Tra cứu luật và vai trò thực chiến"
            >
              <span>Luật và vai trò</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="home-footer">
        <div className="home-status-live">
          <span className="live-pulse-dot" aria-hidden="true" />
          <span>{state.isConnected ? 'Sẵn sàng kết nối' : 'Đang đồng bộ'}</span>
        </div>

        <div className="home-ambient-controls">
          <button
            type="button"
            className="home-ambient-pill"
            onClick={() => {
              triggerHaptic();
              setDayNightFactor((prev) => (prev > 0.5 ? 0.08 : 0.92));
            }}
            title={dayNightFactor > 0.5 ? 'Chuyển sang Ban Ngày' : 'Chuyển sang Ban Đêm'}
          >
            <span className="ambient-icon" aria-hidden="true">{dayNightFactor > 0.5 ? '🌙' : '☀️'}</span>
            <span>{dayNightFactor > 0.5 ? 'Ban Đêm' : 'Ban Ngày'}</span>
          </button>
        </div>
      </footer>

      {/* MODAL 1: Vào bàn (Join Room) */}
      {activeModal === 'join' && (
        <div
          className="home-modal-backdrop"
          role="presentation"
          onClick={() => setActiveModal(null)}
        >
          <div
            className="home-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-join-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="modal-join-title">Vào bàn</h2>
              <button
                ref={modalCloseBtn}
                type="button"
                className="modal-close-btn"
                onClick={() => setActiveModal(null)}
                aria-label="Đóng cửa sổ"
              >
                ×
              </button>
            </div>

            <div className="home-form">
              {/* Khu vực Mã bàn */}
              <div className="join-code-section">
                <div className="home-field-heading">
                  <label htmlFor="modal-room-code">Mã bàn (4 số)</label>
                </div>

                <div className="join-code-boxes-wrapper">
                  <input
                    id="modal-room-code"
                    className="home-code-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={roomCode}
                    onChange={(event) => {
                      setNotice('');
                      setRoomCode(event.target.value.replace(/\D/g, '').slice(0, 4));
                    }}
                    autoFocus
                  />
                  <div className="home-code-display join-code-grid" aria-hidden="true">
                    {[0, 1, 2, 3].map((idx) => {
                      const digit = roomCode[idx] ?? '';
                      const isCurrent = idx === roomCode.length;
                      return (
                        <div key={idx} className={`code-box ${digit ? 'filled' : ''} ${isCurrent ? 'active' : ''}`}>
                          {digit || '·'}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Khu vực Tên hiển thị */}
              <div className="join-name-section">
                <label className="home-label" htmlFor="modal-nickname">Tên hiển thị</label>
                <input
                  ref={nameInputRef}
                  id="modal-nickname"
                  className="home-text-input"
                  value={nickname}
                  maxLength={24}
                  onChange={(event) => {
                    setNotice('');
                    setNickname(event.target.value);
                  }}
                  placeholder="Tên của bạn"
                />
              </div>

              <button
                className={`home-button home-button-primary join-submit-btn ${
                  roomCode.length === 4 && nickname.trim().length > 0 && !isLoading ? 'is-ready' : 'is-disabled'
                }`}
                disabled={roomCode.length !== 4 || !nickname.trim() || isLoading}
                onClick={() => enterLobby('join')}
              >
                <span>{isLoading ? 'Đang kết nối...' : 'Vào chơi'}</span>
              </button>

              {actions.hasRecoverableSession() && (
                <button
                  type="button"
                  className="join-reconnect-inline"
                  onClick={handleReconnect}
                >
                  <span>Khôi phục ván chơi dở gần nhất</span>
                </button>
              )}

              {notice && (
                <div className="home-modal-alert" role="alert">
                  <span className="home-alert-icon">⚠️</span>
                  <span>{notice}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Lập bàn (Create Room) */}
      {activeModal === 'create' && (
        <div
          className="home-modal-backdrop"
          role="presentation"
          onClick={() => setActiveModal(null)}
        >
          <div
            className="home-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-create-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="modal-create-title">Lập bàn mới</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setActiveModal(null)}
                aria-label="Đóng cửa sổ"
              >
                ×
              </button>
            </div>

            <div className="home-form">
              {/* Khu vực Chế độ chơi */}
              <div className="create-mode-section">
                <div className="home-field-heading">
                  <label>Chế độ thiết bị</label>
                </div>
                <div className="create-mode-grid" role="radiogroup" aria-label="Chế độ chơi">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={deviceSelection === 'multi'}
                    className={`create-mode-btn ${deviceSelection === 'multi' ? 'is-active' : ''}`}
                    onClick={() => setDeviceSelection('multi')}
                  >
                    <span className="mode-btn-title">Mỗi người 1 máy</span>
                    <span className="mode-btn-sub">Quét mã QR vào phòng</span>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={deviceSelection === 'shared'}
                    className={`create-mode-btn ${deviceSelection === 'shared' ? 'is-active' : ''}`}
                    onClick={() => {
                      setDeviceSelection('shared');
                      setHostRoleSelection('board');
                    }}
                  >
                    <span className="mode-btn-title">1 máy dùng chung</span>
                    <span className="mode-btn-sub">Offline 100% không cần mạng</span>
                  </button>
                </div>

                {/* Chọn vai trò Host */}
                <div className="home-field-heading" style={{ marginTop: '12px' }}>
                  <label>Vai trò Quản trò (Host)</label>
                </div>
                <div className="create-mode-grid" role="radiogroup" aria-label="Vai trò Host">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={hostRoleSelection === 'player'}
                    disabled={deviceSelection === 'shared'}
                    className={`create-mode-btn ${hostRoleSelection === 'player' ? 'is-active' : ''} ${
                      deviceSelection === 'shared' ? 'is-disabled' : ''
                    }`}
                    onClick={() => {
                      if (deviceSelection !== 'shared') {
                        setHostRoleSelection('player');
                      }
                    }}
                    title={
                      deviceSelection === 'shared'
                        ? 'Chế độ 1 máy dùng chung cố định thiết bị làm Bảng trung tâm cho cả làng'
                        : 'Quản trò vừa chơi vừa điều phối qua thanh Control Bar'
                    }
                  >
                    <span className="mode-btn-title">Host kiêm Người chơi</span>
                    <span className="mode-btn-sub">
                      {deviceSelection === 'shared' ? 'Khóa ở chế độ 1 máy' : 'Có thanh Control Bar trên đầu'}
                    </span>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={hostRoleSelection === 'board'}
                    className={`create-mode-btn ${hostRoleSelection === 'board' ? 'is-active' : ''}`}
                    onClick={() => setHostRoleSelection('board')}
                    title="Đặt máy giữa bàn làm Bảng trung tâm điều khiển và phát loa"
                  >
                    <span className="mode-btn-title">Bảng trung tâm</span>
                    <span className="mode-btn-sub">
                      {deviceSelection === 'shared' ? 'Auto cho 1 máy dùng chung' : 'iPad / TV / Laptop 3 cột'}
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  className={`create-speaker-outline-btn ${isTestingSpeaker ? 'is-testing' : ''}`}
                  onClick={handleTestSpeaker}
                  title="Kiểm tra âm lượng loa ngoài"
                >
                  <span className="speaker-glyph" aria-hidden="true">{isTestingSpeaker ? '🔊' : '🔈'}</span>
                  <span>{isTestingSpeaker ? 'Đang phát thử âm thanh...' : 'Thử loa quản trò'}</span>
                </button>
              </div>

              {/* Khu vực Tên hiển thị (chỉ cần khi Host kiêm người chơi ở chế độ nhiều máy) */}
              {deviceSelection === 'multi' && hostRoleSelection === 'player' && (
                <div className="join-name-section">
                  <label className="home-label" htmlFor="modal-host-name">Tên hiển thị của Host</label>
                  <input
                    id="modal-host-name"
                    className="home-text-input"
                    value={nickname}
                    maxLength={24}
                    onChange={(event) => {
                      setNotice('');
                      setNickname(event.target.value);
                    }}
                    placeholder="Tên của bạn"
                  />
                </div>
              )}

              {/* Nút Tạo bàn */}
              <button
                className={`home-button home-button-primary create-submit-btn ${
                  (hostRoleSelection === 'board' || nickname.trim().length > 0) && !isLoading ? 'is-ready' : 'is-disabled'
                }`}
                disabled={(deviceSelection === 'multi' && hostRoleSelection === 'player' && !nickname.trim()) || isLoading}
                onClick={() => enterLobby('create')}
              >
                <span>{isLoading ? 'Đang khởi tạo...' : 'Tạo bàn'}</span>
              </button>

              {notice && (
                <div className="home-modal-alert" role="alert">
                  <span className="home-alert-icon">⚠️</span>
                  <span>{notice}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fallback Drawer */}
      {!onOpenRules && (
        <RulesAndRolesDrawer
          isOpen={fallbackDrawerOpen}
          onClose={() => setFallbackDrawerOpen(false)}
          initialTab="roles"
        />
      )}
    </div>
  );
}
