import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameSession } from '../adapters/useGameSession';
import { gameRoles, type GameRole, type RoleSide } from '../screens/home/rolesData';
import './rulesRolesDrawer.css';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'rules' | 'roles';
};

type RoleSection = {
  side: RoleSide;
  title: string;
  roles: GameRole[];
};

const SIDE_SECTIONS: ReadonlyArray<{ side: RoleSide; title: string }> = [
  { side: 'village', title: 'PHE DÂN LÀNG' },
  { side: 'wolf', title: 'PHE MA SÓI' },
  { side: 'third', title: 'PHE THỨ BA' },
];

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getBalanceClass(weight: number): 'pos' | 'neg' | 'neu' {
  if (weight > 0) return 'pos';
  if (weight < 0) return 'neg';
  return 'neu';
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed',
  );
}

export default function RulesAndRolesDrawer({ isOpen, onClose, initialTab = 'roles' }: Props) {
  const { state } = useGameSession();
  const hasActiveRoom = Boolean(state.roomCode && state.publicView);
  const roomSettings = hasActiveRoom ? state.publicView?.settings : undefined;
  const knownRoleIds = useMemo(() => new Set(gameRoles.map((r) => r.id)), []);
  const inGameRoleIds = useMemo(() => {
    if (!hasActiveRoom) return new Set<string>();
    const deck = roomSettings?.customDeck;
    if (!deck) return new Set<string>();
    return new Set(
      Object.entries(deck)
        .filter(([roleId, count]) => knownRoleIds.has(roleId) && Number.isFinite(count) && count > 0)
        .map(([roleId]) => roleId),
    );
  }, [hasActiveRoom, knownRoleIds, roomSettings?.customDeck]);
  const hasInGameDeck = hasActiveRoom && inGameRoleIds.size > 0;

  const [activeTab, setActiveTab] = useState<'rules' | 'roles'>(initialTab);
  const [filterSide, setFilterSide] = useState<RoleSide | 'all' | 'in_game'>('all');

  useEffect(() => {
    if (filterSide === 'in_game' && !hasInGameDeck) {
      setFilterSide('all');
    }
  }, [filterSide, hasInGameDeck]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<GameRole | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const galleryShellRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const lightboxDialogRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastLightboxRoleIdRef = useRef<string | null>(null);

  const markImageFailed = useCallback((roleId: string) => {
    setFailedImages((prev) => (prev[roleId] ? prev : { ...prev, [roleId]: true }));
  }, []);

  // Lock body scroll while drawer is open and restore previous overflow & opener focus on close
  useEffect(() => {
    if (!isOpen) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [isOpen]);

  // Sync initial tab and focus drawer close button when opening
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSelectedRole(null);
      lastLightboxRoleIdRef.current = null;
      closeButtonRef.current?.focus();
    } else {
      lastLightboxRoleIdRef.current = null;
    }
  }, [isOpen, initialTab]);

  // Manage Lightbox focus on open and restore focus to the originating role card on close
  useEffect(() => {
    if (!isOpen) return;

    if (selectedRole) {
      const wasClosed = lastLightboxRoleIdRef.current === null;
      lastLightboxRoleIdRef.current = selectedRole.id;
      if (wasClosed) {
        lightboxCloseRef.current?.focus();
      }
      return;
    }

    const lastRoleId = lastLightboxRoleIdRef.current;
    if (lastRoleId) {
      lastLightboxRoleIdRef.current = null;
      cardRefs.current[lastRoleId]?.focus();
    }
  }, [isOpen, selectedRole]);

  const trimmedQuery = searchQuery.trim();
  const isSegmented = filterSide === 'all' && trimmedQuery === '';

  const filteredRoles = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    return gameRoles.filter((role) => {
      const matchSide =
        filterSide === 'all'
          ? true
          : filterSide === 'in_game'
          ? inGameRoleIds.has(role.id)
          : role.side === filterSide;
      const matchSearch =
        !q ||
        role.name.toLowerCase().includes(q) ||
        role.nameEn.toLowerCase().includes(q) ||
        role.description.toLowerCase().includes(q) ||
        role.seerResult.toLowerCase().includes(q) ||
        role.roomRuleNote.toLowerCase().includes(q);
      return matchSide && matchSearch;
    });
  }, [filterSide, inGameRoleIds, trimmedQuery]);

  const segmentedSections = useMemo<RoleSection[]>(() => {
    if (!isSegmented) return [];
    return SIDE_SECTIONS.map(({ side, title }) => ({
      side,
      title,
      roles: gameRoles.filter((role) => role.side === side),
    }));
  }, [isSegmented]);

  const navigableRoles = useMemo(() => {
    if (isSegmented) {
      return segmentedSections.flatMap((section) => section.roles);
    }
    return filteredRoles;
  }, [isSegmented, segmentedSections, filteredRoles]);

  const canNavigate = navigableRoles.length > 1;

  const { prevRole, nextRole, selectedRoleIndex } = useMemo(() => {
    if (!selectedRole || navigableRoles.length === 0) {
      return { prevRole: null, nextRole: null, selectedRoleIndex: -1 };
    }
    const idx = navigableRoles.findIndex((r) => r.id === selectedRole.id);
    if (idx === -1) {
      return { prevRole: null, nextRole: null, selectedRoleIndex: -1 };
    }
    if (navigableRoles.length <= 1) {
      return { prevRole: null, nextRole: null, selectedRoleIndex: idx };
    }
    const prev = navigableRoles[(idx - 1 + navigableRoles.length) % navigableRoles.length];
    const next = navigableRoles[(idx + 1) % navigableRoles.length];
    return { prevRole: prev, nextRole: next, selectedRoleIndex: idx };
  }, [selectedRole, navigableRoles]);

  // Keyboard handling: Escape, ArrowLeft/ArrowRight in Lightbox, Tab focus trap inside .lightbox-dialog
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (selectedRole) {
          setSelectedRole(null);
        } else {
          onClose();
        }
        return;
      }

      if (event.key === 'Tab') {
        const trapContainer = selectedRole ? lightboxDialogRef.current : galleryShellRef.current;
        if (!trapContainer) return;
        const focusables = getFocusableElements(trapContainer);
        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const activeEl = document.activeElement as HTMLElement | null;

        if (event.shiftKey) {
          if (!activeEl || !trapContainer.contains(activeEl) || activeEl === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (!activeEl || !trapContainer.contains(activeEl) || activeEl === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (!selectedRole) return;

      if (
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        if (
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        if (!canNavigate) return;
        event.preventDefault();
        if (event.key === 'ArrowLeft' && prevRole) {
          setSelectedRole(prevRole);
        } else if (event.key === 'ArrowRight' && nextRole) {
          setSelectedRole(nextRole);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedRole, onClose, canNavigate, prevRole, nextRole]);

  if (!isOpen) return null;

  const isLightboxOpen = selectedRole !== null;

  const renderRoleCard = (role: GameRole) => {
    const showImage = Boolean(role.image && !failedImages[role.id]);

    return (
      <button
        key={role.id}
        ref={(el) => {
          cardRefs.current[role.id] = el;
        }}
        type="button"
        className={`gallery-card side-${role.side}`}
        onClick={() => setSelectedRole(role)}
      >
        <div className="gallery-card-art">
          {showImage ? (
            <img
              src={role.image}
              alt=""
              className="gallery-card-img"
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={() => markImageFailed(role.id)}
            />
          ) : (
            <span className="gallery-card-symbol" aria-hidden="true">
              {role.symbol}
            </span>
          )}
        </div>
        <div className="gallery-card-caption">
          <span className="gallery-card-name">{role.name}</span>
          <span className="gallery-card-meta">{role.wakeFrequency}</span>
        </div>
      </button>
    );
  };

  return (
    <div
      className="roles-gallery-backdrop"
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
        ref={galleryShellRef}
        className="roles-gallery-shell"
        role="dialog"
        aria-modal="true"
        aria-label="Sổ tay luật làng và danh sách vai trò"
      >
        <header className="gallery-header" aria-hidden={isLightboxOpen ? true : undefined}>
          <div className="gallery-header-inner">
            <span className="gallery-eyebrow">HỒ SƠ QUẢN TRÒ</span>
            <div className="gallery-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'roles'}
                className={`gallery-tab-btn ${activeTab === 'roles' ? 'active' : ''}`}
                onClick={() => setActiveTab('roles')}
              >
                VAI TRÒ ({gameRoles.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'rules'}
                className={`gallery-tab-btn ${activeTab === 'rules' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('rules');
                  setSelectedRole(null);
                }}
              >
                LUẬT LÀNG
              </button>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              className="gallery-close-btn"
              aria-label="Đóng bảng tra cứu"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>

        <div className="gallery-scroll-body" aria-hidden={isLightboxOpen ? true : undefined}>
          <div className="gallery-container">
            {activeTab === 'rules' ? (
              <div className="gallery-rules-wrap">
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

                {roomSettings && (
                  <div className="masa-rules-footnote" style={{ marginTop: '16px', flexDirection: 'column', gap: '8px' }}>
                    <strong>Luật phòng #{state.roomCode} đang bật:</strong>
                    <p style={{ margin: 0 }}>
                      Bầu Trưởng làng: {roomSettings.hasMayor ? 'Có' : 'Không'} ·
                      Lộ vai khi chết: {roomSettings.revealOnDeath ? 'Có' : 'Ẩn'} ·
                      Bảo vệ tự cứu: {roomSettings.allowBodyguardSelfProtect ? 'Được' : 'Không'} ·
                      Phù thủy 2 bình/đêm: {roomSettings.allowWitchBothPotionsSameNight ? 'Được' : 'Không'} ·
                      Sói bỏ qua cắn: {roomSettings.allowWolfSkip ? 'Được' : 'Không'} ·
                      Hòa phiếu: {roomSettings.tieVoteMode === 'RUNOFF' ? 'Bỏ phiếu lại' : 'Thoát nạn'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="gallery-toolbar">
                  <div className="gallery-filter-group" role="group" aria-label="Lọc vai trò theo phe">
                    <button
                      type="button"
                      className={`gallery-filter-btn ${filterSide === 'all' ? 'active' : ''}`}
                      onClick={() => setFilterSide('all')}
                    >
                      TẤT CẢ ({gameRoles.length})
                    </button>
                    {hasInGameDeck && (
                      <button
                        type="button"
                        className={`gallery-filter-btn ${filterSide === 'in_game' ? 'active' : ''}`}
                        onClick={() => setFilterSide('in_game')}
                      >
                        TRONG VÁN NÀY ({inGameRoleIds.size})
                      </button>
                    )}
                    <button
                      type="button"
                      className={`gallery-filter-btn ${filterSide === 'village' ? 'active' : ''}`}
                      onClick={() => setFilterSide('village')}
                    >
                      DÂN LÀNG
                    </button>
                    <button
                      type="button"
                      className={`gallery-filter-btn ${filterSide === 'wolf' ? 'active' : ''}`}
                      onClick={() => setFilterSide('wolf')}
                    >
                      MA SÓI
                    </button>
                    <button
                      type="button"
                      className={`gallery-filter-btn ${filterSide === 'third' ? 'active' : ''}`}
                      onClick={() => setFilterSide('third')}
                    >
                      PHE THỨ 3
                    </button>
                  </div>

                  <div className="gallery-search-wrap">
                    <input
                      type="text"
                      placeholder="Tìm tên vai trò, kỹ năng, luật..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="gallery-search-input"
                      aria-label="Tìm kiếm vai trò"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        className="gallery-search-clear"
                        onClick={() => setSearchQuery('')}
                        aria-label="Xóa nội dung tìm kiếm"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                {navigableRoles.length === 0 ? (
                  <div className="gallery-empty">
                    <p>Không có vai trò nào khớp với từ khóa &ldquo;{searchQuery}&rdquo;.</p>
                    <button
                      type="button"
                      className="gallery-reset-btn"
                      onClick={() => {
                        setSearchQuery('');
                        setFilterSide('all');
                      }}
                    >
                      Đặt lại tìm kiếm
                    </button>
                  </div>
                ) : isSegmented ? (
                  segmentedSections.map((section) => (
                    <section key={section.side} className="gallery-section">
                      <header className="gallery-section-header">
                        <h2 className="gallery-section-title">{section.title}</h2>
                        <span className="gallery-section-count">{section.roles.length}</span>
                        <span className="gallery-section-line" aria-hidden="true" />
                      </header>
                      <div className="gallery-grid">{section.roles.map(renderRoleCard)}</div>
                    </section>
                  ))
                ) : (
                  <div className="gallery-grid">{filteredRoles.map(renderRoleCard)}</div>
                )}
              </>
            )}
          </div>
        </div>

        {selectedRole && (
          <div
            className="lightbox-backdrop"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setSelectedRole(null);
              }
            }}
          >
            {canNavigate && prevRole && (
              <button
                type="button"
                className="lightbox-nav-btn prev"
                onClick={() => setSelectedRole(prevRole)}
                aria-label={`Vai trò trước: ${prevRole.name}`}
              >
                ←
              </button>
            )}

            <div
              ref={lightboxDialogRef}
              className="lightbox-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={`Chi tiết vai trò ${selectedRole.name}`}
            >
              <button
                ref={lightboxCloseRef}
                type="button"
                className="lightbox-close-btn"
                aria-label="Đóng chi tiết vai trò"
                onClick={() => setSelectedRole(null)}
              >
                ×
              </button>

              <div className="lightbox-layout">
                <div className="lightbox-left">
                  <div className={`lightbox-portrait-card side-${selectedRole.side}`}>
                    <div className="lightbox-portrait-art">
                      {selectedRole.image && !failedImages[selectedRole.id] ? (
                        <img
                          src={selectedRole.image}
                          alt={selectedRole.name}
                          className="lightbox-portrait-img"
                          decoding="async"
                          draggable={false}
                          onError={() => markImageFailed(selectedRole.id)}
                        />
                      ) : (
                        <span className="lightbox-portrait-symbol" aria-hidden="true">
                          {selectedRole.symbol}
                        </span>
                      )}
                    </div>
                    <div className="lightbox-portrait-meta">
                      <span className={`lightbox-side-pill side-${selectedRole.side}`}>
                        {selectedRole.sideLabel}
                      </span>
                      <span className={`lightbox-balance-pill ${getBalanceClass(selectedRole.balanceWeight)}`}>
                        {selectedRole.balanceWeight > 0
                          ? `+${selectedRole.balanceWeight}`
                          : selectedRole.balanceWeight}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="lightbox-right">
                  <span className="lightbox-eyebrow">
                    {selectedRoleIndex >= 0
                      ? `NO. ${String(selectedRoleIndex + 1).padStart(2, '0')} · ${selectedRole.packLabel}`
                      : selectedRole.packLabel}
                  </span>
                  <h2 className="lightbox-title">{selectedRole.name}</h2>
                  <p className="lightbox-subtitle">{selectedRole.nameEn}</p>
                  <p className="lightbox-desc">{selectedRole.description}</p>

                  <dl className="lightbox-specs">
                    <div className="lightbox-spec-row">
                      <dt>Kết quả Tiên tri</dt>
                      <dd>{selectedRole.seerResult}</dd>
                    </div>
                    <div className="lightbox-spec-row">
                      <dt>Điều kiện thắng</dt>
                      <dd>{selectedRole.winCondition}</dd>
                    </div>
                    <div className="lightbox-spec-row">
                      <dt>Nhịp thức dậy</dt>
                      <dd>{selectedRole.wakeFrequency}</dd>
                    </div>
                  </dl>

                  {selectedRole.edgeCases.length > 0 && (
                    <div className="lightbox-edges">
                      <h3>Tình huống tranh chấp &amp; Engine rule</h3>
                      <ul>
                        {selectedRole.edgeCases.map((edgeCase, idx) => (
                          <li key={idx}>{edgeCase}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="lightbox-note">{selectedRole.roomRuleNote}</p>

                  {canNavigate && prevRole && nextRole && (
                    <div className="lightbox-mobile-pager">
                      <button
                        type="button"
                        className="lightbox-mobile-btn"
                        onClick={() => setSelectedRole(prevRole)}
                      >
                        ← Trước
                      </button>
                      <button
                        type="button"
                        className="lightbox-mobile-btn"
                        onClick={() => setSelectedRole(nextRole)}
                      >
                        Tiếp →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {canNavigate && nextRole && (
              <button
                type="button"
                className="lightbox-nav-btn next"
                onClick={() => setSelectedRole(nextRole)}
                aria-label={`Vai trò tiếp theo: ${nextRole.name}`}
              >
                →
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
