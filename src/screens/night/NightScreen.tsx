import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import './night.css';

type ScreenName = 'lobby' | 'night' | 'day' | 'host' | 'summary' | 'home';

type NightScreenProps = {
  onNavigate?: (screen: ScreenName) => void;
};

const roster = [
  'Minh Khang', 'Lan Anh', 'Hoàng Nam', 'Bảo Trâm', 'Đức Huy', 'Quỳnh Như',
  'Văn Hậu', 'Thúy Kiều', 'Gia Bảo', 'Tường Vy', 'Đăng Khoa', 'Mỹ Duyên',
];

export default function NightScreen({ onNavigate }: NightScreenProps) {
  const [mode, setMode] = useState<'sleep' | 'role' | 'table'>('sleep');
  const [target, setTarget] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [seats, setSeats] = useState(8);
  const [complete, setComplete] = useState<'heal' | 'poison' | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const progressTimer = useRef<number | undefined>(undefined);
  const [progress, setProgress] = useState(0);

  useEffect(() => () => {
    window.clearTimeout(timer.current);
    window.clearInterval(progressTimer.current);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('night-sleep-active', mode === 'sleep');
    return () => document.body.classList.remove('night-sleep-active');
  }, [mode]);

  const finishAction = (action: 'heal' | 'poison') => {
    window.clearTimeout(timer.current);
    window.clearInterval(progressTimer.current);
    timer.current = undefined;
    progressTimer.current = undefined;
    setProgress(100);
    setComplete(action);
    setNotice(action === 'heal' ? 'Đã xác nhận dùng bình cứu trong bản demo.' : `Đã xác nhận đầu độc ${target}.`);
    window.setTimeout(() => {
      setProgress(0);
      setComplete(null);
      setMode('sleep');
      setNotice('');
    }, 1400);
  };

  const startHold = (action: 'heal' | 'poison') => {
    if (complete || (action === 'poison' && !target) || timer.current) return;
    setProgress(0);
    const started = Date.now();
    progressTimer.current = window.setInterval(() => {
      const value = Math.min(100, Math.round(((Date.now() - started) / 1000) * 100));
      setProgress(value);
      if (value >= 100) finishAction(action);
    }, 32);
    timer.current = window.setTimeout(() => finishAction(action), 1000);
  };

  const cancelHold = () => {
    if (!timer.current) return;
    window.clearTimeout(timer.current);
    window.clearInterval(progressTimer.current);
    timer.current = undefined;
    setProgress(0);
  };

  const holdProps = (action: 'heal' | 'poison') => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      startHold(action);
    },
    onPointerUp: cancelHold,
    onPointerLeave: cancelHold,
    onPointerCancel: cancelHold,
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) startHold(action);
    },
    onKeyUp: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') cancelHold();
    },
  });

  const seatPositions = Array.from({ length: seats }, (_, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / seats;
    return { x: 140 + 105 * Math.cos(angle), y: 140 + 105 * Math.sin(angle), index };
  });

  return (
    <main className={`night-screen app-page ${mode === 'sleep' ? 'night-sleep' : ''}`}>
      <header className="screen-header night-header">
        <div className="phase-label"><span className="status-dot danger-dot" /> <span>ĐÊM 1</span></div>
        <nav aria-label="Chế độ ban đêm" className="segmented-control">
          {(['sleep', 'role', 'table'] as const).map((item) => (
            <button key={item} type="button" aria-pressed={mode === item} onClick={() => setMode(item)} className={mode === item ? 'segment active' : 'segment'}>
              {item === 'sleep' ? 'Úp máy' : item === 'role' ? 'Lượt gọi' : 'Bàn tròn'}
            </button>
          ))}
        </nav>
      </header>

      {mode === 'sleep' && (
        <section className="night-content sleep-content" aria-live="polite">
          <div className="sleep-icon" aria-hidden="true">☾</div>
          <h1>ÚP MÁY XUỐNG BÀN</h1>
          <p>Chờ hiệu lệnh từ quản trò.</p>
          <span className="standby"><i /> STANDBY</span>
          <p className="demo-note">Màn hình chờ của bản demo</p>
        </section>
      )}

      {mode === 'role' && (
        <section className="night-content role-content">
          <div className="role-heading">
            <div><span className="role-glyph" aria-hidden="true">✦</span><span>PHÙ THỦY THỨC GIẤC</span></div>
            <span className="timer-chip">00:18</span>
          </div>
          <div className="victim-card">
            <div><span className="victim-glyph" aria-hidden="true">☠</span><span><small>NẠN NHÂN ĐÊM NAY</small><strong>Bảo Trâm (Ghế 4)</strong></span></div>
            <button type="button" className="hold-button heal-button" aria-label="Giữ một giây để dùng bình cứu" {...holdProps('heal')}>
              <span className="hold-progress heal-progress" style={{ width: `${complete === 'heal' ? 100 : progress}%` }} />
              <span className="hold-label">{complete === 'heal' ? 'ĐÃ CỨU' : 'Giữ 1s Cứu'}</span>
            </button>
          </div>
          <div className="target-heading"><strong>BÌNH ĐỘC (CÒN 1 LẦN)</strong><span>Chạm chọn rồi giữ để chốt</span></div>
          <div className="target-grid">
            {roster.slice(0, 6).map((name, index) => (
              <button type="button" key={name} aria-pressed={target === name} onClick={() => setTarget(name)} className={`target-card ${target === name ? 'selected' : ''}`}>
                <span>{index + 1}. {name}</span><small>G{index + 1}</small>
              </button>
            ))}
          </div>
          <div className="role-actions">
            <button type="button" className="hold-button poison-button" disabled={!target || !!complete} aria-label="Giữ một giây để xác nhận đầu độc mục tiêu đã chọn" {...holdProps('poison')}>
              <span className="hold-progress poison-progress" style={{ width: `${complete === 'poison' ? 100 : progress}%` }} />
              <span className="hold-label">{complete === 'poison' ? `ĐÃ ĐẦU ĐỘC: ${target}` : `Giữ 1s để đầu độc (${target ?? 'Chưa chọn'})`}</span>
            </button>
            <button type="button" className="secondary-button" onClick={() => { setMode('sleep'); setNotice(''); }}>Không dùng bình &amp; úp máy</button>
          </div>
          {notice && <p className="screen-notice" role="status">{notice}</p>}
        </section>
      )}

      {mode === 'table' && (
        <section className="night-content table-content">
          <div className="screen-title"><span>SƠ ĐỒ BÀN TRÒN TỰ ĐỘNG</span><h1>Chạm vị trí ghế để định vị</h1></div>
          <svg className="seat-table" viewBox="0 0 280 280" role="img" aria-label={`Sơ đồ bàn tròn ${seats} ghế`}>
            <circle cx="140" cy="140" r="105" fill="none" stroke="rgba(255,255,255,.12)" strokeDasharray="3 3" />
            <rect x="122" y="115" width="36" height="50" rx="4" fill="#000" stroke="rgba(255,255,255,.2)" />
            <text x="140" y="143" textAnchor="middle" fill="#71717a" fontSize="8">MÁY</text>
            {seatPositions.map(({ x, y, index }) => <g key={index}>
              <rect x={x - 28} y={y - 10} width="56" height="20" rx="3" fill="#090a0d" stroke={index === 0 ? '#f59e0b' : 'rgba(255,255,255,.12)'} />
              <text x={x} y={y + 3} textAnchor="middle" fill={index === 0 ? '#f59e0b' : '#a1a1aa'} fontSize="8">{index + 1}.{roster[index].split(' ')[0]}</text>
            </g>)}
          </svg>
          <div className="seat-count" aria-label="Số ghế bàn">
            <span>SỐ GHẾ BÀN:</span>{[6, 8, 10, 12].map(count => <button type="button" key={count} aria-pressed={seats === count} className={seats === count ? 'seat-count-active' : ''} onClick={() => setSeats(count)}>{count}</button>)}
          </div>
          <button type="button" className="secondary-button" onClick={() => onNavigate?.('day')}>Tiếp tục sang pha ngày demo</button>
        </section>
      )}

      <footer className="screen-footer night-footer">ZERO-GLARE SYSTEM <span>•</span> AUDIO CHƯA KẾT NỐI</footer>
    </main>
  );
}
