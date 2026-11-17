import { useEffect, useState } from 'react';
import './day.css';

type ScreenName = 'lobby' | 'night' | 'day' | 'host' | 'summary' | 'home';
type DayScreenProps = { onNavigate?: (screen: ScreenName) => void };

const players = [
  { name: 'Minh Khang', alive: true, mayor: true },
  { name: 'Lan Anh', alive: true },
  { name: 'Hoàng Nam', alive: true },
  { name: 'Bảo Trâm', alive: false },
  { name: 'Đức Huy', alive: true },
  { name: 'Quỳnh Như', alive: true },
];

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export default function DayScreen({ onNavigate }: DayScreenProps) {
  const [remaining, setRemaining] = useState(165);
  const [lockRemaining, setLockRemaining] = useState(60);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<'shared' | 'player'>('shared');
  const [selected, setSelected] = useState<string | null>(null);
  const [voteSubmitted, setVoteSubmitted] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmFinalize, setConfirmFinalize] = useState(false);

  useEffect(() => {
    if (paused || (remaining === 0 && lockRemaining === 0)) return;
    const id = window.setInterval(() => {
      if (remaining > 0) setRemaining(value => Math.max(0, value - 1));
      if (lockRemaining > 0) setLockRemaining(value => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [paused, remaining, lockRemaining]);

  const unlocked = lockRemaining === 0;
  const livingPlayers = players.filter(player => player.alive);

  return (
    <main className="day-screen app-page">
      <header className="screen-header day-header">
        <div className="phase-label"><span className="status-dot day-dot" /><span>NGÀY 2 <b>•</b> THẢO LUẬN</span></div>
        <nav aria-label="Chế độ xem ban ngày" className="day-mode-switch">
          <button type="button" aria-pressed={mode === 'shared'} onClick={() => setMode('shared')} className={mode === 'shared' ? 'day-mode-active' : ''}>BÀN CHUNG</button>
          <button type="button" aria-pressed={mode === 'player'} onClick={() => setMode('player')} className={mode === 'player' ? 'day-mode-active' : ''}>NGƯỜI CHƠI</button>
        </nav>
      </header>

      <div className="day-main">
        <section className="day-clock-card">
          <span className="eyebrow">ĐỒNG HỒ THẢO LUẬN TỰ DO</span>
          <div className="day-clock" aria-live="off">{formatTime(remaining)}</div>
          <div className="lock-indicator" aria-live="polite">
            <span aria-hidden="true">◷</span>
            <span>{unlocked ? 'BỎ PHIẾU ĐÃ MỞ' : <>KHÓA BIỂU QUYẾT: <strong>{lockRemaining}S ĐẦU</strong></>}</span>
          </div>
          <div className="day-timer-actions">
            <button type="button" onClick={() => setPaused(value => !value)}><span aria-hidden="true">{paused ? '▶' : 'Ⅱ'}</span>{paused ? 'TIẾP TỤC' : 'TẠM DỪNG'}</button>
            <button type="button" onClick={() => setRemaining(value => value + 30)}><span aria-hidden="true">＋</span>+30 GIÂY</button>
          </div>
        </section>

        <section className="narration-card">
          <span className="narration-icon" aria-hidden="true">◖</span>
          <div><strong>LỜI THOẠI QUẢN TRÒ</strong><p>“Trời đã sáng, đêm qua Thợ Săn Bảo Trâm đã tử vong. Cả làng có thời gian thảo luận tự do.”</p></div>
          <button type="button" disabled aria-label="Phát lời dẫn chưa khả dụng">Âm thanh chưa kết nối</button>
        </section>

        {mode === 'shared' ? (
          <section className="day-players-panel">
            <div className="day-panel-heading"><strong>TRẠNG THÁI BÀN ({livingPlayers.length} SỐNG / {players.length - livingPlayers.length} CHẾT)</strong><span>Đặt giữa bàn</span></div>
            <div className="day-player-grid">
              {players.map((player, index) => <div key={player.name} className={`day-player-card ${player.alive ? '' : 'is-dead'}`}>
                <div><i className={player.alive ? 'alive-indicator' : 'dead-indicator'} /><span className={player.alive ? '' : 'crossed-out'}>{index + 1}. {player.name}</span></div>
                {player.mayor ? <b className="mayor-badge">TRƯỞNG LÀNG</b> : <span className={player.alive ? 'alive-label' : 'dead-label'}>{player.alive ? 'Sống' : 'TỬ VONG'}</span>}
              </div>)}
            </div>
          </section>
        ) : (
          <section className="day-players-panel">
            <div className="day-panel-heading"><strong>BỎ PHIẾU BÍ MẬT CỦA BẠN</strong><span className={unlocked ? 'unlocked-label' : 'locked-label'}>{unlocked ? 'ĐÃ MỞ BỎ PHIẾU' : `CHỈ XEM · KHÓA ${lockRemaining}S`}</span></div>
            <div className="day-vote-grid">
              {players.map((player, index) => player.alive ? <button key={player.name} type="button" disabled={!unlocked || voteSubmitted} aria-pressed={selected === player.name} onClick={() => { setSelected(player.name); setNotice(''); }} className={`day-vote-card ${selected === player.name ? 'vote-selected' : ''}`}>
                <span>{index + 1}. {player.name}</span><small>{player.mayor ? '2 Phiếu · Trưởng làng' : '1 Phiếu'}</small>
              </button> : <div key={player.name} className="day-vote-card dead-vote-card"><span className="crossed-out">{index + 1}. {player.name}</span><small>Đã chết</small></div>)}
            </div>
              {unlocked && <button type="button" disabled={!selected || voteSubmitted} className="cast-vote-button" onClick={() => { if (selected && !voteSubmitted) { setVoteSubmitted(true); setNotice(`Đã ghi nhận lựa chọn demo: ${selected}.`); } }}>{voteSubmitted ? 'ĐÃ GỬI PHIẾU' : `GỬI PHIẾU${selected ? `: ${selected}` : ''}`}</button>}
          </section>
        )}
      </div>

      <footer className="day-bottom-bar">
        {confirmFinalize ? <div className="finalize-confirm" role="group" aria-label="Xác nhận chốt kết quả">
          <span>Xác nhận chuyển sang màn giải mã?</span>
          <button type="button" onClick={() => setConfirmFinalize(false)}>Hủy</button>
          <button type="button" className="confirm-yes" onClick={() => onNavigate?.('summary')}>Đồng ý</button>
        </div> : <button type="button" className="finalize-button" disabled={!unlocked} onClick={() => setConfirmFinalize(true)}>
          <span aria-hidden="true">⚒</span>{unlocked ? 'CHỐT KẾT QUẢ VOTE NGOÀI ĐỜI' : `MỞ VOTE SAU ${lockRemaining}S (ĐANG KHÓA)`}
        </button>}
        {notice && <p role="status" className="vote-notice">{notice}</p>}
      </footer>
    </main>
  );
}
