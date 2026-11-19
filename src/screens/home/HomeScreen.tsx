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

export default function HomeScreen({ onNavigate, onPlayerJoined, onOpenRules }: Props) {
  const [activeModal, setActiveModal] = useState<'join' | 'create' | null>(null);
  const [fallbackDrawerOpen, setFallbackDrawerOpen] = useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [isTestingSpeaker, setIsTestingSpeaker] = useState(false);

  // Day / Night Atmosphere State (0.0 = Sáng / Bình Minh, 1.0 = Tối / Nửa Đêm)
  const [dayNightFactor, setDayNightFactor] = useState(0.85); // Mặc định đêm
  const [cursorPos, setCursorPos] = useState({
    x: typeof window !== 'undefined' ? window.innerWidth * 0.75 : 800,
    y: typeof window !== 'undefined' ? window.innerHeight * 0.35 : 400,
    active: false,
  });
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });

  // Auto-Reconnect Session from localStorage
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(() => {
    try {
      const saved = localStorage.getItem('werewolf_active_session');
      if (saved) return JSON.parse(saved);
      // Sample active session if none yet so user can immediately experience the reconnect banner
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

  const rulesTrigger = useRef<HTMLButtonElement>(null);
  const qrCloseBtn = useRef<HTMLButtonElement>(null);
  const modalCloseBtn = useRef<HTMLButtonElement>(null);
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

  // Pointer movement tracking (myshaky style interaction)
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const x = e.clientX;
    const y = e.clientY;
    const w = window.innerWidth;
    const h = window.innerHeight;

    setCursorPos({ x, y, active: true });

    // Move left -> Day (0), Move right -> Night (1)
    const factor = Math.min(Math.max((x - w * 0.08) / (w * 0.84), 0), 1);
    setDayNightFactor(factor);

    // Subtle 3D card tilt
    const rx = -((y / h) - 0.5) * 6;
    const ry = ((x / w) - 0.5) * 8;
    setTilt({ rotateX: rx, rotateY: ry });
  };

  const handlePointerLeave = () => {
    setCursorPos((prev) => ({ ...prev, active: false }));
    setTilt({ rotateX: 0, rotateY: 0 });
  };

  const handleOpenRules = () => {
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

  // Reconnect immediately to active game session
  const handleReconnect = () => {
    if (!activeSession) return;
    onPlayerJoined?.(activeSession.nickname);
    setNotice(`Đang vào lại bàn #${activeSession.roomCode}...`);
    window.clearTimeout(navigationTimer.current);
    navigationTimer.current = window.setTimeout(() => onNavigate?.(activeSession.screen || 'lobby'), 200);
  };

  // Dismiss / Clear active session
  const handleDismissSession = () => {
    try {
      localStorage.removeItem('werewolf_active_session');
    } catch {
      // ignore
    }
    setActiveSession(null);
    if (activeModal === 'reconnect') {
      setActiveModal(null);
    }
  };

  // Test Speaker button logic (SpeechSynthesis + Web Audio fallback)
  const handleTestSpeaker = () => {
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

  const enterLobby = (action: 'join' | 'create') => {
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
    setNotice(action === 'join' ? 'Đang vào sảnh chờ...' : 'Đã lập bàn chơi mới.');
    window.clearTimeout(navigationTimer.current);
    navigationTimer.current = window.setTimeout(() => onNavigate?.('lobby'), 250);
  };

  // Determine Atmosphere Stage
  let celestialStage: 'day' | 'twilight' | 'night' = 'night';
  if (dayNightFactor < 0.35) {
    celestialStage = 'day';
  } else if (dayNightFactor < 0.65) {
    celestialStage = 'twilight';
  }

  return (
    <div
      className={`home-page atmosphere-${celestialStage}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {/* Dark Forest Photo Background with Parallax */}
      <div
        className="home-forest-backdrop"
        style={{
          transform: `scale(1.06) translate(${
            cursorPos.active
              ? (cursorPos.x / (typeof window !== 'undefined' ? window.innerWidth : 1) - 0.5) * -16
              : 0
          }px, ${
            cursorPos.active
              ? (cursorPos.y / (typeof window !== 'undefined' ? window.innerHeight : 1) - 0.5) * -10
              : 0
          }px)`,
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

      {/* Interactive Background Atmosphere Canvas */}
      <DayNightAtmosphereCanvas
        dayNightFactor={dayNightFactor}
        cursorPos={cursorPos}
      />

      {/* Top Header */}
      <header className="home-header">
        <a className="home-brand" href="#home" onClick={(event) => event.preventDefault()} aria-label="Ma Sói Host">
          <div className="home-moon-symbol" aria-hidden="true">
            {dayNightFactor > 0.5 ? (
              <svg viewBox="0 0 24 24" fill="none" className="moon-svg">
                <path
                  d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" className="sun-svg">
                <circle cx="12" cy="12" r="5" fill="currentColor" />
                <path
                  d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>
          <div className="home-brand-text">
            <span>MA SÓI HOST</span>
            <small>Quản trò tự động cho đêm chơi Ma Sói</small>
          </div>
        </a>

      </header>

      {/* Central Interactive Screen (myshaky style) */}
      <main className="home-main home-main-stage">
        {/* Shaky-Inspired Nav Dock: Placed right below the header line */}
        <nav className="home-shaky-nav" aria-label="Menu chức năng chính">
          <button
            type="button"
            className={`shaky-nav-item ${activeModal === 'join' ? 'is-active' : ''}`}
            onClick={() => { setActiveModal('join'); setNotice(''); }}
          >
            <span className="shaky-nav-text">Vào bàn</span>
            {activeSession && <span className="shaky-nav-dot" title="Có bàn đang chơi" aria-hidden="true" />}
          </button>

          <button
            type="button"
            className={`shaky-nav-item ${activeModal === 'create' ? 'is-active' : ''}`}
            onClick={() => { setActiveModal('create'); setNotice(''); }}
          >
            <span className="shaky-nav-text">Lập bàn</span>
          </button>

          <button
            type="button"
            className="shaky-nav-item"
            onClick={handleOpenRules}
            title="Tra cứu luật làng và 10 vai trò thực chiến"
          >
            <span className="shaky-nav-text">Luật &amp; Vai trò</span>
          </button>
        </nav>

        {/* Centerpiece: ONLY WEREWOLF MODERATOR Typography with 3D Tilt */}
        <div
          className="home-center-stage"
          style={{
            transform: `perspective(900px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
          }}
        >
          <h1 className="center-hero-title">
            <span className="title-word title-werewolf">WEREWOLF</span>
            <span className="title-word title-moderator">MODERATOR</span>
          </h1>
        </div>
      </main>

      {/* Footer */}
      <footer className="home-footer">
        <div className="home-status-live">
          <span className="live-pulse-dot" aria-hidden="true" />
          <span>Máy chủ trực tiếp</span>
        </div>
      </footer>

      {/* MODAL 1: Vào bàn có sẵn (Join Room) */}
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
              <h2 id="modal-join-title">Vào bàn có sẵn</h2>
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
              {/* Thẻ Vào lại bàn nếu có phiên lưu dở */}
              {activeSession && (
                <div className="modal-reconnect-card" role="region" aria-label="Bàn đang chơi dở">
                  <div className="reconnect-card-top">
                    <div className="reconnect-card-title-group">
                      <span className="live-pulse-dot" aria-hidden="true" />
                      <strong className="reconnect-card-title">
                        Bàn đang chơi #{activeSession.roomCode} ({activeSession.nickname})
                      </strong>
                    </div>
                    <button
                      type="button"
                      className="reconnect-dismiss-btn"
                      onClick={handleDismissSession}
                      title="Bỏ qua bàn này"
                      aria-label="Bỏ qua bàn này"
                    >
                      ×
                    </button>
                  </div>
                  <p className="reconnect-card-sub">
                    Bạn có phiên chơi chưa hoàn tất trên máy này
                  </p>
                  <button
                    type="button"
                    className="reconnect-quick-btn"
                    onClick={handleReconnect}
                  >
                    <span>Vào lại ngay</span>
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              )}

              <div className="home-field-heading">
                <label htmlFor="modal-room-code">Mã bàn 4 số</label>
              </div>

              <div className="home-code-row">
                <div className="home-code-wrapper">
                  <input
                    id="modal-room-code"
                    className="home-code-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={roomCode}
                    onChange={(event) => setRoomCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    aria-describedby="modal-code-help"
                    autoFocus
                  />
                  <div className="home-code-display" aria-hidden="true">
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
                  className="home-qr-scan-btn"
                  onClick={() => setQrScannerOpen(true)}
                  title="Quét mã QR trên màn hình bàn Host"
                >
                  <span className="qr-scan-glyph" aria-hidden="true">📷</span>
                  <span>Quét QR</span>
                </button>
              </div>

              <p id="modal-code-help" className="home-helper">
                <span className="helper-icon" aria-hidden="true">❦</span>
                Nhập 4 số hoặc quét nhanh QR trên màn hình bàn Host.
              </p>

              <label className="home-label" htmlFor="modal-nickname">Biệt danh của bạn</label>
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
                placeholder="Nhập tên gọi…"
              />

              <button
                className="home-button home-button-primary"
                onClick={() => enterLobby('join')}
              >
                <span>Bước vào bàn chơi</span>
                <span className="arrow-icon" aria-hidden="true">→</span>
              </button>

              <div className="home-pre-room-tip">
                <span className="tip-bulb" aria-hidden="true">💡</span>
                <span>Mẹo: Bật im lặng thông báo và giảm độ sáng màn hình trước khi Đêm 1 bắt đầu.</span>
              </div>

              {notice && <p className="home-notice" role="status">{notice}</p>}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Lập bàn đấu mới (Create Room) */}
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
              <h2 id="modal-create-title">Lập bàn đấu mới</h2>
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
              <p className="home-label">Chọn phương thức đặt máy</p>

              <button
                type="button"
                className={`home-device-option ${deviceMode === 'shared' ? 'active' : ''}`}
                onClick={() => setDeviceMode('shared')}
                aria-pressed={deviceMode === 'shared'}
              >
                <div className="device-icon-wrap" aria-hidden="true">
                  <span className="device-folk-icon">🪵</span>
                </div>
                <div className="device-info">
                  <strong>Một máy đặt giữa bàn</strong>
                  <small>Một điện thoại hoặc iPad đặt giữa bàn, tự động phát âm thanh và quản trò cho cả làng.</small>
                </div>
                <span className="home-radio" aria-hidden="true" />
              </button>

              <button
                type="button"
                className={`home-device-option ${deviceMode === 'multi' ? 'active' : ''}`}
                onClick={() => setDeviceMode('multi')}
                aria-pressed={deviceMode === 'multi'}
              >
                <div className="device-icon-wrap" aria-hidden="true">
                  <span className="device-folk-icon">🎴</span>
                </div>
                <div className="device-info">
                  <strong>Mỗi người một điện thoại riêng</strong>
                  <small>Từng người chơi quét mã vào bàn trên máy riêng để nhận vai và thao tác kín đáo khi Trời tối.</small>
                </div>
                <span className="home-radio" aria-hidden="true" />
              </button>

              {/* Nút Test Loa Quản Trò */}
              <div className="home-test-speaker-card">
                <div className="test-speaker-meta">
                  <span className="speaker-icon" aria-hidden="true">
                    {isTestingSpeaker ? '🔊' : '🔈'}
                  </span>
                  <div>
                    <strong>Thử loa quản trò</strong>
                    <small>Kiểm tra âm lượng loa ngoài và mở khóa quyền phát âm thanh</small>
                  </div>
                </div>
                <button
                  type="button"
                  className={`test-speaker-btn ${isTestingSpeaker ? 'is-testing' : ''}`}
                  onClick={handleTestSpeaker}
                >
                  {isTestingSpeaker ? 'Đang phát thử...' : 'Thử âm lượng'}
                </button>
              </div>

              <label className="home-label" htmlFor="modal-host-name">Tên người lập bàn</label>
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
                placeholder="Nhập tên gọi…"
              />

              <button
                className="home-button home-button-primary"
                onClick={() => enterLobby('create')}
              >
                <span>Khởi tạo bàn đấu</span>
                <span className="arrow-icon" aria-hidden="true">✦</span>
              </button>

              <div className="home-pre-room-tip">
                <span className="tip-bulb" aria-hidden="true">💡</span>
                <span>Mẹo: Bật im lặng thông báo và giảm độ sáng màn hình trước khi Đêm 1 bắt đầu.</span>
              </div>

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
