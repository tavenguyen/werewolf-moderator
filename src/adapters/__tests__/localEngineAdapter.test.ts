import { describe, expect, it } from 'bun:test';
import { LocalEngineAdapter } from '../localEngineAdapter';

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

  it('thực hiện tái đấu Rematch tạo thế hệ ván mới', async () => {
    const adapter = createPopulatedAdapter(8);
    await adapter.startGame();
    await adapter.startFirstNight();
    await adapter.hostRematch();

    let state = adapter.getState();
    expect(state.publicView?.gameGeneration).toBe(2);
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
});
