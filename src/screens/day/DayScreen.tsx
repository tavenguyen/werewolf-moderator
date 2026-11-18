import { useEffect, useState } from 'react';
import type { ScreenName } from '../../navigation';
import { formatTime } from '../../utils/formatTime';
import './day.css';

type DayScreenProps = { onNavigate?: (screen: ScreenName) => void };

const initialPlayers = [
  { name: 'Minh Khang', alive: true, mayor: true },
  { name: 'Lan Anh', alive: true },
  { name: 'Hoàng Nam', alive: true },
  { name: 'Bảo Trâm', alive: false },
  { name: 'Đức Huy', alive: true },
  { name: 'Quỳnh Như', alive: true },
];

export default function DayScreen({ onNavigate }: DayScreenProps) {
  const [totalTime] = useState(180);
  const [remaining, setRemaining] = useState(165);
  const [lockRemaining, setLockRemaining] = useState(60);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<'shared' | 'player'>('shared');
  const [selected, setSelected] = useState<string | null>(null);
  const [voteSubmitted, setVoteSubmitted] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [isNarrating, setIsNarrating] = useState(true);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
      setLockRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [paused]);

  useEffect(() => {
    if (!confirmFinalize) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmFinalize(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmFinalize]);

  const unlocked = lockRemaining === 0;
  const livingPlayers = initialPlayers.filter((player) => player.alive);
  const isUrgent = remaining <= 30;

  // Calculate SVG circular progress
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (remaining / totalTime) * circumference;

  return (
    <main className="day-screen app-page">
      <header className="screen-header day-header">
        <div className="phase-label">
          <span className="status-dot day-dot" />
          <span>NGÀY 2 <b>•</b> THẢO LUẬN DÂN LÀNG</span>
        </div>
        <nav aria-label="Chế độ xem ban ngày" className="day-mode-switch">
          <button
            type="button"
            aria-pressed={mode === 'shared'}
            onClick={() => setMode('shared')}
            className={mode === 'shared' ? 'day-mode-active' : ''}
          >
            BÀN CHUNG
          </button>
          <button
            type="button"
            aria-pressed={mode === 'player'}
            onClick={() => setMode('player')}
            className={mode === 'player' ? 'day-mode-active' : ''}
          >
            NGƯỜI CHƠI
          </button>
        </nav>
      </header>

      <div className="day-main">
        {/* Circular Countdown Clock */}
        <section className={`day-clock-card ${isUrgent ? 'is-urgent' : ''}`}>
          <span className="eyebrow">ĐỒNG HỒ THẢO LUẬN TỰ DO</span>
          
          <div className="day-clock-graphic">
            <svg className="timer-svg" viewBox="0 0 160 160">
              {/* Background ring */}
              <circle
                cx="80"
                cy="80"
                r={radius}
                className="timer-ring-bg"
                strokeWidth="7"
                fill="none"
              />
              {/* Progress ring */}
              <circle
                cx="80"
                cy="80"
                r={radius}
                className={`timer-ring-progress ${isUrgent ? 'urgent-ring' : ''}`}
                strokeWidth="7"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <div className="clock-digits-wrap">
              <div className="day-clock" aria-live="off">{formatTime(remaining)}</div>
              <span className="clock-status-tag">{paused ? 'TẠM DỪNG' : isUrgent ? 'SẮP HẾT GIỜ' : 'ĐANG ĐẾM'}</span>
            </div>
          </div>

          <div className={`lock-indicator ${unlocked ? 'is-unlocked' : 'is-locked'}`} aria-live="polite">
            <span className="lock-icon" aria-hidden="true">{unlocked ? '🔓' : '🔒'}</span>
            <span>
              {unlocked ? (
                <strong className="unlocked-text">BIỂU QUYẾT ĐÃ MỞ · CẢ LÀNG BẮT ĐẦU VOTE</strong>
              ) : (
                <>KHÓA BIỂU QUYẾT: <strong>{lockRemaining}S TRANH LUẬN ĐẦU</strong></>
              )}
            </span>
          </div>

          <div className="day-timer-actions">
            <button
              type="button"
              className="action-btn-pause"
              onClick={() => setPaused((value) => !value)}
            >
              <span aria-hidden="true">{paused ? '▶' : 'Ⅱ'}</span>
              <span>{paused ? 'TIẾP TỤC ĐẾM' : 'TẠM DỪNG'}</span>
            </button>
            <button
              type="button"
              className="action-btn-extend"
              onClick={() => setRemaining((value) => value + 30)}
            >
              <span aria-hidden="true">＋</span>
              <span>GIA HẠN +30S</span>
            </button>
          </div>
        </section>

        {/* Narrator Card with Live Audio Waves */}
        <section className="narration-card">
          <div className="narration-avatar" aria-hidden="true">
            <span className="narration-icon">🎙️</span>
          </div>
          <div className="narration-body">
            <div className="narration-title-bar">
              <strong>LỜI THOẠI QUẢN TRÒ TỰ ĐỘNG</strong>
              <div className="audio-equalizer" title="Quản trò đang phát giọng nói">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
            <p>
              “Trời đã sáng, đêm qua Thợ Săn Bảo Trâm đã tử vong. Cả làng có thời gian thảo luận tự do trước khi tiến hành bỏ phiếu treo cổ.”
            </p>
          </div>
          <button
            type="button"
            className="replay-voice-btn"
            onClick={() => setIsNarrating((v) => !v)}
            title="Nghe lại lời dẫn"
          >
            {isNarrating ? 'Đang phát' : 'Phát lại'}
          </button>
        </section>

        {mode === 'shared' ? (
          <section className="day-players-panel">
            <div className="day-panel-heading">
              <div className="heading-group">
                <span className="heading-dot" />
                <strong>TRẠNG THÁI BÀN ĐẤU</strong>
              </div>
              <span className="player-stats">
                <b>{livingPlayers.length}</b> Sống · <b>{initialPlayers.length - livingPlayers.length}</b> Chết
              </span>
            </div>

            <div className="day-player-grid">
              {initialPlayers.map((player, index) => (
                <div
                  key={player.name}
                  className={`day-player-card ${player.alive ? 'is-alive' : 'is-dead'}`}
                >
                  <div className="player-col-main">
                    <span className="seat-badge">#{String(index + 1).padStart(2, '0')}</span>
                    <i className={player.alive ? 'alive-indicator' : 'dead-indicator'} />
                    <span className={`player-title ${player.alive ? '' : 'crossed-out'}`}>
                      {player.name}
                    </span>
                  </div>
                  {player.mayor ? (
                    <b className="mayor-badge">👑 TRƯỞNG LÀNG</b>
                  ) : (
                    <span className={player.alive ? 'alive-label' : 'dead-label'}>
                      {player.alive ? 'SỐNG' : '☠ TỬ VONG'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="day-players-panel">
            <div className="day-panel-heading">
              <div className="heading-group">
                <span className="heading-dot" />
                <strong>BỎ PHIẾU BÍ MẬT CỦA BẠN</strong>
              </div>
              <span className={unlocked ? 'unlocked-label' : 'locked-label'}>
                {unlocked ? '✓ ĐÃ MỞ PHIẾU' : `🔒 KHÓA ${lockRemaining}S`}
              </span>
            </div>

            <div className="day-vote-grid">
              {initialPlayers.map((player, index) =>
                player.alive ? (
                  <button
                    key={player.name}
                    type="button"
                    disabled={!unlocked || voteSubmitted}
                    aria-pressed={selected === player.name}
                    onClick={() => { setSelected(player.name); setNotice(''); }}
                    className={`day-vote-card ${selected === player.name ? 'vote-selected' : ''}`}
                  >
                    <div className="vote-card-header">
                      <span className="vote-seat">#{String(index + 1).padStart(2, '0')}</span>
                      <span className="vote-name">{player.name}</span>
                    </div>
                    <small className="vote-weight">
                      {player.mayor ? '⭐ 2 Phiếu (Trưởng làng)' : '1 Phiếu biểu quyết'}
                    </small>
                  </button>
                ) : (
                  <div key={player.name} className="day-vote-card dead-vote-card">
                    <div className="vote-card-header">
                      <span className="vote-seat">#{String(index + 1).padStart(2, '0')}</span>
                      <span className="vote-name crossed-out">{player.name}</span>
                    </div>
                    <small className="dead-tag">☠ Đã tử vong</small>
                  </div>
                )
              )}
            </div>

            {unlocked && (
              <button
                type="button"
                disabled={!selected || voteSubmitted}
                className={`cast-vote-button ${voteSubmitted ? 'is-submitted' : ''}`}
                onClick={() => {
                  if (selected && !voteSubmitted) {
                    setVoteSubmitted(true);
                    setNotice(`✓ Đã ghi nhận phiếu vote của bạn: ${selected}`);
                  }
                }}
              >
                <span>
                  {voteSubmitted
                    ? `✓ ĐÃ GỬI PHIẾU VOTE (${selected})`
                    : selected
                    ? `BỎ PHIẾU TREO CỔ: ${selected}`
                    : 'CHỌN MỤC TIÊU ĐỂ GỬI PHIẾU'}
                </span>
              </button>
            )}
          </section>
        )}
      </div>

      <footer className="day-bottom-bar">
        {confirmFinalize ? (
          <div className="finalize-confirm" role="group" aria-label="Xác nhận chốt kết quả">
            <span className="confirm-text">Xác nhận hoàn tất thảo luận &amp; lật mở kết quả ván?</span>
            <div className="confirm-btns">
              <button type="button" className="confirm-cancel" onClick={() => setConfirmFinalize(false)}>
                Hủy
              </button>
              <button type="button" className="confirm-yes" onClick={() => onNavigate?.('summary')}>
                Chốt kết quả →
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="finalize-button"
            disabled={!unlocked}
            onClick={() => setConfirmFinalize(true)}
          >
            <span className="gavel-icon" aria-hidden="true">⚒</span>
            <span>
              {unlocked
                ? 'CHỐT KẾT QUẢ BIỂU QUYẾT TREO CỔ'
                : `KHÓA CHỐT VOTE (${lockRemaining}S ĐẦU)`}
            </span>
          </button>
        )}
        {notice && <p role="status" className="vote-notice">{notice}</p>}
      </footer>
    </main>
  );
}
