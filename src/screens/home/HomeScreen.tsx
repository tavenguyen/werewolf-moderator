import { useEffect, useRef, useState } from 'react';
import type { ScreenName } from '../../navigation';
import RulesAndRolesDrawer from '../../components/RulesAndRolesDrawer';
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
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [fallbackDrawerOpen, setFallbackDrawerOpen] = useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [isTestingSpeaker, setIsTestingSpeaker] = useState(false);

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
    if (!qrScannerOpen) return;
    qrCloseBtn.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setQrScannerOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [qrScannerOpen]);

  const handleOpenRules = () => {
    if (onOpenRules) {
      onOpenRules('rules');
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

  const enterLobby = () => {
    const cleanCode = roomCode.replace(/\D/g, '').slice(0, 4);
    if (mode === 'join' && cleanCode.length !== 4) {
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
    setNotice(mode === 'join' ? 'Đang vào sảnh chờ...' : 'Đã lập bàn chơi mới.');
    window.clearTimeout(navigationTimer.current);
    navigationTimer.current = window.setTimeout(() => onNavigate?.('lobby'), 250);
  };

  return (
    <div className="home-page">
      <header className="home-header">
        <a className="home-brand" href="#home" onClick={(event) => event.preventDefault()} aria-label="Ma Sói Host">
          <div className="home-moon-symbol" aria-hidden="true">
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
          </div>
          <div className="home-brand-text">
            <span>MA SÓI HOST</span>
            <small>Quản trò tự động cho đêm chơi Ma Sói</small>
          </div>
        </a>

        <div className="home-header-nav">
          <button
            ref={rulesTrigger}
            className="home-button home-button-quiet"
            onClick={handleOpenRules}
            title="Tra cứu luật làng và 10 vai trò thực chiến"
          >
            <span aria-hidden="true">📜</span>
            <span>Luật &amp; Vai trò</span>
          </button>
        </div>
      </header>

      <main className="home-main">
        {/* Auto-Reconnect Banner (Khôi phục ván đấu nếu F5 / ngắt kết nối) */}
        {activeSession && (
          <div className="home-reconnect-banner" role="region" aria-label="Khôi phục phiên chơi">
            <div className="reconnect-left">
              <span className="reconnect-pulse-dot" aria-hidden="true" />
              <div className="reconnect-info">
                <strong>Bạn đang ở bàn #{activeSession.roomCode} ({activeSession.nickname})</strong>
                <small>Bấm để quay lại bàn đấu ngay lập tức</small>
              </div>
            </div>
            <div className="reconnect-actions">
              <button
                type="button"
                className="reconnect-btn"
                onClick={handleReconnect}
                title="Vào lại bàn ngay"
              >
                Vào lại ngay →
              </button>
              <button
                type="button"
                className="reconnect-dismiss"
                onClick={handleDismissSession}
                title="Rời khỏi bàn này"
                aria-label="Bỏ qua bàn này"
              >
                ×
              </button>
            </div>
          </div>
        )}

        <div className="home-hero">
          <h1>
            Đêm buông xuống.
            <em>Cuộc chơi bắt đầu.</em>
          </h1>
        </div>

        <section className="home-console" aria-label="Vào hoặc tạo phòng">
          <div className="home-tabs" role="tablist" aria-label="Chọn thao tác">
            <button
              role="tab"
              aria-selected={mode === 'join'}
              className={mode === 'join' ? 'selected' : ''}
              onClick={() => { setMode('join'); setNotice(''); }}
            >
              <span>Vào bàn có sẵn</span>
            </button>
            <button
              role="tab"
              aria-selected={mode === 'create'}
              className={mode === 'create' ? 'selected' : ''}
              onClick={() => { setMode('create'); setNotice(''); }}
            >
              <span>Lập bàn đấu mới</span>
            </button>
          </div>

          {mode === 'join' ? (
            <div className="home-form" role="tabpanel">
              <div className="home-field-heading">
                <label htmlFor="room-code">Mã bàn 4 số</label>
              </div>
              
              <div className="home-code-row">
                <div className="home-code-wrapper">
                  <input
                    id="room-code"
                    className="home-code-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={roomCode}
                    onChange={(event) => setRoomCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    aria-describedby="code-help-text"
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

              <p id="code-help-text" className="home-helper">
                <span className="helper-icon" aria-hidden="true">❦</span>
                Nhập 4 số hoặc quét nhanh QR trên màn hình bàn Host.
              </p>

              <label className="home-label" htmlFor="nickname">Biệt danh của bạn</label>
              <input
                id="nickname"
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

              <button className="home-button home-button-primary" onClick={enterLobby}>
                <span>Bước vào bàn chơi</span>
                <span className="arrow-icon" aria-hidden="true">→</span>
              </button>

              <div className="home-pre-room-tip">
                <span className="tip-bulb" aria-hidden="true">💡</span>
                <span>Mẹo: Bật im lặng thông báo và giảm độ sáng màn hình trước khi Đêm 1 bắt đầu.</span>
              </div>
            </div>
          ) : (
            <div className="home-form" role="tabpanel">
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

              <label className="home-label" htmlFor="host-name">Tên người lập bàn</label>
              <input
                id="host-name"
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

              <button className="home-button home-button-primary" onClick={enterLobby}>
                <span>Khởi tạo bàn đấu</span>
                <span className="arrow-icon" aria-hidden="true">✦</span>
              </button>

              <div className="home-pre-room-tip">
                <span className="tip-bulb" aria-hidden="true">💡</span>
                <span>Mẹo: Bật im lặng thông báo và giảm độ sáng màn hình trước khi Đêm 1 bắt đầu.</span>
              </div>
            </div>
          )}

          {notice && <p className="home-notice" role="status">{notice}</p>}
        </section>
      </main>

      <footer className="home-footer">
        <div className="home-status-live">
          <span className="live-pulse-dot" aria-hidden="true" />
          <span>Máy chủ trực tiếp</span>
        </div>
        <span className="home-room-ping">Phòng #7290 sẵn sàng</span>
      </footer>

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
        />
      )}
    </div>
  );
}
