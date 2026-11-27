import { useEffect, useRef, useState } from 'react';
import { useGameSession } from '../../adapters/useGameSession';
import { audioController } from '../../audio/audioController';
import { ROLES, ROLES_BY_ID } from '../../engine/roles';
import { searchRoles } from '../../engine/roleSearch';
import { generateQrSvgString } from '../../utils/qrCodeSvg';
import { getRoleImage } from '../../assets/roles';
import type { ScreenName } from '../../navigation';
import {
  computeDeckMetrics,
  convertSelectionToRoleIds,
  DEFAULT_INITIAL_ROLES,
  formatDeckSummaryText,
  type RoleSelectionMap,
} from './lobbyValidation';
import PresetSelectorModal from './components/PresetSelectorModal';
import RoomSettingsModal, {
  DEFAULT_CONFIGURABLE_SETTINGS,
  getModifiedRulesCount,
} from './components/RoomSettingsModal';
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

  // Preset Selector Modal State
  const [presetModalOpen, setPresetModalOpen] = useState(false);

  // Inline Info expansion (shows 1-line description below role name)
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [failedRoleImages, setFailedRoleImages] = useState<Record<string, boolean>>({});

  // Settings & QR
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const addPlayerInputRef = useRef<HTMLInputElement>(null);
  const advSearchInputRef = useRef<HTMLInputElement>(null);

  const sortedPlayers = [...players].sort((a, b) => a.seatIndex - b.seatIndex);

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

  const modifiedRulesCount = getModifiedRulesCount(currentSettings, selectedRoles);

  // Non-host players sync deck from settings in real-time
  useEffect(() => {
    if (!isHost && currentSettings.customDeck) {
      setSelectedRoles(currentSettings.customDeck);
    }
  }, [isHost, currentSettings.customDeck]);

  // Lock body scroll when Advanced Sheet / Modal is open & focus search only on non-touch desktop
  useEffect(() => {
    if (advancedModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const isCoarsePointer =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches;
      const isNarrow = typeof window !== 'undefined' && window.innerWidth < 768;

      let rafId: number | undefined;
      if (!isCoarsePointer && !isNarrow) {
        rafId = window.requestAnimationFrame(() => {
          advSearchInputRef.current?.focus();
        });
      }

      return () => {
        document.body.style.overflow = originalOverflow;
        if (rafId !== undefined) {
          window.cancelAnimationFrame(rafId);
        }
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

  const handleUpdateSetting = async <K extends keyof typeof currentSettings>(
    key: K,
    value: (typeof currentSettings)[K]
  ) => {
    if (!isHost) return;
    await actions.updateSettings({ [key]: value });
  };

  const handleResetSettingsToDefault = async () => {
    if (!isHost) return;
    await actions.updateSettings(DEFAULT_CONFIGURABLE_SETTINGS);
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

  // Nút Đặt lại (Reset về 6 lá mặc định)
  const handleResetDefault = () => {
    if (!isHost) return;
    setSelectedRoles(DEFAULT_INITIAL_ROLES);
    void actions.updateSettings({ customDeck: DEFAULT_INITIAL_ROLES });
  };

  const replaceOfflinePlayers = (nextNames: string[]) => {
    if (!actions.removeOfflinePlayer || !actions.addOfflinePlayer) return;
    for (const p of sortedPlayers) {
      actions.removeOfflinePlayer(p.id);
    }
    for (const name of nextNames) {
      actions.addOfflinePlayer(name);
    }
    setEditingPlayerId(null);
    setConfirmDeleteId(null);
  };

  const handleAddOfflinePlayer = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const candidates = newPlayerName
      .split(/[,\n\r]+/)
      .map((part) => part.trim().slice(0, 20))
      .filter((part) => part.length > 0);

    if (candidates.length === 0) return;

    const existingNormalized = new Set(
      sortedPlayers.map((p) => p.name.trim().toLowerCase())
    );
    let remainingSlots = 16 - sortedPlayers.length;
    let addedCount = 0;
    const duplicateNames: string[] = [];
    let overflowCount = 0;

    try {
      for (const candidate of candidates) {
        const norm = candidate.toLowerCase();
        if (existingNormalized.has(norm)) {
          duplicateNames.push(candidate);
          continue;
        }
        if (remainingSlots <= 0) {
          overflowCount++;
          continue;
        }
        actions.addOfflinePlayer?.(candidate);
        existingNormalized.add(norm);
        remainingSlots--;
        addedCount++;
      }

      if (addedCount > 0) {
        setNewPlayerName('');
        window.requestAnimationFrame(() => {
          addPlayerInputRef.current?.focus();
        });
      }

      if (addedCount === 0 && duplicateNames.length === 1 && candidates.length === 1) {
        setNotice(`Tên "${duplicateNames[0]}" đã có trong bàn.`);
      } else if (duplicateNames.length > 0 || overflowCount > 0) {
        const skippedCount = duplicateNames.length + overflowCount;
        setNotice(
          addedCount > 0
            ? `Đã thêm ${addedCount} người (bỏ qua ${skippedCount} tên trùng hoặc vượt 16 ghế).`
            : `Không thể thêm (${skippedCount} tên trùng hoặc đã đủ 16 ghế).`
        );
      } else {
        setNotice('');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể thêm người chơi';
      setNotice(msg);
    }
  };

  const handleStartEditPlayer = (playerId: string, currentName: string) => {
    setConfirmDeleteId(null);
    setEditingPlayerId(playerId);
    setEditingName(currentName);
    setNotice('');
  };

  const handleSaveEditPlayer = (playerId: string) => {
    const trimmed = editingName.trim().slice(0, 20);
    if (!trimmed) {
      setNotice('Tên người chơi không được để trống.');
      return;
    }
    const duplicate = sortedPlayers.some(
      (p) => p.id !== playerId && p.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setNotice(`Tên "${trimmed}" đã có trong bàn.`);
      return;
    }
    const target = sortedPlayers.find((p) => p.id === playerId);
    if (target && target.name === trimmed) {
      setEditingPlayerId(null);
      setNotice('');
      return;
    }
    const nextNames = sortedPlayers.map((p) => (p.id === playerId ? trimmed : p.name));
    replaceOfflinePlayers(nextNames);
    setNotice('');
  };

  const handleMoveOfflinePlayer = (index: number, delta: -1 | 1) => {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= sortedPlayers.length) return;
    const nextNames = sortedPlayers.map((p) => p.name);
    const temp = nextNames[index];
    nextNames[index] = nextNames[targetIndex];
    nextNames[targetIndex] = temp;
    replaceOfflinePlayers(nextNames);
    setNotice('');
  };

  const handleConfirmDeletePlayer = (playerId: string) => {
    if (isSingleDevice) {
      actions.removeOfflinePlayer?.(playerId);
    } else {
      void actions.hostEmergencyEliminate(playerId);
    }
    setConfirmDeleteId(null);
  };

  const handleStartGame = async () => {
    if (!metrics.isReadyToStart || !isHost) return;
    if (isSingleDevice) {
      void audioController.unlockAudio();
    }
    try {
      const roleIds = convertSelectionToRoleIds(selectedRoles);
      await actions.startGame(roleIds);
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

  const markRoleImageFailed = (roleId: string) => {
    setFailedRoleImages((prev) => (prev[roleId] ? prev : { ...prev, [roleId]: true }));
  };

  const renderRoleMiniAvatar = (roleId: string, faction: string) => {
    const roleImage = getRoleImage(roleId);
    if (!roleImage || failedRoleImages[roleId]) return null;
    const sideClass =
      faction === 'WEREWOLF' ? 'wolf' : faction === 'THIRD_PARTY' ? 'third' : 'village';
    return (
      <img
        src={roleImage}
        alt=""
        aria-hidden="true"
        className={`role-mini-avatar side-${sideClass}`}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => markRoleImageFailed(roleId)}
      />
    );
  };

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
          {isHost && !isSingleDevice && (
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
                  ref={addPlayerInputRef}
                  type="text"
                  placeholder="Tên mới (hoặc An, Bình, Chi)..."
                  value={newPlayerName}
                  maxLength={200}
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
              {sortedPlayers.length === 0 ? (
                <div className="compact-empty-state">
                  <p>
                    {isSingleDevice
                      ? 'Chưa có người chơi. Nhập tên ở trên để thêm ghế!'
                      : 'Đang đợi người chơi quét mã vào bàn...'}
                  </p>
                </div>
              ) : (
                sortedPlayers.map((player, index) => {
                  const isThisPlayerHost =
                    !isSingleDevice &&
                    isHostPlayer &&
                    (player.seatIndex === 0 || player.id === hostPlayerId);
                  const isEditing = isSingleDevice && editingPlayerId === player.id;
                  const isConfirmingDelete = confirmDeleteId === player.id;

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
                        {isEditing ? (
                          <input
                            type="text"
                            className="player-inline-edit-input"
                            value={editingName}
                            maxLength={20}
                            autoFocus
                            aria-label={`Sửa tên ${player.name}`}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveEditPlayer(player.id);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditingPlayerId(null);
                              }
                            }}
                          />
                        ) : (
                          <span className="player-name-text">{player.name}</span>
                        )}
                        {isThisPlayerHost && (
                          <span className="host-pill">HOST</span>
                        )}
                      </div>

                      {isHost && !isThisPlayerHost && (
                        <div className="player-row-actions">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="player-action-btn confirm"
                                onClick={() => handleSaveEditPlayer(player.id)}
                                title="Lưu tên"
                                aria-label={`Lưu tên ${player.name}`}
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                className="player-action-btn"
                                onClick={() => setEditingPlayerId(null)}
                                title="Hủy sửa"
                                aria-label="Hủy sửa tên"
                              >
                                ✕
                              </button>
                            </>
                          ) : isConfirmingDelete ? (
                            <div className="player-confirm-delete-group">
                              <button
                                type="button"
                                className="player-confirm-del-btn"
                                onClick={() => handleConfirmDeletePlayer(player.id)}
                                aria-label={`Xác nhận xóa ${player.name}`}
                              >
                                Xóa?
                              </button>
                              <button
                                type="button"
                                className="player-cancel-del-btn"
                                onClick={() => setConfirmDeleteId(null)}
                                aria-label={`Hủy xóa ${player.name}`}
                              >
                                Hủy
                              </button>
                            </div>
                          ) : (
                            <>
                              {isSingleDevice && (
                                <>
                                  <button
                                    type="button"
                                    className="player-action-btn"
                                    disabled={index === 0}
                                    onClick={() => handleMoveOfflinePlayer(index, -1)}
                                    title="Đổi lên ghế trên"
                                    aria-label={`Đưa ${player.name} lên ghế trên`}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    className="player-action-btn"
                                    disabled={index === sortedPlayers.length - 1}
                                    onClick={() => handleMoveOfflinePlayer(index, 1)}
                                    title="Đổi xuống ghế dưới"
                                    aria-label={`Đưa ${player.name} xuống ghế dưới`}
                                  >
                                    ↓
                                  </button>
                                  <button
                                    type="button"
                                    className="player-action-btn"
                                    onClick={() => handleStartEditPlayer(player.id, player.name)}
                                    title={`Sửa tên ${player.name}`}
                                    aria-label={`Sửa tên ${player.name}`}
                                  >
                                    ✎
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                className="player-del-btn"
                                onClick={() => {
                                  setEditingPlayerId(null);
                                  setConfirmDeleteId(player.id);
                                }}
                                title={`Bớt ${player.name}`}
                                aria-label={`Bớt ${player.name}`}
                              >
                                ×
                              </button>
                            </>
                          )}
                        </div>
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
                  <span className="action-divider" aria-hidden="true">·</span>
                  <button
                    type="button"
                    className="quick-action-text-btn"
                    onClick={() => setSettingsModalOpen(true)}
                    title={isHost ? 'Xem và tùy chỉnh luật phòng' : 'Xem cài đặt luật phòng (Chỉ xem)'}
                  >
                    {modifiedRulesCount > 0 ? `Luật phòng (${modifiedRulesCount})` : 'Luật phòng'}
                  </button>
                </div>
              </div>

              {/* Thanh đo cân bằng Dân–Sói trực quan (Balance Meter) */}
              {(() => {
                const clampedBalance = Math.max(-20, Math.min(20, metrics.balanceScore));
                const markerPct = 50 + (clampedBalance / 20) * 45;
                return (
                  <div
                    className="lobby-balance-meter"
                    aria-label={`Độ cân bằng Dân-Sói: ${metrics.balanceLabel} (${metrics.balanceScore > 0 ? `+${metrics.balanceScore}` : metrics.balanceScore})`}
                    style={{ margin: '8px 0 10px' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                      <span>🐺 Phe Sói ({metrics.wolvesCount})</span>
                      <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                        {metrics.balanceLabel} ({metrics.balanceScore > 0 ? `+${metrics.balanceScore}` : metrics.balanceScore})
                      </span>
                      <span>☀️ Phe Dân ({metrics.villagersCount})</span>
                    </div>
                    <div
                      style={{
                        position: 'relative',
                        height: '6px',
                        borderRadius: '999px',
                        background: 'linear-gradient(90deg, rgba(220,38,38,0.55) 0%, rgba(148,163,184,0.25) 50%, rgba(16,185,129,0.55) 100%)',
                        overflow: 'visible',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          top: '50%',
                          left: `${markerPct}%`,
                          transform: 'translate(-50%, -50%)',
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          background: '#f8fafc',
                          border: '2px solid #d4af37',
                          boxShadow: '0 0 6px rgba(212,175,55,0.65)',
                        }}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* Tóm tắt luật phòng cho khách (non-host) */}
              {!isHost && (
                <div
                  className="lobby-guest-rules-summary"
                  style={{
                    fontSize: '12px',
                    color: '#cbd5e1',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    marginBottom: '10px',
                  }}
                >
                  <strong>Luật phòng đang áp dụng:</strong>{' '}
                  {currentSettings.hasMayor ? 'Có Trưởng làng' : 'Không Trưởng làng'} ·{' '}
                  {currentSettings.revealOnDeath ? 'Lộ vai khi chết' : 'Ẩn vai khi chết'} ·{' '}
                  {currentSettings.tieVoteMode === 'RUNOFF' ? 'Hòa phiếu: Bỏ phiếu lại' : 'Hòa phiếu: Thoát nạn'}
                </div>
              )}

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
                          aria-expanded={isExpanded}
                          title="Bấm để xem nhanh kỹ năng"
                        >
                          {renderRoleMiniAvatar(role.id, role.faction)}
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
                  ref={advSearchInputRef}
                  type="text"
                  placeholder="Tìm kiếm vai trò nâng cao (VD: soi, pt, witch, ban)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="sheet-search-input"
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
                            aria-expanded={isExpanded}
                            title="Bấm để xem nhanh kỹ năng"
                          >
                            {renderRoleMiniAvatar(role.id, role.faction)}
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

      {/* Room Rules & Settings Modal */}
      <RoomSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        isHost={isHost}
        currentSettings={currentSettings}
        onUpdateSetting={handleUpdateSetting}
        onResetDefaults={handleResetSettingsToDefault}
        selectedRoles={selectedRoles}
      />
    </div>
  );
}
