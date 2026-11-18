import { useEffect, useRef, useState } from 'react';
import type { ScreenName } from '../../navigation';
import { formatTime } from '../../utils/formatTime';
import './host.css';

type HostScreenProps = { onNavigate?: (screen: ScreenName) => void };

const players = [
  ['Minh Khang', 'Trưởng làng', true],
  ['Lan Anh', 'Sống', true],
  ['Hoàng Nam', 'Sống', true],
  ['Bảo Trâm', 'Tử vong', false],
  ['Đức Huy', 'Sống', true],
  ['Quỳnh Như', 'Sống', true],
] as const;

export default function HostScreen({ onNavigate }: HostScreenProps) {
  const [remaining, setRemaining] = useState(165);
  const [lockRemaining, setLockRemaining] = useState(60);
  const [paused, setPaused] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [voiceVolume, setVoiceVolume] = useState(85);
  const [musicVolume, setMusicVolume] = useState(40);
  const qrTrigger = useRef<HTMLButtonElement>(null);
  const qrClose = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
      setLockRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    if (!qrOpen && !emergencyOpen && !confirming) return;
    if (qrOpen) qrClose.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (qrOpen) {
          setQrOpen(false);
          qrTrigger.current?.focus();
        }
        if (emergencyOpen) setEmergencyOpen(false);
        if (confirming) setConfirming(false);
      } else if (event.key === 'Tab' && qrOpen) {
        event.preventDefault();
        qrClose.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [qrOpen, emergencyOpen, confirming]);

  const toggleFullscreen = () => {
    if (!document.fullscreenEnabled) return;
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
    else void document.exitFullscreen?.().catch(() => undefined);
  };

  const livingCount = players.filter((p) => p[2]).length;
  const deadCount = players.length - livingCount;
  const isUrgent = remaining <= 30;

  return (
    <main className="host-screen">
      <header className="host-header">
        <div className="host-brand">
          <span className="host-led" aria-hidden="true" />
          <div>
            <h1>
              BẢNG ĐIỀU PHỐI TRUNG TÂM <span>• PHÒNG #7290</span>
            </h1>
            <p>Màn hình công khai đặt giữa bàn hoặc chiếu Smart TV / iPad</p>
          </div>
        </div>
        <div className="host-header-actions">
          <button ref={qrTrigger} className="host-button" onClick={() => setQrOpen(true)} aria-haspopup="dialog">
            <span aria-hidden="true">▦</span>
            <span>QR Kết nối lại</span>
          </button>
          <button className="host-button" onClick={toggleFullscreen} title="Bật/Tắt toàn màn hình">
            <span aria-hidden="true">⛶</span>
            <span>Toàn màn hình</span>
          </button>
          <button className="host-mobile-nav" onClick={() => onNavigate?.('day')}>
            Pha ngày
          </button>
        </div>
      </header>

      <div className="host-layout">
        {/* Left Column: Player Roster */}
        <aside className="host-panel host-roster">
          <div className="host-panel-title">
            <strong>DANH SÁCH BÀN ĐẤU</strong>
            <span className="host-alive-tag">{livingCount} SỐNG · {deadCount} CHẾT</span>
          </div>

          <div className="host-player-list">
            {players.map(([name, , alive], index) => (
              <div className={`host-player ${!alive ? 'is-dead' : ''} ${index === 0 ? 'is-mayor' : ''}`} key={name}>
                <div className="host-player-name">
                  <span className="host-seat">#{String(index + 1).padStart(2, '0')}</span>
                  <i aria-hidden="true" />
                  <span className="host-name-txt">{name}</span>
                </div>
                {index === 0 ? (
                  <span className="host-mayor-tag">👑 TRƯỞNG LÀNG</span>
                ) : (
                  <span className={alive ? 'host-alive' : 'host-dead'}>
                    {alive ? 'SỐNG' : '☠ TỬ VONG'}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="host-emergency-wrap">
            {!emergencyOpen ? (
              <button className="host-emergency" onClick={() => setEmergencyOpen(true)}>
                <span>LOẠI KHẨN CẤP (RỜI BÀN)</span>
                <span aria-hidden="true">⚠️</span>
              </button>
            ) : (
              <div className="host-emergency-picker">
                <strong>Chọn người chơi rời bàn khẩn cấp:</strong>
                {players
                  .filter((p) => p[2])
                  .map(([name]) => (
                    <button
                      key={name}
                      onClick={() => {
                        setAnnouncement(`⚠️ ${name} đã được quản trò cho rời bàn.`);
                        setEmergencyOpen(false);
                      }}
                    >
                      {name}
                    </button>
                  ))}
                <button className="host-cancel" onClick={() => setEmergencyOpen(false)}>
                  Hủy bỏ
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Center Column: Big Clock & Debate Controls */}
        <section className={`host-panel host-main-panel ${isUrgent ? 'host-urgent' : ''}`}>
          <div className="host-panel-title host-center-title">
            <div className="host-title-left">
              <span className="phase-badge">NGÀY 2</span>
              <strong>ĐỒNG HỒ BIỂU QUYẾT TOÀN BÀN</strong>
            </div>
            <span className="host-stable">
              <i aria-hidden="true" />
              <span>LOA ĐANG HOẠT ĐỘNG</span>
            </span>
          </div>

          <div className="host-clock-block">
            <div className="host-clock" aria-live="off">{formatTime(remaining)}</div>
            <div className={`host-lock ${lockRemaining === 0 ? 'unlocked' : 'locked'}`}>
              <span aria-hidden="true">{lockRemaining === 0 ? '🔓' : '🔒'}</span>
              <span>
                {lockRemaining > 0 ? (
                  <>KHÓA BIỂU QUYẾT: <b>{lockRemaining}S TRANH LUẬN ĐẦU</b></>
                ) : (
                  <b className="unlocked-highlight">BỎ PHIẾU ĐÃ MỞ · CẢ LÀNG BẮT ĐẦU VOTE</b>
                )}
              </span>
            </div>
          </div>

          <div className="host-script">
            <div className="host-script-icon-wrap" aria-hidden="true">
              <span className="host-script-icon">🎙️</span>
            </div>
            <div className="host-script-text">
              <div className="host-script-header">
                <strong>LỜI THOẠI QUẢN TRÒ (PHÁT RA LOA TRUNG TÂM):</strong>
                <div className="audio-equalizer">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <p>“Trời sáng, đêm qua Thợ Săn Bảo Trâm đã hy sinh. Cả làng có thời gian tìm ra kẻ khả nghi trước khi biểu quyết.”</p>
            </div>
            <button
              className="host-button host-speaker"
              onClick={() => setAnnouncement('Đang phát giọng đọc quản trò qua loa...')}
              aria-label="Phát lại lời thoại"
            >
              <span>Phát lại</span>
            </button>
          </div>

          {announcement && <p className="host-notice" role="status">{announcement}</p>}

          <div className="host-controls">
            <div className="host-control-row">
              <button
                className="host-button host-control"
                onClick={() => setPaused((value) => !value)}
              >
                <span aria-hidden="true">{paused ? '▶' : 'Ⅱ'}</span>
                <span>{paused ? 'TIẾP TỤC ĐẾM GIỜ' : 'TẠM DỪNG ĐẾM GIỜ'}</span>
              </button>
              <button
                className="host-button host-control host-extend"
                onClick={() => setRemaining((value) => value + 30)}
              >
                <span aria-hidden="true">＋</span>
                <span>+30 GIÂY THẢO LUẬN</span>
              </button>
            </div>

            {!confirming ? (
              <button
                disabled={lockRemaining > 0}
                className="host-finalize"
                onClick={() => setConfirming(true)}
              >
                <span aria-hidden="true">⚒</span>
                <span>
                  {lockRemaining > 0
                    ? `CHỐT KẾT QUẢ VOTE (ĐANG KHÓA ${lockRemaining}S)`
                    : 'CHỐT KẾT QUẢ VOTE NGOÀI ĐỜI & LẬT BÀI'}
                </span>
              </button>
            ) : (
              <div className="host-confirm">
                <span>Xác nhận kết thúc bỏ phiếu và chuyển sang giải mã ván đấu?</span>
                <div className="host-confirm-actions">
                  <button className="host-button" onClick={() => setConfirming(false)}>
                    Hủy
                  </button>
                  <button className="host-confirm-yes" onClick={() => onNavigate?.('summary')}>
                    Đồng ý chốt →
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Audio & Privacy Guard */}
        <aside className="host-panel host-audio-panel">
          <div className="host-panel-title">
            <strong>BẢNG ĐIỀU CHỈNH ÂM THANH</strong>
            <span className="audio-badge">DUCKING AUTO</span>
          </div>

          <div className="host-slider-group">
            <label className="host-slider">
              <div className="slider-label">
                <span>Giọng đọc quản trò</span>
                <b>{voiceVolume}%</b>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={voiceVolume}
                onChange={(event) => setVoiceVolume(Number(event.target.value))}
                aria-label="Âm lượng giọng đọc"
              />
            </label>

            <label className="host-slider">
              <div className="slider-label">
                <span>Nhạc nền đêm (Ambient)</span>
                <b>{musicVolume}%</b>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={musicVolume}
                onChange={(event) => setMusicVolume(Number(event.target.value))}
                aria-label="Âm lượng nhạc nền"
              />
            </label>
          </div>

          <div className="host-public-note">
            <div className="note-title">
              <span aria-hidden="true">🔒</span>
              <strong>MÀN HÌNH BẢO MẬT TUYỆT ĐỐI</strong>
            </div>
            <p>Bảng trung tâm chỉ hiển thị thông tin công khai. Mọi vai trò và phiếu vote kín đều được che giấu đến hết ván.</p>
          </div>

          <button className="host-summary-btn" onClick={() => onNavigate?.('summary')}>
            Xem trước màn tổng kết →
          </button>
        </aside>
      </div>

      {/* QR Modal */}
      {qrOpen && (
        <div
          className="host-modal-backdrop"
          role="presentation"
          onClick={() => {
            setQrOpen(false);
            qrTrigger.current?.focus();
          }}
        >
          <section
            className="host-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="host-qr-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="host-modal-heading">
              <h2 id="host-qr-title">MÃ KẾT NỐI BÀN ĐẤU</h2>
              <button
                ref={qrClose}
                onClick={() => {
                  setQrOpen(false);
                  qrTrigger.current?.focus();
                }}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <div className="host-qr-wrap">
              <div className="qr-scan-line" aria-hidden="true" />
              <svg viewBox="0 0 80 80" className="host-qr-svg" aria-label="Mã QR kết nối phòng 7290">
                <rect width="80" height="80" fill="#080a0e" rx="4" />
                <rect x="6" y="6" width="20" height="20" fill="none" stroke="#f59e0b" strokeWidth="3" rx="2" />
                <rect x="11" y="11" width="10" height="10" fill="#f59e0b" rx="1" />
                <rect x="54" y="6" width="20" height="20" fill="none" stroke="#f59e0b" strokeWidth="3" rx="2" />
                <rect x="59" y="11" width="10" height="10" fill="#f59e0b" rx="1" />
                <rect x="6" y="54" width="20" height="20" fill="none" stroke="#f59e0b" strokeWidth="3" rx="2" />
                <rect x="11" y="59" width="10" height="10" fill="#f59e0b" rx="1" />
                <rect x="32" y="8" width="4" height="4" fill="#a1a1aa" />
                <rect x="42" y="8" width="4" height="4" fill="#a1a1aa" />
                <rect x="36" y="16" width="4" height="4" fill="#f59e0b" />
                <rect x="36" y="36" width="8" height="8" fill="#f59e0b" rx="2" />
                <rect x="36" y="62" width="4" height="4" fill="#a1a1aa" />
              </svg>
            </div>

            <strong className="host-room-code">#7290</strong>
            <p className="host-qr-desc">
              Quét mã để kết nối lại điện thoại nếu bị ngắt mạng hoặc vô tình đóng trình duyệt.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
