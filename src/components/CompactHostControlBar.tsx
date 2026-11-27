import { useEffect, useState } from 'react';
import { useGameSession } from '../adapters/useGameSession';
import { audioController, type AudioStatus } from '../audio/audioController';
import { generateQrSvgString } from '../utils/qrCodeSvg';
import type { PlayerId } from '../engine/types';
import './compactHostControlBar.css';

export default function CompactHostControlBar() {
  const { state, actions } = useGameSession();
  const [isMuted, setIsMuted] = useState(() => audioController.getIsMuted());
  const [subtitle, setSubtitle] = useState(() => audioController.getCurrentSubtitle());
  const [audioStatus, setAudioStatus] = useState<AudioStatus>(() => audioController.getAudioStatus());
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    const unsubSub = audioController.subscribeSubtitle((sub) => {
      setSubtitle(sub);
    });
    const unsubStatus = audioController.subscribeAudioStatus((status) => {
      setAudioStatus(status);
    });
    return () => {
      unsubSub();
      unsubStatus();
    };
  }, []);

  const handleToggleMute = () => {
    const muted = audioController.toggleMute();
    setIsMuted(muted);
  };

  const isPaused = state.publicView?.isPaused ?? false;
  const phase = state.publicView?.phase;
  const isNightPhase = phase === 'NIGHT';
  const isTimedDayPhase =
    phase === 'DAY_DISCUSS' || phase === 'DAY_RUNOFF' || phase === 'DAY_MAYOR_ELECTION';
  const extensionsUsed = state.publicView?.extensionsUsed ?? 0;
  const isHostPlayer = state.hostMode === 'PLAYER_HOST' || Boolean(state.hostView?.isHostPlayer);
  const hostPlayerId = state.playerId || state.privateView?.playerId || state.hostView?.hostPlayerId;
  const livingPlayers = state.publicView?.players.filter((p) => p.isAlive) ?? [];
  const eliminatablePlayers = isHostPlayer
    ? livingPlayers.filter((p) => p.seatIndex !== 0 && p.id !== hostPlayerId)
    : livingPlayers;

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

  const handleEmergencyEliminate = async (targetId: PlayerId) => {
    await actions.hostEmergencyEliminate(targetId);
    setEmergencyOpen(false);
  };

  return (
    <aside
      className={`compact-host-bar ${isNightPhase ? 'is-night-stealth' : ''}`}
      aria-label="Thanh điều khiển Quản trò"
    >
      <div className="compact-host-inner">
        {/* Tag Host Badge */}
        <div className="compact-host-badge" title="Bạn là Quản trò kiêm Người chơi">
          <span className="compact-host-dot" aria-hidden="true" />
          <span>HOST</span>
        </div>

        {/* Dynamic Subtitle / Announcement Bar */}
        <div className="compact-host-subtitle" aria-live="polite">
          {subtitle ? (
            <span className="subtitle-text">
              <span className="subtitle-icon" aria-hidden="true">📣</span>
              {subtitle}
            </span>
          ) : (
            <span className="subtitle-placeholder">Bàn #{state.roomCode} · Quản trò sẵn sàng</span>
          )}
        </div>

        {/* Action Controls */}
        <div className="compact-host-actions">
          {/* Nút phục hồi khi Autoplay bị chặn */}
          {audioStatus !== 'unlocked' && (
            <button
              type="button"
              className="compact-btn compact-btn-unblock"
              onClick={() => {
                void audioController.unlockAudio();
              }}
              title="Trình duyệt đang chặn âm thanh · Bấm để kích hoạt loa"
              aria-label="Kích hoạt loa Quản trò"
            >
              <span className="unblock-pulse-dot" aria-hidden="true" />
              <span>Bật loa</span>
            </button>
          )}

          {/* Loa âm thanh */}
          <button
            type="button"
            className={`compact-btn ${isMuted ? 'is-muted' : ''}`}
            onClick={handleToggleMute}
            title={isMuted ? 'Bật âm thanh hiệu lệnh' : 'Tắt âm thanh (Mute)'}
            aria-label={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
          >
            <span aria-hidden="true">{isMuted ? '🔇' : '🔊'}</span>
          </button>

          {/* Pause / Resume (khả dụng các pha ngày có đồng hồ) */}
          {isTimedDayPhase && (
            <button
              type="button"
              className={`compact-btn ${isPaused ? 'is-paused' : ''}`}
              onClick={handleTogglePause}
              title={isPaused ? 'Tiếp tục đồng hồ' : 'Tạm dừng đồng hồ'}
              aria-label={isPaused ? 'Tiếp tục' : 'Tạm dừng'}
            >
              <span aria-hidden="true">{isPaused ? '▶' : '⏸'}</span>
            </button>
          )}

          {/* +30s Gia hạn (tối đa 2 lần ban ngày) */}
          {isTimedDayPhase && extensionsUsed < 2 && (
            <button
              type="button"
              className="compact-btn compact-btn-extend"
              onClick={handleExtendTime}
              title={`Gia hạn +30 giây (đã dùng ${extensionsUsed}/2 lần)`}
              aria-label="Gia hạn 30 giây"
            >
              <span>+30s</span>
            </button>
          )}

          {/* Mở khóa vote ngay (khi đang khóa 60s đầu) */}
          {phase === 'DAY_DISCUSS' && state.publicView?.voteLocked && (
            <button
              type="button"
              className="compact-btn compact-btn-extend"
              onClick={() => void actions.hostUnlockVote()}
              title="Mở khóa hòm phiếu ngay lập tức"
              aria-label="Mở vote ngay"
            >
              <span>🔓 Vote ngay</span>
            </button>
          )}

          {/* Mở nhanh mã QR (Multi-device) */}
          {state.deviceMode !== 'SINGLE_DEVICE' && (
            <button
              type="button"
              className="compact-btn"
              onClick={() => setQrOpen((prev) => !prev)}
              title="Mở nhanh mã QR mời vào bàn"
              aria-label="Mở mã QR"
            >
              <span aria-hidden="true">▦</span>
            </button>
          )}

          {/* Trục xuất khẩn cấp */}
          <div className="compact-emergency-wrapper">
            <button
              type="button"
              className="compact-btn compact-btn-emergency"
              onClick={() => setEmergencyOpen((prev) => !prev)}
              title="Menu trục xuất người chơi rời bàn khẩn cấp"
              aria-label="Trục xuất khẩn cấp"
            >
              <span aria-hidden="true">⚠️</span>
            </button>

            {emergencyOpen && (
              <div className="compact-emergency-menu" role="dialog" aria-label="Chọn người trục xuất">
                <div className="emergency-menu-head">
                  <span>Trục xuất khẩn cấp</span>
                  <button
                    type="button"
                    className="emergency-close"
                    onClick={() => setEmergencyOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <div className="emergency-player-list">
                  {eliminatablePlayers.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="emergency-player-item"
                      onClick={() => handleEmergencyEliminate(p.id)}
                    >
                      <span>#{p.seatIndex} {p.name}</span>
                      <span className="danger-text">Loại</span>
                    </button>
                  ))}
                  {eliminatablePlayers.length === 0 && (
                    <span className="emergency-empty">Không có người chơi khác để loại</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {qrOpen && state.deviceMode !== 'SINGLE_DEVICE' && (
        <div
          className="compact-qr-popover"
          role="dialog"
          aria-label={`Mã QR phòng ${state.roomCode}`}
          style={{
            position: 'fixed',
            top: '52px',
            right: '12px',
            zIndex: 200,
            background: '#14171f',
            border: '1px solid rgba(212,175,55,0.45)',
            borderRadius: '10px',
            padding: '12px',
            textAlign: 'center',
            boxShadow: '0 12px 32px rgba(0,0,0,0.75)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <strong style={{ fontSize: '12px', color: '#f5d77f' }}>PHÒNG #{state.roomCode}</strong>
            <button
              type="button"
              onClick={() => setQrOpen(false)}
              aria-label="Đóng mã QR"
              style={{ background: 'none', border: 'none', color: '#e2e8f0', cursor: 'pointer', fontSize: '16px' }}
            >
              ×
            </button>
          </div>
          <div
            dangerouslySetInnerHTML={{
              __html: generateQrSvgString(
                typeof window !== 'undefined'
                  ? `${window.location.origin}/?room=${state.roomCode}`
                  : `http://localhost:5173/?room=${state.roomCode}`,
                150
              ),
            }}
          />
        </div>
      )}
    </aside>
  );
}
