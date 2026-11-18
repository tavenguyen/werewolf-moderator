import { useEffect, useMemo, useRef, useState } from 'react';
import { gameRoles, type GameRole, type RoleSide } from '../screens/home/rolesData';
import './rulesRolesDrawer.css';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'rules' | 'roles';
};

export default function RulesAndRolesDrawer({ isOpen, onClose, initialTab = 'rules' }: Props) {
  const [activeTab, setActiveTab] = useState<'rules' | 'roles'>(initialTab);
  const [filterSide, setFilterSide] = useState<RoleSide | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<GameRole | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSelectedRole(null);
      closeButtonRef.current?.focus();
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (selectedRole) {
          setSelectedRole(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedRole, onClose]);

  const filteredRoles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return gameRoles.filter((role) => {
      const matchSide = filterSide === 'all' || role.side === filterSide;
      const matchSearch =
        !q ||
        role.name.toLowerCase().includes(q) ||
        role.tagline.toLowerCase().includes(q) ||
        role.description.toLowerCase().includes(q) ||
        role.seerResult.toLowerCase().includes(q) ||
        role.roomRuleNote.toLowerCase().includes(q);
      return matchSide && matchSearch;
    });
  }, [filterSide, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="rules-drawer-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          if (selectedRole) {
            setSelectedRole(null);
          } else {
            onClose();
          }
        }
      }}
    >
      <aside
        className="rules-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Sổ tay luật làng và bách khoa vai trò"
      >
        <div className="rules-drawer-header">
          <div className="rules-tab-group" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'rules'}
              className={`rules-tab-btn ${activeTab === 'rules' ? 'active' : ''}`}
              onClick={() => { setActiveTab('rules'); setSelectedRole(null); }}
            >
              <span aria-hidden="true">📜</span>
              <span>Luật làng</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'roles'}
              className={`rules-tab-btn ${activeTab === 'roles' ? 'active' : ''}`}
              onClick={() => setActiveTab('roles')}
            >
              <span aria-hidden="true">🎴</span>
              <span>Danh sách vai trò</span>
            </button>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            className="rules-drawer-close"
            aria-label="Đóng bảng tra cứu"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="rules-drawer-body">
          {activeTab === 'rules' ? (
            <div className="rules-steps-wrap">
              <div className="rules-step-card">
                <span className="step-num-badge">I</span>
                <div>
                  <strong>Trời tối: Thổi nến và úp máy xuống bàn</strong>
                  <p>
                    Tất cả người chơi úp điện thoại xuống mặt bàn. Loa quản trò cất tiếng gọi từng vai trò, ai được gọi thì nhẹ nhàng mở mắt thao tác kín trên máy cá nhân rồi nhắm mắt lại. Tuyệt đối không chuyền điện thoại trong đêm.
                  </p>
                </div>
              </div>

              <div className="rules-step-card">
                <span className="step-num-badge">II</span>
                <div>
                  <strong>Trời sáng: Mở mắt và luận tội</strong>
                  <p>
                    Cả làng thức giấc thảo luận tự do. Đồng hồ khóa nút biểu quyết 60 giây đầu tiên để đảm bảo mọi người tập trung nhìn thẳng vào mắt nhau tranh luận trước khi bỏ phiếu treo cổ.
                  </p>
                </div>
              </div>

              <div className="rules-step-card">
                <span className="step-num-badge">III</span>
                <div>
                  <strong>Hạ màn: Lật bài và điểm lại ván đấu</strong>
                  <p>
                    Khi một phe đạt điều kiện toàn thắng, toàn bộ thẻ bài thực sự của người chơi sẽ được lật mở kèm nhật ký từng đêm để cùng giải mã ván đấu trước khi bắt đầu ván mới.
                  </p>
                </div>
              </div>

              <div className="rules-privacy-banner">
                <span aria-hidden="true">🔒</span>
                <span>Không cần tạo tài khoản. Mọi vai trò và phiếu vote kín được Game Engine bảo mật tuyệt đối.</span>
              </div>
            </div>
          ) : (
            <div className="roles-codex-wrap">
              {selectedRole ? (
                /* Zoom-out / Spotlight Role Detail */
                <article className="role-zoom-panel" aria-label={`Chi tiết vai trò ${selectedRole.name}`}>
                  <div className="role-zoom-topbar">
                    <button
                      type="button"
                      className="role-back-link"
                      onClick={() => setSelectedRole(null)}
                    >
                      ← Quay lại danh sách
                    </button>
                    <span className={`role-badge-side side-${selectedRole.side}`}>
                      {selectedRole.sideLabel}
                    </span>
                  </div>

                  <div className="role-zoom-header-block">
                    <div
                      className="role-zoom-emblem"
                      style={{ borderColor: selectedRole.auraColor }}
                    >
                      <span>{selectedRole.symbol}</span>
                    </div>
                    <h2>{selectedRole.name}</h2>
                    <p className="role-zoom-quote">“{selectedRole.tagline}”</p>
                  </div>

                  <div className="role-battlefield-grid">
                    {/* Thông tin 1: Phe & Kết quả soi */}
                    <div className="battlefield-card">
                      <div className="battlefield-title">
                        <span aria-hidden="true">👁️</span>
                        <strong>Phe phái &amp; Kết quả soi</strong>
                      </div>
                      <div className="battlefield-value">
                        <span>Thuộc: <b>{selectedRole.sideLabel}</b></span>
                        <span>Tiên tri soi ra: <b className="seer-highlight">{selectedRole.seerResult}</b></span>
                      </div>
                    </div>

                    {/* Thông tin 2: Tần suất thức dậy */}
                    <div className="battlefield-card">
                      <div className="battlefield-title">
                        <span aria-hidden="true">⏳</span>
                        <strong>Tần suất thức dậy</strong>
                      </div>
                      <div className="battlefield-value">
                        <span className="wake-tag">{selectedRole.wakeFrequency}</span>
                      </div>
                    </div>

                    {/* Thông tin 3: Mô tả kỹ năng */}
                    <div className="battlefield-card battlefield-span2">
                      <div className="battlefield-title">
                        <span aria-hidden="true">📜</span>
                        <strong>Mô tả kỹ năng</strong>
                      </div>
                      <p className="battlefield-desc">{selectedRole.description}</p>
                    </div>

                    {/* Thông tin 4: Lưu ý luật phòng */}
                    <div className="battlefield-card battlefield-span2 battlefield-rule-alert">
                      <div className="battlefield-title">
                        <span aria-hidden="true">⚠️</span>
                        <strong>Lưu ý luật phòng thực chiến</strong>
                      </div>
                      <p className="battlefield-desc">{selectedRole.roomRuleNote}</p>
                    </div>

                    {/* Mẹo thực chiến */}
                    <div className="battlefield-card battlefield-span2 battlefield-tip">
                      <div className="battlefield-title">
                        <span aria-hidden="true">💡</span>
                        <strong>Mẹo tâm lý thực chiến</strong>
                      </div>
                      <p className="battlefield-desc">{selectedRole.tacticTip}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="role-zoom-dismiss-btn"
                    onClick={() => setSelectedRole(null)}
                  >
                    Thu nhỏ vai trò
                  </button>
                </article>
              ) : (
                /* Roles List with Quick Filter & Search */
                <div className="roles-list-container">
                  {/* Search Bar & Quick Filters */}
                  <div className="roles-toolbar">
                    <div className="roles-search-box">
                      <span className="search-icon" aria-hidden="true">🔍</span>
                      <input
                        type="text"
                        placeholder="Tìm tên vai trò, kỹ năng, kết quả soi…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        aria-label="Tìm kiếm vai trò"
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

                    <div className="roles-filter-bar" role="group" aria-label="Lọc theo phe phái">
                      <button
                        type="button"
                        className={`filter-btn ${filterSide === 'all' ? 'active' : ''}`}
                        onClick={() => setFilterSide('all')}
                      >
                        Tất cả ({gameRoles.length})
                      </button>
                      <button
                        type="button"
                        className={`filter-btn side-village ${filterSide === 'village' ? 'active' : ''}`}
                        onClick={() => setFilterSide('village')}
                      >
                        Phe Dân
                      </button>
                      <button
                        type="button"
                        className={`filter-btn side-wolf ${filterSide === 'wolf' ? 'active' : ''}`}
                        onClick={() => setFilterSide('wolf')}
                      >
                        Phe Sói
                      </button>
                      <button
                        type="button"
                        className={`filter-btn side-third ${filterSide === 'third' ? 'active' : ''}`}
                        onClick={() => setFilterSide('third')}
                      >
                        Phe Thứ 3
                      </button>
                    </div>
                  </div>

                  {filteredRoles.length === 0 ? (
                    <div className="roles-empty-state">
                      <p>Không tìm thấy vai trò nào phù hợp với từ khóa &ldquo;{searchQuery}&rdquo;.</p>
                      <button type="button" onClick={() => { setSearchQuery(''); setFilterSide('all'); }}>
                        Đặt lại bộ lọc
                      </button>
                    </div>
                  ) : (
                    <div className="roles-card-grid">
                      {filteredRoles.map((role) => (
                        <button
                          key={role.id}
                          type="button"
                          className={`role-practical-card side-${role.side}`}
                          onClick={() => setSelectedRole(role)}
                        >
                          <div className="role-card-main-header">
                            <div className="role-card-symbol-badge">
                              <span>{role.symbol}</span>
                            </div>
                            <div className="role-card-headline">
                              <strong className="role-card-name">{role.name}</strong>
                              <div className="role-card-badges">
                                <span className={`card-side-tag side-${role.side}`}>
                                  {role.sideLabel}
                                </span>
                                <span className="card-wake-tag">{role.wakeFrequency}</span>
                              </div>
                            </div>
                            <span className="role-card-zoom-glyph" title="Xem chi tiết thực chiến">↗</span>
                          </div>

                          <div className="role-card-seer-line">
                            <small>Soi: <b>{role.seerResult}</b></small>
                          </div>

                          <p className="role-card-brief">{role.description}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
