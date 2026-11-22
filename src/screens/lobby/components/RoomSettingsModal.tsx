import { useEffect } from 'react';
import type { RoomSettings } from '../../../engine/types';
import './roomSettingsModal.css';

export interface RoomSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
  currentSettings: RoomSettings;
  onUpdateSetting: <K extends keyof RoomSettings>(key: K, value: RoomSettings[K]) => void;
  onResetDefaults: () => void;
  selectedRoles: Record<string, number>;
}

export const DEFAULT_CONFIGURABLE_SETTINGS: Partial<RoomSettings> = {
  firstNightNoKill: false,
  allowWolfSkip: false,
  allowWolfFriendlyFire: false,
  allowBodyguardSelfProtect: true,
  allowWitchSelfHeal: true,
  allowWitchBothPotionsSameNight: true,
  witchKnowsVictim: true,
  witchHealMode: 'AOE',
  witchWasteHealOnEmpty: false,
  witchDoubleProtectKills: false,
  seerRevealMode: 'FACTION',
  allowCupidSelfMatch: true,
  hunterShootsOnPoison: true,
  allowHunterSkipShot: true,
  hasMayor: false,
  dayDiscussionSeconds: 180,
  dayVoteLockSeconds: 60,
  revealVoterIdentities: false,
  lynchThreshold: 'PLURALITY',
  tieVoteMode: 'ESCAPE',
  revealOnDeath: false,
  ghostMode: false,
};

export function getModifiedRulesCount(
  settings: RoomSettings,
  selectedRoles: Record<string, number> = {}
): number {
  const hasBodyguard = (selectedRoles['bodyguard'] ?? 0) > 0;
  const hasWitch = (selectedRoles['witch'] ?? 0) > 0;
  const hasSeer = (selectedRoles['seer'] ?? 0) > 0;
  const hasCupid = (selectedRoles['cupid'] ?? 0) > 0;
  const hasHunter = (selectedRoles['hunter'] ?? 0) > 0;

  let count = 0;
  // Phe Ma Sói
  if (settings.firstNightNoKill) count++;
  if (settings.allowWolfSkip) count++;
  if (settings.allowWolfFriendlyFire) count++;

  // Bảo vệ
  if (hasBodyguard && settings.allowBodyguardSelfProtect === false) count++;

  // Phù thủy
  if (hasWitch) {
    if (settings.allowWitchSelfHeal === false) count++;
    if (settings.allowWitchBothPotionsSameNight === false) count++;
    if (settings.witchKnowsVictim === false) {
      count++;
      if (settings.witchWasteHealOnEmpty === true) count++;
    } else {
      if (settings.witchHealMode === 'SINGLE') count++;
    }
    if (hasBodyguard && settings.witchDoubleProtectKills === true) count++;
  }

  // Tiên tri
  if (hasSeer && settings.seerRevealMode === 'EXACT_ROLE') count++;

  // Cupid
  if (hasCupid && settings.allowCupidSelfMatch === false) count++;

  // Thợ săn
  if (hasHunter) {
    if (settings.hunterShootsOnPoison === false) count++;
    if (settings.allowHunterSkipShot === false) count++;
  }

  // Ban ngày
  if (settings.hasMayor === true) count++;
  if (settings.dayDiscussionSeconds && settings.dayDiscussionSeconds !== 180) count++;
  if (settings.dayVoteLockSeconds !== undefined && settings.dayVoteLockSeconds !== 60) count++;
  if (settings.revealVoterIdentities === true) count++;
  if (settings.lynchThreshold === 'MAJORITY') count++;
  if (settings.tieVoteMode === 'RUNOFF') count++;

  // Minh bạch
  if (settings.revealOnDeath === true) count++;

  return count;
}

export default function RoomSettingsModal({
  isOpen,
  onClose,
  isHost,
  currentSettings,
  onUpdateSetting,
  onApplySettingsPatch,
  onResetDefaults,
  selectedRoles,
}: RoomSettingsModalProps) {
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

  const hasBodyguard = (selectedRoles['bodyguard'] ?? 0) > 0;
  const hasWitch = (selectedRoles['witch'] ?? 0) > 0;
  const hasSeer = (selectedRoles['seer'] ?? 0) > 0;
  const hasCupid = (selectedRoles['cupid'] ?? 0) > 0;
  const hasHunter = (selectedRoles['hunter'] ?? 0) > 0;

  const modifiedCount = getModifiedRulesCount(currentSettings, selectedRoles);

  const handleToggle = (key: keyof RoomSettings, defaultValue = false) => {
    if (!isHost) return;

    if (key === 'witchKnowsVictim') {
      const nextVal = !currentSettings.witchKnowsVictim;
      onUpdateSetting('witchKnowsVictim', nextVal);
      // Khi tắt biết nạn nhân (cứu mù), tự động khóa về AoE để không bị kẹt khi có 2 nạn nhân
      if (!nextVal && currentSettings.witchHealMode !== 'AOE') {
        onUpdateSetting('witchHealMode', 'AOE');
      }
      return;
    }

    const currentVal = currentSettings[key] !== undefined ? Boolean(currentSettings[key]) : defaultValue;
    onUpdateSetting(key, !currentVal as RoomSettings[typeof key]);
  };

  const handleSegmentChange = <K extends keyof RoomSettings>(
    key: K,
    val: RoomSettings[K]
  ) => {
    if (!isHost) return;
    onUpdateSetting(key, val);
  };

  return (
    <div
      className="room-settings-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="room-settings-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="room-settings-header">
          <div className="room-settings-title-wrap">
            <h2 id="room-settings-title" className="room-settings-title">
              Tùy chỉnh luật phòng
            </h2>
            <span className={`room-settings-badge ${modifiedCount > 0 ? 'modified' : ''}`}>
              {modifiedCount > 0 ? `Đã đổi ${modifiedCount}` : 'Mặc định'}
            </span>
            {!isHost && (
              <span className="room-settings-readonly-tag">Chỉ xem</span>
            )}
          </div>

          <button
            type="button"
            className="room-settings-close-btn"
            onClick={onClose}
            aria-label="Đóng"
            title="Đóng"
          >
            ×
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="room-settings-body">
          {/* Nhóm 1: Phe Ma Sói (Luôn hiển thị) */}
          <section className="settings-modal-group" aria-labelledby="group-wolves-title">
            <div className="settings-group-header-row">
              <span id="group-wolves-title" className="settings-group-label">Phe Ma Sói</span>
            </div>
            <div className="settings-group-list">
              <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                <div className="settings-item-info">
                  <span className="settings-item-name">Đêm 1 không được cắn</span>
                  <span className="settings-item-desc">
                    Đêm 1 Ma sói chỉ nhận mặt nhau, không ai bị cắn chết.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(currentSettings.firstNightNoKill)}
                  disabled={!isHost}
                  className={`settings-switch-control ${
                    currentSettings.firstNightNoKill ? 'active' : ''
                  }`}
                  onClick={() => handleToggle('firstNightNoKill', false)}
                  aria-label="Đêm 1 không được cắn"
                >
                  <span className="settings-switch-thumb" />
                </button>
              </div>

              <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                <div className="settings-item-info">
                  <span className="settings-item-name">Sói được bỏ cắn</span>
                  <span className="settings-item-desc">
                    Cho phép đàn Sói không cắn ai để tạo đêm bình yên giả.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(currentSettings.allowWolfSkip)}
                  disabled={!isHost}
                  className={`settings-switch-control ${
                    currentSettings.allowWolfSkip ? 'active' : ''
                  }`}
                  onClick={() => handleToggle('allowWolfSkip', false)}
                  aria-label="Sói được bỏ cắn"
                >
                  <span className="settings-switch-thumb" />
                </button>
              </div>

              <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                <div className="settings-item-info">
                  <span className="settings-item-name">Sói cắn đồng đội</span>
                  <span className="settings-item-desc">
                    Cho phép Sói tự cắn nhau để đánh lạc hướng Tiên tri và Dân.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(currentSettings.allowWolfFriendlyFire)}
                  disabled={!isHost}
                  className={`settings-switch-control ${
                    currentSettings.allowWolfFriendlyFire ? 'active' : ''
                  }`}
                  onClick={() => handleToggle('allowWolfFriendlyFire', false)}
                  aria-label="Sói cắn đồng đội"
                >
                  <span className="settings-switch-thumb" />
                </button>
              </div>
            </div>
          </section>

          {/* Nhóm 2: Kỹ năng Bảo Vệ (Chỉ hiển thị khi có Bảo vệ) */}
          {hasBodyguard && (
            <section className="settings-modal-group" aria-labelledby="group-bodyguard-title">
              <div className="settings-group-header-row">
                <span id="group-bodyguard-title" className="settings-group-label">Kỹ năng Bảo Vệ</span>
              </div>
              <div className="settings-group-list">
                <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                  <div className="settings-item-info">
                    <span className="settings-item-name">Bảo vệ tự bảo vệ bản thân</span>
                    <span className="settings-item-desc">
                      Cho phép Bảo vệ tự chọn chính mình để che chở.
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={currentSettings.allowBodyguardSelfProtect !== false}
                    disabled={!isHost}
                    className={`settings-switch-control ${
                      currentSettings.allowBodyguardSelfProtect !== false ? 'active' : ''
                    }`}
                    onClick={() => handleToggle('allowBodyguardSelfProtect', true)}
                    aria-label="Bảo vệ tự bảo vệ bản thân"
                  >
                    <span className="settings-switch-thumb" />
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Nhóm 3: Kỹ năng Phù Thủy (Chỉ hiển thị khi có Phù thủy) */}
          {hasWitch && (
            <section className="settings-modal-group" aria-labelledby="group-witch-title">
              <div className="settings-group-header-row">
                <span id="group-witch-title" className="settings-group-label">Kỹ năng Phù Thủy</span>
              </div>

              <div className="settings-group-list">
                <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                  <div className="settings-item-info">
                    <span className="settings-item-name">Phù thủy tự cứu</span>
                    <span className="settings-item-desc">
                      Cho phép Phù thủy dùng bình cứu giải thoát cho chính mình.
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={currentSettings.allowWitchSelfHeal !== false}
                    disabled={!isHost}
                    className={`settings-switch-control ${
                      currentSettings.allowWitchSelfHeal !== false ? 'active' : ''
                    }`}
                    onClick={() => handleToggle('allowWitchSelfHeal', true)}
                    aria-label="Phù thủy tự cứu"
                  >
                    <span className="settings-switch-thumb" />
                  </button>
                </div>

                <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                  <div className="settings-item-info">
                    <span className="settings-item-name">Dùng 2 bình trong cùng 1 đêm</span>
                    <span className="settings-item-desc">
                      Cho phép Phù thủy vừa dùng bình cứu vừa ném bình độc trong 1 đêm.
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={currentSettings.allowWitchBothPotionsSameNight !== false}
                    disabled={!isHost}
                    className={`settings-switch-control ${
                      currentSettings.allowWitchBothPotionsSameNight !== false ? 'active' : ''
                    }`}
                    onClick={() => handleToggle('allowWitchBothPotionsSameNight', true)}
                    aria-label="Dùng 2 bình trong cùng 1 đêm"
                  >
                    <span className="settings-switch-thumb" />
                  </button>
                </div>

                <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                  <div className="settings-item-info">
                    <span className="settings-item-name">Phù thủy biết nạn nhân</span>
                    <span className="settings-item-desc">
                      Bật: Hiện tên người bị cắn. Tắt: Cứu mù theo phán đoán.
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(currentSettings.witchKnowsVictim)}
                    disabled={!isHost}
                    className={`settings-switch-control ${
                      currentSettings.witchKnowsVictim ? 'active' : ''
                    }`}
                    onClick={() => handleToggle('witchKnowsVictim', true)}
                    aria-label="Phù thủy biết nạn nhân"
                  >
                    <span className="settings-switch-thumb" />
                  </button>
                </div>

                <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                  <div className="settings-item-info">
                    <div className="settings-item-title-row">
                      <span className="settings-item-name">Cơ chế bình cứu</span>
                      {!currentSettings.witchKnowsVictim && (
                        <span className="settings-item-hint">Cố định AoE khi cứu mù</span>
                      )}
                    </div>
                    <span className="settings-item-desc">
                      {currentSettings.witchKnowsVictim
                        ? 'AoE: Cứu mọi nạn nhân bị cắn. 1 người: Chọn cứu 1 nạn nhân.'
                        : 'Khi cứu mù, bình cứu tự động bảo vệ tất cả nạn nhân trong đêm.'}
                    </span>
                  </div>
                  <div className="settings-segmented-control" role="group" aria-label="Cơ chế bình cứu">
                    <button
                      type="button"
                      disabled={!isHost || !currentSettings.witchKnowsVictim}
                      className={`settings-segmented-button ${
                        currentSettings.witchHealMode === 'AOE' || !currentSettings.witchKnowsVictim
                          ? 'active'
                          : ''
                      }`}
                      onClick={() => handleSegmentChange('witchHealMode', 'AOE')}
                    >
                      AoE (Tất cả)
                    </button>
                    <button
                      type="button"
                      disabled={!isHost || !currentSettings.witchKnowsVictim}
                      className={`settings-segmented-button ${
                        currentSettings.witchHealMode === 'SINGLE' && currentSettings.witchKnowsVictim
                          ? 'active'
                          : ''
                      }`}
                      onClick={() => handleSegmentChange('witchHealMode', 'SINGLE')}
                    >
                      1 người
                    </button>
                  </div>
                </div>

                {!currentSettings.witchKnowsVictim && (
                  <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                    <div className="settings-item-info">
                      <span className="settings-item-name">Mất bình khi cứu trượt</span>
                      <span className="settings-item-desc">
                        Khi cứu mù trúng đêm bình yên: Bật để mất bình, Tắt để hoàn lại.
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(currentSettings.witchWasteHealOnEmpty)}
                      disabled={!isHost}
                      className={`settings-switch-control ${
                        currentSettings.witchWasteHealOnEmpty ? 'active' : ''
                      }`}
                      onClick={() => handleToggle('witchWasteHealOnEmpty', false)}
                      aria-label="Mất bình khi cứu trượt"
                    >
                      <span className="settings-switch-thumb" />
                    </button>
                  </div>
                )}

                {hasBodyguard && (
                  <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                    <div className="settings-item-info">
                      <span className="settings-item-name">Bảo vệ &amp; Phù thủy trùng mục tiêu</span>
                      <span className="settings-item-desc">
                        Biến thể thuốc quá liều: Nếu cả Bảo vệ và Phù thủy cùng cứu 1 người bị cắn, nạn nhân vẫn chết do quá liều.
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(currentSettings.witchDoubleProtectKills)}
                      disabled={!isHost}
                      className={`settings-switch-control ${
                        currentSettings.witchDoubleProtectKills ? 'active' : ''
                      }`}
                      onClick={() => handleToggle('witchDoubleProtectKills', false)}
                      aria-label="Thuốc quá liều"
                    >
                      <span className="settings-switch-thumb" />
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Nhóm 4: Kỹ năng Tiên Tri (Chỉ hiển thị khi có Tiên tri) */}
          {hasSeer && (
            <section className="settings-modal-group" aria-labelledby="group-seer-title">
              <div className="settings-group-header-row">
                <span id="group-seer-title" className="settings-group-label">Kỹ năng Tiên Tri</span>
              </div>
              <div className="settings-group-list">
                <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                  <div className="settings-item-info">
                    <span className="settings-item-name">Chế độ soi của Tiên tri</span>
                    <span className="settings-item-desc">
                      Phe: Chỉ báo Dân hoặc Sói. Vai cụ thể: Báo chính xác tên vai trò của mục tiêu.
                    </span>
                  </div>
                  <div className="settings-segmented-control" role="group" aria-label="Chế độ soi của Tiên tri">
                    <button
                      type="button"
                      disabled={!isHost}
                      className={`settings-segmented-button ${
                        (currentSettings.seerRevealMode || 'FACTION') === 'FACTION' ? 'active' : ''
                      }`}
                      onClick={() => handleSegmentChange('seerRevealMode', 'FACTION')}
                    >
                      Phe (Dân/Sói)
                    </button>
                    <button
                      type="button"
                      disabled={!isHost}
                      className={`settings-segmented-button ${
                        currentSettings.seerRevealMode === 'EXACT_ROLE' ? 'active' : ''
                      }`}
                      onClick={() => handleSegmentChange('seerRevealMode', 'EXACT_ROLE')}
                    >
                      Vai cụ thể
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Nhóm 5: Thần Tình Yêu - Cupid (Chỉ hiển thị khi có Cupid) */}
          {hasCupid && (
            <section className="settings-modal-group" aria-labelledby="group-cupid-title">
              <div className="settings-group-header-row">
                <span id="group-cupid-title" className="settings-group-label">Thần Tình Yêu (Cupid)</span>
              </div>
              <div className="settings-group-list">
                <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                  <div className="settings-item-info">
                    <span className="settings-item-name">Cupid tự ghép mình</span>
                    <span className="settings-item-desc">
                      Cho phép Cupid chọn chính mình làm một nửa của cặp đôi định mệnh.
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={currentSettings.allowCupidSelfMatch !== false}
                    disabled={!isHost}
                    className={`settings-switch-control ${
                      currentSettings.allowCupidSelfMatch !== false ? 'active' : ''
                    }`}
                    onClick={() => handleToggle('allowCupidSelfMatch', true)}
                    aria-label="Cupid tự ghép mình"
                  >
                    <span className="settings-switch-thumb" />
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Nhóm 6: Kỹ năng Thợ Săn (Chỉ hiển thị khi có Thợ săn) */}
          {hasHunter && (
            <section className="settings-modal-group" aria-labelledby="group-hunter-title">
              <div className="settings-group-header-row">
                <span id="group-hunter-title" className="settings-group-label">Kỹ năng Thợ Săn</span>
              </div>
              <div className="settings-group-list">
                <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                  <div className="settings-item-info">
                    <span className="settings-item-name">Bị trúng độc vẫn được bắn</span>
                    <span className="settings-item-desc">
                      Bật: Vẫn nổ súng kéo theo. Tắt: Chết vì độc trong giấc ngủ sẽ không được bắn.
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={currentSettings.hunterShootsOnPoison !== false}
                    disabled={!isHost}
                    className={`settings-switch-control ${
                      currentSettings.hunterShootsOnPoison !== false ? 'active' : ''
                    }`}
                    onClick={() => handleToggle('hunterShootsOnPoison', true)}
                    aria-label="Bị trúng độc vẫn được bắn"
                  >
                    <span className="settings-switch-thumb" />
                  </button>
                </div>

                <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                  <div className="settings-item-info">
                    <span className="settings-item-name">Thợ săn có quyền không bắn</span>
                    <span className="settings-item-desc">
                      Cho phép Thợ săn bỏ qua phát súng nếu sợ bắn nhầm phe Dân ở cuối ván.
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={currentSettings.allowHunterSkipShot !== false}
                    disabled={!isHost}
                    className={`settings-switch-control ${
                      currentSettings.allowHunterSkipShot !== false ? 'active' : ''
                    }`}
                    onClick={() => handleToggle('allowHunterSkipShot', true)}
                    aria-label="Thợ săn có quyền không bắn"
                  >
                    <span className="settings-switch-thumb" />
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Nhóm 7: Ban Ngày & Biểu Quyết (Luôn hiển thị) */}
          <section className="settings-modal-group" aria-labelledby="group-day-title">
            <div className="settings-group-header-row">
              <span id="group-day-title" className="settings-group-label">Ban Ngày &amp; Biểu Quyết</span>
            </div>
            <div className="settings-group-list">
              <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                <div className="settings-item-info">
                  <span className="settings-item-name">Bầu Trưởng làng ngày 1</span>
                  <span className="settings-item-desc">
                    Mở vòng tranh cử Trưởng làng (sở hữu 2 phiếu) vào sáng Ngày 1.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(currentSettings.hasMayor)}
                  disabled={!isHost}
                  className={`settings-switch-control ${
                    currentSettings.hasMayor ? 'active' : ''
                  }`}
                  onClick={() => handleToggle('hasMayor', false)}
                  aria-label="Bầu Trưởng làng ngày 1"
                >
                  <span className="settings-switch-thumb" />
                </button>
              </div>

              <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                <div className="settings-item-info">
                  <span className="settings-item-name">Thời lượng thảo luận ban ngày</span>
                  <span className="settings-item-desc">
                    Thời gian tranh luận của làng trước khi chốt biểu quyết.
                  </span>
                </div>
                <div className="settings-segmented-control" role="group" aria-label="Thời lượng thảo luận ban ngày">
                  {[120, 180, 240, 300].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      disabled={!isHost}
                      className={`settings-segmented-button ${
                        (currentSettings.dayDiscussionSeconds ?? 180) === sec ? 'active' : ''
                      }`}
                      onClick={() => handleSegmentChange('dayDiscussionSeconds', sec)}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>

              <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                <div className="settings-item-info">
                  <span className="settings-item-name">Khóa vote đầu ngày</span>
                  <span className="settings-item-desc">
                    0s: Mở hòm phiếu ngay. 30s/60s: Buộc thảo luận trước khi cho phép bấm vote.
                  </span>
                </div>
                <div className="settings-segmented-control" role="group" aria-label="Khóa vote đầu ngày">
                  {[0, 30, 60].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      disabled={!isHost}
                      className={`settings-segmented-button ${
                        (currentSettings.dayVoteLockSeconds ?? 60) === sec ? 'active' : ''
                      }`}
                      onClick={() => handleSegmentChange('dayVoteLockSeconds', sec)}
                    >
                      {sec === 0 ? '0s (Mở ngay)' : `${sec}s`}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                <div className="settings-item-info">
                  <span className="settings-item-name">Hiện ai vote ai sau khi chốt</span>
                  <span className="settings-item-desc">
                    Sau khi chốt phiếu, hiện danh sách người bỏ phiếu cho từng mục tiêu để phân tích phe Sói.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(currentSettings.revealVoterIdentities)}
                  disabled={!isHost}
                  className={`settings-switch-control ${
                    currentSettings.revealVoterIdentities ? 'active' : ''
                  }`}
                  onClick={() => handleToggle('revealVoterIdentities', false)}
                  aria-label="Hiện ai vote ai sau khi chốt"
                >
                  <span className="settings-switch-thumb" />
                </button>
              </div>

              <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                <div className="settings-item-info">
                  <span className="settings-item-name">Tỷ lệ phiếu để treo cổ</span>
                  <span className="settings-item-desc">
                    Đa số: Nhiều phiếu nhất là bị treo. Quá bán: Phải đạt trên 50% số người sống mới bị treo.
                  </span>
                </div>
                <div className="settings-segmented-control" role="group" aria-label="Tỷ lệ phiếu để treo cổ">
                  <button
                    type="button"
                    disabled={!isHost}
                    className={`settings-segmented-button ${
                      (currentSettings.lynchThreshold || 'PLURALITY') === 'PLURALITY' ? 'active' : ''
                    }`}
                    onClick={() => handleSegmentChange('lynchThreshold', 'PLURALITY')}
                  >
                    Đa số (Nhiều nhất)
                  </button>
                  <button
                    type="button"
                    disabled={!isHost}
                    className={`settings-segmented-button ${
                      currentSettings.lynchThreshold === 'MAJORITY' ? 'active' : ''
                    }`}
                    onClick={() => handleSegmentChange('lynchThreshold', 'MAJORITY')}
                  >
                    Quá bán (&gt; 50%)
                  </button>
                </div>
              </div>

              <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                <div className="settings-item-info">
                  <span className="settings-item-name">Xử lý khi hòa phiếu</span>
                  <span className="settings-item-desc">
                    Hòa là thoát: Không ai bị treo. Vote lại: Biện hộ 30s &amp; bầu lại giữa các ứng viên hòa.
                  </span>
                </div>
                <div className="settings-segmented-control" role="group" aria-label="Xử lý khi hòa phiếu">
                  <button
                    type="button"
                    disabled={!isHost}
                    className={`settings-segmented-button ${
                      (currentSettings.tieVoteMode || 'ESCAPE') === 'ESCAPE' ? 'active' : ''
                    }`}
                    onClick={() => handleSegmentChange('tieVoteMode', 'ESCAPE')}
                  >
                    Hòa là thoát
                  </button>
                  <button
                    type="button"
                    disabled={!isHost}
                    className={`settings-segmented-button ${
                      currentSettings.tieVoteMode === 'RUNOFF' ? 'active' : ''
                    }`}
                    onClick={() => handleSegmentChange('tieVoteMode', 'RUNOFF')}
                  >
                    Vote lại
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Nhóm 8: Cơ Chế & Minh Bạch (Luôn hiển thị) */}
          <section className="settings-modal-group" aria-labelledby="group-info-title">
            <div className="settings-group-header-row">
              <span id="group-info-title" className="settings-group-label">Cơ Chế &amp; Minh Bạch</span>
            </div>
            <div className="settings-group-list">
              <div className={`settings-row-item ${!isHost ? 'disabled' : ''}`}>
                <div className="settings-item-info">
                  <span className="settings-item-name">Lật vai khi chết</span>
                  <span className="settings-item-desc">
                    Khuyên Tắt để tăng đất diễn giả danh vai trò và suy luận.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(currentSettings.revealOnDeath)}
                  disabled={!isHost}
                  className={`settings-switch-control ${
                    currentSettings.revealOnDeath ? 'active' : ''
                  }`}
                  onClick={() => handleToggle('revealOnDeath', false)}
                  aria-label="Lật vai khi chết"
                >
                  <span className="settings-switch-thumb" />
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="room-settings-footer">
          {isHost ? (
            <button
              type="button"
              className="settings-footer-reset-btn"
              disabled={modifiedCount === 0}
              onClick={onResetDefaults}
              title="Đặt lại tất cả luật phòng về giá trị mặc định"
            >
              Khôi phục mặc định
            </button>
          ) : (
            <span className="settings-group-note">Cài đặt do Quản trò điều chỉnh</span>
          )}

          <button
            type="button"
            className="settings-footer-close-btn"
            onClick={onClose}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
