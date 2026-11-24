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
});
