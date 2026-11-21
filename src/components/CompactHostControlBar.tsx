import { useEffect, useState } from 'react';
import { useGameSession } from '../adapters/useGameSession';
import { audioController } from '../audio/audioController';
import type { PlayerId } from '../engine/types';
import './compactHostControlBar.css';

export default function CompactHostControlBar() {
  const { state, actions } = useGameSession();
  const [isMuted, setIsMuted] = useState(() => audioController.getIsMuted());
  const [subtitle, setSubtitle] = useState(() => audioController.getCurrentSubtitle());
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  useEffect(() => {
    const unsub = audioController.subscribeSubtitle((sub) => {
      setSubtitle(sub);
    });
    return unsub;
  }, []);

  const handleToggleMute = () => {
    const muted = audioController.toggleMute();
    setIsMuted(muted);
  };

  const isPaused = state.publicView?.isPaused ?? false;
  const isDayPhase = state.publicView?.phase === 'DAY_DISCUSS';
  const extensionsUsed = state.publicView?.extensionsUsed ?? 0;
  const livingPlayers = state.publicView?.players.filter((p) => p.isAlive) ?? [];

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
    <aside className="compact-host-bar" aria-label="Thanh điều khiển Quản trò">
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

          {/* Pause / Resume (chỉ khả dụng ban ngày) */}
          {isDayPhase && (
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
          {isDayPhase && extensionsUsed < 2 && (
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
                  {livingPlayers.map((p) => (
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
                  {livingPlayers.length === 0 && (
                    <span className="emergency-empty">Không có người chơi sống</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
