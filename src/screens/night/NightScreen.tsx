import { useEffect, useState } from 'react';
import type { ScreenName } from '../../navigation';
import { useGameSession } from '../../adapters/useGameSession';
import { ROLES_BY_ID } from '../../engine/roles';
import CompactHostControlBar from '../../components/CompactHostControlBar';
import type { PlayerId } from '../../engine/types';
import './night.css';

type NightScreenProps = {
  onNavigate?: (screen: ScreenName) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
};

export default function NightScreen({ onNavigate }: NightScreenProps) {
  const { state, actions, deviceMode } = useGameSession();

  const [mode, setMode] = useState<'sleep' | 'action' | 'my_role'>('sleep');
  const [selectedTargetId, setSelectedTargetId] = useState<PlayerId | null>(null);
  const [hoodlumTargets, setHoodlumTargets] = useState<PlayerId[]>([]);
  const [witchPoisonTargetId, setWitchPoisonTargetId] = useState<PlayerId | null>(null);
  const [isWitchHeal, setIsWitchHeal] = useState(false);
  const [isShowingRole, setIsShowingRole] = useState(false);
  const [notice, setNotice] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const privateView = state.privateView;
  const publicView = state.publicView;
  const isSingleDevice = deviceMode === 'SINGLE_DEVICE';
  const isPlayerHost = state.isHost && state.hostMode === 'PLAYER_HOST';

  const myRoleId = privateView?.roleId || 'villager';
  const roleDef = ROLES_BY_ID[myRoleId] ?? ROLES_BY_ID.villager;
  const canAct = Boolean(privateView?.canActCurrentTurn && !hasSubmitted);
  const validTargets = privateView?.validTargets ?? [];
  const currentTurnInfo = publicView?.currentTurnInfo;

  const currentTurnKey = privateView?.turnKey || privateView?.roleId || '';
  const isMason = currentTurnKey === 'mason' || currentTurnKey === 'night_mason';
  const isHoodlum = currentTurnKey === 'hoodlum' || currentTurnKey === 'night_hoodlum';
  const isWildChild = currentTurnKey === 'wild_child' || currentTurnKey === 'night_wild_child';
  const isDireWolf = currentTurnKey === 'dire_wolf' || currentTurnKey === 'night_dire_wolf';
  const isWitch = currentTurnKey === 'witch';

  // Lấy thông tin nạn nhân bị sói cắn nếu là phù thủy
  const victimPlayerId = privateView?.skills?.witchVictimId;
  const victimPlayer = victimPlayerId
    ? publicView?.players.find((p) => p.id === victimPlayerId)
    : null;

  // Tự động mở Action mode nếu đến lượt có thể hành động
  useEffect(() => {
    if (canAct) {
      setMode('action');
      setHasSubmitted(false);
      setSelectedTargetId(null);
      setHoodlumTargets([]);
    } else {
      setMode('sleep');
    }
  }, [canAct, privateView?.turnKey]);

  useEffect(() => {
    document.body.classList.toggle('night-sleep-active', mode === 'sleep');
    return () => document.body.classList.remove('night-sleep-active');
  }, [mode]);

  const handleConfirmAction = async () => {
    if (!privateView) return;

    try {
      if (isWitch) {
        await actions.sendNightAction('witch', {
          heal: isWitchHeal,
          healTargetId: isWitchHeal ? victimPlayerId : null,
          poisonTargetId: witchPoisonTargetId,
        });
      } else if (isHoodlum) {
        if (hoodlumTargets.length !== 2 || hoodlumTargets[0] === hoodlumTargets[1]) {
          setNotice('Vui lòng chọn đủ 2 người chơi khác nhau làm kẻ thù.');
          return;
        }
        await actions.sendNightAction('hoodlum', {
          target1: hoodlumTargets[0],
          target2: hoodlumTargets[1],
        });
      } else if (isMason) {
        await actions.sendNightAction('mason', {});
      } else if (isWildChild) {
        if (!selectedTargetId) {
          setNotice('Vui lòng chọn 1 người làm thần tượng.');
          return;
        }
        await actions.sendNightAction('wild_child', {
          targetId: selectedTargetId,
        });
      } else if (isDireWolf) {
        if (!selectedTargetId) {
          setNotice('Vui lòng chọn 1 người làm bạn đồng hành.');
          return;
        }
        await actions.sendNightAction('dire_wolf', {
          targetId: selectedTargetId,
        });
      } else {
        await actions.sendNightAction(privateView.roleId, {
          targetId: selectedTargetId,
          isSkip: selectedTargetId === null,
        });
      }

      setHasSubmitted(true);
      const successMsg = isMason
        ? '✓ Đã nhận diện anh em Hội Tam Điểm.'
        : isWildChild
        ? '✓ Đã chọn thần tượng thành công.'
        : isDireWolf
        ? '✓ Đã chọn bạn đồng hành thành công.'
        : isHoodlum
        ? '✓ Đã chọn 2 kẻ thù trừ khử thành công.'
        : '✓ Đã xác nhận hành động ban đêm thành công.';
      setNotice(successMsg);
      setTimeout(() => {
        setMode('sleep');
        setNotice('');
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi gửi hành động';
      setNotice(msg);
    }
  };

  const handleAdvanceLocal = () => {
    actions.advanceLocalTurn();
    setHasSubmitted(false);
    setSelectedTargetId(null);
    setHoodlumTargets([]);
    setWitchPoisonTargetId(null);
    setIsWitchHeal(false);
  };

  const handleSelectTarget = (tId: PlayerId) => {
    if (isHoodlum) {
      setHoodlumTargets((prev) => {
        if (prev.includes(tId)) {
          return prev.filter((id) => id !== tId);
        }
        if (prev.length < 2) {
          return [...prev, tId];
        }
        return [prev[0], tId];
      });
    } else {
      setSelectedTargetId((prev) => (prev === tId ? null : tId));
    }
  };

  const isHoodlumValid = hoodlumTargets.length === 2 && hoodlumTargets[0] !== hoodlumTargets[1];
  const canConfirm = isHoodlum
    ? isHoodlumValid
    : isWildChild || isDireWolf
    ? Boolean(selectedTargetId)
    : true;

  return (
    <main className={`night-screen app-page ${mode === 'sleep' ? 'night-sleep' : ''}`}>
      {/* Compact Host Control Bar cho Host kiêm Người chơi */}
      {isPlayerHost && <CompactHostControlBar />}

      <header className="screen-header night-header">
        <div className="phase-label">
          <span className="status-ember" />
          <span>
            TRỜI TỐI · ĐÊM THỨ {publicView?.roundNumber || 1}
            {currentTurnInfo && <b> • {currentTurnInfo.titleVi}</b>}
          </span>
        </div>

        <nav aria-label="Chế độ ban đêm" className="segmented-control">
          <button
            type="button"
            aria-pressed={mode === 'sleep'}
            onClick={() => setMode('sleep')}
            className={mode === 'sleep' ? 'segment active' : 'segment'}
          >
            Thổi nến (Ngủ)
          </button>
          <button
            type="button"
            aria-pressed={mode === 'my_role'}
            onClick={() => setMode('my_role')}
            className={mode === 'my_role' ? 'segment active' : 'segment'}
          >
            Xem vai bí mật
          </button>
          {canAct && (
            <button
              type="button"
              aria-pressed={mode === 'action'}
              onClick={() => setMode('action')}
              className={mode === 'action' ? 'segment active' : 'segment'}
            >
              Hành động
            </button>
          )}
        </nav>
      </header>

      {/* 1. Sleep Overlay (Thổi tắt ngọn nến) */}
      {mode === 'sleep' && (
        <section className="night-content sleep-content" aria-live="polite">
          <div className="stealth-moon-wrap" aria-hidden="true">
            <div className="stealth-moon-ring" />
            <div className="sleep-icon">☾</div>
          </div>
          <h1>THỔI TẮT NGỌN NẾN</h1>
          <p>Nhắm mắt lại và lắng nghe khẩu lệnh của quản trò từ loa trung tâm.</p>
          <div className="standby">
            <span className="stealth-ember-dot" aria-hidden="true" />
            <span>TĨNH LẶNG · BẢO MẬT BAN ĐÊM (KHÔNG RUNG)</span>
          </div>
          <p className="demo-note">
            Độ sáng tối thiểu (OLED True Black). Hãy úp điện thoại xuống bàn để giữ bí mật tuyệt đối.
          </p>

          {/* Nút điều phối chuyển lượt cho 1 máy offline */}
          {isSingleDevice && (
            <div className="night-offline-advance-bar">
              <button
                type="button"
                className="offline-advance-btn"
                onClick={handleAdvanceLocal}
              >
                <span>Xong lượt này ➔ Chuyển lượt gọi tiếp theo</span>
              </button>
            </div>
          )}
        </section>
      )}

      {/* 2. Xem Vai Bí Mật (Press-and-Hold để xem, thả tay tự che) */}
      {mode === 'my_role' && (
        <section className="night-content role-reveal-content">
          <div className="screen-title">
            <span>BẢO MẬT THÂN PHẬN</span>
            <h1>Lá bài bí mật của bạn</h1>
          </div>

          {/* Single-device: Bộ chọn người đang cầm máy */}
          {isSingleDevice && (
            <div className="offline-player-switcher">
              <span>Đang chuyền máy cho:</span>
              <select
                value={state.playerId}
                onChange={(e) => actions.setLocalActivePlayer(e.target.value)}
                className="offline-select"
              >
                {publicView?.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.seatIndex} {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="press-hold-card-wrapper">
            <button
              type="button"
              className={`press-hold-card ${isShowingRole ? 'is-revealed' : ''}`}
              onPointerDown={() => setIsShowingRole(true)}
              onPointerUp={() => setIsShowingRole(false)}
              onPointerLeave={() => setIsShowingRole(false)}
              onContextMenu={(e) => e.preventDefault()}
              aria-label="Nhấn giữ để xem vai trò bí mật"
            >
              {isShowingRole ? (
                <div className="revealed-role-box">
                  <span className="role-side-badge">
                    {roleDef.faction === 'WEREWOLF'
                      ? 'PHE MA SÓI'
                      : roleDef.faction === 'THIRD_PARTY'
                      ? 'PHE THỨ BA'
                      : 'PHE DÂN LÀNG'}
                  </span>
                  <div className="role-icon-big">
                    {roleDef.faction === 'WEREWOLF'
                      ? '🐺'
                      : myRoleId === 'seer'
                      ? '🔮'
                      : myRoleId === 'witch'
                      ? '🧪'
                      : myRoleId === 'bodyguard'
                      ? '⚔️'
                      : myRoleId === 'mason'
                      ? '🏛️'
                      : myRoleId === 'wild_child'
                      ? '👶'
                      : myRoleId === 'dire_wolf'
                      ? '❄️'
                      : myRoleId === 'hoodlum'
                      ? '🗡️'
                      : '🛡️'}
                  </div>
                  <h2>{roleDef.nameVi}</h2>
                  <p>{roleDef.descriptionVi}</p>

                  {myRoleId === 'mason' && (
                    <div className="revealed-role-details">
                      <strong>ANH EM HỘI TAM ĐIỂM:</strong>
                      <span>
                        {privateView?.skills?.masonPartnerIds && privateView.skills.masonPartnerIds.length > 0
                          ? privateView.skills.masonPartnerIds
                              .map((id) => {
                                const p = publicView?.players.find((pl) => pl.id === id);
                                return p ? `#${p.seatIndex} ${p.name}` : id;
                              })
                              .join(', ')
                          : 'Bạn là thành viên Hội Tam Điểm duy nhất trong làng.'}
                      </span>
                    </div>
                  )}

                  {myRoleId === 'wild_child' && privateView?.skills?.roleModelId && (
                    <div className="revealed-role-details">
                      <strong>THẦN TƯỢNG CỦA BẠN:</strong>
                      <span>
                        {(() => {
                          const p = publicView?.players.find((pl) => pl.id === privateView.skills?.roleModelId);
                          return p ? `#${p.seatIndex} ${p.name}` : 'Chưa chọn';
                        })()}
                      </span>
                    </div>
                  )}

                  {myRoleId === 'dire_wolf' && privateView?.skills?.companionId && (
                    <div className="revealed-role-details">
                      <strong>BẠN ĐỒNG HÀNH:</strong>
                      <span>
                        {(() => {
                          const p = publicView?.players.find((pl) => pl.id === privateView.skills?.companionId);
                          return p ? `#${p.seatIndex} ${p.name}` : 'Chưa chọn';
                        })()}
                      </span>
                    </div>
                  )}

                  {myRoleId === 'hoodlum' && privateView?.skills?.hoodlumTargetIds && (
                    <div className="revealed-role-details">
                      <strong>2 KẺ THÙ CẦN TRỪ KHỬ:</strong>
                      <span>
                        {(() => {
                          const ids = privateView.skills.hoodlumTargetIds;
                          const p1 = publicView?.players.find((pl) => pl.id === ids[0]);
                          const p2 = publicView?.players.find((pl) => pl.id === ids[1]);
                          return `${p1 ? `#${p1.seatIndex} ${p1.name}` : ids[0]} & ${p2 ? `#${p2.seatIndex} ${p2.name}` : ids[1]}`;
                        })()}
                      </span>
                    </div>
                  )}

                  <small className="release-hint">Thả tay để che lại ngay lập tức</small>
                </div>
              ) : (
                <div className="unrevealed-card-box">
                  <div className="card-tarot-icon">🎴</div>
                  <strong>NHẤN VÀ GIỮ VÀO ĐÂY</strong>
                  <span>để mở lá bài xem vai bí mật</span>
                  <small>Buông tay màn hình sẽ tự động che lại</small>
                </div>
              )}
            </button>
          </div>
        </section>
      )}

      {/* 3. Lượt Hành Động Bí Mật Trong Đêm */}
      {mode === 'action' && canAct && (
        <section className="night-content role-content" aria-live="polite">
          <div className="role-heading">
            <div className="role-caller">
              <span className="role-glyph" aria-hidden="true">✦</span>
              <div>
                <h2>{roleDef.nameVi} THỨC GIẤC</h2>
                <small>BẠN ĐANG TRONG LƯỢT KÍN ĐÊM NAY</small>
              </div>
            </div>
          </div>

          {isMason ? (
            <div className="mason-turn-panel">
              <div className="mason-header-badge">
                <span className="mason-symbol" aria-hidden="true">🏛️</span>
                <div>
                  <strong>HỘI TAM ĐIỂM (MASONS)</strong>
                  <p>
                    Tất cả thành viên trong Hội Tam Điểm đều thuộc phe Dân làng và biết mặt nhau từ Đêm 1.
                  </p>
                </div>
              </div>

              <div className="mason-partners-container">
                <div className="mason-list-header">
                  <span className="mason-dot" aria-hidden="true" />
                  <span>DANH SÁCH ANH EM TAM ĐIỂM CỦA BẠN</span>
                </div>

                {privateView?.skills?.masonPartnerIds && privateView.skills.masonPartnerIds.length > 0 ? (
                  <div className="mason-grid">
                    {privateView.skills.masonPartnerIds.map((partnerId) => {
                      const partner = publicView?.players.find((p) => p.id === partnerId);
                      if (!partner) return null;
                      return (
                        <div key={partnerId} className="mason-card">
                          <div className="mason-card-avatar" aria-hidden="true">🤝</div>
                          <div className="mason-card-info">
                            <span className="mason-seat-badge">Ghế #{partner.seatIndex}</span>
                            <span className="mason-name">{partner.name}</span>
                          </div>
                          <span className="mason-partner-badge-green">ANH EM TAM ĐIỂM</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mason-single-note">
                    <span>Không có anh em nào khác trong hội (bạn là thành viên duy nhất).</span>
                  </div>
                )}
              </div>

              <div className="role-actions">
                <button
                  type="button"
                  className="primary-confirm-btn mason-confirm-btn"
                  onClick={handleConfirmAction}
                >
                  <span>✓ ĐÃ NHẬN DIỆN ANH EM</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Nạn nhân Phù Thủy nếu có */}
              {isWitch && victimPlayer && (
                <div className="victim-card">
                  <div className="victim-info">
                    <div className="victim-glyph-wrap" aria-hidden="true">
                      <span className="victim-glyph">☠</span>
                    </div>
                    <div className="victim-meta">
                      <small>NẠN NHÂN BỊ SÓI CẮN ĐÊM NAY</small>
                      <strong>#{victimPlayer.seatIndex} {victimPlayer.name}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`hold-button heal-button ${isWitchHeal ? 'is-complete' : ''}`}
                    onClick={() => setIsWitchHeal((prev) => !prev)}
                  >
                    <span>{isWitchHeal ? '✓ ĐÃ CHỌN DÙNG BÌNH CỨU' : 'DÙNG BÌNH TIÊN DƯỢC (CỨU)'}</span>
                  </button>
                </div>
              )}

              {/* Chọn mục tiêu hợp lệ */}
              <div className="target-heading">
                <div>
                  <strong>
                    {isHoodlum
                      ? 'CHỌN 2 KẺ THÙ CẦN TRỪ KHỬ'
                      : isWildChild
                      ? 'CHỌN 1 THẦN TƯỢNG CỦA BẠN'
                      : isDireWolf
                      ? 'CHỌN 1 BẠN ĐỒNG HÀNH'
                      : 'CHỌN MỤC TIÊU HÀNH ĐỘNG'}
                  </strong>
                  <small>
                    {isHoodlum
                      ? 'Bạn chỉ thắng nếu cả 2 người này đều chết và bạn còn sống'
                      : isWildChild
                      ? 'Nếu người này chết, bạn sẽ biến thành Ma Sói từ đêm hôm sau'
                      : isDireWolf
                      ? 'Nếu người này chết, bạn sẽ chết theo ngay lập tức'
                      : 'Chỉ hiển thị các người chơi hợp lệ trong luật'}
                  </small>
                </div>
                <span className="target-hint">
                  {isHoodlum
                    ? hoodlumTargets.length === 0
                      ? 'Chọn đúng 2 người khác nhau (0/2)'
                      : hoodlumTargets.length === 1
                      ? `Đã chọn 1/2: #${publicView?.players.find((p) => p.id === hoodlumTargets[0])?.seatIndex} ${publicView?.players.find((p) => p.id === hoodlumTargets[0])?.name}`
                      : `Kẻ thù: #${publicView?.players.find((p) => p.id === hoodlumTargets[0])?.seatIndex} ${publicView?.players.find((p) => p.id === hoodlumTargets[0])?.name} & #${publicView?.players.find((p) => p.id === hoodlumTargets[1])?.seatIndex} ${publicView?.players.find((p) => p.id === hoodlumTargets[1])?.name}`
                    : isWildChild
                    ? selectedTargetId
                      ? `Thần tượng: ${publicView?.players.find((p) => p.id === selectedTargetId)?.name}`
                      : 'Chọn 1 người làm thần tượng'
                    : isDireWolf
                    ? selectedTargetId
                      ? `Bạn đồng hành: ${publicView?.players.find((p) => p.id === selectedTargetId)?.name}`
                      : 'Chọn 1 người làm bạn đồng hành'
                    : selectedTargetId
                    ? `Mục tiêu: ${publicView?.players.find((p) => p.id === selectedTargetId)?.name}`
                    : 'Chưa chọn'}
                </span>
              </div>

              <div className="target-grid">
                {validTargets.map((tId) => {
                  const targetP = publicView?.players.find((p) => p.id === tId);
                  if (!targetP) return null;
                  const isSelected = isHoodlum
                    ? hoodlumTargets.includes(tId)
                    : selectedTargetId === tId;
                  const hoodlumIdx = hoodlumTargets.indexOf(tId);

                  return (
                    <button
                      type="button"
                      key={tId}
                      aria-pressed={isSelected}
                      onClick={() => handleSelectTarget(tId)}
                      className={`target-card ${isSelected ? 'selected' : ''} ${isHoodlum && isSelected ? 'hoodlum-selected' : ''}`}
                    >
                      <div className="target-meta">
                        <span className="target-num">#{String(targetP.seatIndex).padStart(2, '0')}</span>
                        <span className="target-name">{targetP.name}</span>
                      </div>
                      <span className="target-crosshair" aria-hidden="true">
                        {isHoodlum
                          ? isSelected
                            ? `🎯 #${hoodlumIdx + 1}`
                            : '○'
                          : isSelected
                          ? '⦿'
                          : '○'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Bình độc dược cho Phù Thủy */}
              {isWitch && !privateView?.skills?.witchPoisonUsed && (
                <div className="witch-poison-section">
                  <strong>BÌNH ĐỘC DƯỢC</strong>
                  <div className="target-grid">
                    {validTargets.map((tId) => {
                      const targetP = publicView?.players.find((p) => p.id === tId);
                      if (!targetP) return null;
                      const isPoisoned = witchPoisonTargetId === tId;
                      return (
                        <button
                          type="button"
                          key={`poison-${tId}`}
                          aria-pressed={isPoisoned}
                          onClick={() => setWitchPoisonTargetId(isPoisoned ? null : tId)}
                          className={`target-card ${isPoisoned ? 'selected poison-selected' : ''}`}
                        >
                          <span className="target-name">Đầu độc #{targetP.seatIndex} {targetP.name}</span>
                          <span>{isPoisoned ? '☠' : '○'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Kết quả Tiên Tri / Pháp Sư nếu đã soi */}
              {privateView?.investigationResult && (
                <div className="investigation-result-card">
                  <span>KẾT QUẢ ĐIỀU TRA:</span>
                  <strong>
                    {typeof privateView.investigationResult.result === 'string'
                      ? privateView.investigationResult.result === 'WEREWOLF'
                        ? '🐺 LÀ MA SÓI'
                        : '🛡️ LÀ NGƯỜI LÀNG'
                      : privateView.investigationResult.result
                      ? '🔮 ĐÚNG LÀ TIÊN TRI'
                      : '❌ KHÔNG PHẢI TIÊN TRI'}
                  </strong>
                </div>
              )}

              <div className="role-actions">
                <button
                  type="button"
                  className={`primary-confirm-btn ${!canConfirm ? 'disabled' : ''}`}
                  disabled={!canConfirm}
                  onClick={handleConfirmAction}
                >
                  <span>
                    {isHoodlum
                      ? isHoodlumValid
                        ? 'XÁC NHẬN 2 KẺ THÙ'
                        : `CHỌN ĐỦ 2 KẺ THÙ (${hoodlumTargets.length}/2)`
                      : isWildChild
                      ? 'XÁC NHẬN CHỌN THẦN TƯỢNG'
                      : isDireWolf
                      ? 'XÁC NHẬN CHỌN BẠN ĐỒNG HÀNH'
                      : 'XÁC NHẬN HÀNH ĐỘNG'}
                  </span>
                </button>

                {!['wild_child', 'dire_wolf', 'hoodlum', 'mason', 'night_wild_child', 'night_dire_wolf', 'night_hoodlum', 'night_mason'].includes(currentTurnKey) && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setSelectedTargetId(null);
                      void handleConfirmAction();
                    }}
                  >
                    Bỏ qua không thực hiện (hoặc thổi nến)
                  </button>
                )}
              </div>
            </>
          )}

          {notice && <p className="screen-notice" role="status">{notice}</p>}
        </section>
      )}

      <footer className="screen-footer night-footer">
        <span>TĨNH LẶNG TUYỆT ĐỐI</span>
        <span>•</span>
        <span>KHÔNG RUNG BAN ĐÊM</span>
      </footer>
    </main>
  );
}
