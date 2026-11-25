import { useEffect, useMemo, useRef, useState } from 'react';
import { gameRoles, type GameRole, type RoleSide } from '../screens/home/rolesData';
import './rulesRolesDrawer.css';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'rules' | 'roles';
};

export default function RulesAndRolesDrawer({ isOpen, onClose, initialTab = 'roles' }: Props) {
  const [activeTab, setActiveTab] = useState<'rules' | 'roles'>(initialTab);
  const [filterSide, setFilterSide] = useState<RoleSide | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<GameRole | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const detailPanelRef = useRef<HTMLElement>(null);

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

  // Scroll to top of detail panel when selected role changes
  useEffect(() => {
    if (selectedRole && detailPanelRef.current) {
      detailPanelRef.current.scrollTop = 0;
    }
  }, [selectedRole]);

  const filteredRoles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return gameRoles.filter((role) => {
      const matchSide = filterSide === 'all' || role.side === filterSide;
      const matchSearch =
        !q ||
        role.name.toLowerCase().includes(q) ||
        role.description.toLowerCase().includes(q) ||
        role.seerResult.toLowerCase().includes(q) ||
        role.roomRuleNote.toLowerCase().includes(q);
      return matchSide && matchSearch;
    });
  }, [filterSide, searchQuery]);

  // Prev / Next role navigation in detail view
  const { prevRole, nextRole, selectedRoleIndex } = useMemo(() => {
    if (!selectedRole) return { prevRole: null, nextRole: null, selectedRoleIndex: -1 };
    const idx = gameRoles.findIndex((r) => r.id === selectedRole.id);
    const prev = idx > 0 ? gameRoles[idx - 1] : gameRoles[gameRoles.length - 1];
    const next = idx < gameRoles.length - 1 ? gameRoles[idx + 1] : gameRoles[0];
    return { prevRole: prev, nextRole: next, selectedRoleIndex: idx };
  }, [selectedRole]);

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
        className="rules-drawer-panel masa-aesthetic"
        role="dialog"
        aria-modal="true"
        aria-label="Sổ tay luật làng và danh sách vai trò"
      >
        {/* Editorial Minimalist Header */}
        <header className="masa-drawer-header">
          <div className="masa-header-left">
            <span className="masa-eyebrow">HỒ SƠ QUẢN TRÒ</span>
            <div className="masa-tab-group" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'roles'}
                className={`masa-tab-btn ${activeTab === 'roles' ? 'active' : ''}`}
                onClick={() => { setActiveTab('roles'); }}
              >
                VAI TRÒ ({gameRoles.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'rules'}
                className={`masa-tab-btn ${activeTab === 'rules' ? 'active' : ''}`}
                onClick={() => { setActiveTab('rules'); setSelectedRole(null); }}
              >
                LUẬT LÀNG
              </button>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            className="masa-drawer-close"
            aria-label="Đóng bảng tra cứu"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {/* Drawer Body */}
        <div className="masa-drawer-body">
          {activeTab === 'rules' ? (
            /* Minimalist Rules View */
            <div className="masa-rules-wrap">
              <div className="masa-rules-intro">
                <h2 className="masa-editorial-title">Cách chơi một ván Ma Sói</h2>
                <p className="masa-editorial-lede">
                  Quản trò tự động dẫn truyện qua loa. Mọi người tập trung nói chuyện trực tiếp, không nhìn màn hình của nhau.
                </p>
              </div>

              <div className="masa-rules-list">
                <article className="masa-rule-step">
                  <div className="masa-step-index">HỒI I</div>
                  <div className="masa-step-content">
                    <h3>Đêm xuống</h3>
                    <p>
                      Úp điện thoại xuống bàn và nhắm mắt. Khi loa gọi tới vai trò của mình, chỉ người đó mở mắt thao tác trên máy rồi nhắm lại ngay. Không chuyền tay điện thoại.
                    </p>
                  </div>
                </article>

                <article className="masa-rule-step">
                  <div className="masa-step-index">HỒI II</div>
                  <div className="masa-step-content">
                    <h3>Trời sáng</h3>
                    <p>
                      Cả làng mở mắt thảo luận. Nút bỏ phiếu sẽ khóa trong 60 giây đầu để mọi người tranh luận trực tiếp trước khi treo cổ.
                    </p>
                  </div>
                </article>

                <article className="masa-rule-step">
                  <div className="masa-step-index">HỒI III</div>
                  <div className="masa-step-content">
                    <h3>Lật bài</h3>
                    <p>
                      Khi một phe thắng, toàn bộ vai trò thật và diễn biến từng đêm sẽ mở công khai để cả bàn cùng xem lại.
                    </p>
                  </div>
                </article>
              </div>

              <div className="masa-rules-footnote">
                <span className="masa-footnote-mark">§</span>
                <p>
                  Không cần tạo tài khoản. Vai trò và phiếu bầu của từng người được giữ kín hoàn toàn trên máy cá nhân.
                </p>
              </div>
            </div>
          ) : (
            /* Roles Catalog & Detail (Chef Masa NYC Aesthetic) */
            <div className="masa-roles-container">
              {selectedRole ? (
                /* Detail Reveal Panel ("Bấm vào như thế rồi hiện ra") */
                <article
                  ref={detailPanelRef}
                  className="masa-detail-panel"
                  aria-label={`Chi tiết vai trò ${selectedRole.name}`}
                >
                  <div className="masa-detail-topbar">
                    <button
                      type="button"
                      className="masa-back-btn"
                      onClick={() => setSelectedRole(null)}
                    >
                      <span aria-hidden="true">←</span>
                      <span>DANH MỤC VAI TRÒ</span>
                    </button>

                    <span className={`masa-side-tag side-${selectedRole.side}`}>
                      {selectedRole.sideLabel}
                    </span>
                  </div>

                  {/* Main Role Title Block with Visual Anchor Seal */}
                  <header className="masa-detail-hero">
                    <div className="masa-hero-identity">
                      <div className={`masa-role-avatar-seal side-${selectedRole.side}`} aria-hidden="true">
                        {selectedRole.image ? (
                          <img
                            src={selectedRole.image}
                            alt={selectedRole.name}
                            className="masa-avatar-seal-img"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              if (e.currentTarget.parentElement) {
                                e.currentTarget.parentElement.innerText = selectedRole.symbol;
                              }
                            }}
                          />
                        ) : (
                          <span>{selectedRole.symbol}</span>
                        )}
                      </div>
                      <div className="masa-hero-titles">
                        <span className="masa-role-index">
                          NO. {String(selectedRoleIndex + 1).padStart(2, '0')}
                        </span>
                        <h2 className="masa-role-large-name">{selectedRole.name}</h2>
                      </div>
                    </div>
                  </header>

                  {/* Card Art Showcase for Illustrated Roles */}
                  {selectedRole.image && (
                    <div className="masa-emblem-showcase" aria-hidden="true">
                      <div className={`masa-emblem-card-frame side-${selectedRole.side}`}>
                        <img
                          src={selectedRole.image}
                          alt={selectedRole.name}
                          className="masa-emblem-card-art masa-emblem-full-img"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <div className="masa-emblem-card-glow" />
                      </div>
                    </div>
                  )}

                  {/* Spec Strip - High Value Tactical Specs (No duplicate faction) */}
                  <div className="masa-spec-strip" role="list">
                    <div className="masa-spec-col" role="listitem">
                      <span className="masa-spec-label">THỨC DẬY</span>
                      <strong className="masa-spec-val">{selectedRole.wakeFrequency}</strong>
                    </div>

                    <div className="masa-spec-col" role="listitem">
                      <span className="masa-spec-label">TIÊN TRI SOI RA</span>
                      <strong className="masa-spec-val highlight">{selectedRole.seerResult}</strong>
                    </div>

                    <div className="masa-spec-col" role="listitem">
                      <span className="masa-spec-label">ĐIỀU KIỆN THẮNG</span>
                      <strong className="masa-spec-val">{selectedRole.winCondition}</strong>
                    </div>
                  </div>

                  {/* Editorial Content Sections (Differentiated & Practical) */}
                  <div className="masa-sections-wrap">
                    <section className="masa-section">
                      <h3 className="masa-section-title">
                        <span className="masa-section-num">01</span>
                        <span>NĂNG LỰC CỐT LÕI</span>
                      </h3>
                      <p className="masa-section-body">{selectedRole.description}</p>
                    </section>

                    <section className="masa-section">
                      <h3 className="masa-section-title">
                        <span className="masa-section-num">02</span>
                        <span>LƯU Ý LUẬT TẠI BÀN</span>
                      </h3>
                      <p className="masa-section-body rule-note">{selectedRole.roomRuleNote}</p>
                    </section>

                    {selectedRole.edgeCases && selectedRole.edgeCases.length > 0 && (
                      <section className="masa-section">
                        <h3 className="masa-section-title">
                          <span className="masa-section-num">03</span>
                          <span>TÌNH HUỐNG TRANH CHẤP &amp; ENGINE RULE</span>
                        </h3>
                        <ul className="masa-edge-case-list">
                          {selectedRole.edgeCases.map((ec, idx) => (
                            <li key={idx} className="masa-edge-case-item">
                              {ec}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </div>

                  {/* Role Pager Footer (Safe Prev/Next - No accidental close) */}
                  <footer className="masa-detail-footer">
                    {prevRole ? (
                      <button
                        type="button"
                        className="masa-pager-btn prev"
                        onClick={() => setSelectedRole(prevRole)}
                        title={`Xem vai trò trước: ${prevRole.name}`}
                      >
                        <span className="pager-arrow">←</span>
                        <div className="pager-text">
                          <small>TRƯỚC</small>
                          <span>{prevRole.name}</span>
                        </div>
                      </button>
                    ) : (
                      <div className="masa-pager-spacer" aria-hidden="true" />
                    )}

                    {nextRole ? (
                      <button
                        type="button"
                        className="masa-pager-btn next"
                        onClick={() => setSelectedRole(nextRole)}
                        title={`Xem vai trò tiếp theo: ${nextRole.name}`}
                      >
                        <div className="pager-text align-right">
                          <small>TIẾP THEO</small>
                          <span>{nextRole.name}</span>
                        </div>
                        <span className="pager-arrow">→</span>
                      </button>
                    ) : (
                      <div className="masa-pager-spacer" aria-hidden="true" />
                    )}
                  </footer>
                </article>
              ) : (
                /* Roles Catalog List (Chef Masa NYC Grid/List) */
                <div className="masa-list-panel">
                  {/* Minimalist Filter & Search Bar */}
                  <div className="masa-toolbar">
                    <div className="masa-filter-tabs" role="group" aria-label="Lọc vai trò theo phe">
                      <button
                        type="button"
                        className={`masa-filter-link ${filterSide === 'all' ? 'active' : ''}`}
                        onClick={() => setFilterSide('all')}
                      >
                        TẤT CẢ ({gameRoles.length})
                      </button>
                      <button
                        type="button"
                        className={`masa-filter-link ${filterSide === 'village' ? 'active' : ''}`}
                        onClick={() => setFilterSide('village')}
                      >
                        DÂN LÀNG
                      </button>
                      <button
                        type="button"
                        className={`masa-filter-link ${filterSide === 'wolf' ? 'active' : ''}`}
                        onClick={() => setFilterSide('wolf')}
                      >
                        MA SÓI
                      </button>
                      <button
                        type="button"
                        className={`masa-filter-link ${filterSide === 'third' ? 'active' : ''}`}
                        onClick={() => setFilterSide('third')}
                      >
                        PHE THỨ 3
                      </button>
                    </div>

                    <div className="masa-search-wrapper">
                      <input
                        type="text"
                        placeholder="Tìm tên vai trò, kỹ năng, luật..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="masa-search-input"
                        aria-label="Tìm kiếm vai trò"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          className="masa-search-clear"
                          onClick={() => setSearchQuery('')}
                          aria-label="Xóa nội dung tìm kiếm"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Role Items Catalog */}
                  {filteredRoles.length === 0 ? (
                    <div className="masa-empty-state">
                      <p>Không có vai trò nào khớp với từ khóa &ldquo;{searchQuery}&rdquo;.</p>
                      <button
                        type="button"
                        className="masa-reset-btn"
                        onClick={() => { setSearchQuery(''); setFilterSide('all'); }}
                      >
                        Đặt lại tìm kiếm
                      </button>
                    </div>
                  ) : (
                    <div className="masa-catalog-list" role="list">
                      {filteredRoles.map((role) => {
                        const globalIndex = gameRoles.findIndex((r) => r.id === role.id);
                        const roleNum = String(globalIndex + 1).padStart(2, '0');

                        return (
                          <button
                            key={role.id}
                            type="button"
                            className={`masa-catalog-item side-${role.side}`}
                            onClick={() => setSelectedRole(role)}
                            role="listitem"
                          >
                            <div className="masa-item-left">
                              <span className="masa-item-num">{roleNum}</span>
                              <span className={`masa-item-seal side-${role.side}`} aria-hidden="true">
                                {role.image ? (
                                  <img
                                    src={role.image}
                                    alt=""
                                    className="masa-item-seal-img"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      if (e.currentTarget.parentElement) {
                                        e.currentTarget.parentElement.innerText = role.symbol;
                                      }
                                    }}
                                  />
                                ) : (
                                  role.symbol
                                )}
                              </span>
                              <div className="masa-item-name-block">
                                <h3 className="masa-item-name">{role.name}</h3>
                              </div>
                            </div>

                            <div className="masa-item-right">
                              <div className="masa-item-badges">
                                <span className={`masa-item-side-pill side-${role.side}`}>
                                  {role.sideLabel}
                                </span>
                                <span className="masa-item-wake-pill">
                                  {role.wakeFrequency}
                                </span>
                                <span className={`masa-item-balance-pill ${role.balanceWeight > 0 ? 'pos' : role.balanceWeight < 0 ? 'neg' : 'neu'}`}>
                                  {role.balanceWeight > 0 ? `+${role.balanceWeight}` : role.balanceWeight}
                                </span>
                              </div>
                              <span className="masa-item-reveal-arrow" aria-hidden="true">→</span>
                            </div>
                          </button>
                        );
                      })}
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
