import { useEffect, useRef, useState } from 'react';
import type { ScreenName } from '../../navigation';
import { useGameSession } from '../../adapters/useGameSession';
import { audioController, type AudioStatus } from '../../audio/audioController';
import { ROLES_BY_ID } from '../../engine/roles';
import { getRoleImage } from '../../assets/roles';
import CompactHostControlBar from '../../components/CompactHostControlBar';
import type { PlayerId } from '../../engine/types';
import './night.css';

type NightScreenProps = {
  onNavigate?: (screen: ScreenName) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
};

const INVESTIGATION_TURN_KEYS = new Set([
  'seer',
  'night_seer',
  'apprentice_seer',
  'night_apprentice_seer',
  'aura_seer',
  'night_aura_seer',
  'sorcerer',
  'night_sorcerer',
  'fox',
  'night_fox',
  'pi',
  'night_pi',
]);

export default function NightScreen({ onOpenRules: _onOpenRules }: NightScreenProps) {
  const { state, actions, deviceMode } = useGameSession();

  const [mode, setMode] = useState<'sleep' | 'action'>('sleep');
  const [advancePressed, setAdvancePressed] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<PlayerId | null>(null);
  const [cupidTargets, setCupidTargets] = useState<PlayerId[]>([]);
  const [hoodlumTargets, setHoodlumTargets] = useState<PlayerId[]>([]);
  const [piedPiperTargets, setPiedPiperTargets] = useState<PlayerId[]>([]);
  const [wolfTargets, setWolfTargets] = useState<PlayerId[]>([]);
  const [witchPoisonTargetId, setWitchPoisonTargetId] = useState<PlayerId | null>(null);
  const [isWitchHeal, setIsWitchHeal] = useState(false);
  const [notice, setNotice] = useState('');
  const [sleepNotice, setSleepNotice] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showingResult, setShowingResult] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>(() => audioController.getAudioStatus());

  const privateView = state.privateView;
  const publicView = state.publicView;
  const isSingleDevice = deviceMode === 'SINGLE_DEVICE';
  const isPlayerHost = state.isHost && state.hostMode === 'PLAYER_HOST';

  const myRoleId = privateView?.roleId || 'villager';
  const roleDef = ROLES_BY_ID[myRoleId] ?? ROLES_BY_ID.villager;
  const myRoleImage = getRoleImage(myRoleId);
  const canAct = Boolean(privateView?.canActCurrentTurn && !hasSubmitted);
  const validTargets = privateView?.validTargets ?? [];
  const currentTurnInfo = publicView?.currentTurnInfo;

  const currentTurnKey = privateView?.turnKey || privateView?.roleId || '';
  const isWolfPack = currentTurnKey === 'wolf_pack';
  const isWolfDoubleKill =
    isWolfPack &&
    Boolean(
      (privateView?.skills as { wolfCubDoubleKillNextNight?: boolean } | undefined)
        ?.wolfCubDoubleKillNextNight
    ) &&
    validTargets.length >= 2;
  const isCupid = currentTurnKey === 'cupid' || currentTurnKey === 'night_cupid';
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
  const [avatarError, setAvatarError] = useState(false);
  const submitSleepTimerRef = useRef<number | null>(null);
  const resultTimerRef = useRef<number | null>(null);
  const advancePopTimerRef = useRef<number | null>(null);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const sleepNoticeTimerRef = useRef<number | null>(null);
  const isAdvancingRef = useRef(false);

  useEffect(() => {
    setAvatarError(false);
  }, [myRoleId, privateView?.turnKey, privateView?.playerId]);

  useEffect(() => {
    return audioController.subscribeAudioStatus((status) => {
      setAudioStatus(status);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (submitSleepTimerRef.current !== null) {
        window.clearTimeout(submitSleepTimerRef.current);
      }
      if (resultTimerRef.current !== null) {
        window.clearTimeout(resultTimerRef.current);
      }
      if (advancePopTimerRef.current !== null) {
        window.clearTimeout(advancePopTimerRef.current);
      }
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
      if (sleepNoticeTimerRef.current !== null) {
        window.clearTimeout(sleepNoticeTimerRef.current);
      }
    };
  }, []);

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

  // Đóng thẻ kết quả điều tra khi đổi lượt hoặc đổi người chơi
  useEffect(() => {
    if (resultTimerRef.current !== null) {
      window.clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
    setShowingResult(false);
  }, [privateView?.turnKey, privateView?.playerId]);

  // Luôn reset hasSubmitted và showingResult mỗi khi sang lượt mới (kể cả lượt giả / vai đã chết)
  useEffect(() => {
    setHasSubmitted(false);
    if (resultTimerRef.current !== null) {
      window.clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
    setShowingResult(false);
  }, [currentTurnInfo?.turnIndex, privateView?.turnKey]);

  // Reset trạng thái thao tác khi sang lượt mới / đổi người chơi (hỗ trợ cả Multi-device nhiều lượt trong cùng đêm)
  useEffect(() => {
    isAdvancingRef.current = false;
    if (submitSleepTimerRef.current !== null) {
      window.clearTimeout(submitSleepTimerRef.current);
      submitSleepTimerRef.current = null;
    }
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    if (sleepNoticeTimerRef.current !== null) {
      window.clearTimeout(sleepNoticeTimerRef.current);
      sleepNoticeTimerRef.current = null;
    }
    if (privateView?.canActCurrentTurn) {
      setHasSubmitted(false);
      if (resultTimerRef.current !== null) {
        window.clearTimeout(resultTimerRef.current);
        resultTimerRef.current = null;
      }
      setShowingResult(false);
    }
    setSelectedTargetId(null);
    setCupidTargets([]);
    setHoodlumTargets([]);
    setPiedPiperTargets([]);
    setWolfTargets([]);
    setWitchPoisonTargetId(null);
    setIsWitchHeal(false);
    setIsCurseAction(null);
    setIsTroublemakerActive(null);
    setIsFoxSkip(false);
    setNotice('');
    setSleepNotice('');
    if (isSingleDevice) {
      setMode('sleep');
    }
  }, [
    isSingleDevice,
    currentTurnInfo?.turnIndex,
    privateView?.turnKey,
    privateView?.playerId,
    privateView?.canActCurrentTurn,
  ]);

  // Multi-device: Tự động chuyển giữa màn hình ngủ và màn hình hành động
  // Single-device: Luôn giữ Sleep Overlay cho đến khi người chơi chủ động chạm "Chạm để thực hiện lượt"
  useEffect(() => {
    if (isSingleDevice) {
      if (showingResult) {
        setMode('action');
      } else if (!canAct) {
        setMode('sleep');
      }
      return;
    }

    if (canAct || showingResult) {
      if (submitSleepTimerRef.current !== null) {
        window.clearTimeout(submitSleepTimerRef.current);
        submitSleepTimerRef.current = null;
      }
      setMode('action');
    } else {
      setMode('sleep');
    }
  }, [isSingleDevice, canAct, showingResult]);

  // Single-device Smart Fake Delay (5-14s): Tự động chuyển lượt khi ở Sleep Overlay
  useEffect(() => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }

    if (!isSingleDevice || mode !== 'sleep' || publicView?.phase !== 'NIGHT') {
      return;
    }

    const introLeadMs = currentTurnInfo?.turnIndex === 1 && !hasSubmitted ? 4500 : 0;
    const delayMs = hasSubmitted
      ? 1400
      : introLeadMs + 5000 + Math.floor(Math.random() * 9001);

    autoAdvanceTimerRef.current = window.setTimeout(() => {
      autoAdvanceTimerRef.current = null;
      if (isAdvancingRef.current) return;
      isAdvancingRef.current = true;
      actions.advanceLocalTurn();
    }, delayMs);

    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, [
    isSingleDevice,
    mode,
    publicView?.phase,
    currentTurnInfo?.turnIndex,
    hasSubmitted,
    actions,
  ]);

  useEffect(() => {
    document.body.classList.toggle('night-sleep-active', mode === 'sleep');
    return () => document.body.classList.remove('night-sleep-active');
  }, [mode]);

  const maxPiedPiperTargets = Math.min(2, validTargets.length);
  const isPiedPiperValid = piedPiperTargets.length === maxPiedPiperTargets && maxPiedPiperTargets > 0;

  const playMultiDeviceConfirmSfx = () => {
    if (isSingleDevice) return;
    const ctrl = audioController as unknown as {
      playConfirmSfx?: () => void;
      playTransitionChime?: () => void;
    };
    if (typeof ctrl.playConfirmSfx === 'function') {
      ctrl.playConfirmSfx();
    } else {
      ctrl.playTransitionChime?.();
    }
  };

  const handleConfirmAction = async () => {
    if (!privateView) return;

    try {
      if (isWitch) {
        await actions.sendNightAction('witch', {
          heal: isWitchHeal,
          healTargetId: isWitchHeal ? (victimPlayerId ?? null) : null,
          poisonTargetId: witchPoisonTargetId,
        });
      } else if (isCupid) {
        if (cupidTargets.length !== 2 || cupidTargets[0] === cupidTargets[1]) {
          setNotice('Vui lòng chọn đủ 2 người chơi khác nhau để ghép đôi.');
          return;
        }
        await actions.sendNightAction('cupid', {
          target1: cupidTargets[0],
          target2: cupidTargets[1],
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
        if (privateView?.skills?.foxLostPower || isFoxSkip) {
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
      } else if (isWolfPack) {
        if (isWolfDoubleKill) {
          if (wolfTargets.length !== 2 || wolfTargets[0] === wolfTargets[1]) {
            setNotice('Vui lòng chọn đủ 2 nạn nhân khác nhau (Sói Con đã hy sinh).');
            return;
          }
          await actions.sendNightAction('wolf_pack', {
            targetIds: wolfTargets,
          });
        } else {
          await actions.sendNightAction('wolf_pack', {
            targetId: selectedTargetId,
            targetIds: selectedTargetId ? [selectedTargetId] : [],
            isSkip: selectedTargetId === null,
          });
        }
      } else {
        await actions.sendNightAction(privateView.roleId, {
          targetId: selectedTargetId,
          isSkip: selectedTargetId === null,
        });
      }

      setHasSubmitted(true);
      playMultiDeviceConfirmSfx();
      const successMsg = isMason
        ? '✓ Đã nhận diện anh em Hội Tam Điểm.'
        : isCupid
        ? '✓ Đã bắn mũi tên ghép đôi hai người chơi.'
        : isWildChild
        ? '✓ Đã chọn xong thần tượng.'
        : isDireWolf
        ? '✓ Đã chọn bạn đồng hành.'
        : isHoodlum
        ? '✓ Đã chọn 2 kẻ thù cần loại bỏ.'
        : isWolfAccursed
        ? isCurseAction
          ? '✓ Đã nguyền nạn nhân thành Ma Sói.'
          : '✓ Đã bỏ qua lượt nguyền, giữ lại phép.'
        : isBigBadWolf
        ? '✓ Đã chọn mục tiêu cắn thêm.'
        : isAuraSeer
        ? '✓ Đã soi hào quang người chơi.'
        : isFox
        ? isFoxSkip
          ? '✓ Cáo bỏ qua lượt đánh hơi đêm nay.'
          : '✓ Cáo đã đánh hơi nhóm 3 người.'
        : isPi
        ? '✓ Thám tử đã điều tra nhóm tình nghi.'
        : isSpellcaster
        ? '✓ Đã phù phép câm lặng mục tiêu.'
        : isTroublemaker
        ? isTroublemakerActive
          ? '✓ Đã kích hoạt: hôm nay làng sẽ treo cổ 2 người!'
          : '✓ Đã bỏ qua, giữ lại quyền năng cho đêm sau.'
        : isDoppelganger
        ? '✓ Đã chọn người để sao chép vai.'
        : isPiedPiper
        ? '✓ Đã cất tiếng sáo thôi miên.'
        : isCultLeader
        ? '✓ Đã kết nạp tín đồ mới.'
        : '✓ Đã xác nhận hành động đêm.';
      setNotice(successMsg);
      const shouldShowResult =
        INVESTIGATION_TURN_KEYS.has(currentTurnKey) &&
        !(isFox && isFoxSkip) &&
        Boolean(selectedTargetId);

      if (shouldShowResult) {
        setShowingResult(true);
        if (resultTimerRef.current !== null) {
          window.clearTimeout(resultTimerRef.current);
        }
        resultTimerRef.current = window.setTimeout(() => {
          resultTimerRef.current = null;
          setShowingResult(false);
          setMode('sleep');
          setNotice('');
        }, 5000);
      } else {
        if (submitSleepTimerRef.current !== null) {
          window.clearTimeout(submitSleepTimerRef.current);
        }
        submitSleepTimerRef.current = window.setTimeout(() => {
          submitSleepTimerRef.current = null;
          setMode('sleep');
          setNotice('');
        }, 1000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi gửi hành động';
      setNotice(msg);
    }
  };

  const handleDismissResult = () => {
    if (resultTimerRef.current !== null) {
      window.clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
    setShowingResult(false);
    setMode('sleep');
    setNotice('');
  };

  const handleTapToAct = () => {
    if (!isSingleDevice) {
      setMode('action');
      return;
    }

    if (canAct) {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
      setSleepNotice('');
      setMode('action');
    } else {
      if (sleepNoticeTimerRef.current !== null) {
        window.clearTimeout(sleepNoticeTimerRef.current);
      }
      setSleepNotice('Chưa đến lượt của bạn');
      sleepNoticeTimerRef.current = window.setTimeout(() => {
        sleepNoticeTimerRef.current = null;
        setSleepNotice('');
      }, 2000);
    }
  };

  const handleAdvanceLocal = () => {
    if (isAdvancingRef.current) return;
    isAdvancingRef.current = true;

    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    if (submitSleepTimerRef.current !== null) {
      window.clearTimeout(submitSleepTimerRef.current);
      submitSleepTimerRef.current = null;
    }
    if (resultTimerRef.current !== null) {
      window.clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
    if (advancePopTimerRef.current !== null) {
      window.clearTimeout(advancePopTimerRef.current);
    }
    setAdvancePressed(true);
    advancePopTimerRef.current = window.setTimeout(() => {
      advancePopTimerRef.current = null;
      setAdvancePressed(false);
    }, 250);
    if (!isSingleDevice) {
      try {
        navigator.vibrate?.(40);
      } catch {
        // ignore
      }
    }
    actions.advanceLocalTurn();
    setAvatarError(false);
    setHasSubmitted(false);
    setShowingResult(false);
    setSelectedTargetId(null);
    setCupidTargets([]);
    setHoodlumTargets([]);
    setPiedPiperTargets([]);
    setWolfTargets([]);
    setWitchPoisonTargetId(null);
    setIsWitchHeal(false);
    setIsCurseAction(null);
    setIsTroublemakerActive(null);
    setIsFoxSkip(false);
    setNotice('');
    setSleepNotice('');
  };

  const handleSelectTarget = (tId: PlayerId) => {
    if (isWolfDoubleKill) {
      setWolfTargets((prev) => {
        if (prev.includes(tId)) {
          return prev.filter((id) => id !== tId);
        }
        if (prev.length < 2) {
          return [...prev, tId];
        }
        return [prev[0], tId];
      });
    } else if (isCupid) {
      setCupidTargets((prev) => {
        if (prev.includes(tId)) {
          return prev.filter((id) => id !== tId);
        }
        if (prev.length < 2) {
          return [...prev, tId];
        }
        return [prev[0], tId];
      });
    } else if (isHoodlum) {
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

  const isCupidValid = cupidTargets.length === 2 && cupidTargets[0] !== cupidTargets[1];
  const isHoodlumValid = hoodlumTargets.length === 2 && hoodlumTargets[0] !== hoodlumTargets[1];
  const isWolfDoubleValid = wolfTargets.length === 2 && wolfTargets[0] !== wolfTargets[1];
  const canConfirm = isWolfDoubleKill
    ? isWolfDoubleValid
    : isCupid
    ? isCupidValid
    : isHoodlum
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
    ? Boolean(privateView?.skills?.foxLostPower) || isFoxSkip || Boolean(selectedTargetId)
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

        {!isSingleDevice && canAct && (
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
              {isSingleDevice
                ? 'Hãy nhắm mắt và lắng nghe lời quản trò.'
                : currentTurnInfo?.isFake
                ? '✦ Đêm vẫn đang tiếp diễn. Hãy giữ im lặng.'
                : canAct
                ? 'Đến lượt bạn thức giấc!'
                : 'Hãy nhắm mắt và lắng nghe lời quản trò.'}
            </p>
          </div>

          {isSingleDevice ? (
            <>
              {audioStatus !== 'unlocked' && (
                <button
                  type="button"
                  className="sleep-audio-unlock-btn"
                  onClick={() => {
                    void audioController.unlockAudio();
                  }}
                >
                  🔊 Bật loa Quản trò
                </button>
              )}

              <button
                type="button"
                className="jump-to-action-btn neutral-tap-btn"
                onClick={handleTapToAct}
              >
                Chạm để thực hiện lượt
              </button>

              {sleepNotice && (
                <p className="sleep-turn-notice" role="status">
                  {sleepNotice}
                </p>
              )}

              <div className="night-offline-advance-bar">
                <button
                  type="button"
                  disabled={advancePressed}
                  className={`offline-quick-skip-btn ${advancePressed ? 'btn-pop' : ''}`}
                  onClick={handleAdvanceLocal}
                >
                  Qua lượt nhanh
                </button>
              </div>
            </>
          ) : (
            canAct && (
              <button
                type="button"
                className="jump-to-action-btn"
                onClick={() => setMode('action')}
              >
                ⚡ Thức giấc để hành động ➔
              </button>
            )
          )}
        </section>
      )}

      {/* 3. Lượt Hành Động Bí Mật Trong Đêm */}
      {mode === 'action' && (canAct || showingResult) && (
        <section className="night-content role-content" aria-live="polite">
          <div className="role-heading">
            <div className="role-caller">
              {myRoleImage && !avatarError ? (
                <img
                  src={myRoleImage}
                  alt=""
                  aria-hidden="true"
                  className="night-role-avatar"
                  decoding="async"
                  draggable={false}
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <span className="role-glyph" aria-hidden="true">✦</span>
              )}
              <div>
                <h2>{isWolfPack ? 'BẦY MA SÓI THỨC GIẤC' : `${roleDef.nameVi} THỨC GIẤC`}</h2>
                <small>HÃY HÀNH ĐỘNG TRONG YÊN LẶNG</small>
              </div>
            </div>
          </div>

          {showingResult ? (
            <div className="investigation-result-panel">
              <div className="investigation-result-card">
                <span>KẾT QUẢ ĐIỀU TRA:</span>
                <strong>
                  {(() => {
                    const inv = privateView?.investigationResult;
                    if (!inv) {
                      return 'Đang nhận kết quả điều tra...';
                    }
                    if (inv.result === 'SPECIAL') {
                      return '🔮 CÓ HÀO QUANG ĐẶC BIỆT';
                    }
                    if (inv.result === 'NORMAL') {
                      return '⚪ HÀO QUANG BÌNH THƯỜNG';
                    }
                    if (typeof inv.hasWerewolf === 'boolean') {
                      return inv.hasWerewolf
                        ? '🐺 CÓ MA SÓI TRONG NHÓM 3 NGƯỜI!'
                        : '🛡️ AN TOÀN · KHÔNG CÓ MA SÓI!';
                    }
                    if (typeof inv.result === 'string') {
                      if (inv.result === 'WEREWOLF') return '🐺 LÀ MA SÓI';
                      if (inv.result === 'VILLAGER') return '🛡️ LÀ DÂN LÀNG';
                      const exactRole = ROLES_BY_ID[inv.result];
                      return exactRole ? `🔮 VAI TRÒ: ${exactRole.nameVi}` : `🔮 ${inv.result}`;
                    }
                    return inv.result ? '🔮 ĐÚNG LÀ TIÊN TRI' : '❌ KHÔNG PHẢI TIÊN TRI';
                  })()}
                </strong>
              </div>
              <div className="role-actions">
                <button
                  type="button"
                  className="primary-confirm-btn"
                  onClick={handleDismissResult}
                >
                  <span>Đã nhớ · Úp màn hình</span>
                </button>
              </div>
            </div>
          ) : isMason ? (
            <div className="mason-turn-panel">
              <div className="mason-header-badge">
                <span className="mason-symbol" aria-hidden="true">🏛️</span>
                <div>
                  <strong>HỘI TAM ĐIỂM</strong>
                  <p>
                    Tất cả thành viên Hội Tam Điểm đều thuộc phe Dân làng và biết mặt nhau ngay từ Đêm 1.
                  </p>
                </div>
              </div>

              <div className="mason-partners-container">
                <div className="mason-list-header">
                  <span className="mason-dot" aria-hidden="true" />
                  <span>DANH SÁCH ANH EM TRONG HỘI</span>
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
                          <span className="mason-partner-badge-green">ĐỒNG MINH TAM ĐIỂM</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mason-single-note">
                    <span>Bạn là thành viên duy nhất trong hội, không có ai khác.</span>
                  </div>
                )}
              </div>

              <div className="role-actions">
                <button
                  type="button"
                  className="primary-confirm-btn mason-confirm-btn"
                  onClick={handleConfirmAction}
                >
                  <span>✓ ĐÃ BIẾT MẶT ANH EM</span>
                </button>
              </div>
            </div>
          ) : isWolfAccursed ? (
            <div className="wolf-accursed-turn-panel">
              <div className="wolf-accursed-header-badge">
                <span className="wolf-glyph" aria-hidden="true">🐺💉</span>
                <div>
                  <strong>SÓI NGUYỀN</strong>
                  <p>
                    Bạn có 1 cơ hội duy nhất trong cả ván để biến nạn nhân của bầy Sói thành Ma Sói thay vì để họ chết.
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
                      <span>{isCurseAction === true ? '✓ ĐÃ CHỌN NGUYỀN (HÓA SÓI)' : 'NGUYỀN NẠN NHÂN (HÓA SÓI)'}</span>
                    </button>
                    <button
                      type="button"
                      className={`skip-curse-button ${isCurseAction === false ? 'is-complete' : ''}`}
                      onClick={() => setIsCurseAction(false)}
                    >
                      <span>{isCurseAction === false ? '✓ GIỮ LẠI PHÉP CHO ĐÊM SAU' : 'BỎ QUA (GIỮ LẠI PHÉP)'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="accursed-empty-note">
                  <p>Bầy Sói đêm nay không cắn ai hoặc nạn nhân không thể bị nguyền.</p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setIsCurseAction(false);
                    }}
                  >
                    Bỏ qua, giữ lại phép
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
                      ? 'XÁC NHẬN NGUYỀN HÓA SÓI'
                      : isCurseAction === false
                      ? 'XÁC NHẬN BỎ QUA ĐÊM NAY'
                      : 'CHỌN NGUYỀN HOẶC BỎ QUA'}
                  </span>
                </button>
              </div>
            </div>
          ) : isTroublemaker ? (
            <div className="troublemaker-turn-panel wolf-accursed-turn-panel">
              <div className="troublemaker-header-badge wolf-accursed-header-badge">
                <span className="troublemaker-glyph wolf-glyph" aria-hidden="true">⚡🎭</span>
                <div>
                  <strong>KẺ PHÁ RỐI</strong>
                  <p>
                    Bạn có 1 lần duy nhất trong cả ván để khuấy đảo, khiến cả làng phải biểu quyết treo cổ 2 người vào ngày hôm sau!
                  </p>
                </div>
              </div>

              <div className="troublemaker-decision-actions accursed-decision-actions">
                <button
                  type="button"
                  className={`curse-button ${isTroublemakerActive === true ? 'is-complete' : ''}`}
                  onClick={() => setIsTroublemakerActive(true)}
                >
                  <span>{isTroublemakerActive === true ? '✓ ĐÃ CHỌN TREO CỔ 2 NGƯỜI' : '⚡ GÂY RỐI (TREO CỔ 2 NGƯỜI)'}</span>
                </button>
                <button
                  type="button"
                  className={`skip-curse-button ${isTroublemakerActive === false ? 'is-complete' : ''}`}
                  onClick={() => setIsTroublemakerActive(false)}
                >
                  <span>{isTroublemakerActive === false ? '✓ GIỮ LẠI CHO ĐÊM SAU' : 'BỎ QUA (GIỮ CHO ĐÊM SAU)'}</span>
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
                      ? 'XÁC NHẬN GÂY RỐI'
                      : isTroublemakerActive === false
                      ? 'XÁC NHẬN BỎ QUA ĐÊM NAY'
                      : 'CHỌN GÂY RỐI HOẶC BỎ QUA'}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Nạn nhân Phù Thủy / Bình thuốc cứu */}
              {isWitch && !privateView?.skills?.witchHealUsed && (
                <div className="victim-card">
                  <div className="victim-info">
                    <div className="victim-glyph-wrap" aria-hidden="true">
                      <span className="victim-glyph">{victimPlayer ? '☠' : '🧪'}</span>
                    </div>
                    <div className="victim-meta">
                      {victimPlayer ? (
                        <>
                          <small>NẠN NHÂN BỊ SÓI CẮN ĐÊM NAY</small>
                          <strong>#{victimPlayer.seatIndex} {victimPlayer.name}</strong>
                        </>
                      ) : (
                        <>
                          <small>BÌNH THUỐC CỨU (CỨU MÙ)</small>
                          <strong>Không hiển thị nạn nhân theo luật phòng</strong>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`hold-button heal-button ${isWitchHeal ? 'is-complete' : ''}`}
                    onClick={() => setIsWitchHeal((prev) => !prev)}
                  >
                    <span>
                      {victimPlayer
                        ? isWitchHeal
                          ? '✓ DÙNG BÌNH CỨU'
                          : 'DÙNG BÌNH CỨU NGƯỜI'
                        : isWitchHeal
                        ? '✓ ĐÃ CHỌN CỨU MÙ'
                        : 'DÙNG BÌNH CỨU NGƯỜI (CỨU MÙ)'}
                    </span>
                  </button>
                </div>
              )}

              {isWitch && privateView?.skills?.witchHealUsed && (
                <div className="witch-used-note" role="status">
                  <span>🧪 Bình thuốc cứu đã được sử dụng trong ván này.</span>
                </div>
              )}

              {/* Thông báo Con Cáo mất phép hoặc nút bỏ qua */}
              {isFox && privateView?.skills?.foxLostPower && (
                <div className="fox-lost-power-banner" style={{ background: '#261b1b', border: '1px solid #7f1d1d', borderRadius: 8, padding: 12, margin: '8px 0', color: '#fca5a5', fontSize: 13 }}>
                  <span>⚠️ Cáo đã mất khứu giác do từng đánh hơi trúng nhóm an toàn (không có Ma Sói).</span>
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
                    <span>{isFoxSkip ? '✓ ĐÊM NAY KHÔNG ĐÁNH HƠI' : 'BỎ QUA ĐÊM NAY (GIỮ NGUYÊN PHÉP)'}</span>
                  </button>
                </div>
              )}

              {/* Chọn mục tiêu hợp lệ (ẩn với Phù thủy và Con Cáo đã mất phép) */}
              {!isWitch && !(isFox && privateView?.skills?.foxLostPower) && (
                <>
                  <div className="target-heading">
                    <div>
                      <strong>
                        {isWolfDoubleKill
                          ? 'CHỌN 2 NẠN NHÂN ĐỂ BẦY SÓI CẮN (SÓI CON ĐÃ HY SINH)'
                          : isWolfPack
                          ? 'CHỌN 1 NẠN NHÂN ĐỂ BẦY SÓI CẮN'
                          : isCupid
                          ? 'CHỌN 2 NGƯỜI ĐỂ GHÉP ĐÔI'
                          : isHoodlum
                          ? 'CHỌN 2 KẺ THÙ CẦN LOẠI BỎ'
                      : isWildChild
                      ? 'CHỌN 1 NGƯỜI LÀM THẦN TƯỢNG'
                      : isDireWolf
                      ? 'CHỌN 1 BẠN ĐỒNG HÀNH'
                      : isBigBadWolf
                      ? 'CHỌN 1 MỤC TIÊU CẮN THÊM'
                      : isAuraSeer
                      ? 'CHỌN 1 NGƯỜI ĐỂ SOI HÀO QUANG'
                      : isFox
                      ? 'CHỌN 1 NGƯỜI ĐỂ ĐÁNH HƠI'
                      : isPi
                      ? 'CHỌN 1 NGƯỜI ĐỂ THÁM TỬ ĐIỀU TRA'
                      : isSpellcaster
                      ? 'CHỌN 1 NGƯỜI ĐỂ CẤM NÓI'
                      : isDoppelganger
                      ? 'CHỌN 1 NGƯỜI ĐỂ SAO CHÉP VAI'
                      : isPiedPiper
                      ? `CHỌN NGƯỜI ĐỂ THÔI MIÊN (TỐI ĐA ${maxPiedPiperTargets})`
                      : isCultLeader
                      ? 'CHỌN 1 NGƯỜI VÀO GIÁO PHÁI'
                      : 'CHỌN MỤC TIÊU HÀNH ĐỘNG'}
                  </strong>
                  <small>
                    {isWolfDoubleKill
                      ? 'Sói Con đã chết đêm/ngày trước: đêm nay bầy Sói được chọn 2 nạn nhân'
                      : isWolfPack
                      ? 'Bầy Sói thống nhất chọn 1 nạn nhân để cắn đêm nay'
                      : isCupid
                      ? 'Hai người này sẽ trở thành Cặp đôi (nếu một người chết, người kia cũng chết theo)'
                      : isHoodlum
                      ? 'Bạn thắng khi cả 2 người này đều chết và bạn còn sống'
                      : isWildChild
                      ? 'Nếu người này chết, bạn sẽ hóa Ma Sói từ đêm hôm sau'
                      : isDireWolf
                      ? 'Nếu người này chết, bạn sẽ chết theo ngay lập tức'
                      : isBigBadWolf
                      ? 'Cắn thêm một người, độc lập với bầy Sói'
                      : isAuraSeer
                      ? 'Xem người đó là thường dân / Sói thường hay mang Hào quang đặc biệt'
                      : isFox
                      ? 'Đánh hơi người này và 2 người bên cạnh xem có Sói không (có thể chọn chính mình)'
                      : isPi
                      ? 'Điều tra người này và 2 người bên cạnh xem có Sói không (chỉ dùng 1 lần)'
                      : isSpellcaster
                      ? 'Người này sẽ bị câm lặng hoàn toàn vào ngày mai (không chọn người đêm trước)'
                      : isDoppelganger
                      ? 'Khi người này chết, bạn sẽ nhận vai trò và kỹ năng của họ'
                      : isPiedPiper
                      ? 'Thôi miên người còn sống. Bạn thắng khi tất cả người sống đều bị thôi miên'
                      : isCultLeader
                      ? 'Kết nạp người còn sống. Bạn thắng khi tất cả người sống đều vào giáo phái'
                      : 'Chọn người chơi theo luật'}
                  </small>
                </div>
                <span className="target-hint">
                  {isWolfDoubleKill
                    ? wolfTargets.length === 0
                      ? 'Chọn đủ 2 nạn nhân (0/2)'
                      : wolfTargets.length === 1
                      ? `Đã chọn 1/2: #${publicView?.players.find((p) => p.id === wolfTargets[0])?.seatIndex} ${publicView?.players.find((p) => p.id === wolfTargets[0])?.name}`
                      : `Nạn nhân: #${publicView?.players.find((p) => p.id === wolfTargets[0])?.seatIndex} ${publicView?.players.find((p) => p.id === wolfTargets[0])?.name} & #${publicView?.players.find((p) => p.id === wolfTargets[1])?.seatIndex} ${publicView?.players.find((p) => p.id === wolfTargets[1])?.name}`
                    : isCupid
                    ? cupidTargets.length === 0
                      ? 'Chọn đúng 2 người khác nhau (0/2)'
                      : cupidTargets.length === 1
                      ? `Đã chọn 1/2: #${publicView?.players.find((p) => p.id === cupidTargets[0])?.seatIndex} ${publicView?.players.find((p) => p.id === cupidTargets[0])?.name}`
                      : `Cặp đôi: #${publicView?.players.find((p) => p.id === cupidTargets[0])?.seatIndex} ${publicView?.players.find((p) => p.id === cupidTargets[0])?.name} & #${publicView?.players.find((p) => p.id === cupidTargets[1])?.seatIndex} ${publicView?.players.find((p) => p.id === cupidTargets[1])?.name}`
                    : isHoodlum
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
                      ? 'Đã bỏ qua đánh hơi'
                      : selectedTargetId
                      ? `Tâm điểm: ${publicView?.players.find((p) => p.id === selectedTargetId)?.name}`
                      : 'Chọn 1 người làm tâm điểm'
                    : isPi
                    ? selectedTargetId
                      ? `Nghi phạm: ${publicView?.players.find((p) => p.id === selectedTargetId)?.name}`
                      : 'Chọn 1 người điều tra'
                    : isSpellcaster
                    ? selectedTargetId
                      ? `Cấm nói: ${publicView?.players.find((p) => p.id === selectedTargetId)?.name}`
                      : 'Chọn 1 người để cấm nói'
                    : isDoppelganger
                    ? selectedTargetId
                      ? `Sao chép vai: ${publicView?.players.find((p) => p.id === selectedTargetId)?.name}`
                      : 'Chọn 1 người để sao chép'
                    : isPiedPiper
                    ? `Đã chọn: ${piedPiperTargets.length}/${maxPiedPiperTargets} người`
                    : isCultLeader
                    ? selectedTargetId
                      ? `Tín đồ mới: ${publicView?.players.find((p) => p.id === selectedTargetId)?.name}`
                      : 'Chọn 1 người kết nạp'
                    : selectedTargetId
                    ? `Mục tiêu: ${publicView?.players.find((p) => p.id === selectedTargetId)?.name}`
                    : 'Chưa chọn ai'}
                </span>
              </div>

              {isSingleDevice ? (
                <div className="circular-seat-map" role="group" aria-label="Sơ đồ ghế chọn mục tiêu">
                  <div className="circular-seat-center" aria-hidden="true">
                    <span>{isWolfPack ? '🐺' : '🎯'}</span>
                    <small>{validTargets.length} mục tiêu</small>
                  </div>
                  {validTargets.map((tId, idx) => {
                    const targetP = publicView?.players.find((p) => p.id === tId);
                    if (!targetP) return null;
                    const isSelected = isWolfDoubleKill
                      ? wolfTargets.includes(tId)
                      : isCupid
                      ? cupidTargets.includes(tId)
                      : isHoodlum
                      ? hoodlumTargets.includes(tId)
                      : isPiedPiper
                      ? piedPiperTargets.includes(tId)
                      : selectedTargetId === tId;
                    const angle = (idx / Math.max(1, validTargets.length)) * 2 * Math.PI - Math.PI / 2;
                    const radiusPct = validTargets.length > 10 ? 40 : 37;
                    const leftPct = 50 + Math.cos(angle) * radiusPct;
                    const topPct = 50 + Math.sin(angle) * radiusPct;
                    return (
                      <button
                        type="button"
                        key={tId}
                        aria-pressed={isSelected}
                        aria-label={`Ghế #${targetP.seatIndex} ${targetP.name}`}
                        onClick={() => handleSelectTarget(tId)}
                        style={{ left: `${leftPct.toFixed(2)}%`, top: `${topPct.toFixed(2)}%` }}
                        className={`circular-seat-node ${isSelected ? 'selected' : ''}`}
                      >
                        <span className="circular-seat-num">#{String(targetP.seatIndex).padStart(2, '0')}</span>
                        <span className="circular-seat-name">{targetP.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="target-grid">
                  {validTargets.map((tId) => {
                    const targetP = publicView?.players.find((p) => p.id === tId);
                    if (!targetP) return null;
                    const isSelected = isWolfDoubleKill
                      ? wolfTargets.includes(tId)
                      : isCupid
                      ? cupidTargets.includes(tId)
                      : isHoodlum
                      ? hoodlumTargets.includes(tId)
                      : isPiedPiper
                      ? piedPiperTargets.includes(tId)
                      : selectedTargetId === tId;
                    const cupidIdx = cupidTargets.indexOf(tId);
                    const hoodlumIdx = hoodlumTargets.indexOf(tId);
                    const piedPiperIdx = piedPiperTargets.indexOf(tId);

                    return (
                      <button
                        type="button"
                        key={tId}
                        aria-pressed={isSelected}
                        onClick={() => handleSelectTarget(tId)}
                        className={`target-card ${isSelected ? 'selected' : ''} ${(isCupid || isHoodlum) && isSelected ? 'hoodlum-selected' : ''} ${isPiedPiper && isSelected ? 'piedpiper-selected' : ''}`}
                      >
                        <div className="target-meta">
                          <span className="target-num">#{String(targetP.seatIndex).padStart(2, '0')}</span>
                          <span className="target-name">{targetP.name}</span>
                        </div>
                        <span className="target-crosshair" aria-hidden="true">
                          {isCupid
                            ? isSelected
                              ? `💘 #${cupidIdx + 1}`
                              : '○'
                            : isHoodlum
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
              )}
                </>
              )}

              {/* Bình thuốc độc cho Phù Thủy */}
              {isWitch && !privateView?.skills?.witchPoisonUsed && (
                <div className="witch-poison-section">
                  <strong>BÌNH THUỐC ĐỘC</strong>
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

              {isWitch && privateView?.skills?.witchPoisonUsed && (
                <div className="witch-used-note" role="status">
                  <span>☠️ Bình thuốc độc đã được sử dụng trong ván này.</span>
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
                        return '🔮 CÓ HÀO QUANG ĐẶC BIỆT';
                      }
                      if (inv.result === 'NORMAL') {
                        return '⚪ HÀO QUANG BÌNH THƯỜNG';
                      }
                      if (typeof inv.hasWerewolf === 'boolean') {
                        return inv.hasWerewolf
                          ? '🐺 CÓ MA SÓI TRONG NHÓM 3 NGƯỜI!'
                          : '🛡️ AN TOÀN · KHÔNG CÓ MA SÓI!';
                      }
                      if (typeof inv.result === 'string') {
                        if (inv.result === 'WEREWOLF') return '🐺 LÀ MA SÓI';
                        if (inv.result === 'VILLAGER') return '🛡️ LÀ DÂN LÀNG';
                        const exactRole = ROLES_BY_ID[inv.result];
                        return exactRole ? `🔮 VAI TRÒ: ${exactRole.nameVi}` : `🔮 ${inv.result}`;
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
                    {isWolfDoubleKill
                      ? isWolfDoubleValid
                        ? 'XÁC NHẬN CẮN 2 NẠN NHÂN'
                        : `CHỌN ĐỦ 2 NẠN NHÂN (${wolfTargets.length}/2)`
                      : isCupid
                      ? isCupidValid
                        ? 'XÁC NHẬN GHÉP ĐÔI'
                        : `CHỌN ĐỦ 2 NGƯỜI (${cupidTargets.length}/2)`
                      : isHoodlum
                      ? isHoodlumValid
                        ? 'XÁC NHẬN 2 KẺ THÙ'
                        : `CHỌN ĐỦ 2 KẺ THÙ (${hoodlumTargets.length}/2)`
                      : isWildChild
                      ? 'XÁC NHẬN CHỌN THẦN TƯỢNG'
                      : isDireWolf
                      ? 'XÁC NHẬN BẠN ĐỒNG HÀNH'
                      : isBigBadWolf
                      ? 'XÁC NHẬN CẮN THÊM'
                      : isAuraSeer
                      ? 'XÁC NHẬN SOI HÀO QUANG'
                      : isFox
                      ? privateView?.skills?.foxLostPower || isFoxSkip
                        ? 'XÁC NHẬN BỎ QUA ĐÊM NAY'
                        : 'XÁC NHẬN ĐÁNH HƠI'
                      : isPi
                      ? 'XÁC NHẬN ĐIỀU TRA'
                      : isSpellcaster
                      ? 'XÁC NHẬN CẤM NÓI'
                      : isDoppelganger
                      ? 'XÁC NHẬN SAO CHÉP VAI'
                      : isPiedPiper
                      ? isPiedPiperValid
                        ? `XÁC NHẬN THÔI MIÊN (${piedPiperTargets.length}/${maxPiedPiperTargets})`
                        : `CHỌN ĐỦ NGƯỜI THÔI MIÊN (${piedPiperTargets.length}/${maxPiedPiperTargets})`
                      : isCultLeader
                      ? 'XÁC NHẬN KẾT NẠP TÍN ĐỒ'
                      : 'XÁC NHẬN HÀNH ĐỘNG'}
                  </span>
                </button>

                {!['cupid', 'night_cupid', 'wild_child', 'dire_wolf', 'hoodlum', 'mason', 'night_wild_child', 'night_dire_wolf', 'night_hoodlum', 'night_mason', 'wolf_accursed', 'night_wolf_accursed', 'troublemaker', 'night_troublemaker', 'spellcaster', 'night_spellcaster', 'aura_seer', 'night_aura_seer', 'pi', 'night_pi', 'doppelganger', 'night_doppelganger', 'pied_piper', 'night_pied_piper', 'cult_leader', 'night_cult_leader'].includes(currentTurnKey) && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={async () => {
                      setSelectedTargetId(null);
                      setWolfTargets([]);
                      setIsWitchHeal(false);
                      setWitchPoisonTargetId(null);
                      if (isWolfPack) {
                        await actions.sendNightAction('werewolf', {
                          targetId: null,
                          targetIds: [],
                          isSkip: true,
                        });
                        setHasSubmitted(true);
      playMultiDeviceConfirmSfx();
                        setNotice('✓ Bầy Sói đã bỏ qua lượt cắn đêm nay.');
                        if (submitSleepTimerRef.current !== null) {
                          window.clearTimeout(submitSleepTimerRef.current);
                        }
                        submitSleepTimerRef.current = window.setTimeout(() => {
                          submitSleepTimerRef.current = null;
                          setMode('sleep');
                          setNotice('');
                        }, 1000);
                        return;
                      }
                      void handleConfirmAction();
                    }}
                  >
                    Bỏ qua đêm nay
                  </button>
                )}
              </div>
            </>
          )}

          {notice && <p className="screen-notice" role="status">{notice}</p>}
        </section>
      )}

      <footer className="screen-footer night-footer">
        <span>GIỮ IM LẶNG TUYỆT ĐỐI</span>
        <span>•</span>
        <span>KHÔNG GÂY TIẾNG ĐỘNG</span>
      </footer>
    </main>
  );
}
