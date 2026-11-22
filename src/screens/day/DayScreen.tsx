import { useEffect, useState } from 'react';
import type { ScreenName } from '../../navigation';
import { useGameSession } from '../../adapters/useGameSession';
import { formatTime } from '../../utils/formatTime';
import CompactHostControlBar from '../../components/CompactHostControlBar';
import type { PlayerId } from '../../engine/types';
import './day.css';

type DayScreenProps = {
  onNavigate?: (screen: ScreenName) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
};

export default function DayScreen({ onNavigate, onOpenRules }: DayScreenProps) {
  const { state, actions, deviceMode } = useGameSession();

  const publicView = state.publicView;
  const privateView = state.privateView;
  const isSingleDevice = deviceMode === 'SINGLE_DEVICE';
  const isPlayerHost = state.isHost && state.hostMode === 'PLAYER_HOST';

  const [mode, setMode] = useState<'shared' | 'player'>('player');
  const [selectedPlayerId, setSelectedPlayerId] = useState<PlayerId | null>(null);
  const [voteSubmitted, setVoteSubmitted] = useState(false);
  const [notice, setNotice] = useState('');
  const [remainingTime, setRemainingTime] = useState(180);

  const players = publicView?.players ?? [];
  const livingPlayers = players.filter((p) => p.isAlive);
  const deadPlayers = players.filter((p) => !p.isAlive);
  const isPaused = publicView?.isPaused ?? false;
  const voteLocked = publicView?.voteLocked ?? false;
  const voteLockRemaining = publicView?.voteLockRemainingSeconds ?? 0;
  const lastVoteTally = publicView?.lastVoteTally;

  // Cập nhật đếm ngược theo deadlineAt từ session (đóng băng khi Pause)
  useEffect(() => {
    if (!publicView?.deadlineAt) {
      setRemainingTime(180);
      return;
    }

    if (publicView.isPaused) {
      // Khi đang Pause, đóng băng hiển thị không cập nhật đếm lùi
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const left = Math.max(0, Math.ceil((publicView.deadlineAt! - now) / 1000));
      setRemainingTime(left);
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 500);
    return () => window.clearInterval(interval);
  }, [publicView?.deadlineAt, publicView?.isPaused]);

  // Reset voteSubmitted khi sang ngày mới, đổi phase, hoặc khi đổi người chơi ở chế độ 1 máy
  useEffect(() => {
    setVoteSubmitted(false);
    setSelectedPlayerId(null);
  }, [publicView?.roundNumber, publicView?.phase, state.playerId]);

  const handleCastVote = async () => {
    if (voteSubmitted || voteLocked) return;

    try {
      await actions.sendDayVote(selectedPlayerId);
      setVoteSubmitted(true);
      const targetName = selectedPlayerId
        ? players.find((p) => p.id === selectedPlayerId)?.name
        : 'Phiếu trắng';
      setNotice(`✓ Đã niêm phong phiếu biểu quyết kín của bạn (${targetName}). Không thể sửa đổi.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi gửi phiếu';
      setNotice(msg);
    }
  };

  const handleFinalizeVote = async () => {
    try {
      await actions.finalizePublicVote();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể chốt phán quyết lúc này';
      setNotice(msg);
    }
  };

  const isUrgent = remainingTime <= 30;
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(remainingTime, 180) / 180) * circumference;

  return (
    <main className="day-screen app-page">
      {/* Compact Host Bar cho Host kiêm Người chơi */}
      {isPlayerHost && <CompactHostControlBar />}

      <header className="screen-header day-header">
        <div className="phase-label">
          <span className="day-candle-flame" aria-hidden="true">☀️</span>
          <span>
            TRỜI SÁNG · NGÀY {publicView?.roundNumber || 1} <b>•</b> THẢO LUẬN DÂN LÀNG
          </span>
        </div>

        <div className="day-header-actions">
          <nav aria-label="Chế độ xem ban ngày" className="day-mode-switch">
            <button
              type="button"
              aria-pressed={mode === 'player'}
              onClick={() => setMode('player')}
              className={mode === 'player' ? 'day-mode-active' : ''}
            >
              PHIẾU KÍN
            </button>
            <button
              type="button"
              aria-pressed={mode === 'shared'}
              onClick={() => setMode('shared')}
              className={mode === 'shared' ? 'day-mode-active' : ''}
            >
              CHIẾU BÀN
            </button>
          </nav>
          <button
            type="button"
            className="day-rules-button"
            onClick={() => onOpenRules?.('roles')}
            title="Tra cứu luật làng và vai trò"
          >
            <span aria-hidden="true">📜</span>
            <span>Luật &amp; Vai trò</span>
          </button>
        </div>
      </header>

      <div className="day-main">
        {/* Antique Sundial Countdown Clock */}
        <section className={`day-clock-card ${isUrgent ? 'is-urgent' : ''}`}>
          <span className="eyebrow">ĐỒNG HỒ NẮNG • THẢO LUẬN DÂN LÀNG</span>

          <div className="day-clock-graphic">
            <svg className="timer-svg" viewBox="0 0 160 160">
              <circle
                cx="80"
                cy="80"
                r={radius}
                className="timer-ring-bg"
                strokeWidth="6"
                fill="none"
              />
              <circle
                cx="80"
                cy="80"
                r={radius}
                className={`timer-ring-progress ${isUrgent ? 'urgent-ring' : ''}`}
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <div className="clock-digits-wrap">
              <div className="day-clock" aria-live="off">{formatTime(remainingTime)}</div>
              <span className="clock-status-tag">
                {isPaused ? 'TẠM DỪNG' : isUrgent ? 'HOÀNG HÔN BUÔNG' : 'ĐANG THẢO LUẬN'}
              </span>
            </div>
          </div>

          <div className={`lock-indicator ${!voteLocked ? 'is-unlocked' : 'is-locked'}`} aria-live="polite">
            <span className="lock-icon" aria-hidden="true">{!voteLocked ? '🔓' : '🔒'}</span>
            <span>
              {!voteLocked ? (
                <strong className="unlocked-text">HÒM PHIẾU ĐÃ MỞ · CẢ LÀNG BỎ PHIẾU TREO CỔ</strong>
              ) : (
                <>KHÓA BIỂU QUYẾT: <strong>{voteLockRemaining}S ĐÀM ĐẠO ĐẦU</strong></>
              )}
            </span>
          </div>

          {/* Điều khiển cho Host */}
          {state.isHost && (
            <div className="day-timer-actions">
              <button
                type="button"
                className="action-btn-pause"
                onClick={() => (isPaused ? actions.hostResume() : actions.hostPause())}
              >
                <span aria-hidden="true">{isPaused ? '▶' : '⏸'}</span>
                <span>{isPaused ? 'TIẾP TỤC ĐẾM' : 'TẠM DỪNG'}</span>
              </button>
              {(publicView?.extensionsUsed ?? 0) < 2 && (
                <button
                  type="button"
                  className="action-btn-extend"
                  onClick={() => actions.hostExtendTime()}
                >
                  <span aria-hidden="true">＋</span>
                  <span>GIA HẠN +30S</span>
                </button>
              )}
            </div>
          )}
        </section>

        {/* Cổ Thư / Log thông báo sáng */}
        <section className="narration-card">
          <div className="narration-avatar" aria-hidden="true">
            <span className="narration-icon">📜</span>
          </div>
          <div className="narration-body">
            <div className="narration-title-bar">
              <strong>THÔNG CÁO DÂN LÀNG BUỔI SÁNG</strong>
            </div>
            <p>
              {publicView?.publicLogs?.[publicView.publicLogs.length - 1] ??
                'Trời đã sáng, thôn dân cùng nhau bàn bạc vạch trần kẻ ác ma trước khi hoàng hôn buông xuống.'}
            </p>
          </div>
        </section>

        {/* Banner Gấu gầm (Bear Tamer) */}
        {publicView?.bearGrowled !== undefined && (
          <div
            className={`day-event-banner ${publicView.bearGrowled ? 'bear-growled' : 'bear-calm'}`}
            role="status"
          >
            <span className="banner-icon" aria-hidden="true">
              {publicView.bearGrowled ? '🐻' : '🌿'}
            </span>
            <div className="banner-text">
              {publicView.bearGrowled ? (
                <>
                  <strong>TIẾNG GẤU GẦM DỮ DỘI!</strong>
                  <span>Gấu thuần hóa phát hiện có Ma Sói ngồi ngay cạnh bên!</span>
                </>
              ) : (
                <>
                  <strong>GẤU THUẦN HÓA YÊN LẶNG</strong>
                  <span>Không có Ma Sói nào ngồi cạnh người thuần gấu sáng nay.</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Banner Hoàng tử lật thẻ (Prince) */}
        {publicView?.princeRevealed && (
          <div className="day-event-banner prince-revealed" role="status">
            <span className="banner-icon" aria-hidden="true">👑</span>
            <div className="banner-text">
              <strong>HOÀNG TỬ ĐÃ LẬT THẺ!</strong>
              <span>Án treo cổ bị bãi bỏ. Hoàng tử giữ nguyên quyền bỏ phiếu.</span>
            </div>
          </div>
        )}

        {/* Kết quả biểu quyết gần nhất nếu có */}
        {lastVoteTally && (
          <section className="last-tally-card">
            <strong>KẾT QUẢ BIỂU QUYẾT VỪA QUA:</strong>
            <div className="tally-breakdown">
              {Object.entries(lastVoteTally.tallies).map(([pId, count]) => {
                const p = players.find((pl) => pl.id === pId);
                return (
                  <span key={pId} className="tally-badge">
                    #{p?.seatIndex} {p?.name}: <b>{count} phiếu</b>
                  </span>
                );
              })}
              <span className="tally-badge abstain-badge">
                Phiếu trắng: <b>{lastVoteTally.abstainCount} phiếu</b>
              </span>
            </div>
          </section>
        )}

        {/* Danh sách người chơi / Bỏ phiếu */}
        {mode === 'player' ? (
          <section className="day-players-panel">
            <div className="day-panel-heading">
              <div className="heading-group">
                <span className="heading-dot" />
                <strong>BỎ PHIẾU BIỂU QUYẾT KÍN</strong>
              </div>
              <span className={!voteLocked ? 'unlocked-label' : 'locked-label'}>
                {!voteLocked ? '✓ HÒM PHIẾU ĐÃ MỞ' : `🔒 KHÓA ${voteLockRemaining}S`}
              </span>
            </div>

            {/* Single-device chọn người đang vote */}
            {isSingleDevice && (
              <div className="offline-voter-bar">
                <span>Người đang cầm máy bỏ phiếu:</span>
                <select
                  value={state.playerId}
                  onChange={(e) => actions.setLocalActivePlayer(e.target.value)}
                  className="offline-select"
                >
                  {livingPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.seatIndex} {p.name} {p.isMayor ? '(Trưởng làng - 2 phiếu)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="day-vote-grid">
              {/* Nút Bỏ phiếu trắng */}
              <button
                type="button"
                disabled={voteLocked || voteSubmitted}
                aria-pressed={selectedPlayerId === null}
                onClick={() => setSelectedPlayerId(null)}
                className={`day-vote-card abstain-card ${selectedPlayerId === null ? 'vote-selected' : ''}`}
              >
                <div className="vote-card-header">
                  <span className="vote-seat">⚪</span>
                  <span className="vote-name">Bỏ phiếu trắng</span>
                </div>
                <small className="vote-weight">Không muốn treo cổ ai hôm nay</small>
              </button>

              {players.map((player) =>
                player.isAlive ? (
                  <button
                    key={player.id}
                    type="button"
                    disabled={voteLocked || voteSubmitted}
                    aria-pressed={selectedPlayerId === player.id}
                    onClick={() => {
                      setSelectedPlayerId(player.id);
                      setNotice('');
                    }}
                    className={`day-vote-card ${selectedPlayerId === player.id ? 'vote-selected' : ''}`}
                  >
                    <div className="vote-card-header">
                      <span className="vote-seat">#{String(player.seatIndex).padStart(2, '0')}</span>
                      <span className="vote-name">{player.name}</span>
                    </div>
                    <small className="vote-weight">
                      {player.isMayor ? '👑 Trưởng làng (2 Phiếu)' : '1 Phiếu biểu quyết'}
                    </small>
                  </button>
                ) : (
                  <div key={player.id} className="day-vote-card dead-vote-card">
                    <div className="vote-card-header">
                      <span className="vote-seat">#{String(player.seatIndex).padStart(2, '0')}</span>
                      <span className="vote-name crossed-out">{player.name}</span>
                    </div>
                    <small className="dead-tag">☠ Đã tử vong</small>
                  </div>
                )
              )}
            </div>

            {!voteLocked && (
              <button
                type="button"
                disabled={voteSubmitted}
                className={`cast-vote-button ${voteSubmitted ? 'is-submitted' : ''}`}
                onClick={handleCastVote}
              >
                <span>
                  {voteSubmitted
                    ? '✓ ĐÃ KHÓA PHIẾU KÍN (KHÔNG THỂ THAY ĐỔI)'
                    : selectedPlayerId
                    ? `XÁC NHẬN BỎ PHIẾU TREO CỔ: ${players.find((p) => p.id === selectedPlayerId)?.name}`
                    : 'XÁC NHẬN BỎ PHIẾU TRẮNG'}
                </span>
              </button>
            )}
          </section>
        ) : (
          <section className="day-players-panel">
            <div className="day-panel-heading">
              <div className="heading-group">
                <span className="heading-dot" />
                <strong>CHIẾU BÀN DÂN LÀNG</strong>
              </div>
              <span className="player-stats">
                <b>{livingPlayers.length}</b> Sống · <b>{deadPlayers.length}</b> Chết
              </span>
            </div>

            <div className="day-player-grid">
              {players.map((player) => (
                <div
                  key={player.id}
                  className={`day-player-card ${player.isAlive ? 'is-alive' : 'is-dead'}`}
                >
                  <div className="player-col-main">
                    <span className="seat-badge">#{String(player.seatIndex).padStart(2, '0')}</span>
                    <i className={player.isAlive ? 'alive-indicator' : 'dead-indicator'} />
                    <span className={`player-title ${player.isAlive ? '' : 'crossed-out'}`}>
                      {player.name}
                    </span>
                  </div>
                  {player.isMayor ? (
                    <b className="mayor-badge">👑 TRƯỞNG LÀNG</b>
                  ) : (
                    <span className={player.isAlive ? 'alive-label' : 'dead-label'}>
                      {player.isAlive ? 'CÒN SỐNG' : '☠ ĐÃ CHẾT'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Footer Host chốt phán quyết */}
      {state.isHost && (
        <footer className="day-bottom-bar">
          <button
            type="button"
            className="finalize-button"
            disabled={voteLocked}
            onClick={handleFinalizeVote}
          >
            <span className="gavel-icon" aria-hidden="true">⚒</span>
            <span>
              {!voteLocked
                ? 'CHỐT PHÁN QUYẾT BIỂU QUYẾT TREO CỔ'
                : `ĐANG KHÓA HÒM PHIẾU (${voteLockRemaining}S)`}
            </span>
          </button>
          {notice && <p role="status" className="vote-notice">{notice}</p>}
        </footer>
      )}
    </main>
  );
}
