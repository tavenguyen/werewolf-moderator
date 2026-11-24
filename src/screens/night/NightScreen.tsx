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

export default function NightScreen({ onOpenRules: _onOpenRules }: NightScreenProps) {
  const { state, actions, deviceMode } = useGameSession();

  const [mode, setMode] = useState<'sleep' | 'action'>('sleep');
  const [advancePressed, setAdvancePressed] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<PlayerId | null>(null);
  const [hoodlumTargets, setHoodlumTargets] = useState<PlayerId[]>([]);
  const [piedPiperTargets, setPiedPiperTargets] = useState<PlayerId[]>([]);
  const [witchPoisonTargetId, setWitchPoisonTargetId] = useState<PlayerId | null>(null);
  const [isWitchHeal, setIsWitchHeal] = useState(false);
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
  const isWolfAccursed = currentTurnKey === 'wolf_accursed' || currentTurnKey === 'night_wolf_accursed';
  const isBigBadWolf = currentTurnKey === 'big_bad_wolf' || currentTurnKey === 'night_big_bad_wolf';
  const isAuraSeer = currentTurnKey === 'aura_seer' || currentTurnKey === 'night_aura_seer';
  const isPi = currentTurnKey === 'pi' || currentTurnKey === 'night_pi';
  const isFox = currentTurnKey === 'fox' || currentTurnKey === 'night_fox';
  const isSpellcaster = currentTurnKey === 'spellcaster' || currentTurnKey === 'night_spellcaster';
  const isTroublemaker = currentTurnKey === 'troublemaker' || currentTurnKey === 'night_troublemaker';
  const isDoppelganger = currentTurnKey === 'doppelganger' || currentTurnKey === 'night_doppelganger';
  const isPiedPiper = currentTurnKey === 'pied_piper' || currentTurnKey === 'night_pied_piper';
  const isCultLeader = currentTurnKey === 'cult_leader' || currentTurnKey === 'night_cult_leader';
  const isWitch = currentTurnKey === 'witch';

  const [isCurseAction, setIsCurseAction] = useState<boolean | null>(null);
  const [isTroublemakerActive, setIsTroublemakerActive] = useState<boolean | null>(null);
  const [isFoxSkip, setIsFoxSkip] = useState(false);

  // Lấy thông tin nạn nhân bị sói cắn nếu là phù thủy
  const victimPlayerId = privateView?.skills?.witchVictimId;
  const victimPlayer = victimPlayerId
    ? publicView?.players.find((p) => p.id === victimPlayerId)
    : null;

  // Lấy thông tin nạn nhân của bầy Sói cho Sói nguyền
  const accursedVictimId = validTargets[0] || privateView?.skills?.wolfPackVictimId;
  const accursedVictim = accursedVictimId
    ? publicView?.players.find((p) => p.id === accursedVictimId)
    : null;

  // Tự động mở Action mode nếu đến lượt có thể hành động
  useEffect(() => {
    if (canAct) {
      setMode('action');
      setHasSubmitted(false);
      setSelectedTargetId(null);
      setHoodlumTargets([]);
      setPiedPiperTargets([]);
      setIsCurseAction(null);
      setIsTroublemakerActive(null);
      setIsFoxSkip(false);
    } else {
      setMode('sleep');
    }
  }, [canAct, privateView?.turnKey]);

  useEffect(() => {
    document.body.classList.toggle('night-sleep-active', mode === 'sleep');
    return () => document.body.classList.remove('night-sleep-active');
  }, [mode]);

  const maxPiedPiperTargets = Math.min(2, validTargets.length);
  const isPiedPiperValid = piedPiperTargets.length === maxPiedPiperTargets && maxPiedPiperTargets > 0;

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
      } else if (isWolfAccursed) {
        const curseTargetId = isCurseAction && accursedVictimId ? accursedVictimId : null;
        await actions.sendNightAction('wolf_accursed', {
          curseTargetId,
        });
      } else if (isBigBadWolf) {
        if (!selectedTargetId) {
          setNotice('Vui lòng chọn 1 nạn nhân để cắn xé thêm.');
          return;
        }
        await actions.sendNightAction('big_bad_wolf', {
          targetId: selectedTargetId,
        });
      } else if (isTroublemaker) {
        if (isTroublemakerActive === null) {
          setNotice('Vui lòng chọn Kích hoạt hoặc Bỏ qua.');
          return;
        }
        await actions.sendNightAction('troublemaker', {
          activate: isTroublemakerActive,
        });
      } else if (isFox) {
        if (isFoxSkip) {
          await actions.sendNightAction('fox', { isSkip: true });
        } else {
          if (!selectedTargetId) {
            setNotice('Vui lòng chọn 1 người làm tâm điểm để Con Cáo đánh hơi hoặc bấm Bỏ qua.');
            return;
          }
          await actions.sendNightAction('fox', {
            targetId: selectedTargetId,
            isSkip: false,
          });
        }
      } else if (isAuraSeer) {
        if (!selectedTargetId) {
          setNotice('Vui lòng chọn 1 người để quan sát vầng hào quang.');
          return;
        }
        await actions.sendNightAction('aura_seer', {
          targetId: selectedTargetId,
        });
      } else if (isPi) {
        if (!selectedTargetId) {
          setNotice('Vui lòng chọn 1 nghi phạm để điều tra cụm 3 người.');
          return;
        }
        await actions.sendNightAction('pi', {
          targetId: selectedTargetId,
        });
      } else if (isSpellcaster) {
        if (!selectedTargetId) {
          setNotice('Vui lòng chọn 1 người để phù phép câm lặng.');
          return;
        }
        await actions.sendNightAction('spellcaster', {
          targetId: selectedTargetId,
        });
      } else if (isDoppelganger) {
        if (!selectedTargetId) {
          setNotice('Vui lòng chọn 1 người làm bản sao.');
          return;
        }
        await actions.sendNightAction('doppelganger', {
          targetId: selectedTargetId,
        });
      } else if (isPiedPiper) {
        if (piedPiperTargets.length !== maxPiedPiperTargets) {
          setNotice(`Vui lòng chọn đủ ${maxPiedPiperTargets} người để thôi miên.`);
          return;
        }
        await actions.sendNightAction('pied_piper', {
          targetIds: piedPiperTargets,
        });
      } else if (isCultLeader) {
        if (!selectedTargetId) {
          setNotice('Vui lòng chọn 1 người để kết nạp vào giáo phái.');
          return;
        }
        await actions.sendNightAction('cult_leader', {
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
        : isWolfAccursed
        ? isCurseAction
          ? '✓ Đã nguyền nạn nhân thành Ma Sói.'
          : '✓ Đã bỏ qua lượt nguyền, giữ lại phép.'
        : isBigBadWolf
        ? '✓ Đã chọn mục tiêu cắn thêm thành công.'
        : isAuraSeer
        ? '✓ Đã quan sát hào quang người chơi thành công.'
        : isFox
        ? isFoxSkip
          ? '✓ Con cáo đã bỏ qua lượt đánh hơi đêm nay.'
          : '✓ Con cáo đã đánh hơi cụm 3 người thành công.'
        : isPi
        ? '✓ Thám tử đã điều tra cụm nghi phạm thành công.'
        : isSpellcaster
        ? '✓ Đã phù phép câm lặng người chơi thành công.'
        : isTroublemaker
        ? isTroublemakerActive
          ? '✓ Đã kích hoạt hỗn loạn: hôm nay làng sẽ treo cổ 2 người!'
          : '✓ Đã bỏ qua, giữ lại quyền năng cho đêm sau.'
        : isDoppelganger
        ? '✓ Đã chọn bản sao thành công.'
        : isPiedPiper
        ? '✓ Đã cất tiếng sáo thôi miên thành công.'
        : isCultLeader
        ? '✓ Đã kết nạp tín đồ mới thành công.'
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
    setAdvancePressed(true);
    setTimeout(() => setAdvancePressed(false), 250);
    try {
      navigator.vibrate?.(40);
    } catch {
      // ignore
    }
    actions.advanceLocalTurn();
    setHasSubmitted(false);
    setSelectedTargetId(null);
    setHoodlumTargets([]);
    setPiedPiperTargets([]);
    setWitchPoisonTargetId(null);
    setIsWitchHeal(false);
    setIsCurseAction(null);
    setIsTroublemakerActive(null);
    setIsFoxSkip(false);
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
    } else if (isPiedPiper) {
      const maxTargets = Math.min(2, validTargets.length);
      setPiedPiperTargets((prev) => {
        if (prev.includes(tId)) {
          return prev.filter((id) => id !== tId);
        }
        if (prev.length < maxTargets) {
          return [...prev, tId];
        }
        if (maxTargets === 1) {
          return [tId];
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
    : isPiedPiper
    ? isPiedPiperValid
    : isDoppelganger || isCultLeader
    ? Boolean(selectedTargetId)
    : isWildChild || isDireWolf || isBigBadWolf || isAuraSeer || isPi || isSpellcaster
    ? Boolean(selectedTargetId)
    : isWolfAccursed
    ? isCurseAction !== null || !accursedVictim
    : isTroublemaker
    ? isTroublemakerActive !== null
    : isFox
    ? isFoxSkip || Boolean(selectedTargetId)
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

        {canAct && (
          <nav aria-label="Chế độ ban đêm" className="segmented-control">
            <button
              type="button"
              aria-pressed={mode === 'sleep'}
              onClick={() => setMode('sleep')}
              className={mode === 'sleep' ? 'segment active' : 'segment'}
            >
              Đêm tối
            </button>
            <button
              type="button"
              aria-pressed={mode === 'action'}
              onClick={() => setMode('action')}
              className={mode === 'action' ? 'segment active' : 'segment'}
            >
              Hành động
            </button>
          </nav>
        )}
      </header>

      {/* 1. Màn hình Đêm Tĩnh Lặng */}
      {mode === 'sleep' && (
        <section className="night-content sleep-content" aria-live="polite">
          <div className="stealth-moon-wrap" aria-hidden="true">
            <div className="stealth-moon-ring" />
            <div className="sleep-icon">☾</div>
          </div>

          <div className="night-calling-card">
            <span className="turn-step-pill">
              {currentTurnInfo?.totalTurns
                ? `LƯỢT ${currentTurnInfo.turnIndex ?? 1} / ${currentTurnInfo.totalTurns}`
                : 'ĐÊM TỐI'}
            </span>
            <h1 className="night-calling-title">
              {currentTurnInfo ? currentTurnInfo.titleVi : 'Đêm tĩnh lặng'}
            </h1>
            <p className="night-calling-hint">
              {currentTurnInfo?.isFake
                ? '✦ Quản trò đang phát thanh điều phối nhịp độ ván đấu.'
                : canAct
                ? 'Đã đến lượt thức dậy của bạn!'
                : 'Nhắm mắt lại và lắng nghe lời dẫn từ quản trò.'}
            </p>
          </div>

          {canAct && (
            <button
              type="button"
              className="jump-to-action-btn"
              onClick={() => setMode('action')}
            >
              ⚡ Vào lượt hành động của bạn ➔
            </button>
          )}

          {/* Nút điều phối chuyển lượt cho chế độ 1 máy offline */}
          {isSingleDevice && (
            <div className="night-offline-advance-bar">
              <button
                type="button"
                className={`offline-advance-btn ${advancePressed ? 'btn-pop' : ''}`}
                onClick={handleAdvanceLocal}
              >
                {currentTurnInfo?.nextTurnTitleVi ? (
                  <span>
                    Chuyển lượt gọi: <b>{currentTurnInfo.nextTurnTitleVi}</b>
                  </span>
                ) : (
                  <span>Kết thúc các lượt đêm ➔ Sang Ban Ngày ☀️</span>
                )}
              </button>
            </div>
          )}
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
          ) : isWolfAccursed ? (
            <div className="wolf-accursed-turn-panel">
              <div className="wolf-accursed-header-badge">
                <span className="wolf-glyph" aria-hidden="true">🐺💉</span>
                <div>
                  <strong>SÓI NGUYỀN (ACCURSED WOLF)</strong>
                  <p>
                    Bạn có 1 lần duy nhất trong cả ván để truyền nọc độc biến nạn nhân của bầy Sói thành Ma Sói thay vì giết chết họ.
                  </p>
                </div>
              </div>

              {accursedVictim ? (
                <div className="victim-card accursed-victim-card">
                  <div className="victim-info">
                    <div className="victim-glyph-wrap" aria-hidden="true">
                      <span className="victim-glyph">🐺</span>
                    </div>
                    <div className="victim-meta">
                      <small>NẠN NHÂN CỦA BẦY SÓI ĐÊM NAY</small>
                      <strong>#{accursedVictim.seatIndex} {accursedVictim.name}</strong>
                    </div>
                  </div>

                  <div className="accursed-decision-actions">
                    <button
                      type="button"
                      className={`curse-button ${isCurseAction === true ? 'is-complete' : ''}`}
                      onClick={() => setIsCurseAction(true)}
                    >
                      <span>{isCurseAction === true ? '✓ ĐÃ CHỌN NGUYỀN NẠN NHÂN' : 'NGUYỀN NẠN NHÂN (HÓA SÓI)'}</span>
                    </button>
                    <button
                      type="button"
                      className={`skip-curse-button ${isCurseAction === false ? 'is-complete' : ''}`}
                      onClick={() => setIsCurseAction(false)}
                    >
                      <span>{isCurseAction === false ? '✓ ĐÃ CHỌN GIỮ LẠI PHÉP' : 'BỎ QUA / GIỮ LẠI PHÉP'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="accursed-empty-note">
                  <p>Bầy Sói đêm nay không cắn ai hoặc nạn nhân không hợp lệ để nguyền.</p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setIsCurseAction(false);
                    }}
                  >
                    Bỏ qua / Giữ lại phép nguyền
                  </button>
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
                    {isCurseAction === true
                      ? 'XÁC NHẬN NGUYỀN NẠN NHÂN'
                      : isCurseAction === false
                      ? 'XÁC NHẬN BỎ QUA LƯỢT NGUYỀN'
                      : 'VUI LÒNG CHỌN NGUYỀN HOẶC BỎ QUA'}
                  </span>
                </button>
              </div>
            </div>
          ) : isTroublemaker ? (
            <div className="troublemaker-turn-panel wolf-accursed-turn-panel">
              <div className="troublemaker-header-badge wolf-accursed-header-badge">
                <span className="troublemaker-glyph wolf-glyph" aria-hidden="true">⚡🎭</span>
                <div>
                  <strong>KẺ PHÁ RỐI (TROUBLEMAKER)</strong>
                  <p>
                    Bạn có 1 lần duy nhất trong cả ván để gây hỗn loạn, khiến cả làng phải biểu quyết treo cổ 2 người trong ngày hôm sau thay vì 1 người!
                  </p>
                </div>
              </div>

              <div className="troublemaker-decision-actions accursed-decision-actions">
                <button
                  type="button"
                  className={`curse-button ${isTroublemakerActive === true ? 'is-complete' : ''}`}
                  onClick={() => setIsTroublemakerActive(true)}
                >
                  <span>{isTroublemakerActive === true ? '✓ ĐÃ CHỌN KÍCH HOẠT TREO CỔ 2 NGƯỜI' : '⚡ KÍCH HOẠT TREO CỔ 2 NGƯỜI'}</span>
                </button>
                <button
                  type="button"
                  className={`skip-curse-button ${isTroublemakerActive === false ? 'is-complete' : ''}`}
                  onClick={() => setIsTroublemakerActive(false)}
                >
                  <span>{isTroublemakerActive === false ? '✓ ĐÃ CHỌN GIỮ LẠI CHO ĐÊM SAU' : 'BỎ QUA / GIỮ LẠI CHO ĐÊM SAU'}</span>
                </button>
              </div>

              <div className="role-actions">
                <button
                  type="button"
                  className={`primary-confirm-btn ${!canConfirm ? 'disabled' : ''}`}
                  disabled={!canConfirm}
                  onClick={handleConfirmAction}
                >
                  <span>
                    {isTroublemakerActive === true
                      ? 'XÁC NHẬN KÍCH HOẠT HỖN LOẠN'
                      : isTroublemakerActive === false
                      ? 'XÁC NHẬN BỎ QUA ĐÊM NAY'
                      : 'VUI LÒNG CHỌN KÍCH HOẠT HOẶC BỎ QUA'}
                  </span>
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

              {/* Thông báo Con Cáo mất phép hoặc nút bỏ qua */}
              {isFox && privateView?.skills?.foxLostPower && (
                <div className="fox-lost-power-banner" style={{ background: '#261b1b', border: '1px solid #7f1d1d', borderRadius: 8, padding: 12, margin: '8px 0', color: '#fca5a5', fontSize: 13 }}>
                  <span>⚠️ Con cáo đã mất khứu giác đánh hơi vĩnh viễn do đã từng đánh hơi cụm an toàn không có Ma Sói.</span>
                </div>
              )}

              {isFox && !privateView?.skills?.foxLostPower && (
                <div style={{ margin: '8px 0' }}>
                  <button
                    type="button"
                    className={`skip-curse-button ${isFoxSkip ? 'is-complete' : ''}`}
                    onClick={() => {
                      setIsFoxSkip((prev) => !prev);
                      if (!isFoxSkip) setSelectedTargetId(null);
                    }}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8 }}
                  >
                    <span>{isFoxSkip ? '✓ ĐÃ CHỌN BỎ QUA ĐÊM NAY' : 'BỎ QUA KHÔNG ĐÁNH HƠI ĐÊM NAY (BẢO TOÀN PHÉP)'}</span>
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
                      : isBigBadWolf
                      ? 'CHỌN 1 MỤC TIÊU CẮN THÊM'
                      : isAuraSeer
                      ? 'CHỌN 1 NGƯỜI ĐỂ QUAN SÁT HÀO QUANG'
                      : isFox
                      ? 'CHỌN 1 NGƯỜI LÀM TÂM ĐIỂM ĐÁNH HƠI'
                      : isPi
                      ? 'CHỌN 1 NGHI PHẠM ĐỂ ĐIỀU TRA'
                      : isSpellcaster
                      ? 'CHỌN 1 NGƯỜI ĐỂ PHÙ PHÉP CÂM LẶNG'
                      : isDoppelganger
                      ? 'CHỌN 1 NGƯỜI LÀM BẢN SAO'
                      : isPiedPiper
                      ? `CHỌN NGƯỜI ĐỂ THÔI MIÊN (TỐI ĐA ${maxPiedPiperTargets})`
                      : isCultLeader
                      ? 'CHỌN 1 TÍN ĐỒ GIA NHẬP GIÁO PHÁI'
                      : 'CHỌN MỤC TIÊU HÀNH ĐỘNG'}
                  </strong>
                  <small>
                    {isHoodlum
                      ? 'Bạn chỉ thắng nếu cả 2 người này đều chết và bạn còn sống'
                      : isWildChild
                      ? 'Nếu người này chết, bạn sẽ biến thành Ma Sói từ đêm hôm sau'
                      : isDireWolf
                      ? 'Nếu người này chết, bạn sẽ chết theo ngay lập tức'
                      : isBigBadWolf
                      ? 'Cắn thêm một nạn nhân độc lập với bầy Sói'
                      : isAuraSeer
                      ? 'Nhận biết người đó là Người thường (Dân/Sói thường) hay có Hào quang Đặc biệt'
                      : isFox
                      ? 'Đánh hơi người này và 2 người ngồi cạnh xem có Ma Sói nào không. Có thể chọn chính mình'
                      : isPi
                      ? 'Điều tra người này và 2 người ngồi cạnh xem có Ma Sói nào không (1 lần duy nhất)'
                      : isSpellcaster
                      ? 'Người này sẽ bị câm lặng hoàn toàn vào ngày mai (không chọn trùng người đêm trước)'
                      : isDoppelganger
                      ? 'Khi người này chết, bạn sẽ nhận vai trò và kỹ năng của họ từ đêm tiếp theo'
                      : isPiedPiper
                      ? 'Chọn những người còn sống chưa bị thôi miên. Bạn thắng khi toàn bộ người sống đều bị thôi miên'
                      : isCultLeader
                      ? 'Chọn người còn sống chưa vào giáo phái. Bạn thắng khi toàn bộ người sống đều vào giáo phái'
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
                    : isBigBadWolf
                    ? selectedTargetId
                      ? `Mục tiêu cắn thêm: ${publicView?.players.find((p) => p.id === selectedTargetId)?.name}`
                      : 'Chọn 1 người để cắn thêm'
                    : isAuraSeer
                    ? selectedTargetId
                      ? `Soi hào quang: ${publicView?.players.find((p) => p.id === selectedTargetId)?.name}`
                      : 'Chọn 1 người để soi hào quang'
                    : isFox
                    ? isFoxSkip
                      ? 'Đã chọn bỏ qua đánh hơi'
                      : selectedTargetId
                      ? `Tâm điểm: ${publicView?.players.find((p) => p.id === selectedTargetId)?.name}`
                      : 'Chọn 1 người làm tâm điểm'
                    : isPi
                    ? selectedTargetId
                      ? `Nghi phạm: ${publicView?.players.find((p) => p.id === selectedTargetId)?.name}`
                      : 'Chọn 1 nghi phạm'
                    : isSpellcaster
                    ? selectedTargetId
                      ? `Phù phép câm: ${publicView?.players.find((p) => p.id === selectedTargetId)?.name}`
                      : 'Chọn 1 người làm câm'
                    : isDoppelganger
                    ? selectedTargetId
                      ? `Bản sao: ${publicView?.players.find((p) => p.id === selectedTargetId)?.name}`
                      : 'Chọn 1 người làm bản sao'
                    : isPiedPiper
                    ? `Đã chọn: ${piedPiperTargets.length}/${maxPiedPiperTargets} người`
                    : isCultLeader
                    ? selectedTargetId
                      ? `Tín đồ mới: ${publicView?.players.find((p) => p.id === selectedTargetId)?.name}`
                      : 'Chọn 1 người kết nạp'
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
                    : isPiedPiper
                    ? piedPiperTargets.includes(tId)
                    : selectedTargetId === tId;
                  const hoodlumIdx = hoodlumTargets.indexOf(tId);
                  const piedPiperIdx = piedPiperTargets.indexOf(tId);

                  return (
                    <button
                      type="button"
                      key={tId}
                      aria-pressed={isSelected}
                      onClick={() => handleSelectTarget(tId)}
                      className={`target-card ${isSelected ? 'selected' : ''} ${isHoodlum && isSelected ? 'hoodlum-selected' : ''} ${isPiedPiper && isSelected ? 'piedpiper-selected' : ''}`}
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
                          : isPiedPiper
                          ? isSelected
                            ? `🎵 #${piedPiperIdx + 1}`
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

              {/* Kết quả Điều tra (Tiên Tri / Pháp Sư / Tiên Tri Hào Quang / Con Cáo / Thám Tử) */}
              {privateView?.investigationResult && (
                <div className="investigation-result-card">
                  <span>KẾT QUẢ ĐIỀU TRA:</span>
                  <strong>
                    {(() => {
                      const inv = privateView.investigationResult;
                      if (inv.result === 'SPECIAL') {
                        return '🔮 HÀO QUANG ĐẶC BIỆT (Tím)';
                      }
                      if (inv.result === 'NORMAL') {
                        return '⚪ HÀO QUANG BÌNH THƯỜNG (Xám)';
                      }
                      if (typeof inv.hasWerewolf === 'boolean') {
                        return inv.hasWerewolf
                          ? '🐺 CÓ MA SÓI TRONG CỤM 3 NGƯỜI!'
                          : '🛡️ AN TOÀN · KHÔNG CÓ MA SÓI TRONG CỤM!';
                      }
                      if (typeof inv.result === 'string') {
                        return inv.result === 'WEREWOLF' ? '🐺 LÀ MA SÓI' : '🛡️ LÀ NGƯỜI LÀNG';
                      }
                      return inv.result ? '🔮 ĐÚNG LÀ TIÊN TRI' : '❌ KHÔNG PHẢI TIÊN TRI';
                    })()}
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
                      : isBigBadWolf
                      ? 'XÁC NHẬN CẮN THÊM'
                      : isAuraSeer
                      ? 'XÁC NHẬN SOI HÀO QUANG'
                      : isFox
                      ? isFoxSkip
                        ? 'XÁC NHẬN BỎ QUA ĐÊM NAY'
                        : 'XÁC NHẬN ĐÁNH HƠI CỤM 3 NGƯỜI'
                      : isPi
                      ? 'XÁC NHẬN ĐIỀU TRA NGHI PHẠM'
                      : isSpellcaster
                      ? 'XÁC NHẬN PHÙ PHÉP CÂM LẶNG'
                      : isDoppelganger
                      ? 'XÁC NHẬN CHỌN BẢN SAO'
                      : isPiedPiper
                      ? isPiedPiperValid
                        ? `XÁC NHẬN THÔI MIÊN (${piedPiperTargets.length}/${maxPiedPiperTargets})`
                        : `CHỌN ĐỦ SỐ NGƯỜI THÔI MIÊN (${piedPiperTargets.length}/${maxPiedPiperTargets})`
                      : isCultLeader
                      ? 'XÁC NHẬN KẾT NẠP TÍN ĐỒ'
                      : 'XÁC NHẬN HÀNH ĐỘNG'}
                  </span>
                </button>

                {!['wild_child', 'dire_wolf', 'hoodlum', 'mason', 'night_wild_child', 'night_dire_wolf', 'night_hoodlum', 'night_mason', 'wolf_accursed', 'night_wolf_accursed', 'troublemaker', 'night_troublemaker', 'spellcaster', 'night_spellcaster', 'aura_seer', 'night_aura_seer', 'pi', 'night_pi', 'doppelganger', 'night_doppelganger', 'pied_piper', 'night_pied_piper', 'cult_leader', 'night_cult_leader'].includes(currentTurnKey) && (
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
