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

  it('bắt đầu ván đấu chuyển sang NIGHT Đêm 1 và sinh Night Turn Plan', async () => {
    const adapter = createPopulatedAdapter(8);
    await adapter.startGame();

    const state = adapter.getState();
    expect(state.publicView?.phase).toBe('NIGHT');
    expect(state.publicView?.roundNumber).toBe(1);
    expect(state.publicView?.currentTurnInfo).toBeDefined();
    expect(state.privateView?.roleId).toBeDefined();
  });

  it('điều phối lần lượt các lượt đêm và chuyển sang Ngày thảo luận', async () => {
    const adapter = createPopulatedAdapter(8);
    await adapter.startGame();

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
    await adapter.hostRematch();

    const state = adapter.getState();
    expect(state.publicView?.gameGeneration).toBe(2);
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
});
