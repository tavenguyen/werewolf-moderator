import { useEffect, useState } from 'react';
import { ROLES_BY_ID } from '../../../engine/roles';
import {
  ROLE_PRESETS,
  type PresetTheme,
  type RolePreset,
} from '../../../engine/presets';
import './presetSelectorModal.css';

export interface PresetSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (roles: string[]) => void;
  playerCount: number;
  isSingleDevice: boolean;
}

function getThemeNameVi(theme: PresetTheme): string {
  switch (theme) {
    case 'CLASSIC':
      return 'Cổ điển';
    case 'DEDUCTION':
      return 'Trinh thám';
    case 'CHAOS':
      return 'Hỗn loạn';
    case 'WOLVES':
      return 'Bầy sói';
  }
}

function formatRoleListString(roles: string[]): string {
  const counts: Record<string, number> = {};
  const order: string[] = [];
  for (const rId of roles) {
    if (!counts[rId]) {
      order.push(rId);
      counts[rId] = 0;
    }
    counts[rId] += 1;
  }
  return order
    .map((rId) => {
      const def = ROLES_BY_ID[rId];
      const name = def?.nameVi || rId;
      const count = counts[rId];
      return count > 1 ? `${count} ${name}` : name;
    })
    .join(' · ');
}

export default function PresetSelectorModal({
  isOpen,
  onClose,
  onSelectPreset,
  playerCount,
  isSingleDevice,
}: PresetSelectorModalProps) {
  const normalizedCount = Math.max(6, Math.min(16, playerCount));
  const [selectedCount, setSelectedCount] = useState<number>(normalizedCount);

  // Tự động đồng bộ số người theo Lobby khi modal được mở
  useEffect(() => {
    if (isOpen) {
      setSelectedCount(Math.max(6, Math.min(16, playerCount)));
    }
  }, [isOpen, playerCount]);

  // Khóa scroll body và hỗ trợ phím Escape
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

  // Lọc 4 bộ bài mẫu theo số người chơi
  const presetsForCount: RolePreset[] = ROLE_PRESETS.filter(
    (preset) => preset.playerCount === selectedCount
  );

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
        {/* Header 1 dòng phẳng: Tên modal bên trái, Bộ tăng giảm người & Nút × bên phải */}
        <div className="preset-modal-header">
          <h2 id="preset-modal-title" className="preset-modal-title">
            Mẫu bộ bài
          </h2>

          <div className="preset-header-controls">
            <div className="preset-counter-box" aria-label="Chọn số người chơi">
              <button
                type="button"
                className="preset-counter-btn"
                disabled={selectedCount <= 6}
                onClick={() => setSelectedCount((c) => Math.max(6, c - 1))}
                aria-label="Giảm số người"
                title="Giảm 1 người"
              >
                −
              </button>
              <span className="preset-counter-value">{selectedCount} người</span>
              <button
                type="button"
                className="preset-counter-btn"
                disabled={selectedCount >= 16}
                onClick={() => setSelectedCount((c) => Math.min(16, c + 1))}
                aria-label="Tăng số người"
                title="Tăng 1 người"
              >
                +
              </button>
            </div>

            <button
              type="button"
              className="preset-modal-close-btn"
              onClick={onClose}
              aria-label="Đóng"
              title="Đóng"
            >
              ×
            </button>
          </div>
        </div>

        {/* Danh sách 4 mẫu bài (2 dòng mỗi card, chạm thẳng để chọn) */}
        <div className="preset-cards-list">
          {presetsForCount.map((preset) => {
            const isMultiOnly = Boolean(preset.isMultiDeviceOnly);
            const isBlocked = isSingleDevice && isMultiOnly;
            const balanceScore = preset.balanceScore;
            const balanceText =
              balanceScore === 0
                ? 'Cân bằng (0)'
                : `Cân bằng (${balanceScore > 0 ? `+${balanceScore}` : balanceScore})`;

            const balanceStatusClass =
              balanceScore === 0
                ? 'balanced'
                : balanceScore > 0
                  ? 'lean-village'
                  : 'lean-wolf';

            return (
              <div
                key={preset.id}
                className={`preset-card ${isBlocked ? 'disabled' : ''}`}
                onClick={() => {
                  if (isBlocked) return;
                  onSelectPreset(preset.roles);
                  onClose();
                }}
                role="button"
                tabIndex={isBlocked ? -1 : 0}
                onKeyDown={(e) => {
                  if (!isBlocked && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSelectPreset(preset.roles);
                    onClose();
                  }
                }}
              >
                {/* Dòng 1: Tên phong cách · Cân bằng (điểm) — Nút Chọn */}
                <div className="preset-card-row1">
                  <div className="preset-card-info">
                    <strong className="preset-theme-name">
                      {getThemeNameVi(preset.theme)}
                    </strong>
                    <span className="preset-sep">·</span>
                    <span className={`preset-balance-text ${balanceStatusClass}`}>
                      {balanceText}
                    </span>
                    {isMultiOnly && (
                      <>
                        <span className="preset-sep">·</span>
                        <span
                          className={`preset-device-badge ${isBlocked ? 'blocked' : ''}`}
                          title={
                            isSingleDevice
                              ? 'Bộ bài chứa vai ẩn bí mật, không hỗ trợ 1 máy'
                              : 'Yêu cầu màn hình riêng'
                          }
                        >
                          {isSingleDevice ? 'Chỉ nhiều máy' : 'Nhiều máy'}
                        </span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    className="preset-select-btn"
                    disabled={isBlocked}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isBlocked) return;
                      onSelectPreset(preset.roles);
                      onClose();
                    }}
                    title={
                      isBlocked
                        ? 'Chế độ 1 máy không hỗ trợ vai đặc biệt trong bộ bài này'
                        : `Áp dụng mẫu ${getThemeNameVi(preset.theme)}`
                    }
                  >
                    {isBlocked ? 'Không khả dụng' : 'Chọn'}
                  </button>
                </div>

                {/* Dòng 2: Danh sách vai trò phẳng 1 dòng */}
                <div className="preset-card-row2">
                  {formatRoleListString(preset.roles)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
