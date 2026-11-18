import { useEffect, useRef, useState } from 'react';
import type { ScreenName } from '../../navigation';
import './home.css';

type Props = { onNavigate?: (screen: ScreenName) => void };

export default function HomeScreen({ onNavigate }: Props) {
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesTrigger = useRef<HTMLButtonElement>(null);
  const rulesClose = useRef<HTMLButtonElement>(null);
  const navigationTimer = useRef<number | undefined>(undefined);
  const [roomCode, setRoomCode] = useState('7290');
  const [nickname, setNickname] = useState('Minh Khang');
  const [notice, setNotice] = useState('');
  const [deviceMode, setDeviceMode] = useState<'shared' | 'multi'>('shared');

  useEffect(() => () => window.clearTimeout(navigationTimer.current), []);

  useEffect(() => {
    if (!rulesOpen) return;
    rulesClose.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRulesOpen(false);
        rulesTrigger.current?.focus();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        rulesClose.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [rulesOpen]);

  const enterLobby = () => {
    if (mode === 'join' && !/^\d{4}$/.test(roomCode)) {
      setNotice('Mã phòng cần có đúng 4 chữ số.');
      return;
    }
    if (!nickname.trim()) {
      setNotice('Hãy nhập tên trước khi tiếp tục.');
      return;
    }
    setNotice(mode === 'join' ? 'Đang mở lobby demo…' : 'Đã tạo phòng demo.');
    window.clearTimeout(navigationTimer.current);
    navigationTimer.current = window.setTimeout(() => onNavigate?.('lobby'), 250);
  };

  return (
    <div className="home-page">
      <div className="home-ambient-glow" aria-hidden="true" />
      <header className="home-header">
        <a className="home-brand" href="#home" onClick={(event) => event.preventDefault()} aria-label="Ma Sói Host">
          <div className="home-moon-symbol" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" className="moon-svg">
              <path
                d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="home-brand-text">
            <span>MA SÓI HOST</span>
            <small>AI &amp; HYBRID MODERATOR</small>
          </div>
        </a>
        <button ref={rulesTrigger} className="home-button home-button-quiet" onClick={() => setRulesOpen(true)}>
          <span aria-hidden="true">▤</span>
          <span>Luật chơi</span>
        </button>
      </header>

      <main className="home-main">
        <div className="home-hero">
          <div className="home-eyebrow">
            <span className="home-led" />
            <span>KHÔNG CẦN QUẢN TRÒ · TRẢI NGHIỆM TRỰC TIẾP</span>
          </div>
          <h1>
            Đêm xuống.<br />
            <em>Cuộc chơi bắt đầu.</em>
          </h1>
          <p className="home-intro">
            Quản trò tự động cho nhóm bạn chơi trực tiếp mặt đối mặt. Điện thoại hỗ trợ thầm lặng ban đêm, tính toán và bảo mật tuyệt đối.
          </p>
        </div>

        <section className="home-console" aria-label="Vào hoặc tạo phòng">
          <div className="home-tabs" role="tablist" aria-label="Chọn thao tác">
            <button
              role="tab"
              aria-selected={mode === 'join'}
              className={mode === 'join' ? 'selected' : ''}
              onClick={() => { setMode('join'); setNotice(''); }}
            >
              <span>Tham gia bàn</span>
            </button>
            <button
              role="tab"
              aria-selected={mode === 'create'}
              className={mode === 'create' ? 'selected' : ''}
              onClick={() => { setMode('create'); setNotice(''); }}
            >
              <span>Tạo bàn mới</span>
            </button>
          </div>

          {mode === 'join' ? (
            <div className="home-form" role="tabpanel">
              <div className="home-field-heading">
                <label htmlFor="room-code">Mã bàn 4 số</label>
                <span className="home-demo-label">THỬ BẢN DEMO</span>
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
                        {digit || (isCurrent ? <span className="blinking-cursor">|</span> : '·')}
                      </div>
                    );
                  })}
                </div>
              </div>

              <p id="demo-note" className="home-helper">
                <span className="helper-icon" aria-hidden="true">✦</span>
                Mẹo: Bạn có thể quét mã QR từ thiết bị Host để vào phòng tức thì.
              </p>

              <label className="home-label" htmlFor="nickname">Tên của bạn trên bàn</label>
              <input
                id="nickname"
                className="home-text-input"
                value={nickname}
                maxLength={24}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Nhập biệt danh…"
              />

              <button className="home-button home-button-primary" onClick={enterLobby}>
                <span>Vào bàn chơi ngay</span>
                <span className="arrow-icon" aria-hidden="true">→</span>
              </button>
            </div>
          ) : (
            <div className="home-form" role="tabpanel">
              <p className="home-label">Chọn phương thức điều phối bàn đấu</p>
              
              <button
                type="button"
                className={`home-device-option ${deviceMode === 'shared' ? 'active' : ''}`}
                onClick={() => setDeviceMode('shared')}
                aria-pressed={deviceMode === 'shared'}
              >
                <div className="device-icon-wrap" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="device-svg">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                    <circle cx="12" cy="10" r="2.5" fill="currentColor" fillOpacity="0.2" />
                  </svg>
                </div>
                <div className="device-info">
                  <strong>Một máy đặt giữa bàn (Single-device)</strong>
                  <small>Đặt điện thoại/iPad ở trung tâm bàn làm bảng điều phối chung kiêm phát âm thanh.</small>
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
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="device-svg">
                    <rect x="5" y="2" width="14" height="20" rx="3" />
                    <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="device-info">
                  <strong>Nhiều điện thoại riêng (Multi-device)</strong>
                  <small>Mỗi người dùng điện thoại riêng để xem vai và thao tác kín đáo trong đêm.</small>
                </div>
                <span className="home-radio" aria-hidden="true" />
              </button>

              <label className="home-label" htmlFor="host-name">Tên người tạo bàn</label>
              <input
                id="host-name"
                className="home-text-input"
                value={nickname}
                maxLength={24}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Nhập biệt danh…"
              />

              <button className="home-button home-button-primary" onClick={enterLobby}>
                <span>Khởi tạo bàn đấu mới</span>
                <span className="arrow-icon" aria-hidden="true">＋</span>
              </button>
            </div>
          )}

          {notice && <p className="home-notice" role="status">{notice}</p>}
        </section>

        <div className="home-footnote">
          <span aria-hidden="true">✦</span>
          <span>Bản demo giao diện · Thiết kế chuẩn Modern Dark Atmospheric</span>
        </div>
      </main>

      <footer className="home-footer">
        <span>WEREWOLF MODERATOR</span>
        <span><i /> SẴN SÀNG ĐIỀU PHỐI</span>
      </footer>

      {rulesOpen && (
        <div
          className="home-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setRulesOpen(false);
              rulesTrigger.current?.focus();
            }
          }}
        >
          <section className="home-drawer" role="dialog" aria-modal="true" aria-labelledby="rules-title">
            <div className="home-drawer-head">
              <div className="drawer-title-group">
                <span className="drawer-icon" aria-hidden="true">☾</span>
                <h2 id="rules-title">Hướng dẫn bàn đấu Ma Sói Host</h2>
              </div>
              <button
                ref={rulesClose}
                aria-label="Đóng hướng dẫn"
                onClick={() => {
                  setRulesOpen(false);
                  rulesTrigger.current?.focus();
                }}
              >
                ×
              </button>
            </div>
            
            <div className="drawer-steps">
              <div className="drawer-step">
                <span className="step-num">01</span>
                <div>
                  <strong>Pha đêm (Sleep &amp; Secret Turn)</strong>
                  <p>Mọi người úp điện thoại xuống bàn. Quản trò gọi tên vai nào thì người đó mở mắt chạm vào máy để thao tác kín, sau đó úp máy lại.</p>
                </div>
              </div>
              <div className="drawer-step">
                <span className="step-num">02</span>
                <div>
                  <strong>Pha ngày (Eyes-Up Discussion)</strong>
                  <p>Cả bàn mở mắt nhìn nhau thảo luận tự do. Nút biểu quyết bị khóa 60 giây đầu để buộc cả làng tranh luận trước khi bỏ phiếu.</p>
                </div>
              </div>
              <div className="drawer-step">
                <span className="step-num">03</span>
                <div>
                  <strong>Giải mã ván đấu (Post-game Reveal)</strong>
                  <p>Cuối ván cùng lật toàn bộ thẻ bài thực tế, xem lại dòng thời gian đêm và bấm chơi ván mới ngay lập tức.</p>
                </div>
              </div>
            </div>
            
            <div className="drawer-footer-note">
              <span>✦</span> Không cần tài khoản · Chống lộ thông tin qua F12
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
