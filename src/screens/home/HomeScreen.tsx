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
      <header className="home-header">
        <a className="home-brand" href="#home" onClick={(event) => event.preventDefault()} aria-label="Ma Sói Host">
          <span className="home-moon" aria-hidden="true">☾</span>
          <span>MA SÓI HOST</span>
        </a>
        <button ref={rulesTrigger} className="home-button home-button-quiet" onClick={() => setRulesOpen(true)}>
          <span aria-hidden="true">▤</span> Luật chơi
        </button>
      </header>

      <main className="home-main">
        <div className="home-eyebrow"><span className="home-led" /> FIELD COMPANION · BẢN DEMO</div>
        <h1>Đêm xuống.<br /><em>Cuộc chơi bắt đầu.</em></h1>
        <p className="home-intro">Tạo bàn đấu hoặc tham gia cùng bạn bè. Không cần tài khoản.</p>

        <section className="home-console" aria-label="Vào hoặc tạo phòng">
          <div className="home-tabs" role="tablist" aria-label="Chọn thao tác">
            <button role="tab" aria-selected={mode === 'join'} className={mode === 'join' ? 'selected' : ''} onClick={() => { setMode('join'); setNotice(''); }}>Tham gia bàn</button>
            <button role="tab" aria-selected={mode === 'create'} className={mode === 'create' ? 'selected' : ''} onClick={() => { setMode('create'); setNotice(''); }}>Tạo bàn mới</button>
          </div>

          {mode === 'join' ? (
            <div className="home-form" role="tabpanel">
              <div className="home-field-heading"><label htmlFor="room-code">Mã bàn 4 số</label><span className="home-demo-label">THỬ BẢN DEMO</span></div>
              <input id="room-code" className="home-code-input" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={roomCode} onChange={(event) => setRoomCode(event.target.value.replace(/\D/g, '').slice(0, 4))} aria-describedby="demo-note" />
              <p id="demo-note" className="home-helper">Quét QR và kết nối phòng sẽ được bổ sung sau.</p>
              <label className="home-label" htmlFor="nickname">Tên của bạn trên bàn</label>
              <input id="nickname" className="home-text-input" value={nickname} maxLength={24} onChange={(event) => setNickname(event.target.value)} placeholder="Nhập biệt danh…" />
              <button className="home-button home-button-primary" onClick={enterLobby}>Vào bàn chơi <span aria-hidden="true">→</span></button>
            </div>
          ) : (
            <div className="home-form" role="tabpanel">
              <p className="home-label">Chọn phương thức điều phối</p>
              <button className={`home-device-option ${deviceMode === 'shared' ? 'active' : ''}`} onClick={() => setDeviceMode('shared')} aria-pressed={deviceMode === 'shared'}>
                <span className="home-radio" aria-hidden="true" />
                <span><strong>Một máy đặt giữa bàn</strong><small>Thiết bị chung hiển thị và điều phối ván chơi.</small></span>
              </button>
              <button className={`home-device-option ${deviceMode === 'multi' ? 'active' : ''}`} onClick={() => setDeviceMode('multi')} aria-pressed={deviceMode === 'multi'}>
                <span className="home-radio" aria-hidden="true" />
                <span><strong>Nhiều điện thoại riêng</strong><small>Mỗi người dùng điện thoại của mình. Kết nối hiện chỉ là demo.</small></span>
              </button>
              <label className="home-label" htmlFor="host-name">Tên người tạo bàn</label>
              <input id="host-name" className="home-text-input" value={nickname} maxLength={24} onChange={(event) => setNickname(event.target.value)} placeholder="Nhập biệt danh…" />
              <button className="home-button home-button-primary" onClick={enterLobby}>Khởi tạo bàn đấu <span aria-hidden="true">＋</span></button>
            </div>
          )}
          {notice && <p className="home-notice" role="status">{notice}</p>}
        </section>

        <div className="home-footnote"><span aria-hidden="true">✦</span> Bản demo frontend · Chưa kết nối nhiều thiết bị</div>
      </main>

      <footer className="home-footer"><span>WEREWOLF MODERATOR</span><span><i /> GIAO DIỆN DEMO</span></footer>

      {rulesOpen && <div className="home-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setRulesOpen(false); rulesTrigger.current?.focus(); } }}>
        <section className="home-drawer" role="dialog" aria-modal="true" aria-labelledby="rules-title">
          <div className="home-drawer-head"><h2 id="rules-title">Hướng dẫn bàn đấu</h2><button ref={rulesClose} aria-label="Đóng hướng dẫn" onClick={() => { setRulesOpen(false); rulesTrigger.current?.focus(); }}>×</button></div>
          <p><strong>1. Pha đêm:</strong> Đặt điện thoại úp xuống. Người được gọi mở mắt và thao tác khi đến lượt.</p>
          <p><strong>2. Pha ngày:</strong> Cả bàn thảo luận; vote được mở sau thời gian khóa đầu ngày.</p>
          <p><strong>3. Kết thúc:</strong> Cùng lật bài và xem lại diễn biến ván đấu.</p>
          <p className="home-helper">Các luật và hành động trong bản này chỉ phục vụ trình diễn giao diện.</p>
        </section>
      </div>}
    </div>
  );
}
