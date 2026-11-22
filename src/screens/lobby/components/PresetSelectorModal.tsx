import { useEffect, useState } from 'react';
import { ROLES_BY_ID } from '../../../engine/roles';
import {
  ROLE_PRESETS,
  type PresetTheme,
  type RolePreset,
} from '../../../engine/presets';
import './presetSelectorModal.css';

export type PresetThemeFilter = 'ALL' | PresetTheme;

export interface PresetSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (roles: string[]) => void;
  playerCount: number;
  isSingleDevice: boolean;
}

const PLAYER_COUNTS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

const THEME_OPTIONS: { id: PresetThemeFilter; label: string; icon: string }[] = [
  { id: 'ALL', label: 'Tất cả', icon: '✨' },
  { id: 'CLASSIC', label: 'Cổ điển', icon: '⚖️' },
  { id: 'DEDUCTION', label: 'Trinh thám', icon: '🔍' },
  { id: 'CHAOS', label: 'Hỗn loạn', icon: '🎭' },
  { id: 'WOLVES', label: 'Bầy Sói', icon: '🐺' },
];

export default function PresetSelectorModal({
  isOpen,
  onClose,
  onSelectPreset,
  playerCount,
  isSingleDevice,
}: PresetSelectorModalProps) {
  const normalizedCount = Math.max(6, Math.min(16, playerCount));
  const [selectedCount, setSelectedCount] = useState<number>(normalizedCount);
  const [selectedTheme, setSelectedTheme] = useState<PresetThemeFilter>('ALL');

  // Đồng bộ số người khi modal mở
  useEffect(() => {
    if (isOpen) {
      setSelectedCount(Math.max(6, Math.min(16, playerCount)));
    }
  }, [isOpen, playerCount]);

  // Khóa scroll body khi modal mở
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Lọc danh sách Preset theo số người và theme
  const filteredPresets: RolePreset[] = ROLE_PRESETS.filter((preset) => {
    if (preset.playerCount !== selectedCount) return false;
    if (selectedTheme !== 'ALL' && preset.theme !== selectedTheme) return false;
    return true;
  });

  // Chuyển mảng roles thành danh sách nhóm { roleId, count }
  const groupRoles = (roles: string[]) => {
    const counts: Record<string, number> = {};
    for (const rId of roles) {
      counts[rId] = (counts[rId] ?? 0) + 1;
    }
    return Object.entries(counts).map(([roleId, count]) => {
      const def = ROLES_BY_ID[roleId];
      return {
        roleId,
        name: def?.nameVi || roleId,
        count,
        faction: def?.faction || 'VILLAGER',
      };
    });
  };

  const getThemeBadgeLabel = (theme: PresetTheme) => {
    switch (theme) {
      case 'CLASSIC':
        return '⚖️ Cổ điển';
      case 'DEDUCTION':
        return '🔍 Trinh thám';
      case 'CHAOS':
        return '🎭 Hỗn loạn';
      case 'WOLVES':
        return '🐺 Bầy Sói';
    }
  };

  const getBalanceBadge = (score: number) => {
    if (score === 0) {
      return <span className="preset-balance-badge balanced">Cân bằng (0)</span>;
    }
    if (score > 0) {
      return (
        <span className="preset-balance-badge lean-village">
          Cân bằng (+{score})
        </span>
      );
    }
    return (
      <span className="preset-balance-badge lean-wolf">
        Cân bằng ({score})
      </span>
    );
  };

  return (
    <div
      className="preset-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="preset-modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="preset-modal-header">
          <div className="preset-header-titles">
            <h2 id="preset-modal-title" className="preset-modal-title">
              <span className="title-icon">🎨</span>
              Chọn Phong Cách Chơi
            </h2>
            <p className="preset-modal-subtitle">
              44 tổ hợp vai trò đã cân bằng toán học chuẩn mực từ 6 đến 16 người
            </p>
          </div>
          <button
            type="button"
            className="preset-modal-close-btn"
            onClick={onClose}
            aria-label="Đóng bảng gợi ý bộ bài"
            title="Đóng"
          >
            ×
          </button>
        </div>

        {/* Tab bar chọn số lượng người chơi (6-16) */}
        <div className="preset-player-tabs-bar" role="tablist" aria-label="Chọn số người chơi">
          {PLAYER_COUNTS.map((count) => {
            const isActive = count === selectedCount;
            return (
              <button
                key={count}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`preset-player-tab ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedCount(count)}
              >
                {count} người
              </button>
            );
          })}
        </div>

        {/* Filter buttons theo Theme */}
        <div className="preset-theme-filters" role="group" aria-label="Lọc theo phong cách">
          {THEME_OPTIONS.map((opt) => {
            const isActive = opt.id === selectedTheme;
            return (
              <button
                key={opt.id}
                type="button"
                className={`preset-theme-filter-btn ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedTheme(opt.id)}
              >
                <span>{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Danh sách các card Preset */}
        <div className="preset-cards-scroll-body">
          {filteredPresets.length === 0 ? (
            <div className="preset-empty-msg">
              Không tìm thấy bộ bài nào phù hợp với bộ lọc hiện tại.
            </div>
          ) : (
            filteredPresets.map((preset) => {
              const isMultiOnly = preset.isMultiDeviceOnly;
              const isBlocked = isSingleDevice && isMultiOnly;
              const groupedRoles = groupRoles(preset.roles);

              return (
                <article
                  key={preset.id}
                  className={`preset-card ${isBlocked ? 'disabled' : ''}`}
                >
                  {/* Card Header: Tên, Theme, Balance, MultiDevice */}
                  <div className="preset-card-header">
                    <div className="preset-card-title-group">
                      <h3 className="preset-card-title">{preset.nameVi}</h3>
                      <span className={`preset-theme-badge theme-${preset.theme}`}>
                        {getThemeBadgeLabel(preset.theme)}
                      </span>
                      {getBalanceBadge(preset.balanceScore)}
                      {isMultiOnly && (
                        <span
                          className="preset-multi-device-badge"
                          title="Cần chế độ Nhiều máy do có vai trò ẩn bí mật"
                        >
                          📱 Chỉ Nhiều máy
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Description */}
                  {preset.descriptionVi && (
                    <p className="preset-card-desc">{preset.descriptionVi}</p>
                  )}

                  {/* Danh sách thẻ vai dạng visual pills */}
                  <div className="preset-pills-wrap" aria-label="Danh sách các vai trong bộ bài">
                    {groupedRoles.map((role) => (
                      <span
                        key={role.roleId}
                        className={`preset-role-pill faction-${role.faction}`}
                      >
                        <span>{role.name}</span>
                        {role.count > 1 && (
                          <span className="preset-role-multiplier">×{role.count}</span>
                        )}
                      </span>
                    ))}
                  </div>

                  {/* Card Footer: Cảnh báo 1 máy & Nút áp dụng */}
                  <div className="preset-card-footer">
                    {isBlocked ? (
                      <div className="preset-single-device-warning">
                        ⚠️ Chứa vai đặc biệt, chỉ hỗ trợ Nhiều máy
                      </div>
                    ) : (
                      <div />
                    )}

                    <button
                      type="button"
                      className="preset-apply-btn"
                      disabled={isBlocked}
                      onClick={() => {
                        if (isBlocked) return;
                        onSelectPreset(preset.roles);
                        onClose();
                      }}
                      title={
                        isBlocked
                          ? 'Bộ bài không hỗ trợ chế độ 1 máy'
                          : `Áp dụng bộ bài ${preset.nameVi} (${preset.playerCount} người)`
                      }
                    >
                      {isBlocked ? 'Không khả dụng' : 'Áp dụng bộ bài này'}
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
