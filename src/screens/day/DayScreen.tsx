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

export default function DayScreen({ onOpenRules }: DayScreenProps) {
  const { state, actions, deviceMode } = useGameSession();

  const publicView = state.publicView;
  const privateView = state.privateView;
  const isSingleDevice = deviceMode === 'SINGLE_DEVICE';
  const isPlayerHost = state.isHost && state.hostMode === 'PLAYER_HOST';

  const [mode, setMode] = useState<'shared' | 'player'>('player');
  const [selectedPlayerId, setSelectedPlayerId] = useState<PlayerId | null>(null);
  const [voteSubmitted, setVoteSubmitted] = useState(false);
  const [isSubmittingSpecial, setIsSubmittingSpecial] = useState(false);
  const [notice, setNotice] = useState('');
  const [remainingTime, setRemainingTime] = useState(180);

  const phase = publicView?.phase ?? 'DAY_DISCUSS';
  const isHunterShotPhase = phase === 'HUNTER_SHOT';
  const isMayorSuccessionPhase = phase === 'MAYOR_SUCCESSION';
  const isMayorElectionPhase = phase === 'DAY_MAYOR_ELECTION';
  const isRunoffPhase = phase === 'DAY_RUNOFF';
  const isSpecialInstantPhase = isHunterShotPhase || isMayorSuccessionPhase;

  const players = publicView?.players ?? [];
  const livingPlayers = players.filter((p) => p.isAlive);
  const deadPlayers = players.filter((p) => !p.isAlive);
  const isPaused = publicView?.isPaused ?? false;
  const voteLocked = publicView?.voteLocked ?? false;
  const effectiveVoteLocked = isMayorElectionPhase || isRunoffPhase ? false : voteLocked;
  const voteLockRemaining = publicView?.voteLockRemainingSeconds ?? 0;
  const lastVoteTally = publicView?.lastVoteTally;

  const currentPlayerPublic = players.find((p) => p.id === state.playerId);
  const isCurrentPlayerAlive = privateView ? privateView.isAlive : (currentPlayerPublic?.isAlive ?? true);
  const currentVoteWeight = currentPlayerPublic?.voteWeight ?? 1;
  const cannotVoteReason = !isCurrentPlayerAlive
    ? 'Bạn đã chết nên không thể tham gia bỏ phiếu.'
    : currentVoteWeight === 0
    ? 'Bạn đã mất quyền bỏ phiếu (Thằng Ngốc đã lật bài) nên chỉ có thể theo dõi.'
    : null;

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
    setIsSubmittingSpecial(false);
    setNotice('');
  }, [publicView?.roundNumber, publicView?.phase, state.playerId]);

  const effectiveVoteSubmitted =
    voteSubmitted ||
    (!isSingleDevice &&
      (isMayorElectionPhase || isRunoffPhase || publicView?.phase === 'DAY_DISCUSS') &&
      privateView?.canActCurrentTurn === false);

  const handleCastVote = async () => {
    if (effectiveVoteSubmitted || effectiveVoteLocked || cannotVoteReason) return;

    try {
      if (isMayorElectionPhase) {
        await actions.sendMayorElect(selectedPlayerId);
      } else {
        await actions.sendDayVote(selectedPlayerId);
      }
      setVoteSubmitted(true);
      const targetName = selectedPlayerId
        ? players.find((p) => p.id === selectedPlayerId)?.name
        : 'phiếu trắng';
      setNotice(
        isMayorElectionPhase
          ? selectedPlayerId
            ? `✓ Đã bỏ phiếu bầu ${targetName} làm Trưởng làng.`
            : '✓ Đã bỏ phiếu trắng bầu Trưởng làng.'
          : selectedPlayerId
          ? `✓ Đã bỏ phiếu kín cho ${targetName}.`
          : '✓ Đã bỏ phiếu trắng.'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi gửi phiếu';
      setNotice(msg);
    }
  };

  const handleHunterShot = async (targetId: PlayerId | null) => {
    if (isSubmittingSpecial) return;
    setIsSubmittingSpecial(true);
    setNotice('');
    try {
      await actions.sendHunterShot(targetId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể thực hiện phát súng Thợ săn';
      setNotice(msg);
      setIsSubmittingSpecial(false);
    }
  };

  const handleMayorTransfer = async (successorId: PlayerId | null) => {
    if (isSubmittingSpecial) return;
    setIsSubmittingSpecial(true);
    setNotice('');
    try {
      await actions.sendMayorTransfer(successorId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể trao huy hiệu Trưởng làng';
      setNotice(msg);
      setIsSubmittingSpecial(false);
    }
  };

  const handleFinalizeVote = async () => {
    try {
      await actions.finalizePublicVote();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể chốt kết quả lúc này';
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
          <span className="day-candle-flame" aria-hidden="true">
            {isHunterShotPhase ? '🎯' : isMayorSuccessionPhase || isMayorElectionPhase ? '👑' : isRunoffPhase ? '⚖️' : '☀️'}
          </span>
          <span>
            TRỜI SÁNG · NGÀY {publicView?.roundNumber || 1} <b>•</b>{' '}
            {isHunterShotPhase
              ? 'PHÁT SÚNG THỢ SĂN'
              : isMayorSuccessionPhase
              ? 'TRAO HUY HIỆU TRƯỞNG LÀNG'
              : isMayorElectionPhase
              ? 'BẦU TRƯỞNG LÀNG'
              : isRunoffPhase
              ? 'VÒNG BỎ PHIẾU LẠI'
              : 'THẢO LUẬN DÂN LÀNG'}
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
              BỎ PHIẾU
            </button>
            <button
              type="button"
              aria-pressed={mode === 'shared'}
              onClick={() => setMode('shared')}
              className={mode === 'shared' ? 'day-mode-active' : ''}
            >
              BÀN CHƠI
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
          <span className="eyebrow">THỜI GIAN THẢO LUẬN</span>

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
                {isPaused ? 'TẠM DỪNG' : isUrgent ? 'SẮP HẾT GIỜ' : 'ĐANG THẢO LUẬN'}
              </span>
            </div>
          </div>

          <div className={`lock-indicator ${!voteLocked ? 'is-unlocked' : 'is-locked'}`} aria-live="polite">
            <span className="lock-icon" aria-hidden="true">{!voteLocked ? '🔓' : '🔒'}</span>
            <span>
              {!voteLocked ? (
                <strong className="unlocked-text">HÒM PHIẾU ĐÃ MỞ · BẮT ĐẦU BỎ PHIẾU TREO CỔ</strong>
              ) : (
                <>CHƯA ĐẾN GIỜ BỎ PHIẾU: <strong>CÒN {voteLockRemaining}S THẢO LUẬN</strong></>
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
                <span>{isPaused ? 'TIẾP TỤC' : 'TẠM DỪNG'}</span>
              </button>
              {(publicView?.extensionsUsed ?? 0) < 2 && (
                <button
                  type="button"
                  className="action-btn-extend"
                  onClick={() => actions.hostExtendTime()}
                >
                  <span aria-hidden="true">＋</span>
                  <span>THÊM +30S</span>
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
              <strong>THÔNG BÁO BUỔI SÁNG</strong>
            </div>
            <p>
              {publicView?.publicLogs?.[publicView.publicLogs.length - 1] ??
                'Trời đã sáng, dân làng cùng nhau thảo luận để tìm ra Ma Sói.'}
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
                  <strong>GẤU ĐÃ GẦM LÊN!</strong>
                  <span>Người thuần gấu cảm nhận được Ma Sói đang ngồi cạnh bên!</span>
                </>
              ) : (
                <>
                  <strong>GẤU VẪN YÊN LẶNG</strong>
                  <span>Không có Ma Sói nào ngồi cạnh người nuôi gấu.</span>
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
              <strong>HOÀNG TỬ LỘ DIỆN!</strong>
              <span>Án treo cổ bị hủy bỏ. Hoàng tử vẫn giữ nguyên quyền bỏ phiếu.</span>
            </div>
          </div>
        )}

        {/* Banner Người bị phù phép câm lặng (Spellcaster) */}
        {publicView?.mutedPlayerId && (() => {
          const mutedPlayer = players.find((p) => p.id === publicView.mutedPlayerId);
          if (!mutedPlayer || !mutedPlayer.isAlive) return null;
          return (
            <div className="day-event-banner muted-player-banner" role="status" style={{ borderLeft: '4px solid #ef4444' }}>
              <span className="banner-icon" aria-hidden="true">🔇</span>
              <div className="banner-text">
                <strong>CÓ NGƯỜI BỊ CẤM NÓI!</strong>
                <span>
                  #{mutedPlayer.seatIndex} {mutedPlayer.name} đã bị phù phép câm lặng hôm nay, không được nói trong lúc làng thảo luận.
                </span>
              </div>
            </div>
          );
        })()}

        {/* Banner Kẻ phá rối kích hoạt treo cổ 2 người (Troublemaker) */}
        {publicView?.doubleVoteDay && (
          <div className="day-event-banner double-vote-banner" role="status" style={{ borderLeft: '4px solid #eab308' }}>
            <span className="banner-icon" aria-hidden="true">⚡</span>
            <div className="banner-text">
              <strong>HÔM NAY TREO CỔ 2 NGƯỜI!</strong>
              <span>Kẻ phá rối đã kích hoạt: làng sẽ treo cổ 2 người có nhiều phiếu nhất!</span>
            </div>
          </div>
        )}

        {/* Cảnh báo riêng cho người bị câm */}
        {(privateView?.skills?.isMuted || state.playerId === publicView?.mutedPlayerId) && (
          <div className="personal-mute-warning" role="alert" style={{ background: '#2d1515', border: '1px solid #dc2626', borderRadius: 8, padding: 12, margin: '8px 0', color: '#fca5a5' }}>
            <strong>🔇 BẠN ĐANG BỊ CẤM NÓI!</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13 }}>
              Bạn không được nói trong suốt buổi thảo luận sáng nay, nhưng vẫn có quyền bỏ phiếu treo cổ như bình thường.
            </p>
          </div>
        )}

        {/* Kết quả biểu quyết gần nhất nếu có */}
        {lastVoteTally && (
          <section className="last-tally-card">
            <strong>KẾT QUẢ BỎ PHIẾU GẦN NHẤT:</strong>
            <div className="tally-breakdown">
              {Object.entries(lastVoteTally.tallies).map(([pId, count]) => {
                const p = players.find((pl) => pl.id === pId);
                const voters = lastVoteTally.voterDetails?.[pId]
                  ?.map((vId) => players.find((pl) => pl.id === vId)?.name || vId)
                  .join(', ');
                return (
                  <span key={pId} className="tally-badge">
                    #{p?.seatIndex} {p?.name}: <b>{count} phiếu</b>
                    {voters && (
                      <small className="tally-voters-list">
                        ({voters})
                      </small>
                    )}
                  </span>
                );
              })}
              <span className="tally-badge abstain-badge">
                Phiếu trắng: <b>{lastVoteTally.abstainCount} phiếu</b>
              </span>
            </div>
          </section>
        )}

        {/* Pha đặc biệt: Phát súng Thợ Săn */}
        {isHunterShotPhase && (() => {
          const canShoot = Boolean(privateView?.canActCurrentTurn && privateView?.turnKey === 'hunter_shot') || isSingleDevice;
          const hunterTargets = privateView?.validTargets?.length
            ? players.filter((p) => privateView.validTargets.includes(p.id))
            : livingPlayers;
          return (
            <section className="day-players-panel special-phase-panel hunter-shot-panel" aria-live="polite">
              <div className="day-panel-heading">
                <div className="heading-group">
                  <span className="heading-dot" />
                  <strong>🎯 THỢ SĂN NGÃ XUỐNG · PHÁT SÚNG CUỐI CÙNG</strong>
                </div>
                {publicView?.deadlineAt && (
                  <span className="unlocked-label">⏱ {remainingTime}S</span>
                )}
              </div>
              <p className="special-phase-desc">
                Thợ săn đã bị hạ gục và có quyền nổ một phát súng cuối cùng kéo theo 1 người chơi còn sống.
              </p>

              {canShoot ? (
                <>
                  <div className="day-vote-grid">
                    {hunterTargets.map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        disabled={isSubmittingSpecial}
                        aria-pressed={selectedPlayerId === player.id}
                        onClick={() => {
                          setSelectedPlayerId(selectedPlayerId === player.id ? null : player.id);
                          setNotice('');
                        }}
                        className={`day-vote-card ${selectedPlayerId === player.id ? 'vote-selected' : ''}`}
                      >
                        <div className="vote-card-header">
                          <span className="vote-seat">#{String(player.seatIndex).padStart(2, '0')}</span>
                          <span className="vote-name">{player.name}</span>
                        </div>
                        <small className="vote-weight">
                          {selectedPlayerId === player.id ? '🎯 Đang ngắm bắn' : 'Chọn mục tiêu'}
                        </small>
                      </button>
                    ))}
                  </div>
                  <div className="special-phase-actions">
                    <button
                      type="button"
                      disabled={!selectedPlayerId || isSubmittingSpecial}
                      className="cast-vote-button hunter-fire-button"
                      onClick={() => handleHunterShot(selectedPlayerId)}
                    >
                      <span>
                        {selectedPlayerId
                          ? `🎯 BẮN MỤC TIÊU: ${players.find((p) => p.id === selectedPlayerId)?.name}`
                          : 'CHỌN 1 NGƯỜI ĐỂ BẮN'}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingSpecial}
                      className="special-skip-button"
                      onClick={() => handleHunterShot(null)}
                    >
                      💨 Bắn trượt (Không bắn ai)
                    </button>
                  </div>
                </>
              ) : (
                <div className="special-waiting-note" role="status">
                  Hãy giữ im lặng! Thợ săn đang ngắm bắn mục tiêu cuối cùng...
                </div>
              )}
              {notice && <p role="status" className="vote-notice">{notice}</p>}
            </section>
          );
        })()}

        {/* Pha đặc biệt: Trao huy hiệu Trưởng Làng */}
        {isMayorSuccessionPhase && (() => {
          const canTransfer = Boolean(privateView?.canActCurrentTurn && privateView?.turnKey === 'mayor_succession') || isSingleDevice;
          const successionTargets = privateView?.validTargets?.length
            ? players.filter((p) => privateView.validTargets.includes(p.id))
            : livingPlayers;
          return (
            <section className="day-players-panel special-phase-panel mayor-succession-panel" aria-live="polite">
              <div className="day-panel-heading">
                <div className="heading-group">
                  <span className="heading-dot" />
                  <strong>👑 TRƯỞNG LÀNG TRAO HUY HIỆU KẾ VỊ</strong>
                </div>
              </div>
              <p className="special-phase-desc">
                Trưởng làng đã ngã xuống. Hãy chọn 1 người chơi còn sống để trao lại huy hiệu Trưởng làng (2 phiếu biểu quyết).
              </p>

              {canTransfer ? (
                <>
                  <div className="day-vote-grid">
                    {successionTargets.map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        disabled={isSubmittingSpecial}
                        aria-pressed={selectedPlayerId === player.id}
                        onClick={() => {
                          setSelectedPlayerId(selectedPlayerId === player.id ? null : player.id);
                          setNotice('');
                        }}
                        className={`day-vote-card ${selectedPlayerId === player.id ? 'vote-selected' : ''}`}
                      >
                        <div className="vote-card-header">
                          <span className="vote-seat">#{String(player.seatIndex).padStart(2, '0')}</span>
                          <span className="vote-name">{player.name}</span>
                        </div>
                        <small className="vote-weight">
                          {selectedPlayerId === player.id ? '👑 Người kế vị được chọn' : 'Chọn làm Trưởng làng mới'}
                        </small>
                      </button>
                    ))}
                  </div>
                  <div className="special-phase-actions">
                    <button
                      type="button"
                      disabled={!selectedPlayerId || isSubmittingSpecial}
                      className="cast-vote-button"
                      onClick={() => handleMayorTransfer(selectedPlayerId)}
                    >
                      <span>
                        {selectedPlayerId
                          ? `👑 TRAO HUY HIỆU CHO: ${players.find((p) => p.id === selectedPlayerId)?.name}`
                          : 'CHỌN 1 NGƯỜI KẾ VỊ'}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingSpecial}
                      className="special-skip-button"
                      onClick={() => handleMayorTransfer(null)}
                    >
                      Từ bỏ trao huy hiệu
                    </button>
                  </div>
                </>
              ) : (
                <div className="special-waiting-note" role="status">
                  Trưởng làng đang chọn người kế vị trước khi nhắm mắt...
                </div>
              )}
              {notice && <p role="status" className="vote-notice">{notice}</p>}
            </section>
          );
        })()}

        {/* Danh sách người chơi / Bỏ phiếu */}
        {!isSpecialInstantPhase && (mode === 'player' ? (
          <section className="day-players-panel">
            <div className="day-panel-heading">
              <div className="heading-group">
                <span className="heading-dot" />
                <strong>
                  {isMayorElectionPhase
                    ? '👑 BẦU CHỌN TRƯỞNG LÀNG (NGÀY 1)'
                    : isRunoffPhase
                    ? '⚖️ VÒNG BỎ PHIẾU LẠI (HÒA PHIẾU)'
                    : 'BỎ PHIẾU TREO CỔ'}
                </strong>
              </div>
              <span className={!effectiveVoteLocked ? 'unlocked-label' : 'locked-label'}>
                {!effectiveVoteLocked ? '✓ ĐANG MỞ PHIẾU' : `🔒 ĐỢI ${voteLockRemaining}S`}
              </span>
            </div>

            {isRunoffPhase && (
              <div className="day-event-banner double-vote-banner" role="status">
                <span className="banner-icon" aria-hidden="true">⚖️</span>
                <div className="banner-text">
                  <strong>VÒNG BỎ PHIẾU LẠI (RUN-OFF)</strong>
                  <span>Vòng trước hòa phiếu. Chỉ bỏ phiếu cho các ứng viên đang hòa phiếu dưới đây.</span>
                </div>
              </div>
            )}

            {isMayorElectionPhase && (
              <div className="day-event-banner prince-revealed" role="status">
                <span className="banner-icon" aria-hidden="true">👑</span>
                <div className="banner-text">
                  <strong>BẦU TRƯỞNG LÀNG NGÀY 1</strong>
                  <span>Người thắng cử sẽ nhận huy hiệu Trưởng làng với 2 phiếu biểu quyết.</span>
                </div>
              </div>
            )}

            {/* Single-device chọn người đang vote */}
            {isSingleDevice && (
              <div className="offline-voter-bar">
                <span>Người đang cầm máy:</span>
                <select
                  value={state.playerId}
                  onChange={(e) => actions.setLocalActivePlayer(e.target.value)}
                  className="offline-select"
                >
                  {livingPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.seatIndex} {p.name} {p.isMayor ? '(Trưởng làng - 2 phiếu)' : p.voteWeight === 0 ? '(Mất quyền vote)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {cannotVoteReason && (
              <div className="cannot-vote-warning" role="status">
                <span>⚠️ {cannotVoteReason}</span>
              </div>
            )}

            {(() => {
              const runoffCandidateIds =
                isRunoffPhase && privateView?.validTargets && privateView.validTargets.length > 0
                  ? new Set(privateView.validTargets)
                  : null;
              const voteCandidates = runoffCandidateIds
                ? players.filter((p) => runoffCandidateIds.has(p.id))
                : players;
              const isVoteDisabled = Boolean(cannotVoteReason) || effectiveVoteLocked || effectiveVoteSubmitted;

              return (
                <div className="day-vote-grid">
                  {/* Nút Bỏ phiếu trắng */}
                  <button
                    type="button"
                    disabled={isVoteDisabled}
                    aria-pressed={selectedPlayerId === null}
                    onClick={() => setSelectedPlayerId(null)}
                    className={`day-vote-card abstain-card ${selectedPlayerId === null ? 'vote-selected' : ''}`}
                  >
                    <div className="vote-card-header">
                      <span className="vote-seat">⚪</span>
                      <span className="vote-name">Bỏ phiếu trắng</span>
                    </div>
                    <small className="vote-weight">
                      {isMayorElectionPhase ? 'Không bầu ai làm Trưởng làng' : 'Không muốn treo cổ ai hôm nay'}
                    </small>
                  </button>

                  {voteCandidates.map((player) =>
                    player.isAlive ? (
                      <button
                        key={player.id}
                        type="button"
                        disabled={isVoteDisabled}
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
                          {isMayorElectionPhase
                            ? 'Ứng viên Trưởng làng'
                            : player.isMayor
                            ? '👑 Trưởng làng (2 phiếu)'
                            : player.voteWeight === 0
                            ? '🃏 Đã mất quyền vote'
                            : '1 phiếu'}
                        </small>
                      </button>
                    ) : (
                      <div key={player.id} className="day-vote-card dead-vote-card">
                        <div className="vote-card-header">
                          <span className="vote-seat">#{String(player.seatIndex).padStart(2, '0')}</span>
                          <span className="vote-name crossed-out">{player.name}</span>
                        </div>
                        <small className="dead-tag">☠ Đã chết</small>
                      </div>
                    )
                  )}
                </div>
              );
            })()}

            {!effectiveVoteLocked && !cannotVoteReason && (
              <button
                type="button"
                disabled={effectiveVoteSubmitted}
                className={`cast-vote-button ${effectiveVoteSubmitted ? 'is-submitted' : ''}`}
                onClick={handleCastVote}
              >
                <span>
                  {effectiveVoteSubmitted
                    ? '✓ ĐÃ BỎ PHIẾU XONG'
                    : isMayorElectionPhase
                    ? selectedPlayerId
                      ? `BẦU TRƯỞNG LÀNG: ${players.find((p) => p.id === selectedPlayerId)?.name}`
                      : 'BỎ PHIẾU TRẮNG'
                    : selectedPlayerId
                    ? `BỎ PHIẾU TREO CỔ: ${players.find((p) => p.id === selectedPlayerId)?.name}`
                    : 'BỎ PHIẾU TRẮNG'}
                </span>
              </button>
            )}
          </section>
        ) : (
          <section className="day-players-panel">
            <div className="day-panel-heading">
              <div className="heading-group">
                <span className="heading-dot" />
                <strong>BÀN CHƠI DÂN LÀNG</strong>
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
        ))}
      </div>

      {/* Footer Host chốt phán quyết */}
      {state.isHost && !isSpecialInstantPhase && (
        <footer className="day-bottom-bar">
          <button
            type="button"
            className="finalize-button"
            disabled={effectiveVoteLocked}
            onClick={handleFinalizeVote}
          >
            <span className="gavel-icon" aria-hidden="true">⚒</span>
            <span>
              {!effectiveVoteLocked
                ? isMayorElectionPhase
                  ? 'CHỐT KẾT QUẢ BẦU TRƯỞNG LÀNG'
                  : isRunoffPhase
                  ? 'CHỐT KẾT QUẢ BỎ PHIẾU LẠI'
                  : 'CHỐT KẾT QUẢ BỎ PHIẾU'
                : `CHƯA ĐẾN GIỜ BỎ PHIẾU (${voteLockRemaining}S)`}
            </span>
          </button>
          {notice && <p role="status" className="vote-notice">{notice}</p>}
        </footer>
      )}
    </main>
  );
}
