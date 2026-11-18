import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ScreenName } from '../../navigation';
import './night.css';

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
  const completionTimer = useRef<number | undefined>(undefined);
  const [progress, setProgress] = useState(0);

  useEffect(() => () => {
    window.clearTimeout(timer.current);
    window.clearTimeout(completionTimer.current);
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

    // Security: Validate target exists before applying poison
    if (action === 'poison' && (!target || !roster.includes(target))) {
      setProgress(0);
      return;
    }

    setProgress(100);
    setComplete(action);
    setNotice(action === 'heal' ? '✓ ĐÃ CỨU SỐNG NẠN NHÂN' : `☠ ĐÃ ĐẦU ĐỘC: ${target}`);
    completionTimer.current = window.setTimeout(() => {
      setProgress(0);
      setComplete(null);
      setMode('sleep');
      setNotice('');
    }, 1400);
  };

  const startHold = (action: 'heal' | 'poison') => {
    if (complete || (action === 'poison' && (!target || !roster.includes(target))) || timer.current) return;
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
    onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
    },
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
        <div className="phase-label">
          <span className="status-dot danger-dot" />
          <span>PHA ĐÊM THỨ 1</span>
        </div>
        <nav aria-label="Chế độ ban đêm" className="segmented-control">
          {(['sleep', 'role', 'table'] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
              className={mode === item ? 'segment active' : 'segment'}
            >
              {item === 'sleep' ? 'Úp máy' : item === 'role' ? 'Lượt gọi' : 'Bàn tròn'}
            </button>
          ))}
        </nav>
      </header>

      {mode === 'sleep' && (
        <section className="night-content sleep-content" aria-live="polite">
          <div className="stealth-moon-wrap" aria-hidden="true">
            <div className="stealth-moon-ring" />
            <div className="sleep-icon">☾</div>
          </div>
          <h1>ÚP MÁY XUỐNG BÀN</h1>
          <p>Nhắm mắt lại và lắng nghe hiệu lệnh của quản trò từ loa trung tâm.</p>
          <div className="standby">
            <span className="stealth-radar-dot" aria-hidden="true" />
            <span>STANDBY · ZERO-GLARE OLED</span>
          </div>
          <p className="demo-note">Độ sáng tối thiểu để không chiếu sáng mặt người chơi ban đêm</p>
        </section>
      )}

      {mode === 'role' && (
        <section className="night-content role-content">
          <div className="role-heading">
            <div className="role-caller">
              <span className="role-glyph" aria-hidden="true">✦</span>
              <div>
                <h2>PHÙ THỦY THỨC GIẤC</h2>
                <small>BẠN ĐANG TRONG LƯỢT KÍN ĐÊM NAY</small>
              </div>
            </div>
            <div className="timer-chip">
              <span className="timer-pulse-dot" aria-hidden="true" />
              <span>00:18</span>
            </div>
          </div>

          <div className="victim-card">
            <div className="victim-info">
              <div className="victim-glyph-wrap" aria-hidden="true">
                <span className="victim-glyph">☠</span>
              </div>
              <div className="victim-meta">
                <small>NẠN NHÂN BỊ SÓI CẮN ĐÊM NAY</small>
                <strong>Bảo Trâm (Ghế #04)</strong>
              </div>
            </div>
            <button
              type="button"
              className={`hold-button heal-button ${complete === 'heal' ? 'is-complete' : ''} ${progress > 0 ? 'is-pressing' : ''}`}
              aria-label="Giữ một giây để dùng bình cứu"
              {...holdProps('heal')}
            >
              <span
                className="hold-progress heal-progress"
                style={{ width: `${complete === 'heal' ? 100 : progress}%` }}
              />
              <span className="hold-label">
                {complete === 'heal' ? '✓ ĐÃ CỨU' : progress > 0 ? `Giữ (${progress}%)` : 'Giữ 1s Cứu'}
              </span>
            </button>
          </div>

          <div className="target-heading">
            <div>
              <strong>BÌNH ĐỘC (CÒN 1 LẦN)</strong>
              <small>Chọn người chơi muốn đầu độc</small>
            </div>
            <span className="target-hint">{target ? `Mục tiêu: ${target}` : 'Chưa chọn'}</span>
          </div>

          <div className="target-grid">
            {roster.slice(0, 6).map((name, index) => (
              <button
                type="button"
                key={name}
                aria-pressed={target === name}
                onClick={() => setTarget(name)}
                className={`target-card ${target === name ? 'selected' : ''}`}
              >
                <div className="target-meta">
                  <span className="target-num">#{String(index + 1).padStart(2, '0')}</span>
                  <span className="target-name">{name}</span>
                </div>
                <span className="target-crosshair" aria-hidden="true">
                  {target === name ? '⦿' : '○'}
                </span>
              </button>
            ))}
          </div>

          <div className="role-actions">
            <button
              type="button"
              className={`hold-button poison-button ${complete === 'poison' ? 'is-complete' : ''} ${progress > 0 && target ? 'is-pressing' : ''}`}
              disabled={!target || !!complete}
              aria-label="Giữ một giây để xác nhận đầu độc mục tiêu đã chọn"
              {...holdProps('poison')}
            >
              <span
                className="hold-progress poison-progress"
                style={{ width: `${complete === 'poison' ? 100 : progress}%` }}
              />
              <span className="hold-label">
                {complete === 'poison'
                  ? `☠ ĐÃ ĐẦU ĐỘC: ${target}`
                  : target
                  ? `Giữ 1s đầu độc ${target}`
                  : 'Chọn mục tiêu bên trên'}
              </span>
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => { setMode('sleep'); setNotice(''); }}
            >
              Không dùng bình &amp; úp máy lại
            </button>
          </div>

          {notice && <p className="screen-notice" role="status">{notice}</p>}
        </section>
      )}

      {mode === 'table' && (
        <section className="night-content table-content">
          <div className="screen-title">
            <span>SƠ ĐỒ BÀN TRÒN TỰ ĐỘNG</span>
            <h1>Định vị ghế ngồi người chơi</h1>
          </div>
          <svg className="seat-table" viewBox="0 0 280 280" role="img" aria-label={`Sơ đồ bàn tròn ${seats} ghế`}>
            {/* Center orbital radar */}
            <circle cx="140" cy="140" r="105" fill="none" stroke="rgba(255,255,255,.09)" strokeDasharray="4 4" />
            <circle cx="140" cy="140" r="50" fill="none" stroke="rgba(255,255,255,.04)" />
            
            {/* Center host device */}
            <rect x="120" y="112" width="40" height="56" rx="6" fill="#090a0d" stroke="#f59e0b" strokeWidth="1.5" />
            <circle cx="140" cy="136" r="4" fill="#f59e0b" />
            <text x="140" y="156" textAnchor="middle" fill="#f59e0b" fontSize="7.5" fontWeight="700">MÁY BÀN</text>
            
            {/* Player seats */}
            {seatPositions.map(({ x, y, index }) => (
              <g key={index} className="seat-node">
                <rect
                  x={x - 28}
                  y={y - 11}
                  width="56"
                  height="22"
                  rx="4"
                  fill="#0d1017"
                  stroke={index === 0 ? '#f59e0b' : 'rgba(255,255,255,.14)'}
                  strokeWidth={index === 0 ? '1.5' : '1'}
                />
                <text
                  x={x}
                  y={y + 3}
                  textAnchor="middle"
                  fill={index === 0 ? '#f59e0b' : '#d4d4d8'}
                  fontSize="8.5"
                  fontWeight="600"
                >
                  {index + 1}.{(roster[index] || `Ghế ${index + 1}`).split(' ')[0]}
                </text>
              </g>
            ))}
          </svg>

          <div className="seat-count" aria-label="Số ghế bàn">
            <span>SỐ GHẾ BÀN:</span>
            {[6, 8, 10, 12].map((count) => (
              <button
                type="button"
                key={count}
                aria-pressed={seats === count}
                className={seats === count ? 'seat-count-active' : ''}
                onClick={() => setSeats(count)}
              >
                {count}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="next-phase-button"
            onClick={() => onNavigate?.('day')}
          >
            <span>Trời sáng · Tiếp tục sang pha ngày</span>
            <span aria-hidden="true">→</span>
          </button>
        </section>
      )}

      <footer className="screen-footer night-footer">
        <span>ZERO-GLARE OLED SYSTEM</span>
        <span>•</span>
        <span>BẢO MẬT BAN ĐÊM TUYỆT ĐỐI</span>
      </footer>
    </main>
  );
}
