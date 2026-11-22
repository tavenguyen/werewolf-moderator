import { useEffect, useRef, useState } from 'react';
import type { ScreenName } from '../../navigation';
import { useGameSession } from '../../adapters/useGameSession';
import { audioController, type AudioStatus } from '../../audio/audioController';
import { formatTime } from '../../utils/formatTime';
import { generateQrSvgString } from '../../utils/qrCodeSvg';
import type { PlayerId } from '../../engine/types';
import './host.css';

type HostScreenProps = {
  onNavigate?: (screen: ScreenName) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
};

export default function HostScreen({ onNavigate, onOpenRules }: HostScreenProps) {
  const { state, actions } = useGameSession();

  const publicView = state.publicView;
  const roomCode = state.roomCode || '7290';
  const players = publicView?.players ?? [];
  const isPaused = publicView?.isPaused ?? false;
  const voteLocked = publicView?.voteLocked ?? false;
  const voteLockRemaining = publicView?.voteLockRemainingSeconds ?? 0;

  const [remainingTime, setRemainingTime] = useState(180);
  const [qrOpen, setQrOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [subtitle, setSubtitle] = useState(() => audioController.getCurrentSubtitle());
  const [isMuted, setIsMuted] = useState(() => audioController.getIsMuted());
  const [audioStatus, setAudioStatus] = useState<AudioStatus>(() => audioController.getAudioStatus());
  const [copiedLink, setCopiedLink] = useState(false);

  const qrTrigger = useRef<HTMLButtonElement>(null);
  const qrClose = useRef<HTMLButtonElement>(null);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinDeepLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const unsubSubtitle = audioController.subscribeSubtitle((sub) => {
      setSubtitle(sub);
    });
    const unsubStatus = audioController.subscribeAudioStatus((status) => {
      setAudioStatus(status);
    });
    return () => {
      unsubSubtitle();
      unsubStatus();
    };
  }, []);

  useEffect(() => {
    if (!publicView?.deadlineAt) {
      setRemainingTime(180);
      return;
    }

    if (publicView.isPaused) {
      // Đóng băng hiển thị đồng hồ khi Pause
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

  useEffect(() => {
    if (!qrOpen && !emergencyOpen) return;
    if (qrOpen) qrClose.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (qrOpen) {
          setQrOpen(false);
          qrTrigger.current?.focus();
        }
        if (emergencyOpen) setEmergencyOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [qrOpen, emergencyOpen]);

  const toggleFullscreen = () => {
    if (!document.fullscreenEnabled) return;
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
    } else {
      void document.exitFullscreen?.().catch(() => undefined);
    }
  };

  const handleToggleMute = () => {
    const muted = audioController.toggleMute();
    setIsMuted(muted);
  };

  const handleEmergencyEliminate = async (playerId: PlayerId, name: string) => {
    await actions.hostEmergencyEliminate(playerId);
    setAnnouncement(`⚠️ ${name} đã được Quản trò trục xuất khỏi bàn.`);
    setEmergencyOpen(false);
  };

  const handleTogglePause = async () => {
    if (isPaused) {
      await actions.hostResume();
    } else {
      await actions.hostPause();
    }
  };

  const handleExtendTime = async () => {
    await actions.hostExtendTime();
  };

  const handleFinalizeVote = async () => {
    try {
      await actions.finalizePublicVote();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể chốt phán quyết lúc này';
      setAnnouncement(msg);
    }
  };

  const isHostPlayer = Boolean(hostView?.isHostPlayer);
  const hostPlayerId = state.playerId || state.privateView?.playerId || hostView?.hostPlayerId;
  const livingPlayers = players.filter((p) => p.isAlive);
  const eliminatablePlayers = isHostPlayer
    ? livingPlayers.filter((p) => p.seatIndex !== 0 && p.id !== hostPlayerId)
    : livingPlayers;
  const deadPlayers = players.filter((p) => !p.isAlive);
  const isUrgent = remainingTime <= 30;

  const joinDeepLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?room=${roomCode}`
      : `http://localhost:5173/?room=${roomCode}`;

  return (
    <main className="host-screen">
      <header className="host-header">
        <div className="host-brand">
          <span className="host-candle-flame" aria-hidden="true">🕯️</span>
          <div>
            <h1>
              BÀN ĐIỀU PHỐI QUẢN TRÒ <span>• PHÒNG #{roomCode}</span>
            </h1>
            <p>Màn hình trung tâm đặt giữa bàn hoặc chiếu Smart TV / iPad (Bảo mật vai trò)</p>
          </div>
        </div>
        <div className="host-header-actions">
          <button
            className="host-button"
            onClick={() => onOpenRules?.('roles')}
            title="Tra cứu luật làng và 10 vai trò thực chiến"
          >
            <span aria-hidden="true">📜</span>
            <span>Luật &amp; Vai trò</span>
          </button>
          <button ref={qrTrigger} className="host-button" onClick={() => setQrOpen(true)} aria-haspopup="dialog">
            <span aria-hidden="true">▦</span>
            <span>Mật Mã QR</span>
          </button>
          <button className="host-button" onClick={toggleFullscreen} title="Bật/Tắt toàn màn hình">
            <span aria-hidden="true">⛶</span>
            <span>Toàn màn hình</span>
          </button>
          <button className="host-mobile-nav" onClick={() => onNavigate?.('day')}>
            Xem màn ngày ➔
          </button>
        </div>
      </header>

      <div className="host-layout">
        {/* Left Column: Player Roster */}
        <aside className="host-panel host-roster">
          <div className="host-panel-title">
            <strong>CHIẾU BÀN DÂN LÀNG</strong>
            <span className="host-alive-tag">{livingPlayers.length} SỐNG · {deadPlayers.length} CHẾT</span>
          </div>

          <div className="host-player-list">
            {players.map((player) => (
              <div
                className={`host-player ${!player.isAlive ? 'is-dead' : ''} ${player.isMayor ? 'is-mayor' : ''}`}
                key={player.id}
              >
                <div className="host-player-name">
                  <span className="host-seat">#{String(player.seatIndex).padStart(2, '0')}</span>
                  <i
                    className={`host-connect-dot ${player.isConnected ? 'is-online' : 'is-offline'}`}
                    title={player.isConnected ? 'Đang kết nối' : 'Mất kết nối'}
                    aria-hidden="true"
                  />
                  <span className="host-name-txt">{player.name}</span>
                </div>
                {player.isMayor ? (
                  <span className="host-mayor-tag">👑 TRƯỞNG LÀNG</span>
                ) : (
                  <span className={player.isAlive ? 'host-alive' : 'host-dead'}>
                    {player.isAlive ? 'SỐNG' : '☠ TỬ VONG'}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="host-emergency-wrap">
            {!emergencyOpen ? (
              <button className="host-emergency" onClick={() => setEmergencyOpen(true)}>
                <span>TRỤC XUẤT KHẨN CẤP (RỜI BÀN)</span>
                <span aria-hidden="true">⚠️</span>
              </button>
            ) : (
              <div className="host-emergency-picker">
                <strong>Chọn người chơi rời bàn khẩn cấp:</strong>
                {eliminatablePlayers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleEmergencyEliminate(p.id, p.name)}
                  >
                    #{p.seatIndex} {p.name}
                  </button>
                ))}
                {eliminatablePlayers.length === 0 && (
                  <p style={{ fontSize: '12px', color: '#717885', margin: '4px 0' }}>
                    Không có người chơi khác để trục xuất
                  </p>
                )}
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
              <span className="phase-badge">
                {publicView?.phase === 'NIGHT'
                  ? `TRỜI TỐI · ĐÊM THỨ ${publicView.roundNumber}`
                  : `TRỜI SÁNG · NGÀY THỨ ${publicView?.roundNumber || 1}`}
              </span>
              <strong>ĐỒNG HỒ BIỂU QUYẾT TOÀN BÀN</strong>
            </div>
            <span className="host-stable">
              <i aria-hidden="true" />
              <span>LOA TRUNG TÂM HOẠT ĐỘNG</span>
            </span>
          </div>

          <div className="host-clock-block">
            <div className="host-clock" aria-live="off">{formatTime(remainingTime)}</div>
            <div className={`host-lock ${!voteLocked ? 'unlocked' : 'locked'}`}>
              <span aria-hidden="true">{!voteLocked ? '🔓' : '🔒'}</span>
              <span>
                {voteLocked ? (
                  <>KHÓA BIỂU QUYẾT: <b>{voteLockRemaining}S TRANH LUẬN ĐẦU</b></>
                ) : (
                  <b className="unlocked-highlight">BỎ PHIẾU ĐÃ MỞ · CẢ LÀNG BẮT ĐẦU VOTE</b>
                )}
              </span>
            </div>
          </div>

          {/* Cảnh báo âm thanh bị chặn bởi Autoplay chính sách trình duyệt di động */}
          {audioStatus !== 'unlocked' && (
            <button
              type="button"
              className="host-audio-unblock-banner"
              onClick={() => {
                void audioController.unlockAudio();
              }}
              title="Nhấn để kích hoạt phát loa Quản trò"
            >
              <span className="unblock-icon" aria-hidden="true">⚠️</span>
              <span className="unblock-text">
                Trình duyệt đang chặn âm thanh tự động · <strong>Nhấn vào đây để bật loa Quản trò</strong>
              </span>
            </button>
          )}

          {/* Script / Subtitle từ AudioController */}
          <div className="host-script">
            <div className="host-script-icon-wrap" aria-hidden="true">
              <span className="host-script-icon">📜</span>
            </div>
            <div className="host-script-text">
              <div className="host-script-header">
                <strong>CÂU LỆNH QUẢN TRÒ (PHÁT LOA TRUNG TÂM):</strong>
                <div className="host-script-ember" title="Loa đang phát giọng nói">
                  <span className="ember-dot" />
                  <small>ĐANG PHÁT</small>
                </div>
              </div>
              <p>
                {subtitle ||
                  (publicView?.phase === 'NIGHT'
                    ? 'Trời tối rồi, tất cả dân làng hãy nhắm mắt đi ngủ và chờ tiếng gọi vai.'
                    : 'Trời đã sáng, thôn dân cùng nhau bàn bạc và bỏ phiếu tìm ra kẻ phản bội.')}
              </p>
            </div>
            <button
              className="host-button host-speaker"
              onClick={() => {
                if (publicView?.currentTurnInfo?.turnKey) {
                  audioController.playTurnNarration(publicView.currentTurnInfo.turnKey, undefined, true);
                }
              }}
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
                onClick={handleTogglePause}
              >
                <span aria-hidden="true">{isPaused ? '▶' : '⏸'}</span>
                <span>{isPaused ? 'TIẾP TỤC ĐẾM GIỜ' : 'TẠM DỪNG ĐẾM GIỜ'}</span>
              </button>
              {(publicView?.extensionsUsed ?? 0) < 2 && (
                <button
                  className="host-button host-control host-extend"
                  onClick={handleExtendTime}
                >
                  <span aria-hidden="true">＋</span>
                  <span>+30 GIÂY THẢO LUẬN</span>
                </button>
              )}
            </div>

            <button
              disabled={voteLocked}
              className="host-finalize"
              onClick={handleFinalizeVote}
            >
              <span aria-hidden="true">⚒</span>
              <span>
                {voteLocked
                  ? `ĐANG KHÓA CHỐT VOTE (${voteLockRemaining}S)`
                  : 'CHỐT KẾT QUẢ BIỂU QUYẾT TREO CỔ'}
              </span>
            </button>
          </div>
        </section>

        {/* Right Column: Audio & Privacy Guard & Timeline Logs */}
        <aside className="host-panel host-audio-panel">
          <div className="host-panel-title">
            <strong>ÂM HƯỞNG &amp; NHẬT KÝ LÀNG</strong>
            <button
              type="button"
              className="audio-badge"
              onClick={handleToggleMute}
              style={{ cursor: 'pointer', border: 'none' }}
            >
              {isMuted ? '🔇 ĐANG TẮT TIẾNG' : '🔊 ĐANG BẬT LOA'}
            </button>
          </div>

          <div className="host-logs-scroll">
            <strong className="logs-title">BIÊN NIÊN SỬ CÔNG KHAI:</strong>
            <div className="logs-list">
              {(publicView?.publicLogs ?? []).map((log, index) => (
                <div key={index} className="log-entry">
                  <span className="log-bullet">•</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="host-public-note">
            <div className="note-title">
              <span aria-hidden="true">🔒</span>
              <strong>BẢO MẬT TUYỆT ĐỐI BẢNG TRUNG TÂM</strong>
            </div>
            <p>
              Bảng trung tâm không chứa thông tin vai trò của người chơi còn sống. An toàn 100% khi trình chiếu lên TV hoặc iPad.
            </p>
          </div>

          {publicView?.phase === 'GAME_OVER' && (
            <button
              className="host-summary-btn"
              onClick={() => onNavigate?.('summary')}
            >
              Xem giải mã toàn bộ ván đấu ➔
            </button>
          )}
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
              <h2 id="host-qr-title">MẬT MÃ KẾT NỐI BÀN #{roomCode}</h2>
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
              <div
                dangerouslySetInnerHTML={{ __html: generateQrSvgString(joinDeepLink, 190) }}
                className="host-qr-svg-wrap"
              />
            </div>

            <strong className="host-room-code">#{roomCode}</strong>
            <p className="host-qr-desc">
              Quét mã QR bằng camera điện thoại để kết nối trực tiếp vào bàn đấu.
            </p>

            <div className="host-qr-copy-box">
              <button
                type="button"
                className="host-copy-btn"
                onClick={handleCopyLink}
              >
                <span>{copiedLink ? '✓ Đã sao chép liên kết' : '🔗 Sao chép link mời'}</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
