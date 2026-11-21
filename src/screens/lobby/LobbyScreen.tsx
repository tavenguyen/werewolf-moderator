import { useEffect, useState } from 'react';
import { useGameSession } from '../../adapters/useGameSession';
import { ROLES, ROLES_BY_ID, type RoleDefinition, type Faction } from '../../engine/roles';
import { generateQrSvgString } from '../../utils/qrCodeSvg';
import type { ScreenName } from '../../navigation';
import {
  computeDeckMetrics,
  convertSelectionToRoleIds,
  DEFAULT_INITIAL_ROLES,
  getFactionLabel,
  getPackLabel,
  type RoleSelectionMap,
} from './lobbyValidation';
import './lobby.css';

type Props = {
  onNavigate?: (screen: ScreenName) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
};

const FACTION_ORDER: Faction[] = ['WEREWOLF', 'VILLAGER', 'THIRD_PARTY'];

function getRoleSymbol(role: RoleDefinition): string {
  if (role.faction === 'WEREWOLF') {
    if (role.id === 'wolf_cub') return '🐾';
    if (role.id === 'dream_wolf') return '🌙';
    if (role.id === 'sorcerer') return '🧙‍♂️';
    if (role.id === 'minion') return '👺';
    return '🐺';
  }
  if (role.faction === 'THIRD_PARTY') {
    if (role.id === 'white_wolf') return '❄️';
    if (role.id === 'tanner') return '🍂';
    return '⚖️';
  }
  switch (role.id) {
    case 'seer':
      return '🔮';
    case 'bodyguard':
      return '⚔️';
    case 'witch':
      return '🧪';
    case 'hunter':
      return '🎯';
    case 'cupid':
      return '💘';
    case 'elder':
      return '👴';
    case 'village_idiot':
      return '🤡';
    case 'lycan':
      return '🐺';
    default:
      return '🛡️';
  }
}

export default function LobbyScreen({ onNavigate, onOpenRules }: Props) {
  const { state, actions, deviceMode } = useGameSession();

  const roomCode = state.roomCode || '7290';
  const players = state.publicView?.players ?? [];
  const isSingleDevice = deviceMode === 'SINGLE_DEVICE';
  const isHost = state.isHost;
  const isHostPlayer = !isSingleDevice && (state.hostMode === 'PLAYER_HOST' || Boolean(state.hostView?.isHostPlayer));

  const [advanced, setAdvanced] = useState(false);
  const [notice, setNotice] = useState('');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [activeFactionTab, setActiveFactionTab] = useState<Faction | 'ALL'>('ALL');

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
    customDeck: DEFAULT_INITIAL_ROLES,
  };

  // Synchronized deck selection
  const [selectedRoles, setSelectedRoles] = useState<RoleSelectionMap>(() => {
    return currentSettings.customDeck || DEFAULT_INITIAL_ROLES;
  });

  // Non-host players sync deck from settings
  useEffect(() => {
    if (!isHost && currentSettings.customDeck) {
      setSelectedRoles(currentSettings.customDeck);
    }
  }, [isHost, currentSettings.customDeck]);

  // Metrics computation
  const metrics = computeDeckMetrics(selectedRoles, players, isHostPlayer);

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
    if (!isHost) return;
    const nextVal = !currentSettings[key];
    await actions.updateSettings({ [key]: nextVal });
  };

  const handleRoleCountChange = (roleId: string, delta: number) => {
    if (!isHost) return;
    const current = selectedRoles[roleId] ?? 0;
    const next = Math.max(0, current + delta);
    if (current === next) return;
    if (delta > 0 && metrics.totalCards >= 16) return;

    const newRoles = { ...selectedRoles, [roleId]: next };
    if (next === 0 && roleId !== 'villager' && roleId !== 'werewolf') {
      delete newRoles[roleId];
    }
    setSelectedRoles(newRoles);
    void actions.updateSettings({ customDeck: newRoles });
  };

  const handleRoleToggle = (roleId: string) => {
    if (!isHost) return;
    const current = selectedRoles[roleId] ?? 0;
    if (current === 0 && metrics.totalCards >= 16) return;
    const next = current > 0 ? 0 : 1;
    const newRoles = { ...selectedRoles, [roleId]: next };
    if (next === 0) {
      delete newRoles[roleId];
    }
    setSelectedRoles(newRoles);
    void actions.updateSettings({ customDeck: newRoles });
  };

  const handleAddOfflinePlayer = () => {
    const trimmed = newPlayerName.trim();
    if (!trimmed) return;
    if (players.some((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      setNotice(`Tên "${trimmed}" đã có trong bàn.`);
      return;
    }
    try {
      actions.addOfflinePlayer(trimmed);
      setNewPlayerName('');
      setNotice('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể thêm người chơi';
      setNotice(msg);
    }
  };

  const handleStartGame = async () => {
    if (!metrics.isReadyToStart || !isHost) return;
    try {
      const roleIds = convertSelectionToRoleIds(selectedRoles);
      await actions.startGame(roleIds);
      onNavigate?.('night');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể bắt đầu ván đấu';
      setNotice(msg);
    }
  };

  // Group roles by Faction
  const rolesByFaction: Record<Faction, RoleDefinition[]> = {
    WEREWOLF: ROLES.filter((r) => r.faction === 'WEREWOLF'),
    VILLAGER: ROLES.filter((r) => r.faction === 'VILLAGER'),
    THIRD_PARTY: ROLES.filter((r) => r.faction === 'THIRD_PARTY'),
  };

  const displayedFactions =
    activeFactionTab === 'ALL'
      ? FACTION_ORDER
      : FACTION_ORDER.filter((f) => f === activeFactionTab);

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
                ? 'Chế độ 1 máy: Thiết bị đặt cố định giữa bàn làm Bảng trung tâm'
                : isHostPlayer
                  ? 'Chế độ nhiều máy: Host kiêm người chơi và nhận 1 lá bài'
                  : 'Chế độ nhiều máy: Host là Bảng trung tâm không nhận bài'}
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
          {isHost && (
            <button className="lobby-link-button" onClick={() => onNavigate?.('host')}>
              <span>Bàn Quản Trò</span>
              <span aria-hidden="true">↗</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Grid */}
      <main className="lobby-layout">
        {/* Left Column: Room Sharing & Players */}
        <div className="lobby-left-column">
          {/* Multi-Device: Room Code Card */}
          {!isSingleDevice && (
            <section className="lobby-card lobby-room-card">
              <div className="lobby-room-details">
                <span className="lobby-kicker">MÃ BÀN CHƠI</span>
                <strong className="lobby-room-code">#{roomCode}</strong>
                <p>Quét mã QR bằng camera điện thoại hoặc sao chép link mời</p>
                <div className="lobby-room-actions">
                  <button
                    type="button"
                    className="qr-copy-btn"
                    onClick={handleCopyDeepLink}
                  >
                    {copiedLink ? '✓ Đã sao chép link' : '🔗 Sao chép link mời'}
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="lobby-qr-preview-btn"
                onClick={() => setQrModalOpen(true)}
                title="Bấm để phóng to mã QR cho cả bàn cùng quét"
                aria-label={`Phóng to mã QR bàn ${roomCode}`}
              >
                <div className="qr-preview-box">
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
          )}

          {/* Players Roster Card */}
          <section className="lobby-card lobby-players-card">
            <div className="lobby-section-title">
              <div>
                <h2>Danh sách người chơi</h2>
                <span className="lobby-count">{metrics.realPlayersCount}/16 ghế</span>
              </div>
              <div className="lobby-host-role-badge">
                {isSingleDevice ? (
                  <span className="host-mode-pill">🖥️ Bảng trung tâm</span>
                ) : isHostPlayer ? (
                  <span className="host-mode-pill player">🎮 Host kiêm Người chơi</span>
                ) : (
                  <span className="host-mode-pill board">📺 Host Bảng trung tâm</span>
                )}
              </div>
            </div>

            {/* Explanatory subtitle for Host counting logic */}
            <p className="lobby-player-role-hint">
              {isSingleDevice
                ? 'Host nhập danh sách người chơi quanh bàn bên dưới (Host không nhận bài riêng).'
                : isHostPlayer
                  ? `Host là 1 người chơi thật nhận bài. Cần thêm ${Math.max(0, metrics.totalCards - metrics.realPlayersCount)} người chơi khác vào phòng.`
                  : `Host chỉ là màn hình hiển thị/loa trung tâm. Cần ${metrics.totalCards} người chơi khác vào phòng.`}
            </p>

            {/* Single Device: Input form for adding players */}
            {isSingleDevice && (
              <div className="lobby-add-offline">
                <input
                  type="text"
                  placeholder="Tên người chơi mới (VD: Lan Anh, Nam)..."
                  value={newPlayerName}
                  maxLength={20}
                  disabled={metrics.realPlayersCount >= 16}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddOfflinePlayer();
                  }}
                  className="lobby-input-name"
                />
                <button
                  type="button"
                  onClick={handleAddOfflinePlayer}
                  disabled={!newPlayerName.trim() || metrics.realPlayersCount >= 16}
                  className="lobby-btn-add"
                >
                  ＋ Thêm ghế
                </button>
              </div>
            )}

            {/* Player Grid */}
            <div className="lobby-player-grid">
              {players.length === 0 ? (
                <div className="lobby-empty-players">
                  <span className="empty-icon" aria-hidden="true">👥</span>
                  <p>
                    {isSingleDevice
                      ? 'Chưa có người chơi nào quanh bàn. Hãy nhập tên ở trên để thêm ghế!'
                      : 'Chưa có ai vào phòng. Hãy chia sẻ mã hoặc QR để mọi người tham gia!'}
                  </p>
                </div>
              ) : (
                players.map((player) => (
                  <div
                    className={`lobby-player ${player.id === state.playerId ? 'current-player' : ''}`}
                    key={player.id}
                  >
                    <div className="player-meta">
                      <span className="player-seat">#{String(player.seatIndex).padStart(2, '0')}</span>
                      {!isSingleDevice && (
                        <span
                          className={`player-status-dot ${player.isConnected ? 'online' : 'offline'}`}
                          title={player.isConnected ? 'Đang kết nối' : 'Mất kết nối'}
                          aria-hidden="true"
                        />
                      )}
                      <span className="player-name">{player.name}</span>
                    </div>

                    <div className="player-actions">
                      {!isSingleDevice && isHostPlayer && player.seatIndex === 0 && (
                        <b className="badge-host">👑 HOST</b>
                      )}
                      {/* Host can remove player */}
                      {isHost && (
                        <button
                          type="button"
                          className="player-kick-btn"
                          onClick={() => {
                            if (isSingleDevice) {
                              actions.removeOfflinePlayer(player.id);
                            } else {
                              void actions.hostEmergencyEliminate(player.id);
                            }
                          }}
                          title={`Bớt ${player.name}`}
                          aria-label={`Bớt ${player.name}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {notice && <p className="lobby-notice" role="status">{notice}</p>}
          </section>
        </div>

        {/* Right Column: Custom Role Deck Selection & Balance Gauge */}
        <div className="lobby-right-column">
          {/* Read-Only Notice for Non-Host Players */}
          {!isHost && (
            <div className="lobby-readonly-banner" role="status">
              <span aria-hidden="true">👁️</span>
              <div>
                <strong>Chế độ chỉ đọc</strong>
                <p>Bạn đang xem danh sách lá bài do Quản trò thiết lập cho ván đấu này.</p>
              </div>
            </div>
          )}

          {/* Faction Balance Gauge Card */}
          <section className="lobby-card lobby-balance-card">
            <div className="lobby-section-title">
              <div>
                <h2>Thước đo cân bằng phe</h2>
                <span className={`balance-badge status-${metrics.balanceStatus}`}>
                  {metrics.balanceLabel}
                </span>
              </div>
              <span className="deck-total-count">
                <b>{metrics.totalCards}</b> / 16 LÁ
              </span>
            </div>

            {/* Visual Balance Bar */}
            <div className="balance-gauge-wrap" aria-label={`Trạng thái cân bằng: ${metrics.balanceLabel}`}>
              <div className="balance-gauge-track">
                {/* Zone Wolf (< -2) */}
                <div className="gauge-zone zone-wolf" title="Nghiêng phe Sói (< -2)" />
                {/* Zone Balanced ([-2, +2]) */}
                <div className="gauge-zone zone-balanced" title="Vùng Cân bằng (-2 đến +2)" />
                {/* Zone Village (> +2) */}
                <div className="gauge-zone zone-village" title="Nghiêng phe Dân (> +2)" />

                {/* Center marker (0) */}
                <div className="gauge-center-marker" title="Mốc 0" />

                {/* Needle Indicator */}
                {(() => {
                  // Map balanceScore (-15 to +15) into 0% - 100%
                  const clamped = Math.max(-15, Math.min(15, metrics.balanceScore));
                  const percentage = ((clamped + 15) / 30) * 100;
                  return (
                    <div
                      className={`gauge-needle needle-${metrics.balanceStatus}`}
                      style={{ left: `${percentage}%` }}
                    >
                      <span className="gauge-needle-bubble">
                        {metrics.balanceScore > 0 ? `+${metrics.balanceScore}` : metrics.balanceScore}
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div className="gauge-labels">
                <span className="label-wolf">🐺 Nghiêng Sói (&lt; -2)</span>
                <span className="label-balanced">⚖️ Cân bằng (-2 đến +2)</span>
                <span className="label-village">🛡️ Nghiêng Dân (&gt; +2)</span>
              </div>
            </div>

            {/* Deck Composition Summary Pills */}
            <div className="balance-composition-pills">
              <span className="comp-pill comp-wolf">
                <i>🐺</i> Phe Sói: <b>{metrics.wolvesCount}</b>
                {metrics.nightHuntingWolvesCount < 1 && (
                  <small className="pill-warn">⚠️ Thiếu sói cắn</small>
                )}
              </span>
              <span className="comp-pill comp-village">
                <i>🛡️</i> Phe Dân: <b>{metrics.villagersCount}</b>
              </span>
              <span className="comp-pill comp-third">
                <i>⚖️</i> Phe Thứ 3: <b>{metrics.thirdPartyCount}</b>
              </span>
            </div>
          </section>

          {/* Role Selection Card */}
          <section className="lobby-card lobby-deck-selector-card">
            <div className="lobby-section-title">
              <div>
                <h2>Danh mục lá bài chia</h2>
                <span className="lobby-count">Tối thiểu 6 lá, tối đa 16 lá</span>
              </div>
              {/* Faction Filter Tabs */}
              <div className="faction-filter-tabs" role="tablist">
                <button
                  type="button"
                  className={`tab-btn ${activeFactionTab === 'ALL' ? 'active' : ''}`}
                  onClick={() => setActiveFactionTab('ALL')}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeFactionTab === 'WEREWOLF' ? 'active' : ''}`}
                  onClick={() => setActiveFactionTab('WEREWOLF')}
                >
                  🐺 Sói ({metrics.wolvesCount})
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeFactionTab === 'VILLAGER' ? 'active' : ''}`}
                  onClick={() => setActiveFactionTab('VILLAGER')}
                >
                  🛡️ Dân ({metrics.villagersCount})
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeFactionTab === 'THIRD_PARTY' ? 'active' : ''}`}
                  onClick={() => setActiveFactionTab('THIRD_PARTY')}
                >
                  ⚖️ Thứ 3 ({metrics.thirdPartyCount})
                </button>
              </div>
            </div>

            {/* Faction Groups */}
            <div className="deck-selection-groups">
              {displayedFactions.map((faction) => {
                const roles = rolesByFaction[faction];
                return (
                  <div key={faction} className={`faction-deck-group group-${faction.toLowerCase()}`}>
                    <div className="faction-group-header">
                      <span className="faction-group-title">{getFactionLabel(faction)}</span>
                    </div>

                    <div className="faction-roles-grid">
                      {roles.map((role) => {
                        const count = selectedRoles[role.id] ?? 0;
                        const isImplemented = role.implementedInEngine;
                        const isMultiSelectable = role.id === 'villager' || role.id === 'werewolf';
                        const isSelected = count > 0;
                        const weight = role.balanceWeight;
                        const weightStr = weight > 0 ? `+${weight}` : `${weight}`;

                        return (
                          <div
                            key={role.id}
                            className={`role-select-card ${!isImplemented ? 'is-disabled' : ''} ${isSelected ? 'is-selected' : ''}`}
                          >
                            <div className="role-card-top">
                              <span className="role-card-icon" aria-hidden="true">
                                {getRoleSymbol(role)}
                              </span>
                              <div className="role-card-title-wrap">
                                <strong className="role-card-name">{role.nameVi}</strong>
                                <span className="role-card-en">{role.nameEn}</span>
                              </div>
                              <span className={`role-card-weight ${weight > 0 ? 'pos' : weight < 0 ? 'neg' : 'zero'}`}>
                                {weightStr}
                              </span>
                            </div>

                            <div className="role-card-badges">
                              <span className="role-card-pack">{getPackLabel(role.pack)}</span>
                              {!isImplemented && (
                                <span className="role-card-unsupported">Chưa hỗ trợ</span>
                              )}
                            </div>

                            {/* Role Count Controllers */}
                            {isImplemented && (
                              <div className="role-card-controls">
                                {isMultiSelectable ? (
                                  /* Multi-Card Counter for Villager and Werewolf */
                                  <div className="role-counter">
                                    <button
                                      type="button"
                                      className="counter-btn minus"
                                      disabled={!isHost || count <= 0}
                                      onClick={() => handleRoleCountChange(role.id, -1)}
                                      aria-label={`Giảm số lá ${role.nameVi}`}
                                    >
                                      −
                                    </button>
                                    <span className="counter-val">{count}</span>
                                    <button
                                      type="button"
                                      className="counter-btn plus"
                                      disabled={!isHost || metrics.totalCards >= 16}
                                      onClick={() => handleRoleCountChange(role.id, 1)}
                                      aria-label={`Tăng số lá ${role.nameVi}`}
                                    >
                                      +
                                    </button>
                                  </div>
                                ) : (
                                  /* Binary 0 or 1 Toggle for Special Roles */
                                  <button
                                    type="button"
                                    className={`role-toggle-btn ${isSelected ? 'selected' : ''}`}
                                    disabled={!isHost || (!isSelected && metrics.totalCards >= 16)}
                                    onClick={() => handleRoleToggle(role.id)}
                                  >
                                    {isSelected ? '✓ Đã chọn (1)' : '+ Chọn lá'}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Advanced Room Settings Accordion */}
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
                  disabled={!isHost}
                  onChange={() => handleToggleSetting('revealOnDeath')}
                />
                <Setting
                  label="Sói được bỏ lượt cắn"
                  desc="Cho phép bầy Sói tạo đêm bình yên giả để tung hỏa mù"
                  checked={Boolean(currentSettings.allowWolfSkip)}
                  disabled={!isHost}
                  onChange={() => handleToggleSetting('allowWolfSkip')}
                />
                <Setting
                  label="Sói được cắn đồng đội"
                  desc="Cho phép Ma Sói tự cắn nhau để đánh lạc hướng"
                  checked={Boolean(currentSettings.allowWolfFriendlyFire)}
                  disabled={!isHost}
                  onChange={() => handleToggleSetting('allowWolfFriendlyFire')}
                />
                <Setting
                  label="Phù thủy được tự cứu"
                  desc="Cho phép Phù thủy dùng bình cứu cho chính mình"
                  checked={Boolean(currentSettings.allowWitchSelfHeal)}
                  disabled={!isHost}
                  onChange={() => handleToggleSetting('allowWitchSelfHeal')}
                />
                <Setting
                  label="Bầu Trưởng làng ngày 1"
                  desc="Tổ chức bầu cử Trưởng làng vào sáng Ngày 1 (phiếu có trọng số 2)"
                  checked={Boolean(currentSettings.hasMayor)}
                  disabled={!isHost}
                  onChange={() => handleToggleSetting('hasMayor')}
                />
              </div>
            )}
          </section>

          {/* Start Game Action Card */}
          <section className={`lobby-start-card status-${metrics.statusType}`}>
            <div className="start-meta">
              <strong className="start-title">
                {metrics.isReadyToStart
                  ? 'Bàn chơi đã sẵn sàng khai màn!'
                  : metrics.statusType === 'error'
                    ? 'Cấu hình bài chưa hợp lệ'
                    : 'Chưa đủ điều kiện bắt đầu'}
              </strong>
              <span className="start-desc">{metrics.statusMessage}</span>
            </div>

            {isHost ? (
              <button
                className="start-button"
                disabled={!metrics.isReadyToStart}
                onClick={handleStartGame}
              >
                <span className="play-icon" aria-hidden="true">⚔</span>
                <span>BẮT ĐẦU VÁN ĐẤU • ĐÊM 1</span>
              </button>
            ) : (
              <div className="start-waiting-notice">
                <span>Đang đợi Quản trò cấu hình bài và bấm Bắt đầu ván đấu...</span>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* QR Code Magnified Modal */}
      {qrModalOpen && !isSingleDevice && (
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
  disabled,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label className={`lobby-setting ${disabled ? 'is-disabled' : ''}`}>
      <div className="setting-copy">
        <span className="setting-title">{label}</span>
        {desc && <small className="setting-desc">{desc}</small>}
      </div>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
    </label>
  );
}
