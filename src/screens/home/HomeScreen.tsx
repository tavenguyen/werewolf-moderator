import { useEffect, useRef, useState } from 'react';
import type { ScreenName } from '../../navigation';
import RulesAndRolesDrawer from '../../components/RulesAndRolesDrawer';
import './home.css';

type Props = {
  onNavigate?: (screen: ScreenName) => void;
  onPlayerJoined?: (name: string) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
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
  const rulesTrigger = useRef<HTMLButtonElement>(null);
  const navigationTimer = useRef<number | undefined>(undefined);
  const [roomCode, setRoomCode] = useState('7290');
  const [nickname, setNickname] = useState('Minh Khang');
  const [notice, setNotice] = useState('');
  const [deviceMode, setDeviceMode] = useState<'shared' | 'multi'>('shared');

  useEffect(() => () => window.clearTimeout(navigationTimer.current), []);

  const handleOpenRules = () => {
    if (onOpenRules) {
      onOpenRules('rules');
    } else {
      setFallbackDrawerOpen(true);
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
        <div className="home-hero">
          <h1>
            Đêm buông xuống.<br />
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
                <label htmlFor="room-code">Mã bàn (4 số)</label>
                <span className="home-demo-label">MÃ PHÒNG</span>
              </div>
              
              <div className="home-code-wrapper">
                <input
                  id="room-code"
                  className="home-code-input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
                  aria-describedby="demo-note"
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

              <p id="demo-note" className="home-helper">
                <span className="helper-icon" aria-hidden="true">❦</span>
                Quét mã QR trên màn hình của Quản trò hoặc nhập 4 số để vào chiếu họp.
              </p>

              <label className="home-label" htmlFor="nickname">Tên gọi của bạn</label>
              <input
                id="nickname"
                className="home-text-input"
                value={nickname}
                maxLength={24}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Nhập tên gọi…"
              />

              <button className="home-button home-button-primary" onClick={enterLobby}>
                <span>Bước vào bàn chơi</span>
                <span className="arrow-icon" aria-hidden="true">→</span>
              </button>
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

              <label className="home-label" htmlFor="host-name">Tên người lập bàn</label>
              <input
                id="host-name"
                className="home-text-input"
                value={nickname}
                maxLength={24}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Nhập tên gọi…"
              />

              <button className="home-button home-button-primary" onClick={enterLobby}>
                <span>Khởi tạo bàn đấu</span>
                <span className="arrow-icon" aria-hidden="true">✦</span>
              </button>
            </div>
          )}

          {notice && <p className="home-notice" role="status">{notice}</p>}
        </section>

        <div className="home-footnote">
          <span aria-hidden="true">❦</span>
          <span>Bàn chơi Ma Sói tự động · Đơn giản và thuận tiện</span>
        </div>
      </main>

      <footer className="home-footer">
        <span>MA SÓI HOST · SẴN SÀNG KHAI MÀN</span>
        <span>HỘI ĐỒNG THÔN BẢN</span>
      </footer>

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
