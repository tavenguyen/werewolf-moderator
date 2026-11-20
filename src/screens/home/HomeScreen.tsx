import { useEffect, useRef, useState } from 'react';
import type { ScreenName } from '../../navigation';
import RulesAndRolesDrawer from '../../components/RulesAndRolesDrawer';
import DayNightAtmosphereCanvas from './DayNightAtmosphereCanvas';
import forestBg from '../../assets/dark-forest.jpg';
import './home.css';

type Props = {
  onNavigate?: (screen: ScreenName) => void;
  onPlayerJoined?: (name: string) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
  isRulesOpen?: boolean;
};

type ActiveSession = {
  roomCode: string;
  nickname: string;
  screen: ScreenName;
  timestamp: number;
};

// Security: Strip ASCII control characters and zero-width spaces
function sanitizeNickname(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .slice(0, 24);
}

export default function HomeScreen({ onNavigate, onPlayerJoined, onOpenRules, isRulesOpen }: Props) {
  const [activeModal, setActiveModal] = useState<'join' | 'create' | null>(null);
  const [fallbackDrawerOpen, setFallbackDrawerOpen] = useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [isTestingSpeaker, setIsTestingSpeaker] = useState(false);

  // Camera Dolly-in transition state (Zoom xuyên rừng vào sảnh chờ)
  const [isDollyIn, setIsDollyIn] = useState(false);

  // Day / Night Atmosphere Factor (0.0 = Sáng nắng ấm, 1.0 = Đêm trăng lạnh)
  const [dayNightFactor, setDayNightFactor] = useState(0.88);

  // Cursor & Parallax Coordinates
  const [cursorPos, setCursorPos] = useState({
    x: typeof window !== 'undefined' ? window.innerWidth * 0.5 : 800,
    y: typeof window !== 'undefined' ? window.innerHeight * 0.45 : 400,
    active: false,
  });

  // Normalized Parallax Offset [-1, 1] for 3-layer depth (mouse + gyroscope)
  const [parallaxOffset, setParallaxOffset] = useState({ x: 0, y: 0 });
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });

  // Auto-Reconnect Session from localStorage
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(() => {
    try {
      const saved = localStorage.getItem('werewolf_active_session');
      if (saved) return JSON.parse(saved);
      return {
        roomCode: '7290',
        nickname: 'Minh Khang',
        screen: 'lobby',
        timestamp: Date.now(),
      };
    } catch {
      return null;
    }
  });

  // Remember username from previous play session
  const [nickname, setNickname] = useState(() => {
    try {
      return localStorage.getItem('werewolf_nickname') || 'Minh Khang';
    } catch {
      return 'Minh Khang';
    }
  });

  const modalCloseBtn = useRef<HTMLButtonElement>(null);
  const qrCloseBtn = useRef<HTMLButtonElement>(null);
  const navigationTimer = useRef<number | undefined>(undefined);
  const [roomCode, setRoomCode] = useState('7290');
  const [notice, setNotice] = useState('');
  const [deviceMode, setDeviceMode] = useState<'shared' | 'multi'>('shared');

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
        if (qrScannerOpen) {
          setQrScannerOpen(false);
        } else if (activeModal) {
          setActiveModal(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [qrScannerOpen, activeModal]);

  // Mobile Gyroscope Parallax (DeviceOrientationEvent)
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        // gamma: left-to-right tilt [-90, 90] -> normalized [-1, 1]
        // beta: front-to-back tilt [0, 90] (neutral holding angle ~45deg)
        const nx = Math.max(-1, Math.min(1, e.gamma / 22));
        const ny = Math.max(-1, Math.min(1, (e.beta - 42) / 22));
        setParallaxOffset({ x: nx, y: ny });
        setTilt({ rotateX: -ny * 5, rotateY: nx * 6 });
        // Tilt phone left -> Day (0.0), Tilt phone right -> Night (1.0)
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

  // Desktop Pointer Parallax & Torch Tracking (Myshaky Day/Night Continuum)
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const x = e.clientX;
    const y = e.clientY;
    const w = window.innerWidth;
    const h = window.innerHeight;

    setCursorPos({ x, y, active: true });

    // Normalized [-1, 1] offset
    const nx = (x / w - 0.5) * 2;
    const ny = (y / h - 0.5) * 2;
    setParallaxOffset({ x: nx, y: ny });

    // Subtle 3D card tilt
    setTilt({ rotateX: -ny * 4.5, rotateY: nx * 5.5 });

    // Day/Night continuum: Move left -> Day (0.0), Move right -> Night (1.0)
    const factor = Math.min(Math.max((x - w * 0.12) / (w * 0.76), 0), 1);
    setDayNightFactor(factor);
  };

  const handlePointerLeave = () => {
    setCursorPos((prev) => ({ ...prev, active: false }));
    setParallaxOffset({ x: 0, y: 0 });
    setTilt({ rotateX: 0, rotateY: 0 });
  };

  // Micro-interaction: Spotlight cursor tracker on action buttons
  const handleButtonPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const bx = e.clientX - rect.left;
    const by = e.clientY - rect.top;
    e.currentTarget.style.setProperty('--spotlight-x', `${bx}px`);
    e.currentTarget.style.setProperty('--spotlight-y', `${by}px`);
  };

  // Micro-interaction: Tactile Haptic Vibration on Touch Devices
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

  const handleSimulateQrScan = (code: string) => {
    setRoomCode(code);
    setNotice(`✓ Đã quét thành công mã phòng #${code}`);
    setQrScannerOpen(false);
  };

  // Reconnect immediately to active game session with Camera Dolly-in
  const handleReconnect = () => {
    if (!activeSession) return;
    triggerHaptic();
    onPlayerJoined?.(activeSession.nickname);
    setActiveModal(null);
    setIsDollyIn(true);
    window.clearTimeout(navigationTimer.current);
    navigationTimer.current = window.setTimeout(() => {
      onNavigate?.(activeSession.screen || 'lobby');
    }, 580);
  };

  // Dismiss / Clear active session
  const handleDismissSession = () => {
    try {
      localStorage.removeItem('werewolf_active_session');
    } catch {
      // ignore
    }
    setActiveSession(null);
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

  // Enter lobby with cinematic Camera Dolly-in (Zoom xuyên rừng)
  const enterLobby = (action: 'join' | 'create') => {
    triggerHaptic();
    const cleanCode = roomCode.replace(/\D/g, '').slice(0, 4);
    if (action === 'join' && cleanCode.length !== 4) {
      setNotice('Mã phòng cần có đúng 4 chữ số.');
      return;
    }
    const cleanName = sanitizeNickname(nickname);
    if (!cleanName) {
      setNotice('Hãy nhập tên bạn trước khi tiếp tục.');
      return;
    }

    // Save username & active session to localStorage
    try {
      localStorage.setItem('werewolf_nickname', cleanName);
      localStorage.setItem(
        'werewolf_active_session',
        JSON.stringify({
          roomCode: cleanCode,
          nickname: cleanName,
          screen: 'lobby',
          timestamp: Date.now(),
        })
      );
    } catch {
      // ignore storage errors
    }

    onPlayerJoined?.(cleanName);
    setActiveModal(null);
    setIsDollyIn(true);
    window.clearTimeout(navigationTimer.current);
    navigationTimer.current = window.setTimeout(() => {
      onNavigate?.('lobby');
    }, 580);
  };

  const isModalOpen = activeModal !== null || qrScannerOpen || fallbackDrawerOpen || Boolean(isRulesOpen);
  const atmosphereClass = dayNightFactor < 0.5 ? 'atmosphere-day' : 'atmosphere-night';

  return (
    <div
      className={`home-page ${atmosphereClass} ${isModalOpen ? 'is-modal-active' : ''} ${
        isDollyIn ? 'is-dolly-in' : ''
      }`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {/* LAYER 2: Midground Forest Backdrop with Parallax */}
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

      {/* LAYER 1 & 3: Distant Celestial (Moon/Sun) & Foreground Ambient Mist/Particles */}
      <DayNightAtmosphereCanvas
        dayNightFactor={dayNightFactor}
        cursorPos={cursorPos}
        parallaxOffset={parallaxOffset}
      />

      {/* Camera Dolly-in curtain for cinematic fade into village */}
      <div className="home-dolly-curtain" aria-hidden="true" />

      {/* Central Interactive Screen (Vietnamese Folk Horror Editorial) */}
      <main className="home-main home-main-stage">
        {/* Centerpiece: Pure, Minimalist Folk Horror Layout */}
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

          {/* Atmospheric Subtitle */}
          <p className="home-hero-subtitle">
            Đêm xuống, ai là người còn sống?
          </p>

          {/* Central Hero Actions: Pure Action Buttons (No Icons, No Descriptions) */}
          <div className="home-hero-actions-container">
            {/* Primary Action Buttons: "Vào bàn" and "Lập bàn" */}
            <div className="home-hero-actions-primary">
              {/* Vào bàn */}
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
                {activeSession && (
                  <span className="btn-reconnect-badge" title={`Đang chơi dở bàn #${activeSession.roomCode}`}>
                    #{activeSession.roomCode}
                  </span>
                )}
              </button>

              {/* Lập bàn */}
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

            {/* Auxiliary Action Button: "Luật và vai trò" */}
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

      {/* Footer: Live Status & Day/Night Celestial Switch */}
      <footer className="home-footer">
        <div className="home-status-live">
          <span className="live-pulse-dot" aria-hidden="true" />
          <span>Máy chủ trực tiếp</span>
        </div>

        {/* Day/Night Celestial Preview Pill */}
        <div className="home-ambient-controls">
          <button
            type="button"
            className="home-ambient-pill"
            onClick={() => {
              triggerHaptic();
              setDayNightFactor((prev) => (prev > 0.5 ? 0.08 : 0.92));
            }}
            title={dayNightFactor > 0.5 ? 'Chuyển sang Ban Ngày (Nắng vàng ấm)' : 'Chuyển sang Ban Đêm (Trăng xanh lạnh)'}
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
              {/* Thanh Bàn đang chơi rút gọn 1 dòng */}
              {activeSession && (
                <div className="join-reconnect-bar" role="region" aria-label="Bàn đang chơi dở">
                  <div className="reconnect-bar-tag">
                    <span className="live-pulse-dot" aria-hidden="true" />
                    <span className="reconnect-bar-text">
                      #{activeSession.roomCode} · {activeSession.nickname}
                    </span>
                  </div>
                  <div className="reconnect-bar-actions">
                    <button
                      type="button"
                      className="reconnect-bar-btn"
                      onClick={handleReconnect}
                    >
                      <span>Vào lại</span>
                      <span aria-hidden="true">→</span>
                    </button>
                    <button
                      type="button"
                      className="reconnect-bar-dismiss"
                      onClick={handleDismissSession}
                      title="Bỏ qua bàn này"
                      aria-label="Bỏ qua bàn này"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}

              {/* Khu vực Mã bàn */}
              <div className="join-code-section">
                <div className="home-field-heading">
                  <label htmlFor="modal-room-code">Mã bàn</label>
                </div>

                <div className="join-code-boxes-wrapper">
                  <input
                    id="modal-room-code"
                    className="home-code-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={roomCode}
                    onChange={(event) => setRoomCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
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

                <button
                  type="button"
                  className="join-qr-outline-btn"
                  onClick={() => setQrScannerOpen(true)}
                  title="Quét mã QR trên màn hình bàn Host"
                >
                  <span className="qr-scan-glyph" aria-hidden="true">📷</span>
                  <span>Quét mã QR</span>
                </button>
              </div>

              {/* Khu vực Tên hiển thị */}
              <div className="join-name-section">
                <label className="home-label" htmlFor="modal-nickname">Tên hiển thị</label>
                <input
                  id="modal-nickname"
                  className="home-text-input"
                  value={nickname}
                  maxLength={24}
                  onChange={(event) => {
                    setNickname(event.target.value);
                    try {
                      localStorage.setItem('werewolf_nickname', event.target.value);
                    } catch {
                      // ignore
                    }
                  }}
                  placeholder="Tên của bạn"
                />
              </div>

              {/* Nút hành động chính: Vào chơi */}
              <button
                className={`home-button home-button-primary join-submit-btn ${
                  roomCode.length === 4 && nickname.trim().length > 0 ? 'is-ready' : 'is-disabled'
                }`}
                disabled={roomCode.length !== 4 || !nickname.trim()}
                onClick={() => enterLobby('join')}
              >
                <span>Vào chơi</span>
              </button>

              {notice && <p className="home-notice" role="status">{notice}</p>}
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
              <h2 id="modal-create-title">Lập bàn</h2>
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
                  <label>Chế độ chơi</label>
                </div>
                <div className="create-mode-grid" role="radiogroup" aria-label="Chế độ chơi">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={deviceMode === 'multi'}
                    className={`create-mode-btn ${deviceMode === 'multi' ? 'is-active' : ''}`}
                    onClick={() => setDeviceMode('multi')}
                  >
                    <span className="mode-btn-title">Mỗi người 1 máy</span>
                    <span className="mode-btn-sub">Quét mã vào bàn</span>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={deviceMode === 'shared'}
                    className={`create-mode-btn ${deviceMode === 'shared' ? 'is-active' : ''}`}
                    onClick={() => setDeviceMode('shared')}
                  >
                    <span className="mode-btn-title">1 máy chung</span>
                    <span className="mode-btn-sub">Đặt giữa bàn</span>
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

              {/* Khu vực Tên hiển thị */}
              <div className="join-name-section">
                <label className="home-label" htmlFor="modal-host-name">Tên hiển thị</label>
                <input
                  id="modal-host-name"
                  className="home-text-input"
                  value={nickname}
                  maxLength={24}
                  onChange={(event) => {
                    setNickname(event.target.value);
                    try {
                      localStorage.setItem('werewolf_nickname', event.target.value);
                    } catch {
                      // ignore
                    }
                  }}
                  placeholder="Tên của bạn"
                />
              </div>

              {/* Nút hành động chính: Tạo bàn */}
              <button
                className={`home-button home-button-primary create-submit-btn ${
                  nickname.trim().length > 0 ? 'is-ready' : 'is-disabled'
                }`}
                disabled={!nickname.trim()}
                onClick={() => enterLobby('create')}
              >
                <span>Tạo bàn</span>
              </button>

              {notice && <p className="home-notice" role="status">{notice}</p>}
            </div>
          </div>
        </div>
      )}

      {/* QR Scanner Camera Modal */}
      {qrScannerOpen && (
        <div
          className="qr-scanner-backdrop"
          role="presentation"
          onClick={() => setQrScannerOpen(false)}
        >
          <section
            className="qr-scanner-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-scanner-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="qr-scanner-head">
              <h2 id="qr-scanner-title">Quét mã QR vào bàn</h2>
              <button
                ref={qrCloseBtn}
                type="button"
                className="qr-scanner-close"
                aria-label="Đóng quét camera"
                onClick={() => setQrScannerOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="qr-viewfinder-box" aria-hidden="true">
              <span className="viewfinder-corner tl" />
              <span className="viewfinder-corner tr" />
              <span className="viewfinder-corner bl" />
              <span className="viewfinder-corner br" />
              <div className="viewfinder-scan-beam" />
              <span className="viewfinder-hint">Hướng camera về phía mã QR trên bàn Host</span>
            </div>

            <p className="qr-scanner-note">
              Camera sẵn sàng quét mã bàn đấu hiển thị trên màn hình Quản trò hoặc Smart TV.
            </p>

            <button
              type="button"
              className="qr-scanner-simulate-btn"
              onClick={() => handleSimulateQrScan('7290')}
            >
              <span>⚡ Nhận diện ngay phòng #7290</span>
            </button>
          </section>
        </div>
      )}

      {/* Fallback Drawer if used outside App */}
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
