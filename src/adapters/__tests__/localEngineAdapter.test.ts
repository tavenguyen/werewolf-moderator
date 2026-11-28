import { describe, expect, it } from 'bun:test';
import { LocalEngineAdapter } from '../localEngineAdapter';
import { executeDayVote, executeNightPhase } from '../../engine/gameEngine';

function createPopulatedAdapter(playerCount = 8): LocalEngineAdapter {
  const adapter = new LocalEngineAdapter();
  for (let i = 1; i <= playerCount; i++) {
    adapter.addOfflinePlayer(`Người chơi ${i}`);
  }
  return adapter;
}

describe('LocalEngineAdapter - 100% Offline Single Device Mode', () => {
  it('khởi tạo phòng offline sạch không có người chơi demo (Clean Room Initialization)', async () => {
    // 1. Mặc định khởi tạo: 0 người chơi (CENTER_BOARD)
    const adapter = new LocalEngineAdapter();
    let state = adapter.getState();

    expect(state.roomCode).toBeDefined();
    expect(state.deviceMode).toBe('SINGLE_DEVICE');
    expect(state.isHost).toBe(true);
    expect(state.isConnected).toBe(true);
    expect(state.publicView?.phase).toBe('LOBBY');
    expect(state.publicView?.players.length).toBe(0);

    // 2. Tạo phòng kiêm người chơi: chỉ có đúng 1 Host
    await adapter.createRoom({ isPlayer: true, username: 'Quản trò Nam' });
    state = adapter.getState();
    expect(state.publicView?.players.length).toBe(1);
    expect(state.publicView?.players[0].name).toBe('Quản trò Nam');
  });

  it('cho phép thêm và bớt người chơi offline trong sảnh chờ', () => {
    const adapter = new LocalEngineAdapter();

    adapter.addOfflinePlayer('Trần Dũng');
    let state = adapter.getState();
    expect(state.publicView?.players.length).toBe(1);
    expect(state.publicView?.players.some((p) => p.name === 'Trần Dũng')).toBe(true);

    const dungPlayer = state.publicView?.players.find((p) => p.name === 'Trần Dũng');
    if (dungPlayer) {
      adapter.removeOfflinePlayer(dungPlayer.id);
    }

    state = adapter.getState();
    expect(state.publicView?.players.length).toBe(0);
  });

  it('bắt đầu ván đấu chuyển sang FIRST_NIGHT_SETUP để chuyền máy xem vai, sau đó bắt đầu Đêm 1', async () => {
    const adapter = createPopulatedAdapter(8);
    await adapter.startGame();

    let state = adapter.getState();
    expect(state.publicView?.phase).toBe('FIRST_NIGHT_SETUP');
    expect(state.publicView?.roundNumber).toBe(1);
    expect(state.privateView?.roleId).toBeDefined();

    await adapter.startFirstNight();
    state = adapter.getState();
    expect(state.publicView?.phase).toBe('NIGHT');
    expect(state.publicView?.currentTurnInfo).toBeDefined();
    expect(state.publicView?.currentTurnInfo?.turnIndex).toBe(1);
    expect(state.publicView?.currentTurnInfo?.totalTurns).toBeGreaterThan(0);
    expect(state.playerId).toBeDefined();
  });

  it('điều phối lần lượt các lượt đêm và chuyển sang Ngày thảo luận', async () => {
    const adapter = createPopulatedAdapter(8);
    await adapter.startGame();
    await adapter.startFirstNight();

    // Giả lập gửi action đêm và chuyển hết các lượt gọi
    for (let i = 0; i < 10; i++) {
      if (adapter.getState().publicView?.phase !== 'NIGHT') break;
      adapter.advanceLocalTurn();
    }

    const state = adapter.getState();
    // Sau khi kết thúc tất cả các lượt đêm, ván chuyển sang DAY_DISCUSS hoặc HUNTER_SHOT hoặc GAME_OVER
    expect(['DAY_DISCUSS', 'DAY_MAYOR_ELECTION', 'HUNTER_SHOT', 'GAME_OVER']).toContain(
      state.publicView?.phase ?? ''
    );
  });

  it('điều khiển Pause, Resume, Gia hạn và Chốt biểu quyết ban ngày', async () => {
    const adapter = createPopulatedAdapter(8);
    await adapter.startGame();
    await adapter.startFirstNight();

    // Chuyển sang ngày
    for (let i = 0; i < 10; i++) {
      if (adapter.getState().publicView?.phase !== 'NIGHT') break;
      adapter.advanceLocalTurn();
    }

    if (adapter.getState().publicView?.phase === 'DAY_DISCUSS') {
      // Pause
      await adapter.hostPause();
      expect(adapter.getState().publicView?.isPaused).toBe(true);

      // Resume
      await adapter.hostResume();
      expect(adapter.getState().publicView?.isPaused).toBe(false);

      // Gia hạn +30s
      await adapter.hostExtendTime();
      expect(adapter.getState().publicView?.extensionsUsed).toBe(1);

      // Chốt biểu quyết
      await adapter.finalizePublicVote();
      if (adapter.getState().publicView?.dayVerdict?.isPendingNextNight) {
        await adapter.proceedToNextNight();
      }
      const afterState = adapter.getState();
      expect(['NIGHT', 'GAME_OVER', 'HUNTER_SHOT']).toContain(afterState.publicView?.phase ?? '');
    }
  });

  it('trục xuất khẩn cấp người chơi sống', async () => {
    const adapter = createPopulatedAdapter(8);
    await adapter.startGame();
    await adapter.startFirstNight();

    const state = adapter.getState();
    const target = state.publicView?.players.find((p) => p.isAlive);
    expect(target).toBeDefined();

    if (target) {
      await adapter.hostEmergencyEliminate(target.id);
      const updated = adapter.getState();
      const updatedTarget = updated.publicView?.players.find((p) => p.id === target.id);
      expect(updatedTarget?.isAlive).toBe(false);
    }
  });

  it('lưu kết quả soi của Tiên tri và Pháp sư trong chế độ 1 máy', async () => {
    const adapter = createPopulatedAdapter(8);
    await adapter.startGame(['seer', 'werewolf', 'werewolf', 'villager', 'villager', 'villager', 'villager', 'villager']);
    await adapter.startFirstNight();

    // Tìm người chơi được chia vai Tiên tri
    let seerId = '';
    const allPlayers = adapter.getState().publicView?.players ?? [];
    for (const p of allPlayers) {
      adapter.setLocalActivePlayer(p.id);
      if (adapter.getState().privateView?.roleId === 'seer') {
        seerId = p.id;
        break;
      }
    }
    expect(seerId).not.toBe('');

    // Advance qua các lượt trước để đến đúng lượt gọi Tiên tri
    while (adapter.getState().publicView?.currentTurnInfo?.turnKey !== 'seer') {
      adapter.advanceLocalTurn();
      if (adapter.getState().publicView?.phase !== 'NIGHT') break;
    }

    // Tiên tri soi một người chơi khác
    adapter.setLocalActivePlayer(seerId);
    const targetId = allPlayers.find((p) => p.id !== seerId)?.id ?? 'player_2';
    await adapter.sendNightAction('seer', { targetId });

    adapter.setLocalActivePlayer(seerId);
    const state = adapter.getState();
    expect(state.privateView?.investigationResult).toBeDefined();
    expect(state.privateView?.investigationResult?.targetId).toBe(targetId);
    expect(['WEREWOLF', 'VILLAGER']).toContain(state.privateView?.investigationResult?.result as string);
  });

  it('xử lý phát súng Thợ săn chuyển sang NIGHT mượt mà không treo', async () => {
    const adapter = createPopulatedAdapter(8);
    await adapter.startGame();

    // Giả lập trạng thái HUNTER_SHOT
    await adapter.sendHunterShot('player_2');
    const state = adapter.getState();
    expect(['DAY_DISCUSS', 'NIGHT', 'GAME_OVER', 'HUNTER_SHOT']).toContain(state.publicView?.phase ?? '');
  });

  it('Pause và Resume bảo toàn thời gian còn lại của đồng hồ', async () => {
    const adapter = createPopulatedAdapter(8);
    await adapter.startGame();

    // Chuyển sang ngày
    for (let i = 0; i < 10; i++) {
      if (adapter.getState().publicView?.phase !== 'NIGHT') break;
      adapter.advanceLocalTurn();
    }

    if (adapter.getState().publicView?.phase === 'DAY_DISCUSS') {
      const initialDeadline = adapter.getState().publicView?.deadlineAt ?? 0;
      await adapter.hostPause();
      expect(adapter.getState().publicView?.isPaused).toBe(true);

      // Chờ một khoảng rồi resume
      await new Promise((r) => setTimeout(r, 50));
      await adapter.hostResume();
      expect(adapter.getState().publicView?.isPaused).toBe(false);
      const resumedDeadline = adapter.getState().publicView?.deadlineAt ?? 0;
      expect(resumedDeadline).toBeGreaterThanOrEqual(initialDeadline);
    }
  });

  it('thực hiện tái đấu Rematch trả về LOBBY và tạo thế hệ ván mới', async () => {
    const adapter = createPopulatedAdapter(8);
    await adapter.startGame();
    await adapter.startFirstNight();
    await adapter.hostRematch();

    let state = adapter.getState();
    expect(state.publicView?.gameGeneration).toBe(2);
    expect(state.publicView?.phase).toBe('LOBBY');
    expect(state.postGameView).toBeNull();

    await adapter.startGame();
    state = adapter.getState();
    expect(state.publicView?.phase).toBe('FIRST_NIGHT_SETUP');

    await adapter.startFirstNight();
    state = adapter.getState();
    expect(state.publicView?.phase).toBe('NIGHT');
  });

  it('xử lý hành động đêm cho wild_child, dire_wolf, hoodlum, mason', async () => {
    const adapter = createPopulatedAdapter(8);
    await adapter.startGame();

    // Giả lập trực tiếp các lượt
    const roomState = (adapter as unknown as { roomState: any }).roomState;

    // 1. wild_child
    roomState.nightTurnPlan = [
      {
        roleId: 'wild_child',
        turnKey: 'wild_child',
        priority: 12,
        titleVi: 'Đứa con hoang',
        titleEn: 'Wild Child',
        activePlayerIds: ['player_1'],
        isFake: false,
        canAct: true,
        audioKey: 'night_wild_child',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    await adapter.sendNightAction('wild_child', { targetId: 'player_2' });
    expect(roomState.nightActionsAccumulator.wildChild).toEqual({ targetId: 'player_2' });

    // 2. dire_wolf
    roomState.nightTurnPlan = [
      {
        roleId: 'dire_wolf',
        turnKey: 'dire_wolf',
        priority: 16,
        titleVi: 'Sói tuyết',
        titleEn: 'Dire Wolf',
        activePlayerIds: ['player_1'],
        isFake: false,
        canAct: true,
        audioKey: 'night_dire_wolf',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    await adapter.sendNightAction('dire_wolf', { targetId: 'player_3' });
    expect(roomState.nightActionsAccumulator.direWolf).toEqual({ targetId: 'player_3' });

    // 3. hoodlum
    roomState.nightTurnPlan = [
      {
        roleId: 'hoodlum',
        turnKey: 'hoodlum',
        priority: 13,
        titleVi: 'Du côn',
        titleEn: 'Hoodlum',
        activePlayerIds: ['player_1'],
        isFake: false,
        canAct: true,
        audioKey: 'night_hoodlum',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    await adapter.sendNightAction('hoodlum', { target1: 'player_2', target2: 'player_4' });
    expect(roomState.nightActionsAccumulator.hoodlum).toEqual({
      target1: 'player_2',
      target2: 'player_4',
    });

    // 4. mason
    roomState.nightTurnPlan = [
      {
        roleId: 'mason',
        turnKey: 'mason',
        priority: 14,
        titleVi: 'Hội Tam Điểm',
        titleEn: 'Mason',
        activePlayerIds: ['player_1'],
        isFake: false,
        canAct: true,
        audioKey: 'night_mason',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    roomState.nightActionAcks.clear();
    await adapter.sendNightAction('mason', {});
    expect(roomState.nightActionAcks.has('player_1')).toBe(true);
  });

  it('xử lý hành động đêm cho wolf_accursed và big_bad_wolf', async () => {
    const adapter = createPopulatedAdapter(8);
    await adapter.startGame();

    const roomState = (adapter as unknown as { roomState: any }).roomState;

    // 1. wolf_accursed - nguyền nạn nhân
    roomState.nightTurnPlan = [
      {
        roleId: 'wolf_accursed',
        turnKey: 'wolf_accursed',
        priority: 32,
        titleVi: 'Sói nguyền',
        titleEn: 'Accursed Wolf',
        activePlayerIds: ['player_1'],
        isFake: false,
        canAct: true,
        audioKey: 'night_wolf_accursed',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    await adapter.sendNightAction('wolf_accursed', { curseTargetId: 'player_3' });
    expect(roomState.nightActionsAccumulator.accursedWolf).toEqual({
      curseTargetId: 'player_3',
    });

    // 2. wolf_accursed - bỏ qua / giữ lại phép nguyền
    await adapter.sendNightAction('wolf_accursed', { curseTargetId: null });
    expect(roomState.nightActionsAccumulator.accursedWolf).toEqual({
      curseTargetId: null,
    });

    // 3. big_bad_wolf - cắn thêm 1 nạn nhân
    roomState.nightTurnPlan = [
      {
        roleId: 'big_bad_wolf',
        turnKey: 'big_bad_wolf',
        priority: 33,
        titleVi: 'Sói đại ca',
        titleEn: 'Big Bad Wolf',
        activePlayerIds: ['player_2'],
        isFake: false,
        canAct: true,
        audioKey: 'night_big_bad_wolf',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    await adapter.sendNightAction('big_bad_wolf', { targetId: 'player_4' });
    expect(roomState.nightActionsAccumulator.bigBadWolf).toEqual({
      targetId: 'player_4',
    });

    // 4. big_bad_wolf - bỏ qua cắn thêm
    await adapter.sendNightAction('big_bad_wolf', { targetId: null });
    expect(roomState.nightActionsAccumulator.bigBadWolf).toEqual({
      targetId: null,
    });
  });

  it('xử lý hành động đêm cho Phase 4: aura_seer, pi, fox, spellcaster, troublemaker', async () => {
    const adapter = createPopulatedAdapter(8);
    await adapter.startGame();

    const roomState = (adapter as unknown as { roomState: any }).roomState;

    // 1. aura_seer - soi người chơi
    roomState.nightTurnPlan = [
      {
        roleId: 'aura_seer',
        turnKey: 'aura_seer',
        priority: 41,
        titleVi: 'Tiên tri hào quang',
        titleEn: 'Aura Seer',
        activePlayerIds: ['player_1'],
        isFake: false,
        canAct: true,
        audioKey: 'night_aura_seer',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    await adapter.sendNightAction('aura_seer', { targetId: 'player_2' });
    expect(roomState.nightActionsAccumulator.auraSeer).toEqual({
      targetId: 'player_2',
    });
    expect(roomState.auraInvestigationResult).toBeDefined();
    expect(roomState.auraInvestigationResult?.targetId).toBe('player_2');

    // 2. pi - điều tra cụm 3 người
    roomState.nightTurnPlan = [
      {
        roleId: 'pi',
        turnKey: 'pi',
        priority: 42,
        titleVi: 'Thám tử',
        titleEn: 'P.I.',
        activePlayerIds: ['player_3'],
        isFake: false,
        canAct: true,
        audioKey: 'night_pi',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    await adapter.sendNightAction('pi', { targetId: 'player_3' });
    expect(roomState.nightActionsAccumulator.pi).toEqual({
      targetId: 'player_3',
    });
    expect(roomState.piInvestigationResult).toBeDefined();
    expect(roomState.piInvestigationResult?.targetId).toBe('player_3');
    expect(Array.isArray(roomState.piInvestigationResult?.inspectedPlayerIds)).toBe(true);

    // 3. fox - đánh hơi chọn mục tiêu và bỏ qua
    roomState.nightTurnPlan = [
      {
        roleId: 'fox',
        turnKey: 'fox',
        priority: 43,
        titleVi: 'Con cáo',
        titleEn: 'Fox',
        activePlayerIds: ['player_4'],
        isFake: false,
        canAct: true,
        audioKey: 'night_fox',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    await adapter.sendNightAction('fox', { targetId: 'player_4', isSkip: false });
    expect(roomState.nightActionsAccumulator.fox).toEqual({
      targetId: 'player_4',
      isSkip: false,
    });
    expect(roomState.foxInvestigationResult).toBeDefined();
    expect(roomState.foxInvestigationResult?.targetId).toBe('player_4');

    // Fox bỏ qua
    await adapter.sendNightAction('fox', { targetId: null, isSkip: true });
    expect(roomState.nightActionsAccumulator.fox).toEqual({
      targetId: '',
      isSkip: true,
    });

    // 4. spellcaster - phù phép làm câm 1 người
    roomState.nightTurnPlan = [
      {
        roleId: 'spellcaster',
        turnKey: 'spellcaster',
        priority: 55,
        titleVi: 'Người phù phép',
        titleEn: 'Spellcaster',
        activePlayerIds: ['player_5'],
        isFake: false,
        canAct: true,
        audioKey: 'night_spellcaster',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    await adapter.sendNightAction('spellcaster', { targetId: 'player_6' });
    expect(roomState.nightActionsAccumulator.spellcaster).toEqual({
      targetId: 'player_6',
    });

    // 5. troublemaker - kích hoạt hỗn loạn hoặc bỏ qua
    roomState.nightTurnPlan = [
      {
        roleId: 'troublemaker',
        turnKey: 'troublemaker',
        priority: 58,
        titleVi: 'Kẻ phá rối',
        titleEn: 'Troublemaker',
        activePlayerIds: ['player_7'],
        isFake: false,
        canAct: true,
        audioKey: 'night_troublemaker',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    await adapter.sendNightAction('troublemaker', { activate: true });
    expect(roomState.nightActionsAccumulator.troublemaker).toEqual({
      activate: true,
    });

    await adapter.sendNightAction('troublemaker', { activate: false });
    expect(roomState.nightActionsAccumulator.troublemaker).toEqual({
      activate: false,
    });
  });

  it('xử lý hành động đêm cho Phase 5: doppelganger, pied_piper, cult_leader', async () => {
    const adapter = createPopulatedAdapter(8);
    await adapter.startGame();

    const roomState = (adapter as unknown as { roomState: any }).roomState;

    // 1. doppelganger - chọn 1 người làm bản sao
    roomState.nightTurnPlan = [
      {
        roleId: 'doppelganger',
        turnKey: 'doppelganger',
        priority: 11,
        titleVi: 'Nhân bản',
        titleEn: 'Doppelganger',
        activePlayerIds: ['player_1'],
        isFake: false,
        canAct: true,
        audioKey: 'night_doppelganger',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    await adapter.sendNightAction('doppelganger', { targetId: 'player_2' });
    expect(roomState.nightActionsAccumulator.doppelganger).toEqual({
      targetId: 'player_2',
    });

    // 2. pied_piper - chọn 2 người thôi miên
    roomState.nightTurnPlan = [
      {
        roleId: 'pied_piper',
        turnKey: 'pied_piper',
        priority: 60,
        titleVi: 'Người thổi sáo',
        titleEn: 'Pied Piper',
        activePlayerIds: ['player_3'],
        isFake: false,
        canAct: true,
        audioKey: 'night_pied_piper',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    await adapter.sendNightAction('pied_piper', { targetIds: ['player_4', 'player_5'] });
    expect(roomState.nightActionsAccumulator.piedPiper).toEqual({
      targetIds: ['player_4', 'player_5'],
    });

    // 3. cult_leader - chọn 1 người kết nạp giáo phái
    roomState.nightTurnPlan = [
      {
        roleId: 'cult_leader',
        turnKey: 'cult_leader',
        priority: 62,
        titleVi: 'Trưởng giáo phái',
        titleEn: 'Cult Leader',
        activePlayerIds: ['player_6'],
        isFake: false,
        canAct: true,
        audioKey: 'night_cult_leader',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    await adapter.sendNightAction('cult_leader', { targetId: 'player_7' });
    expect(roomState.nightActionsAccumulator.cultLeader).toEqual({
      targetId: 'player_7',
    });
  });

  it('finalizePublicVote hỗ trợ tieVoteMode = RUNOFF và kết thúc vòng Runoff', async () => {
    const adapter = createPopulatedAdapter(6);
    await adapter.updateSettings({ tieVoteMode: 'RUNOFF', lynchThreshold: 'PLURALITY' });
    await adapter.startGame(['werewolf', 'werewolf', 'seer', 'villager', 'villager', 'villager']);
    await adapter.startFirstNight();

    const roomState = (adapter as unknown as { roomState: any }).roomState;
    roomState.gameState.phase = 'DAY_DISCUSS';
    roomState.gameState.dayState = {
      discussionSecondsRemaining: 120,
      voteLockRemainingSeconds: 0,
      voteLocked: false,
      isPaused: false,
      extensionsUsed: 0,
      ballots: {
        player_1: 'player_4',
        player_2: 'player_4',
        player_3: 'player_5',
        player_6: 'player_5',
      },
    };

    await adapter.finalizePublicVote();

    expect(adapter.getState().publicView?.phase).toBe('DAY_RUNOFF');
    expect(roomState.gameState.dayState.runoffCandidates).toEqual(['player_4', 'player_5']);

    // Bỏ phiếu Runoff: player_4 bị treo cổ
    adapter.setLocalActivePlayer('player_1');
    await adapter.sendDayVote('player_4');
    adapter.setLocalActivePlayer('player_2');
    await adapter.sendDayVote('player_4');
    adapter.setLocalActivePlayer('player_3');
    await adapter.sendDayVote('player_5');

    await adapter.finalizePublicVote();

    const p4 = roomState.gameState.players.find((p: any) => p.id === 'player_4');
    expect(p4.isAlive).toBe(false);
    if (adapter.getState().publicView?.dayVerdict?.isPendingNextNight) {
      await adapter.proceedToNextNight();
    }
    expect(['NIGHT', 'GAME_OVER']).toContain(adapter.getState().publicView?.phase ?? '');
  });

  it('finalizePublicVote hỗ trợ doubleVoteDay (treo cổ 2 người), bỏ qua phiếu voteWeight === 0 và đẩy log lật bài Hoàng tử', async () => {
    const adapter = createPopulatedAdapter(6);
    await adapter.updateSettings({ lynchThreshold: 'PLURALITY' });
    await adapter.startGame(['werewolf', 'seer', 'prince', 'village_idiot', 'villager', 'villager']);
    await adapter.startFirstNight();

    const roomState = (adapter as unknown as { roomState: any }).roomState;
    const wolf = roomState.gameState.players.find((p: any) => p.roleId === 'werewolf');
    const seer = roomState.gameState.players.find((p: any) => p.roleId === 'seer');
    const prince = roomState.gameState.players.find((p: any) => p.roleId === 'prince');
    const idiot = roomState.gameState.players.find((p: any) => p.roleId === 'village_idiot');
    const villagers = roomState.gameState.players.filter((p: any) => p.roleId === 'villager');

    // Thằng ngốc đã lật bài trước đó -> voteWeight = 0
    idiot.voteWeight = 0;

    roomState.gameState.phase = 'DAY_DISCUSS';
    roomState.gameState.doubleVoteDay = true;
    roomState.gameState.dayState = {
      discussionSecondsRemaining: 120,
      voteLockRemainingSeconds: 0,
      voteLocked: false,
      isPaused: false,
      extensionsUsed: 0,
      ballots: {
        [wolf.id]: prince.id,
        [seer.id]: prince.id,
        [villagers[0].id]: villagers[1].id,
        // Phiếu của idiot bị bỏ qua vì voteWeight === 0
        [idiot.id]: seer.id,
      },
    };

    await adapter.finalizePublicVote();

    // Không tính phiếu của idiot nên tallies không có seer
    expect(adapter.getState().publicView?.lastVoteTally?.tallies[seer.id]).toBeUndefined();
    // Hoàng tử lật bài thoát chết & có thông báo trong publicLogs
    const updatedPrince = roomState.gameState.players.find((p: any) => p.id === prince.id);
    const updatedSecondTarget = roomState.gameState.players.find((p: any) => p.id === villagers[1].id);
    expect(updatedPrince.isAlive).toBe(true);
    expect(roomState.gameState.princeRevealed).toBe(true);
    expect(
      adapter.getState().publicView?.publicLogs.some((l: string) => l.includes('Hoàng tử'))
    ).toBe(true);
    // Người thứ 2 (villagers[1]) bị treo cổ do doubleVoteDay
    expect(updatedSecondTarget.isAlive).toBe(false);
    expect(roomState.gameState.doubleVoteDay).toBe(false);
  });

  it('sendNightAction hỗ trợ seerRevealMode = EXACT_ROLE cho seer và aura_seer soi drunk trước Đêm 3', async () => {
    const adapter = createPopulatedAdapter(6);
    await adapter.updateSettings({ seerRevealMode: 'EXACT_ROLE' });
    await adapter.startGame(['werewolf', 'seer', 'aura_seer', 'drunk', 'villager', 'villager']);
    await adapter.startFirstNight();

    const roomState = (adapter as unknown as { roomState: any }).roomState;
    const seer = roomState.gameState.players.find((p: any) => p.roleId === 'seer');
    const auraSeer = roomState.gameState.players.find((p: any) => p.roleId === 'aura_seer');
    const wolf = roomState.gameState.players.find((p: any) => p.roleId === 'werewolf');
    const drunk = roomState.gameState.players.find((p: any) => p.roleId === 'drunk');

    // 1. Seer soi với EXACT_ROLE
    roomState.nightTurnPlan = [
      {
        roleId: 'seer',
        turnKey: 'seer',
        priority: 40,
        titleVi: 'Tiên tri',
        titleEn: 'Seer',
        activePlayerIds: [seer.id],
        isFake: false,
        canAct: true,
        audioKey: 'night_seer',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    adapter.setLocalActivePlayer(seer.id);
    await adapter.sendNightAction('seer', { targetId: wolf.id });
    expect(adapter.getState().privateView?.investigationResult).toEqual({
      targetId: wolf.id,
      result: 'werewolf',
    });

    // 2. Aura Seer soi Drunk ở Đêm 1 (< 3) -> NORMAL
    roomState.nightTurnPlan = [
      {
        roleId: 'aura_seer',
        turnKey: 'aura_seer',
        priority: 41,
        titleVi: 'Tiên tri hào quang',
        titleEn: 'Aura Seer',
        activePlayerIds: [auraSeer.id],
        isFake: false,
        canAct: true,
        audioKey: 'night_aura_seer',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    roomState.gameState.roundNumber = 1;
    adapter.setLocalActivePlayer(auraSeer.id);
    await adapter.sendNightAction('aura_seer', { targetId: drunk.id });
    expect(adapter.getState().privateView?.investigationResult).toEqual({
      targetId: drunk.id,
      result: 'NORMAL',
    });
  });

  it('apprentice_seer nhận seerInvestigationResult khi Seer đã chết, và Fake Turn không ghi accumulator', async () => {
    const adapter = createPopulatedAdapter(6);
    await adapter.startGame(['werewolf', 'seer', 'apprentice_seer', 'villager', 'villager', 'villager']);
    await adapter.startFirstNight();

    const roomState = (adapter as unknown as { roomState: any }).roomState;
    const seer = roomState.gameState.players.find((p: any) => p.roleId === 'seer');
    const apprentice = roomState.gameState.players.find((p: any) => p.roleId === 'apprentice_seer');
    const wolf = roomState.gameState.players.find((p: any) => p.roleId === 'werewolf');

    // Fake turn (canAct: false) không được ghi vào nightActionsAccumulator
    roomState.nightTurnPlan = [
      {
        roleId: 'bodyguard',
        turnKey: 'bodyguard',
        priority: 20,
        titleVi: 'Bảo vệ',
        titleEn: 'Bodyguard',
        activePlayerIds: [],
        isFake: true,
        canAct: false,
        audioKey: 'night_bodyguard',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    await adapter.sendNightAction('bodyguard', { targetId: apprentice.id });
    expect(roomState.nightActionsAccumulator.bodyguard).toBeUndefined();

    // Seer chết -> apprentice_seer kế thừa lượt soi và thấy kết quả soi
    seer.isAlive = false;
    roomState.nightTurnPlan = [
      {
        roleId: 'seer',
        turnKey: 'seer',
        priority: 40,
        titleVi: 'Tiên tri',
        titleEn: 'Seer',
        activePlayerIds: [apprentice.id],
        isFake: false,
        canAct: true,
        audioKey: 'night_seer',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    adapter.setLocalActivePlayer(apprentice.id);
    await adapter.sendNightAction('seer', { targetId: wolf.id });

    expect(adapter.getState().privateView?.investigationResult).toEqual({
      targetId: wolf.id,
      result: 'WEREWOLF',
    });
  });

  it('finalizePublicVote xử lý DAY_MAYOR_ELECTION và chuyển sang DAY_DISCUSS', async () => {
    const adapter = createPopulatedAdapter(6);
    await adapter.updateSettings({ hasMayor: true });
    await adapter.startGame(['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager']);
    await adapter.startFirstNight();
    await adapter.advanceLocalTurn(); // Seer
    await adapter.advanceLocalTurn(); // Sang Ngày 1 (DAY_MAYOR_ELECTION)

    const roomState = (adapter as unknown as { roomState: any }).roomState;
    expect(roomState.gameState.phase).toBe('DAY_MAYOR_ELECTION');

    const [p1, p2, p3] = roomState.gameState.players;
    adapter.setLocalActivePlayer(p1.id);
    await adapter.sendMayorElect(p2.id);
    adapter.setLocalActivePlayer(p3.id);
    await adapter.sendMayorElect(p2.id);

    await adapter.finalizePublicVote();

    expect(roomState.gameState.phase).toBe('DAY_DISCUSS');
    expect(roomState.gameState.mayorId).toBe(p2.id);
    expect(roomState.lastVoteTally?.tallies[p2.id]).toBe(2);
  });

  it('Con Cáo đã mất phép (foxLostPower) không thể nhận foxInvestigationResult', async () => {
    const adapter = createPopulatedAdapter(6);
    await adapter.startGame(['fox', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
    await adapter.startFirstNight();

    const roomState = (adapter as unknown as { roomState: any }).roomState;
    const fox = roomState.gameState.players.find((p: any) => p.roleId === 'fox');
    const wolf = roomState.gameState.players.find((p: any) => p.roleId === 'werewolf');
    roomState.gameState.foxLostPower = true;
    roomState.nightTurnPlan = [
      {
        roleId: 'fox',
        turnKey: 'fox',
        priority: 44,
        titleVi: 'Con cáo',
        titleEn: 'Fox',
        activePlayerIds: [fox.id],
        isFake: false,
        canAct: true,
        audioKey: 'night_fox',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    adapter.setLocalActivePlayer(fox.id);

    await adapter.sendNightAction('fox', { targetId: wolf.id, isSkip: false });

    expect(roomState.foxInvestigationResult).toBeUndefined();
    expect(roomState.nightActionsAccumulator.fox?.isSkip).toBe(true);
  });

  it('submitPublicHandVotes xử lý bầu Trưởng làng, hòa phiếu Runoff và treo cổ theo phiếu giơ tay', async () => {
    const adapter = createPopulatedAdapter(6);
    await adapter.updateSettings({ hasMayor: true, tieVoteMode: 'RUNOFF' });
    await adapter.startGame(['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager']);
    await adapter.startFirstNight();

    const roomState = (adapter as unknown as { roomState: any }).roomState;
    const [p1, p2, p3] = roomState.gameState.players;

    // 1. Bầu Trưởng làng bằng phiếu giơ tay
    roomState.gameState.phase = 'DAY_MAYOR_ELECTION';
    await adapter.submitPublicHandVotes({ [p1.id]: 4, [p2.id]: 2 });
    expect(roomState.gameState.phase).toBe('DAY_DISCUSS');
    expect(roomState.gameState.mayorId).toBe(p1.id);
    expect(roomState.gameState.players.find((p: any) => p.id === p1.id)?.voteWeight).toBe(2);

    // 2. Hòa phiếu -> chuyển sang DAY_RUNOFF
    await adapter.submitPublicHandVotes({ [p2.id]: 3, [p3.id]: 3 });
    expect(roomState.gameState.phase).toBe('DAY_RUNOFF');
    expect(roomState.gameState.dayState.runoffCandidates).toEqual([p2.id, p3.id]);

    // 3. Chốt Runoff -> treo cổ p3
    await adapter.submitPublicHandVotes({ [p2.id]: 1, [p3.id]: 4 });
    expect(roomState.gameState.players.find((p: any) => p.id === p3.id)?.isAlive).toBe(false);
    expect(roomState.lastVoteTally?.tallies[p3.id]).toBe(4);
  });

  it('submitPublicHandVotes hỗ trợ doubleVoteDay (treo cổ 2 người có phiếu giơ tay cao nhất)', async () => {
    const adapter = createPopulatedAdapter(6);
    await adapter.startGame(['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager']);
    await adapter.startFirstNight();

    const roomState = (adapter as unknown as { roomState: any }).roomState;
    const [p1, p2] = roomState.gameState.players;
    roomState.gameState.phase = 'DAY_DISCUSS';
    roomState.gameState.doubleVoteDay = true;

    await adapter.submitPublicHandVotes({ [p1.id]: 4, [p2.id]: 2 });

    expect(roomState.gameState.players.find((p: any) => p.id === p1.id)?.isAlive).toBe(false);
    expect(roomState.gameState.players.find((p: any) => p.id === p2.id)?.isAlive).toBe(false);
  });

  it('finalizePublicVote xử lý DAY_MAYOR_ELECTION và chuyển sang DAY_DISCUSS', async () => {
    const adapter = createPopulatedAdapter(6);
    await adapter.updateSettings({ hasMayor: true });
    await adapter.startGame(['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager']);
    await adapter.startFirstNight();
    await adapter.advanceLocalTurn(); // Seer
    await adapter.advanceLocalTurn(); // Sang Ngày 1 (DAY_MAYOR_ELECTION)

    const roomState = (adapter as unknown as { roomState: any }).roomState;
    expect(roomState.gameState.phase).toBe('DAY_MAYOR_ELECTION');

    const [p1, p2, p3] = roomState.gameState.players;
    adapter.setLocalActivePlayer(p1.id);
    await adapter.sendMayorElect(p2.id);
    adapter.setLocalActivePlayer(p3.id);
    await adapter.sendMayorElect(p2.id);

    await adapter.finalizePublicVote();

    expect(roomState.gameState.phase).toBe('DAY_DISCUSS');
    expect(roomState.gameState.mayorId).toBe(p2.id);
    expect(roomState.lastVoteTally?.tallies[p2.id]).toBe(2);
  });

  it('Con Cáo đã mất phép (foxLostPower) không thể nhận foxInvestigationResult', async () => {
    const adapter = createPopulatedAdapter(6);
    await adapter.startGame(['fox', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
    await adapter.startFirstNight();

    const roomState = (adapter as unknown as { roomState: any }).roomState;
    const fox = roomState.gameState.players.find((p: any) => p.roleId === 'fox');
    const wolf = roomState.gameState.players.find((p: any) => p.roleId === 'werewolf');
    roomState.gameState.foxLostPower = true;
    roomState.nightTurnPlan = [
      {
        roleId: 'fox',
        turnKey: 'fox',
        priority: 44,
        titleVi: 'Con cáo',
        titleEn: 'Fox',
        activePlayerIds: [fox.id],
        isFake: false,
        canAct: true,
        audioKey: 'night_fox',
      },
    ];
    roomState.currentNightTurnIndex = 0;
    adapter.setLocalActivePlayer(fox.id);

    await adapter.sendNightAction('fox', { targetId: wolf.id, isSkip: false });

    expect(roomState.foxInvestigationResult).toBeUndefined();
    expect(roomState.nightActionsAccumulator.fox?.isSkip).toBe(true);
  });

  it('addOfflinePlayer dùng nextPlayerIdSeq tăng dần, không trùng ID sau khi xóa người chơi', () => {
    const adapter = new LocalEngineAdapter();
    adapter.addOfflinePlayer('An');
    adapter.addOfflinePlayer('Bình');
    adapter.addOfflinePlayer('Chi');

    let players = adapter.getState().publicView?.players ?? [];
    expect(players.map((p) => p.id)).toEqual(['player_1', 'player_2', 'player_3']);

    // Xóa người chơi ở giữa (player_2)
    adapter.removeOfflinePlayer('player_2');
    adapter.addOfflinePlayer('Dũng');

    players = adapter.getState().publicView?.players ?? [];
    expect(players.map((p) => p.id)).toEqual(['player_1', 'player_3', 'player_4']);
    expect(new Set(players.map((p) => p.id)).size).toBe(3);
  });

  it('hostExtendTime cộng +30s vào remainingBeforePause khi đang pause và không kéo dài khóa vote 60s', async () => {
    const adapter = createPopulatedAdapter(6);
    await adapter.updateSettings({ dayDiscussionSeconds: 180, dayVoteLockSeconds: 60 });
    await adapter.startGame(['seer', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
    await adapter.startFirstNight();

    // Kết thúc đêm để sang DAY_DISCUSS
    for (let i = 0; i < 10; i++) {
      if (adapter.getState().publicView?.phase !== 'NIGHT') break;
      adapter.advanceLocalTurn();
    }

    if (adapter.getState().publicView?.phase === 'DAY_DISCUSS') {
      const roomState = (adapter as unknown as { roomState: any }).roomState;
      const initialLock = adapter.getState().publicView?.voteLockRemainingSeconds;
      expect(initialLock).toBe(60);

      // Pause -> Extend -> Resume
      await adapter.hostPause();
      const pausedRemaining = roomState.timers.remainingBeforePause as number;
      await adapter.hostExtendTime();

      expect(roomState.timers.remainingBeforePause).toBe(pausedRemaining + 30 * 1000);
      expect(adapter.getState().publicView?.voteLockRemainingSeconds).toBe(60);

      await adapter.hostResume();
      const resumedRemaining = (roomState.timers.deadlineAt as number) - Date.now();
      expect(resumedRemaining).toBeGreaterThan(pausedRemaining + 25 * 1000);
      expect(adapter.getState().publicView?.voteLockRemainingSeconds).toBe(60);

      await adapter.leaveRoom();
    }
  });

  it('hostRematch trả về LOBBY, giữ lại settings.customDeck, dọn sạch state/postGameView và ghi đè localStorage', async () => {
    const originalStorage = (globalThis as Record<string, unknown>).localStorage;
    const storageMap = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storageMap.set(k, v);
      },
      removeItem: (k: string) => {
        storageMap.delete(k);
      },
    };

    try {
      const adapter = createPopulatedAdapter(6);
      const customDeck = { werewolf: 1, seer: 1, witch: 1, villager: 3 };
      await adapter.updateSettings({ customDeck });
      await adapter.startGame(['werewolf', 'seer', 'witch', 'villager', 'villager', 'villager']);
      await adapter.startFirstNight();

      const roomState = (adapter as unknown as { roomState: any }).roomState;
      roomState.seerInvestigationResult = { targetId: 'player_1', result: 'WEREWOLF' };
      roomState.nightActionAcks.add('player_2');
      roomState.lastVoteTally = { tallies: { player_1: 2 }, abstainCount: 0 };
      roomState.players.get('player_1').isAlive = false;

      await adapter.hostRematch();

      const state = adapter.getState();
      expect(state.publicView?.phase).toBe('LOBBY');
      expect(state.publicView?.gameGeneration).toBe(2);
      expect(state.postGameView).toBeNull();
      expect(state.privateView).toBeNull();
      expect(roomState.gameState).toBeNull();
      expect(roomState.settings.customDeck).toEqual(customDeck);
      expect(roomState.players.size).toBe(6);
      expect(roomState.players.get('player_1').isAlive).toBe(true);
      expect(roomState.seerInvestigationResult).toBeUndefined();
      expect(roomState.nightActionAcks.size).toBe(0);
      expect(roomState.nightTurnPlan.length).toBe(0);
      expect(roomState.lastVoteTally).toBeUndefined();
      expect((adapter as unknown as { dayTimerInterval: number | null }).dayTimerInterval).toBeNull();

      const saved = JSON.parse(storageMap.get('werewolf_local_game_session') ?? '{}');
      expect(saved.gameState).toBeNull();
      expect(saved.timers?.phase).toBe('LOBBY');
    } finally {
      if (originalStorage === undefined) {
        delete (globalThis as Record<string, unknown>).localStorage;
      } else {
        (globalThis as Record<string, unknown>).localStorage = originalStorage;
      }
    }
  });

  it('hostEmergencyEliminate chuyển HUNTER_SHOT / MAYOR_SUCCESSION, cập nhật activeLocalPlayerId ban đêm và dừng timer khi GAME_OVER', async () => {
    // 1. Loại trúng Thợ săn -> chuyển HUNTER_SHOT
    const hunterAdapter = createPopulatedAdapter(6);
    await hunterAdapter.startGame([
      'hunter',
      'werewolf',
      'villager',
      'villager',
      'villager',
      'villager',
    ]);
    await hunterAdapter.startFirstNight();
    const hunterRoom = (hunterAdapter as unknown as { roomState: any }).roomState;
    const hunter = hunterRoom.gameState.players.find((p: any) => p.roleId === 'hunter');

    await hunterAdapter.hostEmergencyEliminate(hunter.id);
    expect(hunterAdapter.getState().publicView?.phase).toBe('HUNTER_SHOT');

    // 2. Loại trúng Trưởng làng -> chuyển MAYOR_SUCCESSION
    const mayorAdapter = createPopulatedAdapter(6);
    await mayorAdapter.startGame([
      'villager',
      'werewolf',
      'villager',
      'villager',
      'villager',
      'villager',
    ]);
    await mayorAdapter.startFirstNight();
    const mayorRoom = (mayorAdapter as unknown as { roomState: any }).roomState;
    const villagerMayor = mayorRoom.gameState.players.find((p: any) => p.roleId === 'villager');
    mayorRoom.gameState.mayorId = villagerMayor.id;
    await mayorAdapter.hostEmergencyEliminate(villagerMayor.id);
    expect(mayorAdapter.getState().publicView?.phase).toBe('MAYOR_SUCCESSION');

    // 3. Loại activeLocalPlayerId ban đêm -> tự cập nhật sang người sống khác
    const nightAdapter = createPopulatedAdapter(6);
    await nightAdapter.startGame([
      'seer',
      'werewolf',
      'villager',
      'villager',
      'villager',
      'villager',
    ]);
    await nightAdapter.startFirstNight();
    const activeId = nightAdapter.getState().playerId!;
    const activeRole = nightAdapter.getState().privateView?.roleId;
    if (activeRole !== 'werewolf') {
      await nightAdapter.hostEmergencyEliminate(activeId);
      if (nightAdapter.getState().publicView?.phase === 'NIGHT') {
        expect(nightAdapter.getState().playerId).not.toBe(activeId);
      }
    }

    // 4. Loại Sói duy nhất -> GAME_OVER và dừng dayTimerInterval
    const endAdapter = createPopulatedAdapter(6);
    await endAdapter.startGame([
      'werewolf',
      'seer',
      'villager',
      'villager',
      'villager',
      'villager',
    ]);
    await endAdapter.startFirstNight();
    for (let i = 0; i < 10; i++) {
      if (endAdapter.getState().publicView?.phase !== 'NIGHT') break;
      endAdapter.advanceLocalTurn();
    }
    const endRoom = (endAdapter as unknown as { roomState: any }).roomState;
    const wolf = endRoom.gameState.players.find((p: any) => p.roleId === 'werewolf');
    if (wolf && wolf.isAlive) {
      await endAdapter.hostEmergencyEliminate(wolf.id);
      expect(endAdapter.getState().publicView?.phase).toBe('GAME_OVER');
      expect((endAdapter as unknown as { dayTimerInterval: number | null }).dayTimerInterval).toBeNull();
    }
  });

  it('F5 Recovery: persistState và resumeSession lưu/khôi phục timers, nightActionAcks, *InvestigationResult, nextPlayerIdSeq và chạy lại timer ngày', async () => {
    const store = new Map<string, string>();
    const originalStorage = (globalThis as Record<string, unknown>).localStorage;
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };

    try {
      const adapter1 = createPopulatedAdapter(6);
      adapter1.removeOfflinePlayer('player_2');
      adapter1.addOfflinePlayer('Người chơi mới'); // player_7

      await adapter1.startGame(['seer', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
      await adapter1.startFirstNight();

      const room1 = (adapter1 as unknown as { roomState: any }).roomState;
      room1.nightActionAcks.add('player_1');
      room1.seerInvestigationResult = { targetId: 'player_3', result: 'VILLAGER' };
      room1.foxInvestigationResult = {
        targetId: 'player_3',
        hasWerewolf: false,
        inspectedPlayerIds: ['player_3'],
      };

      // Ép sang DAY_DISCUSS với timer còn 120s
      room1.gameState.phase = 'DAY_DISCUSS';
      room1.gameState.dayState = {
        discussionSecondsRemaining: 120,
        voteLockRemainingSeconds: 45,
        voteLocked: true,
        isPaused: false,
        extensionsUsed: 0,
        ballots: {},
      };
      const expectedDeadline = Date.now() + 120 * 1000;
      room1.timers.deadlineAt = expectedDeadline;
      room1.timers.isPaused = false;
      (adapter1 as unknown as { emitState: () => void }).emitState();

      // Khởi tạo adapter mới mô phỏng F5
      const adapter2 = new LocalEngineAdapter();
      expect(adapter2.hasRecoverableSession()).toBe(true);
      const resumed = await adapter2.resumeSession();
      expect(resumed).toBe(true);

      const room2 = (adapter2 as unknown as { roomState: any }).roomState;
      expect(room2.nightActionAcks.has('player_1')).toBe(true);
      expect(room2.seerInvestigationResult).toEqual({ targetId: 'player_3', result: 'VILLAGER' });
      expect(room2.foxInvestigationResult).toEqual({
        targetId: 'player_3',
        hasWerewolf: false,
        inspectedPlayerIds: ['player_3'],
      });
      expect((adapter2 as unknown as { nextPlayerIdSeq: number }).nextPlayerIdSeq).toBe(8);
      expect(room2.timers.deadlineAt).toBe(expectedDeadline);
      expect(room2.gameState.dayState.voteLockRemainingSeconds).toBe(45);
      expect((adapter2 as unknown as { dayTimerInterval: number | null }).dayTimerInterval).not.toBeNull();

      await adapter2.leaveRoom();
    } finally {
      if (originalStorage === undefined) {
        delete (globalThis as Record<string, unknown>).localStorage;
      } else {
        (globalThis as Record<string, unknown>).localStorage = originalStorage;
      }
    }
  });

  it('sendHunterShot / sendMayorTransfer khởi động dayTimer khi chuyển sang DAY_MAYOR_ELECTION, và resumeSession khôi phục timer cho DAY_RUNOFF', async () => {
    const store = new Map<string, string>();
    const originalStorage = (globalThis as Record<string, unknown>).localStorage;
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };

    try {
      const adapter = createPopulatedAdapter(6);
      await adapter.updateSettings({ hasMayor: true });
      await adapter.startGame(['hunter', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
      await adapter.startFirstNight();

      const roomState = (adapter as unknown as { roomState: any }).roomState;
      const hunter = roomState.gameState.players.find((p: any) => p.roleId === 'hunter');
      const villager = roomState.gameState.players.find((p: any) => p.roleId === 'villager');

      // Giả lập Thợ săn chết đêm 1 (khi hasMayor = true -> previousPhaseBeforeHunter = DAY_MAYOR_ELECTION)
      roomState.gameState.phase = 'HUNTER_SHOT';
      roomState.gameState.pendingHunterShotPlayerId = hunter.id;
      roomState.gameState.previousPhaseBeforeHunter = 'DAY_MAYOR_ELECTION';

      await adapter.sendHunterShot(villager.id);
      expect(adapter.getState().publicView?.phase).toBe('DAY_MAYOR_ELECTION');
      expect((adapter as unknown as { dayTimerInterval: number | null }).dayTimerInterval).not.toBeNull();

      // Test resumeSession với DAY_RUNOFF
      roomState.gameState.phase = 'DAY_RUNOFF';
      roomState.timers.deadlineAt = Date.now() + 30_000;
      roomState.timers.isPaused = false;
      (adapter as unknown as { emitState: () => void }).emitState();

      await adapter.leaveRoom();
      // Lưu lại payload trước khi leaveRoom để mô phỏng F5 thực tế
      const adapter2 = new LocalEngineAdapter();
      store.set(
        'werewolf_local_game_session',
        JSON.stringify({
          roomCode: '7290',
          gameGeneration: 1,
          hostMode: 'CENTER_BOARD',
          players: Array.from(roomState.players.values()),
          settings: roomState.settings,
          gameState: roomState.gameState,
          timers: {
            deadlineAt: Date.now() + 30_000,
            isPaused: false,
            phase: 'DAY_RUNOFF',
          },
          expiresAt: Date.now() + 60_000,
        })
      );
      const resumed = await adapter2.resumeSession();
      expect(resumed).toBe(true);
      expect((adapter2 as unknown as { dayTimerInterval: number | null }).dayTimerInterval).not.toBeNull();
      await adapter2.leaveRoom();
    } finally {
      if (originalStorage === undefined) {
        delete (globalThis as Record<string, unknown>).localStorage;
      } else {
        (globalThis as Record<string, unknown>).localStorage = originalStorage;
      }
    }
  });

  it('abortGameToLobby đưa ván đang chơi về LOBBY và endGameToSummary kết thúc sang GAME_OVER', async () => {
    const adapter = createPopulatedAdapter(6);
    await adapter.updateSettings({ customDeck: { werewolf: 1, seer: 1, witch: 1, villager: 3 } });
    await adapter.startGame(['werewolf', 'seer', 'witch', 'villager', 'villager', 'villager']);
    await adapter.startFirstNight();

    await adapter.abortGameToLobby();
    let state = adapter.getState();
    expect(state.publicView?.phase).toBe('LOBBY');
    expect(state.postGameView).toBeNull();
    expect(state.privateView).toBeNull();
    expect(state.publicView?.players.length).toBe(6);

    await adapter.startGame(['werewolf', 'seer', 'witch', 'villager', 'villager', 'villager']);
    await adapter.startFirstNight();
    await adapter.endGameToSummary();

    state = adapter.getState();
    expect(state.publicView?.phase).toBe('GAME_OVER');
    expect(state.postGameView).not.toBeNull();
    expect(state.postGameView?.winOutcome?.winner).toBe('DRAW');
  });

  it('submitPublicHandVotes giữ dayVerdict (isPendingNextNight: true) và proceedToNextNight chuyển sang NIGHT', async () => {
    const adapter = createPopulatedAdapter(6);
    await adapter.startGame(['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager']);
    await adapter.startFirstNight();

    const roomState = (adapter as unknown as { roomState: any }).roomState;
    const villager = roomState.gameState.players.find((p: any) => p.roleId === 'villager');
    roomState.gameState.phase = 'DAY_DISCUSS';

    await adapter.submitPublicHandVotes({ [villager.id]: 4 });

    let state = adapter.getState();
    expect(state.publicView?.phase).toBe('DAY_DISCUSS');
    expect(state.publicView?.roundNumber).toBe(1);
    expect(state.publicView?.dayVerdict?.isPendingNextNight).toBe(true);
    expect(state.publicView?.dayVerdict?.headline).toContain(villager.name);

    await adapter.proceedToNextNight();
    state = adapter.getState();
    expect(state.publicView?.phase).toBe('NIGHT');
    expect(state.publicView?.roundNumber).toBe(2);
    expect(state.publicView?.dayVerdict).toBeNull();
  });

  it('hostUnlockVote mở khóa voteLocked ngay lập tức trong pha DAY_DISCUSS', async () => {
    const adapter = createPopulatedAdapter(6);
    await adapter.startGame(['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager']);
    await adapter.startFirstNight();

    const roomState = (adapter as unknown as { roomState: any }).roomState;
    roomState.gameState.phase = 'DAY_DISCUSS';
    roomState.gameState.dayState = {
      discussionSecondsRemaining: 180,
      voteLockRemainingSeconds: 45,
      voteLocked: true,
      isPaused: false,
      extensionsUsed: 0,
      ballots: {},
    };
    roomState.timers.voteLockDeadlineAt = Date.now() + 45000;

    await adapter.hostUnlockVote();
    const state = adapter.getState();
    expect(state.publicView?.voteLocked).toBe(false);
    expect(state.publicView?.voteLockRemainingSeconds).toBe(0);
    expect(roomState.timers.voteLockDeadlineAt).toBeUndefined();
  });

  it('leaveRoom xóa sạch localStorage để F5 không tự vào lại phòng cũ', async () => {
    const store = new Map<string, string>();
    const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };

    try {
      const adapter = createPopulatedAdapter(6);
      await adapter.startGame(['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager']);
      expect(adapter.hasRecoverableSession()).toBe(true);

      await adapter.leaveRoom();
      expect(adapter.hasRecoverableSession()).toBe(false);
      expect(await adapter.resumeSession()).toBe(false);
      expect(adapter.getState().publicView).toBeNull();
      expect(adapter.getState().roomCode).toBe('');
    } finally {
      if (prevLocalStorage === undefined) {
        delete (globalThis as Record<string, unknown>).localStorage;
      } else {
        (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
      }
    }
  });

  it('xuất đúng morningAnnouncements, postGameView.matchEvents và phục hồi eventLog nguyên vẹn qua F5 + endGameToSummary', async () => {
    const store = new Map<string, string>();
    const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };

    try {
      const adapter = createPopulatedAdapter(6);
      await adapter.startGame([
        'werewolf',
        'bear_tamer',
        'spellcaster',
        'seer',
        'villager',
        'villager',
      ]);
      await adapter.startFirstNight();

      const roomState = (adapter as unknown as { roomState: any }).roomState;
      const bear = roomState.gameState.players.find((p: any) => p.roleId === 'bear_tamer');
      const seer = roomState.gameState.players.find((p: any) => p.roleId === 'seer');
      const villagers = roomState.gameState.players.filter((p: any) => p.roleId === 'villager');

      // Chạy trực tiếp 1 đêm có cả nạn nhân chết + Gấu gầm + Cấm nói
      const n1 = executeNightPhase(roomState.gameState, {
        wolfPack: { targets: [villagers[0].id] },
        spellcaster: { targetId: bear.id },
        seer: { targetId: seer.id },
      });
      roomState.gameState = n1.nextState;
      await (adapter as any).emitState();

      // morningAnnouncements ưu tiên DAWN_SUMMARY lên đầu (không bị BEAR_GROWL hay MUTE_ANNOUNCE đè)
      const morning = adapter.getState().publicView?.morningAnnouncements ?? [];
      expect(morning.length).toBeGreaterThanOrEqual(2);
      expect(morning[0].actionType).toBe('DAWN_SUMMARY');
      expect(morning[0].text).toContain(villagers[0].name);
      // Chưa GAME_OVER thì tuyệt đối không lộ SECRET_NIGHT vào publicTimeline
      expect(
        adapter.getState().publicView?.publicTimeline.some((i) => i.text.includes('Tiên tri'))
      ).toBe(false);

      // F5 reload qua adapter thứ 2: giữ nguyên eventLog & eventSeq
      const prevSeq = roomState.gameState.eventSeq;
      const resumedAdapter = new LocalEngineAdapter();
      const restored = await resumedAdapter.resumeSession();
      expect(restored).toBe(true);
      const resumedRoom = (resumedAdapter as unknown as { roomState: any }).roomState;
      expect(resumedRoom.gameState.eventSeq).toBe(prevSeq);

      // Gọi day vote không lặp morning announcement
      resumedRoom.gameState = executeDayVote(resumedRoom.gameState, null).nextState;

      // Host kết thúc sớm ván -> sinh WIN (DRAW) & mở full matchEvents
      await resumedAdapter.endGameToSummary();
      const postGame = resumedAdapter.getState().postGameView;
      expect(postGame).not.toBeNull();
      expect(postGame!.matchEvents.some((e) => e.actionType === 'ATTACK')).toBe(true);
      expect(postGame!.matchEvents.some((e) => e.actionType === 'WIN')).toBe(true);

      // Rematch dọn sạch
      await resumedAdapter.hostRematch();
      expect(resumedAdapter.getState().postGameView).toBeNull();
      expect(resumedAdapter.getState().publicView?.publicTimeline).toEqual([]);
    } finally {
      if (prevLocalStorage === undefined) {
        delete (globalThis as Record<string, unknown>).localStorage;
      } else {
        (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
      }
    }
  });

  it('hostEmergencyEliminate xóa pendingDayVerdict khi chuyển HUNTER_SHOT và khôi phục NIGHT giữa đêm không nhảy vòng', async () => {
    const adapter = createPopulatedAdapter(8);
    await adapter.startGame([
      'hunter',
      'werewolf',
      'seer',
      'villager',
      'villager',
      'villager',
      'villager',
      'villager',
    ]);
    await adapter.startFirstNight();

    const roomState = (adapter as unknown as { roomState: any }).roomState;
    const hunter = roomState.gameState.players.find((p: any) => p.roleId === 'hunter');
    const villagers = roomState.gameState.players.filter((p: any) => p.roleId === 'villager');

    // 1. Vào ban ngày và chốt hòa -> hiện pendingDayVerdict
    roomState.gameState = executeNightPhase(roomState.gameState, {
      wolfPack: { targets: [villagers[0].id] },
    }).nextState;
    await adapter.submitPublicHandVotes({});
    expect(adapter.getState().publicView?.dayVerdict?.isPendingNextNight).toBe(true);

    // Trục xuất Thợ săn -> chuyển HUNTER_SHOT và phải xóa sạch dayVerdict cũ
    await adapter.hostEmergencyEliminate(hunter.id);
    expect(adapter.getState().publicView?.phase).toBe('HUNTER_SHOT');
    expect(adapter.getState().publicView?.activeHunterPlayerId).toBe(hunter.id);
    expect(adapter.getState().publicView?.dayVerdict).toBeNull();

    await adapter.sendHunterShot(villagers[1].id);
    expect(adapter.getState().publicView?.phase).toBe('DAY_DISCUSS');

    // 2. Test ngắt giữa NIGHT: trục xuất một Hunter thứ 2 giữa Đêm -> bắn xong quay lại đúng round hiện tại
    await adapter.proceedToNextNight();
    const roundAtNight = roomState.gameState.roundNumber;
    const seer = roomState.gameState.players.find((p: any) => p.roleId === 'seer');
    seer.roleId = 'hunter';
    await adapter.hostEmergencyEliminate(seer.id);
    expect(adapter.getState().publicView?.phase).toBe('HUNTER_SHOT');
    await adapter.sendHunterShot(villagers[2].id);
    expect(roomState.gameState.phase).toBe('NIGHT');
    expect(roomState.gameState.roundNumber).toBe(roundAtNight);

    // 3. Chained HUNTER_SHOT (Hunter 1 bắn Hunter 2): cập nhật state.playerId & activeHunterPlayerId sang Hunter 2
    const hunterA = roomState.gameState.players.find((p: any) => p.isAlive && p.roleId === 'villager');
    const hunterB = roomState.gameState.players.filter((p: any) => p.isAlive && p.roleId === 'villager')[1];
    hunterA.roleId = 'hunter';
    hunterB.roleId = 'hunter';
    await adapter.hostEmergencyEliminate(hunterA.id);
    expect(adapter.getState().playerId).toBe(hunterA.id);
    await adapter.sendHunterShot(hunterB.id);
    expect(adapter.getState().publicView?.phase).toBe('HUNTER_SHOT');
    expect(adapter.getState().playerId).toBe(hunterB.id);
    expect(adapter.getState().publicView?.activeHunterPlayerId).toBe(hunterB.id);
  });
});
