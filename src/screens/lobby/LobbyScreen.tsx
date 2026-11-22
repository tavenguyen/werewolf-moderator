import { useEffect, useState } from 'react';
import { useGameSession } from '../../adapters/useGameSession';
import { ROLES, ROLES_BY_ID, type Faction, type RoleDefinition } from '../../engine/roles';
import { generateDynamicBalancedDeck } from '../../engine/presets';
import { searchRoles } from '../../engine/roleSearch';
import { generateQrSvgString } from '../../utils/qrCodeSvg';
import type { ScreenName } from '../../navigation';
import {
  computeDeckMetrics,
  convertSelectionToRoleIds,
  DEFAULT_INITIAL_ROLES,
  formatDeckSummaryText,
  getPresetRoleSelection,
  removeVietnameseTones,
  type RoleSelectionMap,
} from './lobbyValidation';
import PresetSelectorModal from './components/PresetSelectorModal';
import './lobby.css';

type Props = {
  onNavigate?: (screen: ScreenName) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
};

// Các vai trò đã sẵn sàng hiển thị trên giao diện (playableInUI)
const SUPPORTED_ROLES = ROLES.filter((r) => r.playableInUI);
const CORE_ROLES = SUPPORTED_ROLES.filter((r) => r.tier === 'core');
const ADVANCED_ROLES = SUPPORTED_ROLES.filter((r) => r.tier === 'advanced');

type FactionFilter = 'ALL' | 'WEREWOLF' | 'VILLAGER' | 'THIRD_PARTY';

export default function LobbyScreen({ onNavigate, onOpenRules }: Props) {
  const { state, actions, deviceMode } = useGameSession();

  const roomCode = state.roomCode || '7290';
  const players = state.publicView?.players ?? [];
  const isSingleDevice = deviceMode === 'SINGLE_DEVICE';
  const isHost = state.isHost || !state.publicView;
  const isHostPlayer = !isSingleDevice && (state.hostMode === 'PLAYER_HOST' || Boolean(state.hostView?.isHostPlayer));
  const hostPlayerId = state.playerId || state.privateView?.playerId || state.hostView?.hostPlayerId;

  // Tabs on Mobile
  const [activeMobileTab, setActiveMobileTab] = useState<'players' | 'deck'>('players');

  // Advanced Roles Sheet / Modal State
  const [advancedModalOpen, setAdvancedModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalFactionFilter, setModalFactionFilter] = useState<FactionFilter>('ALL');

  // Preset Selector Modal State & Shuffle State
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);

  // Inline Info expansion (shows 1-line description below role name)
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);

  // Settings & QR
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
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
    customDeck: DEFAULT_INITIAL_ROLES,
  };

  const DEFAULT_SETTINGS = {
    revealOnDeath: false,
    allowWolfSkip: false,
    allowWolfFriendlyFire: false,
    allowWitchSelfHeal: true,
    witchWasteHealOnEmpty: false,
    witchKnowsVictim: true,
    witchHealMode: 'AOE',
    tieVoteMode: 'ESCAPE',
    ghostMode: false,
    hasMayor: false,
  };

  const modifiedRulesCount = Object.entries(DEFAULT_SETTINGS).filter(
    ([k, defVal]) => currentSettings[k as keyof typeof DEFAULT_SETTINGS] !== defVal
  ).length;

  // Synchronized deck selection
  const [selectedRoles, setSelectedRoles] = useState<RoleSelectionMap>(() => {
    return currentSettings.customDeck || DEFAULT_INITIAL_ROLES;
  });

  // Non-host players sync deck from settings in real-time
  useEffect(() => {
    if (!isHost && currentSettings.customDeck) {
      setSelectedRoles(currentSettings.customDeck);
    }
  }, [isHost, currentSettings.customDeck]);

  // Lock body scroll when Advanced Sheet / Modal is open
  useEffect(() => {
    if (advancedModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [advancedModalOpen]);

  // Metrics computation
  const metrics = computeDeckMetrics(selectedRoles, players, isHostPlayer);

  // Advanced cards selected count
  const advancedCardsSelectedCount = Object.entries(selectedRoles).reduce((acc, [rId, count]) => {
    const isAdv = ROLES_BY_ID[rId]?.tier === 'advanced';
    return isAdv ? acc + (count || 0) : acc;
  }, 0);

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

  const handleUpdateSetting = async <K extends keyof typeof currentSettings>(
    key: K,
    value: (typeof currentSettings)[K]
  ) => {
    if (!isHost) return;
    await actions.updateSettings({ [key]: value });
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

  // Gỡ nhanh lá bài từ Pill Tag ở Khối A
  const handleRemovePill = (roleId: string) => {
    if (!isHost) return;
    const current = selectedRoles[roleId] ?? 0;
    if (current <= 0) return;

    const isMulti = roleId === 'villager' || roleId === 'werewolf';
    const next = isMulti && current > 1 ? current - 1 : 0;
    const newRoles = { ...selectedRoles, [roleId]: next };
    if (next === 0) {
      delete newRoles[roleId];
    }
    setSelectedRoles(newRoles);
    void actions.updateSettings({ customDeck: newRoles });
  };

  // Nút Gợi ý nhanh (Auto-fill dựa trên số người hiện tại, sàn 6 người, có xét isSingleDevice)
  const handleAutoFill = () => {
    if (!isHost) return;
    const targetCount = Math.max(6, metrics.realPlayersCount);
    const suggested = getPresetRoleSelection(targetCount, 'CLASSIC', isSingleDevice);
    setSelectedRoles(suggested);
    void actions.updateSettings({ customDeck: suggested });
    setNotice(`Đã áp dụng gợi ý chuẩn (${targetCount} người).`);
    setTimeout(() => setNotice(''), 2500);
  };

  // Chọn preset từ PresetSelectorModal
  const handleSelectPresetFromModal = (roles: string[]) => {
    if (!isHost) return;
    const newRoles: RoleSelectionMap = {};
    for (const rId of roles) {
      newRoles[rId] = (newRoles[rId] ?? 0) + 1;
    }
    setSelectedRoles(newRoles);
    void actions.updateSettings({ customDeck: newRoles });
    setNotice(`Đã áp dụng bộ bài ${roles.length} lá.`);
    setTimeout(() => setNotice(''), 2500);
  };

  // Nút Đổi ngẫu nhiên (sinh ngẫu nhiên có cân bằng, sàn 6 người)
  const handleShuffleRandom = () => {
    if (!isHost) return;
    const targetCount = Math.max(6, metrics.realPlayersCount);
    setIsShuffling(true);
    try {
      const generated = generateDynamicBalancedDeck({
        playerCount: targetCount,
        isSingleDevice,
      });
      const newRoles: RoleSelectionMap = {};
      for (const rId of generated.roles) {
        newRoles[rId] = (newRoles[rId] ?? 0) + 1;
      }
      setSelectedRoles(newRoles);
      void actions.updateSettings({ customDeck: newRoles });
      setNotice(`Đã đổi ngẫu nhiên bộ bài ${targetCount} người cân bằng!`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi sinh bộ bài';
      setNotice(msg);
    } finally {
      setTimeout(() => {
        setIsShuffling(false);
        setNotice('');
      }, 2500);
    }
  };

  // Nút Đặt lại (Reset về 6 lá mặc định)
  const handleResetDefault = () => {
    if (!isHost) return;
    setSelectedRoles(DEFAULT_INITIAL_ROLES);
    void actions.updateSettings({ customDeck: DEFAULT_INITIAL_ROLES });
  };

  const handleAddOfflinePlayer = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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

  // Search & Filter Advanced Roles for Modal / Bottom Sheet
  const searchResults = searchRoles(ADVANCED_ROLES, searchQuery, {
    faction: modalFactionFilter,
    onlyImplemented: true,
  });

  // Selected pill items for Khối A Dòng 2
  const selectedPills = Object.entries(selectedRoles)
    .filter(([_, count]) => count > 0)
    .map(([roleId, count]) => {
      const def = ROLES_BY_ID[roleId];
      return {
        roleId,
        name: def?.nameVi || roleId,
        count,
        isAdvanced: def?.tier === 'advanced',
        faction: def?.faction || 'VILLAGER',
      };
    });

  return (
    <div className="lobby-page-compact">
      {/* 1. Header: 1 dòng duy nhất */}
      <header className="lobby-header-compact">
        <div className="header-left">
          <button
            className="lobby-back-btn"
            onClick={() => {
              void actions.leaveRoom();
              onNavigate?.('home');
            }}
            aria-label="Về trang chủ"
            title="Về trang chủ"
          >
            ←
          </button>
          <h1 className="lobby-title-compact">
            Phòng chờ <span>#{roomCode}</span>
          </h1>
        </div>
        <div className="header-right">
          <button
            className="header-link-btn"
            onClick={() => onOpenRules?.('roles')}
            title="Tra cứu luật"
          >
            Luật &amp; Vai trò
          </button>
          {isHost && (
            <button
              className="header-link-btn host-btn"
              onClick={() => onNavigate?.('host')}
              title="Vào bàn quản trò"
            >
              Bàn Host ↗
            </button>
          )}
        </div>
      </header>

      {/* 2. Mobile Tabs Switcher (< 768px) */}
      <div className="mobile-tab-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeMobileTab === 'players'}
          className={`mobile-tab-btn ${activeMobileTab === 'players' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('players')}
        >
          Người chơi ({metrics.realPlayersCount})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeMobileTab === 'deck'}
          className={`mobile-tab-btn ${activeMobileTab === 'deck' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('deck')}
        >
          Bộ bài ({metrics.totalCards})
        </button>
      </div>

      {/* 3. Main Content: 2 cột trên Desktop, 1 tab trên Mobile */}
      <main className="lobby-main-layout">
        {/* Cột 1 / Tab 1: Danh sách người chơi */}
        <section
          className={`lobby-column column-players ${activeMobileTab === 'players' ? 'mobile-visible' : 'mobile-hidden'}`}
        >
          <div className="column-inner">
            <div className="column-header-row">
              <span className="column-title">Danh sách người chơi</span>
              <span className="column-badge">{metrics.realPlayersCount}/16 ghế</span>
            </div>

            {/* Multi-Device: Compact Share Bar */}
            {!isSingleDevice && (
              <div className="compact-share-bar">
                <span className="share-room-code">Bàn #{roomCode}</span>
                <div className="share-buttons">
                  <button
                    type="button"
                    className="share-btn copy-btn"
                    onClick={handleCopyDeepLink}
                  >
                    {copiedLink ? '✓ Đã chép' : 'Sao chép link'}
                  </button>
                  <button
                    type="button"
                    className="share-btn qr-btn"
                    onClick={() => setQrModalOpen(true)}
                  >
                    Mã QR
                  </button>
                </div>
              </div>
            )}

            {/* Single Device: Input thêm người chơi quanh bàn */}
            {isSingleDevice && (
              <form className="compact-add-player-row" onSubmit={handleAddOfflinePlayer}>
                <input
                  type="text"
                  placeholder="Tên người chơi mới..."
                  value={newPlayerName}
                  maxLength={20}
                  disabled={metrics.realPlayersCount >= 16}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  className="compact-input-name"
                />
                <button
                  type="submit"
                  disabled={!newPlayerName.trim() || metrics.realPlayersCount >= 16}
                  className="compact-btn-add"
                >
                  ＋ Thêm
                </button>
              </form>
            )}

            {/* Danh sách người chơi gọn gàng */}
            <div className="compact-players-list">
              {players.length === 0 ? (
                <div className="compact-empty-state">
                  <p>
                    {isSingleDevice
                      ? 'Chưa có người chơi. Nhập tên ở trên để thêm ghế!'
                      : 'Đang đợi người chơi quét mã vào bàn...'}
                  </p>
                </div>
              ) : (
                players.map((player) => {
                  const isThisPlayerHost =
                    !isSingleDevice &&
                    isHostPlayer &&
                    (player.seatIndex === 0 || player.id === hostPlayerId);

                  return (
                    <div className="compact-player-item" key={player.id}>
                      <div className="player-left">
                        <span className="seat-idx">#{String(player.seatIndex).padStart(2, '0')}</span>
                        {!isSingleDevice && (
                          <span
                            className={`player-dot ${player.isConnected ? 'online' : 'offline'}`}
                            title={player.isConnected ? 'Online' : 'Offline'}
                          />
                        )}
                        <span className="player-name-text">{player.name}</span>
                        {isThisPlayerHost && (
                          <span className="host-pill">HOST</span>
                        )}
                      </div>

                      {isHost && !isThisPlayerHost && (
                        <button
                          type="button"
                          className="player-del-btn"
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
                  );
                })
              )}
            </div>

            {notice && <p className="compact-notice-msg">{notice}</p>}
          </div>
        </section>

        {/* Cột 2 / Tab 2: Cấu hình bộ bài */}
        <section
          className={`lobby-column column-deck ${activeMobileTab === 'deck' ? 'mobile-visible' : 'mobile-hidden'}`}
        >
          <div className="column-inner">
            {/* =========================================================================
               Khối A: Tóm tắt & Đang chọn (Selected Deck)
               ========================================================================= */}
            <div className="deck-summary-block">
              {/* Dòng 1: Thông số 1 dòng + Đúng 2 nút chữ thuần: Gợi ý bài · Đặt lại */}
              <div className="deck-summary-top-row">
                <span className="summary-text-lead">{formatDeckSummaryText(metrics)}</span>
                <div className="deck-quick-actions">
                  <button
                    type="button"
                    className="quick-action-text-btn"
                    disabled={!isHost}
                    onClick={() => setPresetModalOpen(true)}
                    title="Mở bảng chọn mẫu bài và phong cách chơi (44 bộ bài chuẩn)"
                  >
                    Gợi ý bài
                  </button>
                  <span className="action-divider" aria-hidden="true">·</span>
                  <button
                    type="button"
                    className="quick-action-text-btn"
                    disabled={!isHost}
                    onClick={handleResetDefault}
                    title="Đặt lại về 6 lá cơ bản cân bằng"
                  >
                    Đặt lại
                  </button>
                </div>
              </div>

              {/* Dòng 2: Pill tags các lá đang chọn (viền mảnh theo phe, có dấu × để gỡ nhanh) */}
              <div className="deck-pills-row" aria-label="Các lá bài đang được chọn">
                {selectedPills.map((pill) => (
                  <span
                    key={pill.roleId}
                    className={`deck-pill-tag faction-${pill.faction.toLowerCase()}`}
                  >
                    <span className="pill-name">{pill.name}</span>
                    {pill.count > 1 && <span className="pill-multiplier">×{pill.count}</span>}
                    {isHost && (
                      <button
                        type="button"
                        className="pill-remove-btn"
                        onClick={() => handleRemovePill(pill.roleId)}
                        title={`Gỡ 1 lá ${pill.name}`}
                        aria-label={`Gỡ 1 lá ${pill.name}`}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>

            {/* =========================================================================
               Khối B: Danh sách Vai cơ bản (Core Roles - 8 vai)
               ========================================================================= */}
            <div className="core-roles-section">
              <span className="section-mini-title">Vai trò cơ bản</span>
              <div className="compact-roles-list">
                {CORE_ROLES.map((role) => {
                  const count = selectedRoles[role.id] ?? 0;
                  const isMulti = role.id === 'villager' || role.id === 'werewolf';
                  const isSelected = count > 0;
                  const isExpanded = expandedRoleId === role.id;
                  const weight = role.balanceWeight;
                  const weightFormatted = weight > 0 ? `+${weight}` : `${weight}`;

                  return (
                    <div
                      key={role.id}
                      className={`compact-role-row ${isSelected ? 'selected' : ''}`}
                    >
                      <div className="role-main-row">
                        <button
                          type="button"
                          className="role-left-click-wrap"
                          onClick={() => setExpandedRoleId(isExpanded ? null : role.id)}
                          title="Bấm để xem nhanh kỹ năng"
                        >
                          <span className="role-title">{role.nameVi}</span>
                          <span className="role-weight-gray">{weightFormatted}</span>
                        </button>

                        <div className="role-right">
                          {isMulti ? (
                            /* Nút tăng giảm - 2 + cho Dân và Sói */
                            <div className="compact-counter-box">
                              <button
                                type="button"
                                className="counter-btn"
                                disabled={!isHost || count <= 0}
                                onClick={() => handleRoleCountChange(role.id, -1)}
                                aria-label={`Giảm ${role.nameVi}`}
                              >
                                −
                              </button>
                              <span className="counter-number">{count}</span>
                              <button
                                type="button"
                                className="counter-btn"
                                disabled={!isHost || metrics.totalCards >= 16}
                                onClick={() => handleRoleCountChange(role.id, 1)}
                                aria-label={`Tăng ${role.nameVi}`}
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            /* Nút gạt bật/tắt (Toggle switch) cho vai đơn */
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isSelected}
                              disabled={!isHost || (!isSelected && metrics.totalCards >= 16)}
                              className={`compact-toggle-switch ${isSelected ? 'active' : ''}`}
                              onClick={() => handleRoleToggle(role.id)}
                              aria-label={`Chọn vai ${role.nameVi}`}
                            >
                              <span className="toggle-thumb" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Xem nhanh kỹ năng tại chỗ (Inline Info) */}
                      {isExpanded && (
                        <div className="role-inline-desc">
                          {role.shortDesc}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* =========================================================================
               Khối C: Nút mở Vai trò nâng cao (Trigger)
               ========================================================================= */}
            <div className="advanced-trigger-block">
              <button
                type="button"
                className="advanced-roles-trigger-btn"
                onClick={() => setAdvancedModalOpen(true)}
              >
                <span>＋ Vai trò nâng cao</span>
                {advancedCardsSelectedCount > 0 && (
                  <span className="adv-selected-badge">đang chọn {advancedCardsSelectedCount}</span>
                )}
              </button>
            </div>

            {/* Tùy chỉnh luật nâng cao thu gọn */}
            <div className="compact-settings-wrapper">
              <button
                type="button"
                className="compact-settings-toggle"
                onClick={() => setAdvancedSettingsOpen((v) => !v)}
                aria-expanded={advancedSettingsOpen}
              >
                <div className="settings-toggle-left">
                  <span className="settings-title-main">Tùy chỉnh luật phòng</span>
                  <span className={`settings-status-badge ${modifiedRulesCount > 0 ? 'modified' : ''}`}>
                    {modifiedRulesCount > 0 ? `Đã đổi ${modifiedRulesCount}` : 'Mặc định'}
                  </span>
                  {!isHost && (
                    <span className="settings-readonly-badge">Chỉ xem</span>
                  )}
                </div>
                <span className="toggle-arrow">{advancedSettingsOpen ? '▲' : '▼'}</span>
              </button>

              {advancedSettingsOpen && (
                <div className="compact-settings-panel">
                  {/* Nhóm 1: Phe Ma Sói */}
                  <div className="settings-group">
                    <div className="settings-group-title">Phe Ma Sói</div>
                    <div className="settings-group-content">
                      <RuleToggleRow
                        title="Sói được bỏ cắn"
                        desc="Cho phép đàn Sói không cắn ai để tạo đêm bình yên giả."
                        checked={Boolean(currentSettings.allowWolfSkip)}
                        disabled={!isHost}
                        onToggle={() => handleToggleSetting('allowWolfSkip')}
                      />
                      <RuleToggleRow
                        title="Sói cắn đồng đội"
                        desc="Cho phép Sói tự cắn nhau để đánh lạc hướng Tiên tri và Dân."
                        checked={Boolean(currentSettings.allowWolfFriendlyFire)}
                        disabled={!isHost}
                        onToggle={() => handleToggleSetting('allowWolfFriendlyFire')}
                      />
                    </div>
                  </div>

                  {/* Nhóm 2: Kỹ năng Phù Thủy */}
                  <div className="settings-group">
                    <div className="settings-group-title">Kỹ năng Phù Thủy</div>
                    <div className="settings-group-content">
                      <RuleToggleRow
                        title="Phù thủy tự cứu"
                        desc="Cho phép Phù thủy dùng bình cứu giải thoát cho chính mình."
                        checked={Boolean(currentSettings.allowWitchSelfHeal)}
                        disabled={!isHost}
                        onToggle={() => handleToggleSetting('allowWitchSelfHeal')}
                      />
                      <RuleToggleRow
                        title="Phù thủy biết nạn nhân"
                        desc="Bật: Hiện tên người bị cắn. Tắt: Cứu mù theo phán đoán."
                        checked={Boolean(currentSettings.witchKnowsVictim)}
                        disabled={!isHost}
                        onToggle={() => handleToggleSetting('witchKnowsVictim')}
                      />
                      <RuleSegmentedRow
                        title="Cơ chế bình cứu"
                        desc="AoE: Cứu mọi nạn nhân bị cắn. 1 người: Chọn cứu 1 nạn nhân."
                        selectedValue={currentSettings.witchHealMode || 'AOE'}
                        disabled={!isHost}
                        options={[
                          { value: 'AOE', label: 'Cứu tất cả (AoE)' },
                          { value: 'SINGLE', label: 'Cứu 1 người' },
                        ]}
                        onChange={(val) => handleUpdateSetting('witchHealMode', val)}
                      />
                      {!currentSettings.witchKnowsVictim && (
                        <RuleToggleRow
                          title="Mất bình khi cứu trượt"
                          desc="Khi cứu mù trúng đêm bình yên: Bật để mất bình, Tắt để hoàn lại."
                          checked={Boolean(currentSettings.witchWasteHealOnEmpty)}
                          disabled={!isHost}
                          onToggle={() => handleToggleSetting('witchWasteHealOnEmpty')}
                        />
                      )}
                    </div>
                  </div>

                  {/* Nhóm 3: Ban Ngày & Biểu Quyết */}
                  <div className="settings-group">
                    <div className="settings-group-title">Ban Ngày &amp; Biểu Quyết</div>
                    <div className="settings-group-content">
                      <RuleToggleRow
                        title="Bầu Trưởng làng ngày 1"
                        desc="Mở vòng tranh cử Trưởng làng (sở hữu 2 phiếu) vào sáng Ngày 1."
                        checked={Boolean(currentSettings.hasMayor)}
                        disabled={!isHost}
                        onToggle={() => handleToggleSetting('hasMayor')}
                      />
                      <RuleSegmentedRow
                        title="Hòa phiếu ban ngày"
                        desc="Hòa là thoát: Không ai bị treo. Vote lại: Biện hộ 30s &amp; bầu lại."
                        selectedValue={currentSettings.tieVoteMode || 'ESCAPE'}
                        disabled={!isHost}
                        options={[
                          { value: 'ESCAPE', label: 'Hòa là thoát' },
                          { value: 'RUNOFF', label: 'Vote lại' },
                        ]}
                        onChange={(val) => handleUpdateSetting('tieVoteMode', val)}
                      />
                    </div>
                  </div>

                  {/* Nhóm 4: Cơ Chế & Thông Tin */}
                  <div className="settings-group">
                    <div className="settings-group-title">Cơ Chế &amp; Thông Tin</div>
                    <div className="settings-group-content">
                      <RuleToggleRow
                        title="Lật vai khi chết"
                        desc="Khuyên Tắt để tăng đất diễn giả danh vai trò và suy luận."
                        checked={Boolean(currentSettings.revealOnDeath)}
                        disabled={!isHost}
                        onToggle={() => handleToggleSetting('revealOnDeath')}
                      />
                      <RuleToggleRow
                        title="Góc nhìn người chết"
                        desc="Ẩn vai người sống đối với màn hình của người đã chết (chống spoil)."
                        checked={Boolean(currentSettings.ghostMode)}
                        disabled={!isHost}
                        onToggle={() => handleToggleSetting('ghostMode')}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* 4. Thanh hành động ghim cố định ở đáy màn hình (Sticky Footer) */}
      <footer className="lobby-sticky-footer">
        <div className="footer-status-box">
          <strong className="footer-count-text">
            {metrics.realPlayersCount}/{metrics.totalCards} người chơi
          </strong>
          <span className={`footer-hint-text status-${metrics.statusType}`}>
            {metrics.isReadyToStart
              ? '✓ Khớp số lượng, sẵn sàng!'
              : metrics.playerCardDiff < 0
                ? `Thiếu ${Math.abs(metrics.playerCardDiff)} người (hoặc bớt bài)`
                : metrics.playerCardDiff > 0
                  ? `Cần chọn thêm ${metrics.playerCardDiff} lá`
                  : metrics.statusMessage}
          </span>
        </div>

        <div className="footer-action-box">
          {isHost ? (
            <button
              type="button"
              className={`footer-btn-start ${metrics.isReadyToStart ? 'ready' : ''}`}
              disabled={!metrics.isReadyToStart}
              onClick={handleStartGame}
            >
              Bắt đầu ván
            </button>
          ) : (
            <span className="footer-waiting-pill">Đang đợi Quản trò...</span>
          )}
        </div>
      </footer>

      {/* =========================================================================
         Khung "Vai trò nâng cao" (Modal trên Desktop / Bottom Sheet trên Mobile)
         ========================================================================= */}
      {advancedModalOpen && (
        <div
          className="advanced-sheet-backdrop"
          role="presentation"
          onClick={() => setAdvancedModalOpen(false)}
        >
          <div
            className="advanced-sheet-container"
            role="dialog"
            aria-modal="true"
            aria-labelledby="advanced-sheet-title"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header cố định (Sticky Top) */}
            <div className="sheet-sticky-header">
              <div className="sheet-title-row">
                <h3 id="advanced-sheet-title" className="sheet-heading">
                  Vai trò nâng cao
                </h3>
                <button
                  type="button"
                  className="sheet-close-btn"
                  onClick={() => setAdvancedModalOpen(false)}
                  aria-label="Đóng bảng nâng cao"
                >
                  ×
                </button>
              </div>

              {/* Thanh tìm kiếm nhanh (Instant Search không dấu) */}
              <div className="sheet-search-wrap">
                <input
                  type="text"
                  placeholder="Tìm kiếm vai trò nâng cao (VD: soi, pt, witch, ban)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="sheet-search-input"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => setSearchQuery('')}
                    aria-label="Xóa tìm kiếm"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Bộ lọc phe chữ thuần: Tất cả | Sói | Dân | Phe thứ 3 */}
              <div className="sheet-filter-bar" role="tablist">
                <button
                  type="button"
                  className={`sheet-filter-btn ${modalFactionFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setModalFactionFilter('ALL')}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  className={`sheet-filter-btn ${modalFactionFilter === 'WEREWOLF' ? 'active' : ''}`}
                  onClick={() => setModalFactionFilter('WEREWOLF')}
                >
                  Sói
                </button>
                <button
                  type="button"
                  className={`sheet-filter-btn ${modalFactionFilter === 'VILLAGER' ? 'active' : ''}`}
                  onClick={() => setModalFactionFilter('VILLAGER')}
                >
                  Dân
                </button>
                <button
                  type="button"
                  className={`sheet-filter-btn ${modalFactionFilter === 'THIRD_PARTY' ? 'active' : ''}`}
                  onClick={() => setModalFactionFilter('THIRD_PARTY')}
                >
                  Phe thứ 3
                </button>
              </div>
            </div>

            {/* Body cuộn độc lập */}
            <div className="sheet-scroll-body">
              {searchResults.length === 0 ? (
                <div className="sheet-empty-search">
                  <p>Không tìm thấy vai trò phù hợp</p>
                </div>
              ) : (
                <div className="compact-roles-list">
                  {searchResults.map(({ role, reason }) => {
                    const count = selectedRoles[role.id] ?? 0;
                    const isSelected = count > 0;
                    const isExpanded = expandedRoleId === role.id;
                    const weight = role.balanceWeight;
                    const weightFormatted = weight > 0 ? `+${weight}` : `${weight}`;
                    const isMultiDeviceBlocked = Boolean(role.multiDeviceOnly && isSingleDevice);

                    return (
                      <div
                        key={role.id}
                        className={`compact-role-row ${isSelected ? 'selected' : ''} ${isMultiDeviceBlocked ? 'role-row-blocked' : ''}`}
                      >
                        <div className="role-main-row">
                          <button
                            type="button"
                            className="role-left-click-wrap"
                            onClick={() => setExpandedRoleId(isExpanded ? null : role.id)}
                            title="Bấm để xem nhanh kỹ năng"
                          >
                            <span className="role-title">{role.nameVi}</span>
                            {role.multiDeviceOnly && (
                              <span
                                className={`role-device-badge ${isMultiDeviceBlocked ? 'blocked' : ''}`}
                                title={isSingleDevice ? 'Chỉ khả dụng ở chế độ Nhiều máy' : 'Yêu cầu màn hình riêng'}
                              >
                                {isSingleDevice ? 'Chỉ khả dụng ở chế độ Nhiều máy' : 'Nhiều máy'}
                              </span>
                            )}
                            {reason && reason.type !== 'name' && (
                              <span className="role-match-badge" title={`${reason.label}: ${reason.value}`}>
                                {reason.label}: "{reason.value}"
                              </span>
                            )}
                            <span className="role-weight-gray">{weightFormatted}</span>
                          </button>

                          <div className="role-right">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isSelected}
                              disabled={!isHost || isMultiDeviceBlocked || (!isSelected && metrics.totalCards >= 16)}
                              className={`compact-toggle-switch ${isSelected ? 'active' : ''}`}
                              onClick={() => {
                                if (isMultiDeviceBlocked) {
                                  setNotice(`Vai [${role.nameVi}] chỉ khả dụng ở chế độ Nhiều máy.`);
                                  return;
                                }
                                handleRoleToggle(role.id);
                              }}
                              aria-label={`Chọn vai ${role.nameVi}`}
                            >
                              <span className="toggle-thumb" />
                            </button>
                          </div>
                        </div>

                        {/* Xem nhanh kỹ năng tại chỗ (Inline Info) */}
                        {isExpanded && (
                          <div className="role-inline-desc">
                            {role.shortDesc}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer cố định (Sticky Bottom) */}
            <div className="sheet-sticky-footer">
              <div className="sheet-footer-info">
                <span className="sheet-summary-badge">
                  Đang chọn: <strong>{metrics.totalCards} lá</strong> · {metrics.balanceLabel}
                </span>
              </div>
              <button
                type="button"
                className="sheet-done-btn"
                onClick={() => setAdvancedModalOpen(false)}
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}

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
                <span className="qr-modal-kicker">MÃ PHÒNG</span>
                <h3 id="qr-modal-title">BÀN #{roomCode}</h3>
              </div>
              <button
                type="button"
                className="qr-modal-close"
                onClick={() => setQrModalOpen(false)}
                aria-label="Đóng"
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

            <p className="qr-modal-hint">Quét mã QR bằng camera để tự động vào bàn</p>

            <div className="qr-deeplink-copy-box">
              <code className="qr-deeplink-url">{joinDeepLink}</code>
              <button
                type="button"
                className="qr-copy-btn"
                onClick={handleCopyDeepLink}
              >
                {copiedLink ? '✓ Đã chép' : 'Sao chép link'}
              </button>
            </div>

            <button
              type="button"
              className="qr-modal-done-btn"
              onClick={() => setQrModalOpen(false)}
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Preset / Game Style Selector Modal */}
      <PresetSelectorModal
        isOpen={presetModalOpen}
        onClose={() => setPresetModalOpen(false)}
        onSelectPreset={handleSelectPresetFromModal}
        playerCount={metrics.realPlayersCount}
        isSingleDevice={isSingleDevice}
      />
    </div>
  );
}

function RuleToggleRow({
  title,
  desc,
  checked,
  disabled,
  onToggle,
}: {
  title: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`rule-row ${disabled ? 'disabled' : ''}`}>
      <div className="rule-info">
        <span className="rule-name">{title}</span>
        <span className="rule-desc">{desc}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`rule-toggle-switch ${checked ? 'active' : ''}`}
        onClick={onToggle}
        aria-label={title}
      >
        <span className="toggle-thumb" />
      </button>
    </div>
  );
}

function RuleSegmentedRow<T extends string>({
  title,
  desc,
  options,
  selectedValue,
  disabled,
  onChange,
}: {
  title: string;
  desc: string;
  options: { value: T; label: string }[];
  selectedValue: T;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className={`rule-row ${disabled ? 'disabled' : ''}`}>
      <div className="rule-info">
        <span className="rule-name">{title}</span>
        <span className="rule-desc">{desc}</span>
      </div>
      <div className="rule-segmented-wrap" role="group" aria-label={title}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            className={`rule-segmented-btn ${selectedValue === opt.value ? 'active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
