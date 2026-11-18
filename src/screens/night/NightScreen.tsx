import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ScreenName } from '../../navigation';
import './night.css';

type NightScreenProps = {
  onNavigate?: (screen: ScreenName) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
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
    setNotice(action === 'heal' ? '✓ ĐÃ NIÊM ẤN CỨU NẠN NHÂN' : `☠ ĐÃ NIÊM ẤN ĐẦU ĐỘC: ${target}`);
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
          <span className="status-ember" />
          <span>TRỜI TỐI · ĐÊM THỨ I</span>
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
              {item === 'sleep' ? 'Thổi nến' : item === 'role' ? 'Lượt gọi' : 'Chiếu đá'}
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
          <h1>THỔI TẮT NGỌN NẾN</h1>
          <p>Nhắm mắt lại và lắng nghe khẩu lệnh của quản trò từ loa trung tâm.</p>
          <div className="standby">
            <span className="stealth-ember-dot" aria-hidden="true" />
            <span>TĨNH LẶNG · BẢO MẬT BAN ĐÊM</span>
          </div>
          <p className="demo-note">Độ sáng tối thiểu để không chiếu sáng gương mặt khi đêm buông</p>
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
              <span className="timer-pulse-ember" aria-hidden="true" />
              <span>00:18</span>
            </div>
          </div>

          <div className="victim-card">
            <div className="victim-info">
              <div className="victim-glyph-wrap" aria-hidden="true">
                <span className="victim-glyph">☠</span>
              </div>
              <div className="victim-meta">
                <small>DẤU VẾT BẦY SÓI ĐÊM NAY</small>
                <strong>Bảo Trâm (Ghế #04)</strong>
              </div>
            </div>
            <button
              type="button"
              className={`hold-button heal-button ${complete === 'heal' ? 'is-complete' : ''} ${progress > 0 ? 'is-pressing' : ''}`}
              aria-label="Giữ một giây để niêm ấn bình tiên dược cứu người"
              {...holdProps('heal')}
            >
              <span
                className="hold-progress heal-progress"
                style={{ width: `${complete === 'heal' ? 100 : progress}%` }}
              />
              <span className="hold-label">
                {complete === 'heal' ? '✓ ĐÃ NIÊM ẤN CỨU' : progress > 0 ? `Ấn dấu (${progress}%)` : 'Ấn Sáp Cứu 1s'}
              </span>
            </button>
          </div>

          <div className="target-heading">
            <div>
              <strong>BÌNH ĐỘC DƯỢC (CÒN I LẦN)</strong>
              <small>Chọn thôn dân muốn gieo lời nguyền</small>
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
              aria-label="Giữ một giây để niêm ấn độc dược mục tiêu đã chọn"
              {...holdProps('poison')}
            >
              <span
                className="hold-progress poison-progress"
                style={{ width: `${complete === 'poison' ? 100 : progress}%` }}
              />
              <span className="hold-label">
                {complete === 'poison'
                  ? `☠ ĐÃ NIÊM ẤN: ${target}`
                  : target
                  ? `Ấn Sáp Đầu Độc ${target}`
                  : 'Chọn mục tiêu bên trên'}
              </span>
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => { setMode('sleep'); setNotice(''); }}
            >
              Không dùng dược liệu &amp; thổi nến
            </button>
          </div>

          {notice && <p className="screen-notice" role="status">{notice}</p>}
        </section>
      )}

      {mode === 'table' && (
        <section className="night-content table-content">
          <div className="screen-title">
            <span>CHIẾU ĐÁ HỘI ĐỒNG</span>
            <h1>Định vị chỗ ngồi thôn dân</h1>
          </div>
          <svg className="seat-table" viewBox="0 0 280 280" role="img" aria-label={`Sơ đồ chiếu đá ${seats} ghế`}>
            {/* Outer stone circle ritual ring */}
            <circle cx="140" cy="140" r="105" fill="none" stroke="rgba(201,134,56,.18)" strokeDasharray="3 5" />
            <circle cx="140" cy="140" r="50" fill="none" stroke="rgba(237,231,220,.06)" />
            
            {/* Center host altar device */}
            <rect x="118" y="110" width="44" height="60" rx="6" fill="#13161d" stroke="#c98638" strokeWidth="1.5" />
            <circle cx="140" cy="134" r="4" fill="#c98638" />
            <text x="140" y="156" textAnchor="middle" fill="#ede7dc" fontSize="7.5" fontWeight="700" letterSpacing="0.05em">LOA BÀN</text>
            
            {/* Player seat nodes */}
            {seatPositions.map(({ x, y, index }) => (
              <g key={index} className="seat-node">
                <rect
                  x={x - 28}
                  y={y - 11}
                  width="56"
                  height="22"
                  rx="4"
                  fill="#141720"
                  stroke={index === 0 ? '#c98638' : 'rgba(237,231,220,.16)'}
                  strokeWidth={index === 0 ? '1.5' : '1'}
                />
                <text
                  x={x}
                  y={y + 3}
                  textAnchor="middle"
                  fill={index === 0 ? '#c98638' : '#ede7dc'}
                  fontSize="8.5"
                  fontWeight="600"
                >
                  {index + 1}.{(roster[index] || `Ghế ${index + 1}`).split(' ')[0]}
                </text>
              </g>
            ))}
          </svg>

          <div className="seat-count" aria-label="Số chỗ ngồi">
            <span>SỐ CHỖ NGỒI:</span>
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
            <span>Trời sáng · Đánh mõ mở ngày</span>
            <span aria-hidden="true">⟶</span>
          </button>
        </section>
      )}

      <footer className="screen-footer night-footer">
        <span>TĨNH LẶNG TUYỆT ĐỐI</span>
        <span>•</span>
        <span>PHONG ẤN BẢO MẬT BAN ĐÊM</span>
      </footer>
    </main>
  );
}
