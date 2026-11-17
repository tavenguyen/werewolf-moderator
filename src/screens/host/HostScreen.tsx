import { useEffect, useRef, useState } from 'react';
import './host.css';

type ScreenName = 'lobby' | 'night' | 'day' | 'host' | 'summary' | 'home';

type HostScreenProps = { onNavigate?: (screen: ScreenName) => void };

const players = [
  ['Minh Khang', 'Trưởng làng', true],
  ['Lan Anh', 'Sống', true],
  ['Hoàng Nam', 'Sống', true],
  ['Bảo Trâm', 'Tử vong', false],
  ['Đức Huy', 'Sống', true],
  ['Quỳnh Như', 'Sống', true],
] as const;

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export default function HostScreen({ onNavigate }: HostScreenProps) {
  const [remaining, setRemaining] = useState(165);
  const [lockRemaining, setLockRemaining] = useState(60);
  const [paused, setPaused] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [voiceVolume, setVoiceVolume] = useState(80);
  const [musicVolume, setMusicVolume] = useState(45);
  const qrTrigger = useRef<HTMLButtonElement>(null);
  const qrClose = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (paused || (remaining === 0 && lockRemaining === 0)) return;
    const timer = window.setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
      setLockRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [paused, remaining === 0, lockRemaining === 0]);

  useEffect(() => {
    if (!qrOpen) return;
    qrClose.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setQrOpen(false);
        qrTrigger.current?.focus();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        qrClose.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [qrOpen]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
    else void document.exitFullscreen?.().catch(() => undefined);
  };

  return (
    <main className="host-screen">
      <header className="host-header">
        <div className="host-brand">
          <span className="host-led" aria-hidden="true" />
          <div>
            <h1>BẢNG ĐIỀU PHỐI TRUNG TÂM <span>• PHÒNG #7290</span></h1>
            <p>Màn hình công khai đặt giữa bàn hoặc chiếu TV</p>
          </div>
        </div>
        <div className="host-header-actions">
          <button ref={qrTrigger} className="host-button" onClick={() => setQrOpen(true)} aria-haspopup="dialog">▦ <span>QR kết nối lại</span></button>
          <button className="host-button" onClick={toggleFullscreen}>⛶ <span>Toàn màn hình</span></button>
          <button className="host-mobile-nav" onClick={() => onNavigate?.('day')}>Pha ngày</button>
        </div>
      </header>

      <div className="host-layout">
        <aside className="host-panel host-roster">
          <div className="host-panel-title"><strong>DANH SÁCH BÀN (5/1)</strong><span>{players.filter((p) => p[2]).length} SỐNG</span></div>
          <div className="host-player-list">
            {players.map(([name, status, alive], index) => (
              <div className={`host-player ${!alive ? 'is-dead' : ''} ${index === 0 ? 'is-mayor' : ''}`} key={name}>
                <span className="host-player-name"><i aria-hidden="true" />{index + 1}. {name}</span>
                <span className={index === 0 ? 'host-mayor-tag' : alive ? 'host-alive' : 'host-dead'}>{index === 0 ? 'TRƯỞNG LÀNG' : status}</span>
              </div>
            ))}
          </div>
          <div className="host-emergency-wrap">
            {!emergencyOpen ? <button className="host-emergency" onClick={() => setEmergencyOpen(true)}>LOẠI KHẨN CẤP (RỜI BÀN) <span>♟</span></button> : (
              <div className="host-emergency-picker">
                <strong>Chọn người rời bàn</strong>
                {players.filter((p) => p[2]).map(([name]) => <button key={name} onClick={() => { setAnnouncement(`${name} được đánh dấu rời bàn trong bản demo.`); setEmergencyOpen(false); }}>{name}</button>)}
                <button className="host-cancel" onClick={() => setEmergencyOpen(false)}>Hủy</button>
              </div>
            )}
          </div>
        </aside>

        <section className="host-panel host-main-panel">
          <div className="host-panel-title host-center-title"><strong>ĐỒNG HỒ THẢO LUẬN TỰ DO</strong><span className="host-demo-status">BẢN DEMO · CHƯA KẾT NỐI</span></div>
          <div className="host-clock-block">
            <div className="host-clock" aria-live="off">{formatTime(remaining)}</div>
            <div className="host-lock">◷ <span>KHÓA BIỂU QUYẾT TRONG: <b>{lockRemaining ? `${lockRemaining}S` : 'ĐÃ MỞ'}</b></span></div>
          </div>
          <div className="host-script">
            <span className="host-script-icon" aria-hidden="true">◖</span>
            <div><strong>LỜI THOẠI QUẢN TRÒ (LOA BÀN):</strong><p>“Trời sáng, đêm qua Thợ Săn Bảo Trâm đã hy sinh. Cả làng có thời gian tìm ra kẻ khả nghi.”</p></div>
            <button className="host-button host-speaker" onClick={() => setAnnouncement('Phát loa chưa được kết nối trong bản demo.')} aria-label="Phát lời thoại (chưa khả dụng)">◖ <span>Phát loa</span></button>
          </div>
          {announcement && <p className="host-notice" role="status">{announcement}</p>}
          <div className="host-controls">
            <div className="host-control-row">
              <button className="host-button host-control" onClick={() => setPaused((value) => !value)}>{paused ? '▶' : 'Ⅱ'} <span>{paused ? 'TIẾP TỤC ĐẾM GIỜ' : 'TẠM DỪNG ĐẾM GIỜ'}</span></button>
              <button className="host-button host-control host-extend" onClick={() => setRemaining((value) => value + 30)}>＋ <span>+30 GIÂY THẢO LUẬN</span></button>
            </div>
            {!confirming ? <button disabled={lockRemaining > 0} className="host-finalize" onClick={() => setConfirming(true)}>⚒ <span>{lockRemaining > 0 ? `CHỐT KẾT QUẢ VOTE (ĐANG KHÓA ${lockRemaining}S)` : 'CHỐT KẾT QUẢ VOTE NGOÀI ĐỜI'}</span></button> : (
              <div className="host-confirm"><span>Xác nhận chốt kết quả và chuyển sang giải mã vai trò?</span><div><button className="host-button" onClick={() => setConfirming(false)}>Hủy</button><button className="host-confirm-yes" onClick={() => onNavigate?.('summary')}>Đồng ý chốt</button></div></div>
            )}
          </div>
        </section>

        <aside className="host-panel host-audio-panel">
          <div className="host-panel-title"><strong>♫ LOA BÀN</strong></div>
          <label className="host-slider"><span>Giọng đọc <b>{voiceVolume}%</b></span><input type="range" min="0" max="100" value={voiceVolume} onChange={(event) => setVoiceVolume(Number(event.target.value))} aria-label="Âm lượng giọng đọc (demo)" /></label>
          <label className="host-slider"><span>Nhạc đêm <b>{musicVolume}%</b></span><input type="range" min="0" max="100" value={musicVolume} onChange={(event) => setMusicVolume(Number(event.target.value))} aria-label="Âm lượng nhạc đêm (demo)" /></label>
          <p className="host-public-note">✓ Màn hình công khai, không lộ chức năng bí mật.</p>
          <button className="host-mobile-nav" onClick={() => onNavigate?.('summary')}>Xem tổng kết demo</button>
        </aside>
      </div>

      {qrOpen && <div className="host-modal-backdrop" role="presentation" onClick={() => { setQrOpen(false); qrTrigger.current?.focus(); }}><section className="host-modal" role="dialog" aria-modal="true" aria-labelledby="host-qr-title" onClick={(event) => event.stopPropagation()}>
        <div className="host-modal-heading"><h2 id="host-qr-title">MÃ KẾT NỐI DEMO</h2><button ref={qrClose} onClick={() => { setQrOpen(false); qrTrigger.current?.focus(); }} aria-label="Đóng">×</button></div>
        <div className="host-qr-placeholder" aria-label="QR demo không kết nối phòng thật"><span>▦</span><small>DEMO</small></div>
        <strong className="host-room-code">#7290</strong><p>Mã và QR minh họa; chưa kết nối người chơi.</p>
      </section></div>}
    </main>
  );
}
