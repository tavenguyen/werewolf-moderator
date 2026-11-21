import { useEffect, useState } from 'react';
import { useGameSession } from '../../adapters/useGameSession';
import { getSmartPreset } from '../../engine/presets';
import { ROLES_BY_ID } from '../../engine/roles';
import { generateQrSvgString } from '../../utils/qrCodeSvg';
import type { ScreenName } from '../../navigation';
import type { LobbyPreset } from './lobbyTypes';
import './lobby.css';

type Props = {
  onNavigate?: (screen: ScreenName) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
};

interface DeckRoleDisplay {
  name: string;
  count: number;
  symbol: string;
  side: 'village' | 'wolf' | 'third';
  sideName: string;
}

export default function LobbyScreen({ onNavigate, onOpenRules }: Props) {
  const { state, actions, deviceMode } = useGameSession();

  const roomCode = state.roomCode || '7290';
  const players = state.publicView?.players ?? [];
  const playerCount = Math.max(players.length, 6);
  const isSingleDevice = deviceMode === 'SINGLE_DEVICE';

  const [presetType, setPresetType] = useState<LobbyPreset>('basic');
  const [advanced, setAdvanced] = useState(false);
  const [notice, setNotice] = useState('');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');

  // Settings
  const currentSettings = state.publicView?.settings ?? {
    revealOnDeath: false,
    allowWolfSkip: false,
    allowWolfFriendlyFire: false,
    allowWitchSelfHeal: true,
    witchWasteHealOnEmpty: false,
    witchKnowsVictim: true,
    witchHealMode: 'AOE' as const,
    tieVoteMode: 'ESCAPE' as const,
    ghostMode: false,
    hasMayor: false,
  };

  const smartPreset = getSmartPreset(players.length >= 6 ? players.length : 8);

  const deckRoles: DeckRoleDisplay[] = (() => {
    if (!smartPreset) return [];
    const counts: Record<string, number> = {};
    for (const rId of smartPreset.roles) {
      counts[rId] = (counts[rId] ?? 0) + 1;
    }
    return Object.entries(counts).map(([rId, count]) => {
      const def = ROLES_BY_ID[rId];
      const side = def?.faction === 'WEREWOLF' ? 'wolf' : def?.faction === 'NEUTRAL' ? 'third' : 'village';
      const sideName = side === 'wolf' ? 'Phe Sói' : side === 'third' ? 'Phe Thứ 3' : 'Phe Dân';
      const symbol = side === 'wolf' ? '🐺' : rId === 'seer' ? '🔮' : rId === 'bodyguard' ? '⚔️' : rId === 'witch' ? '🧪' : rId === 'hunter' ? '🎯' : '🛡️';
      return {
        name: def?.nameVi ?? rId,
        count,
        symbol,
        side,
        sideName,
      };
    });
  })();

  const wolvesCount = deckRoles.filter((r) => r.side === 'wolf').reduce((acc, r) => acc + r.count, 0);
  const villageCount = deckRoles.filter((r) => r.side === 'village').reduce((acc, r) => acc + r.count, 0);
  const ready = players.length >= 6 && players.length <= 16;

  const joinDeepLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?room=${roomCode}`
      : `http://localhost:5173/?room=${roomCode}`;

  const handleCopyDeepLink = async () => {
    try {
      await navigator.clipboard.writeText(joinDeepLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setNotice(`Link vào bàn: ${joinDeepLink}`);
    }
  };

  const handleToggleSetting = async (key: keyof typeof currentSettings) => {
    const nextVal = !currentSettings[key];
    await actions.updateSettings({ [key]: nextVal });
  };

  const handleStartGame = async () => {
    if (!ready) return;
    try {
      await actions.startGame();
      onNavigate?.('night');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể bắt đầu ván đấu';
      setNotice(msg);
    }
  };

  const handleAddOfflinePlayer = () => {
    if (!newPlayerName.trim()) return;
    actions.addOfflinePlayer(newPlayerName.trim());
    setNewPlayerName('');
  };

  return (
    <div className="lobby-page">
      {/* Header */}
      <header className="lobby-header">
        <button
          className="lobby-back"
          onClick={() => {
            void actions.leaveRoom();
            onNavigate?.('home');
          }}
          aria-label="Về trang chủ"
          title="Về trang chủ"
        >
          ⟵
        </button>
        <div className="lobby-heading">
          <span className="lobby-candle-flame" aria-hidden="true">🕯️</span>
          <div>
            <h1>
              PHÒNG CHỜ <span>• BÀN #{roomCode}</span>
            </h1>
            <p>
              {isSingleDevice
                ? 'Chế độ 1 máy offline: Người chơi dùng chung 1 thiết bị đặt giữa bàn'
                : 'Mỗi người quét mã QR hoặc nhập 4 số trên điện thoại để tham gia'}
            </p>
          </div>
        </div>
        <div className="lobby-header-actions">
          <button
            className="lobby-link-button"
            onClick={() => onOpenRules?.('roles')}
            title="Tra cứu luật chơi và vai trò"
          >
            <span aria-hidden="true">📜</span>
            <span>Luật &amp; Vai trò</span>
          </button>
          {state.isHost && (
            <button className="lobby-link-button" onClick={() => onNavigate?.('host')}>
              <span>Bàn Quản Trò</span>
              <span aria-hidden="true">↗</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Grid */}
      <main className="lobby-layout">
        {/* Left Column: Room Code & Players */}
        <div className="lobby-left-column">
          {/* Room Code Card */}
          <section className="lobby-card lobby-room-card">
            <div className="lobby-room-details">
              <span className="lobby-kicker">MÃ BÀN CHƠI</span>
              <strong className="lobby-room-code">#{roomCode}</strong>
              <p>Quét mã QR bằng camera điện thoại hoặc bấm bên dưới để phóng to</p>
            </div>

            <button
              type="button"
              className="lobby-qr-preview-btn"
              onClick={() => setQrModalOpen(true)}
              title="Bấm để phóng to mã QR cho cả bàn cùng quét"
              aria-label={`Phóng to mã QR bàn ${roomCode}`}
            >
              <div className="qr-preview-box">
                {/* Visual QR Code Symbol */}
                <svg viewBox="0 0 80 80" className="lobby-qr-svg" aria-hidden="true">
                  <rect width="80" height="80" fill="#13161c" rx="4" />
                  <rect x="6" y="6" width="20" height="20" fill="none" stroke="#c98638" strokeWidth="2.5" rx="2" />
                  <rect x="11" y="11" width="10" height="10" fill="#c98638" rx="1" />
                  <rect x="54" y="6" width="20" height="20" fill="none" stroke="#c98638" strokeWidth="2.5" rx="2" />
                  <rect x="59" y="11" width="10" height="10" fill="#c98638" rx="1" />
                  <rect x="6" y="54" width="20" height="20" fill="none" stroke="#c98638" strokeWidth="2.5" rx="2" />
                  <rect x="11" y="59" width="10" height="10" fill="#c98638" rx="1" />
                  <rect x="34" y="14" width="6" height="6" fill="#c98638" rx="1" />
                  <rect x="42" y="24" width="4" height="4" fill="#ede7dc" />
                  <rect x="36" y="36" width="8" height="8" fill="#c98638" rx="1" />
                  <rect x="24" y="44" width="4" height="4" fill="#ede7dc" />
                  <rect x="52" y="48" width="6" height="6" fill="#ede7dc" />
                  <rect x="64" y="62" width="6" height="6" fill="#c98638" />
                </svg>
              </div>
              <span className="qr-preview-label">
                <span aria-hidden="true">🔍</span> Phóng to QR
              </span>
            </button>
          </section>

          {/* Players Roster Card */}
          <section className="lobby-card lobby-players-card">
            <div className="lobby-section-title">
              <div>
                <h2>Người chơi trong bàn</h2>
                <span className="lobby-count">{players.length}/16 ghế</span>
              </div>
              {ready && <span className="lobby-ready">✓ ĐỦ ĐIỀU KIỆN (6–16)</span>}
            </div>

            {/* Player Grid */}
            <div className="lobby-player-grid">
              {players.map((player) => (
                <div
                  className={`lobby-player ${player.id === state.playerId ? 'current-player' : ''}`}
                  key={player.id}
                >
                  <div className="player-meta">
                    <span className="player-seat">#{String(player.seatIndex).padStart(2, '0')}</span>
                    <span
                      className={`player-status-dot ${player.isConnected ? 'online' : 'offline'}`}
                      title={player.isConnected ? 'Đang kết nối' : 'Mất kết nối'}
                      aria-hidden="true"
                    />
                    <span className="player-name">{player.name}</span>
                  </div>

                  <div className="player-actions">
                    {player.seatIndex === 1 && state.isHost && (
                      <b className="badge-host">👑 HOST</b>
                    )}
                    {isSingleDevice && players.length > 6 && (
                      <button
                        type="button"
                        className="player-kick-btn"
                        onClick={() => actions.removeOfflinePlayer(player.id)}
                        title={`Bớt ${player.name}`}
                        aria-label={`Bớt ${player.name}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Thêm người chơi offline ở chế độ 1 máy */}
            {isSingleDevice && players.length < 16 && (
              <div className="lobby-add-offline">
                <input
                  type="text"
                  placeholder="Tên người chơi mới..."
                  value={newPlayerName}
                  maxLength={20}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddOfflinePlayer();
                  }}
                  className="lobby-input-name"
                />
                <button
                  type="button"
                  onClick={handleAddOfflinePlayer}
                  disabled={!newPlayerName.trim()}
                  className="lobby-btn-add"
                >
                  ＋ Thêm ghế
                </button>
              </div>
            )}

            {notice && <p className="lobby-notice" role="status">{notice}</p>}

            {/* Faction Balance Bar */}
            <div className="lobby-balance" aria-label={`Phe Dân Làng ${villageCount}, Phe Ma Sói ${wolvesCount}`}>
              <div className="lobby-balance-header">
                <span className="balance-title">PHÂN BỔ PHE PHÁI</span>
                <span className="balance-status">{players.length} người chơi ({villageCount} Dân · {wolvesCount} Sói)</span>
              </div>

              <div className="lobby-balance-bar">
                <i
                  style={{ width: `${(villageCount / (players.length || 1)) * 100}%` }}
                  title={`Phe Dân Làng: ${villageCount}`}
                />
                <i
                  style={{ width: `${(wolvesCount / (players.length || 1)) * 100}%` }}
                  title={`Phe Ma Sói: ${wolvesCount}`}
                />
              </div>

              <div className="balance-legend">
                <span className="legend-villager">
                  <i /> Phe Dân Làng: <b>{villageCount}</b>
                </span>
                <span className="legend-wolf">
                  <i /> Phe Ma Sói: <b>{wolvesCount}</b>
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Presets & Deck Roster */}
        <div className="lobby-right-column">
          <section className="lobby-card lobby-preset-card">
            <div className="lobby-section-title">
              <div>
                <h2>Đội hình thông minh (Smart Preset)</h2>
              </div>
              <span className="lobby-kicker">{playerCount} NGƯỜI CHƠI</span>
            </div>

            <div className="lobby-presets" role="group" aria-label="Chọn quy ước ván đấu">
              <button
                type="button"
                onClick={() => setPresetType('basic')}
                className={presetType === 'basic' ? 'active basic' : ''}
                aria-pressed={presetType === 'basic'}
              >
                <div className="preset-top">
                  <span className="preset-badge">Cân bằng</span>
                  <strong className="preset-name">Tối ưu số người</strong>
                </div>
                <small>Preset chuẩn hóa theo thuật toán game engine</small>
              </button>
            </div>

            {/* Expected Role Deck Breakdown */}
            <div className="lobby-deck-roster">
              <div className="deck-roster-head">
                <span className="deck-roster-title">DANH SÁCH LÁ BÀI SẼ CHIA</span>
                <span className="deck-roster-subtitle">Các vai trò sẽ được chia bí mật khi bắt đầu</span>
              </div>

              <div className="deck-roster-grid">
                {deckRoles.map((role) => (
                  <div key={role.name} className={`deck-role-pill side-${role.side}`}>
                    <span className="deck-role-badge">{role.count}×</span>
                    <span className="deck-role-icon" aria-hidden="true">{role.symbol}</span>
                    <span className="deck-role-name">{role.name}</span>
                    <span className="deck-role-side-tag">{role.sideName}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Advanced Settings Toggle */}
            <button
              type="button"
              className="lobby-advanced-toggle"
              aria-expanded={advanced}
              onClick={() => setAdvanced((open) => !open)}
            >
              <span>Tùy chỉnh luật nâng cao</span>
              <span className="toggle-symbol" aria-hidden="true">{advanced ? '−' : '+'}</span>
            </button>

            {advanced && (
              <div className="lobby-settings">
                <Setting
                  label="Lật vai khi chết"
                  desc="Công bố vai trò của người chơi ngay khi bị xử tử hoặc bị cắn"
                  checked={Boolean(currentSettings.revealOnDeath)}
                  onChange={() => handleToggleSetting('revealOnDeath')}
                />
                <Setting
                  label="Sói được bỏ lượt cắn"
                  desc="Cho phép bầy Sói tạo đêm bình yên giả để tung hỏa mù"
                  checked={Boolean(currentSettings.allowWolfSkip)}
                  onChange={() => handleToggleSetting('allowWolfSkip')}
                />
                <Setting
                  label="Sói được cắn đồng đội"
                  desc="Cho phép Ma Sói tự cắn nhau để đánh lạc hướng"
                  checked={Boolean(currentSettings.allowWolfFriendlyFire)}
                  onChange={() => handleToggleSetting('allowWolfFriendlyFire')}
                />
                <Setting
                  label="Phù thủy được tự cứu"
                  desc="Cho phép Phù thủy dùng bình cứu cho chính mình"
                  checked={Boolean(currentSettings.allowWitchSelfHeal)}
                  onChange={() => handleToggleSetting('allowWitchSelfHeal')}
                />
                <Setting
                  label="Bầu Trưởng làng ngày 1"
                  desc="Tổ chức bầu cử Trưởng làng vào sáng Ngày 1 (phiếu có trọng số 2)"
                  checked={Boolean(currentSettings.hasMayor)}
                  onChange={() => handleToggleSetting('hasMayor')}
                />
              </div>
            )}
          </section>

          {/* Start Game Action Card */}
          <section className={`lobby-start-card ${ready ? 'is-ready' : 'not-ready'}`}>
            <div className="start-meta">
              <strong className="start-title">
                {ready
                  ? 'Bàn chơi đã sẵn sàng khai màn!'
                  : `Cần tối thiểu 6 người chơi để bắt đầu (hiện có ${players.length})`}
              </strong>
              <span className="start-desc">
                {ready
                  ? state.isHost
                    ? 'Bấm nút bên dưới để bắt đầu chia bài và bước vào Đêm 1.'
                    : 'Đang đợi Quản trò bấm bắt đầu ván đấu...'
                  : 'Cần từ 6 đến 16 người để đảm bảo tính cân bằng giữa Phe Dân và Phe Sói.'}
              </span>
            </div>

            {state.isHost && (
              <button
                className="start-button"
                disabled={!ready}
                onClick={handleStartGame}
              >
                <span className="play-icon" aria-hidden="true">⚔</span>
                <span>BẮT ĐẦU VÁN ĐẤU • ĐÊM 1</span>
              </button>
            )}
          </section>
        </div>
      </main>

      {/* QR Code Magnified Modal */}
      {qrModalOpen && (
        <div
          className="lobby-modal-backdrop"
          role="presentation"
          onClick={() => setQrModalOpen(false)}
        >
          <div
            className="lobby-qr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="qr-modal-head">
              <div>
                <span className="qr-modal-kicker">MÃ PHÒNG DEEP LINK</span>
                <h3 id="qr-modal-title">BÀN #{roomCode}</h3>
              </div>
              <button
                type="button"
                className="qr-modal-close"
                onClick={() => setQrModalOpen(false)}
                aria-label="Đóng mã QR"
              >
                ×
              </button>
            </div>

            <div className="qr-modal-canvas-wrap">
              {/* Pure Offline Client SVG QR Code */}
              <div
                dangerouslySetInnerHTML={{ __html: generateQrSvgString(joinDeepLink, 200) }}
                className="qr-modal-svg-wrap"
              />
            </div>

            <p className="qr-modal-hint">
              Quét mã QR bằng camera mặc định của điện thoại để tự động vào bàn
            </p>

            <div className="qr-deeplink-copy-box">
              <code className="qr-deeplink-url">{joinDeepLink}</code>
              <button
                type="button"
                className="qr-copy-btn"
                onClick={handleCopyDeepLink}
              >
                {copiedLink ? '✓ Đã sao chép' : 'Sao chép link'}
              </button>
            </div>

            <button
              type="button"
              className="qr-modal-done-btn"
              onClick={() => setQrModalOpen(false)}
            >
              Đóng lại
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Setting({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="lobby-setting">
      <div className="setting-copy">
        <span className="setting-title">{label}</span>
        {desc && <small className="setting-desc">{desc}</small>}
      </div>
      <input type="checkbox" checked={checked} onChange={onChange} />
    </label>
  );
}
