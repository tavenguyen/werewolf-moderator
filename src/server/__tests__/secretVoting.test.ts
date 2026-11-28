import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { RoomService } from '../roomService';
import { TimerManager } from '../timerManager';
import { SocketGateway } from '../socketGateway';
import { createMockIoServer, type MockSocketIOServer, type MockClientSocket } from './mockSocket';
import { createInitialDayState } from '../../engine/voting';
import { createPublicRoomView } from '../projections';

describe('Realtime Backend - Secret Voting & Tally Secrecy', () => {
  let mockIo: MockSocketIOServer;
  let roomService: RoomService;
  let timerManager: TimerManager;
  let gateway: SocketGateway;
  const clientSockets: MockClientSocket[] = [];

  beforeEach(() => {
    mockIo = createMockIoServer();
    roomService = new RoomService();
    timerManager = new TimerManager({ minNightDelaySec: 5, maxNightDelaySec: 5 });
    gateway = new SocketGateway(mockIo as any, roomService, timerManager);
    gateway.registerEvents();
  });

  afterEach(() => {
    for (const c of clientSockets) {
      c.disconnect();
    }
    clientSockets.length = 0;
    roomService.destroy();
    mockIo.close();
  });

  const createClient = (): MockClientSocket => {
    const c = mockIo.createClientSocket();
    clientSockets.push(c);
    return c;
  };

  const setupDayGame = async () => {
    const hostClient = createClient();
    const createRes: any = await new Promise((resolve) => {
      hostClient.emit('room:create', { isPlayer: false }, resolve);
    });
    const roomCode = createRes.data.roomCode;
    const hostToken = createRes.data.hostToken;

    const players: Array<{ client: MockClientSocket; token: string; id: string; name: string }> = [];

    for (let i = 1; i <= 6; i++) {
      const client = createClient();
      const joinRes: any = await new Promise((resolve) => {
        client.emit('room:join', { roomCode, username: `Player ${i}` }, resolve);
      });
      players.push({
        client,
        token: joinRes.data.playerToken,
        id: joinRes.data.playerId,
        name: `Player ${i}`,
      });
    }

    // Start game
    await new Promise((resolve) => {
      hostClient.emit(
        'lobby:start',
        {
          roomCode,
          token: hostToken,
          customRoleIds: ['werewolf', 'werewolf', 'seer', 'witch', 'villager', 'villager'],
        },
        resolve
      );
    });

    const room = roomService.getRoom(roomCode)!;
    // Chuyển sang DAY_DISCUSS và mở khóa vote
    room.gameState!.phase = 'DAY_DISCUSS';
    room.gameState!.dayState = createInitialDayState();
    room.gameState!.dayState.voteLocked = false;
    room.gameState!.dayState.voteLockRemainingSeconds = 0;

    return { hostClient, roomCode, hostToken, players, room };
  };

  it('chốt sớm khi mọi người đã gửi phiếu (kể cả phiếu trắng), tally chỉ có số phiếu và số phiếu trắng', async () => {
    const { hostClient, roomCode, hostToken, players, room } = await setupDayGame();

    // Player 0 vote cho Player 2
    // Player 1 vote cho Player 2
    // Player 2 vote cho Player 3
    // Player 3 bỏ phiếu trắng (null)
    // Player 4 và Player 5 bỏ phiếu trắng (null)

    await new Promise((resolve) => {
      players[0].client.emit(
        'day:vote',
        { roomCode, token: players[0].token, targetPlayerId: players[2].id },
        resolve
      );
    });

    await new Promise((resolve) => {
      players[1].client.emit(
        'day:vote',
        { roomCode, token: players[1].token, targetPlayerId: players[2].id },
        resolve
      );
    });

    await new Promise((resolve) => {
      players[2].client.emit(
        'day:vote',
        { roomCode, token: players[2].token, targetPlayerId: players[3].id },
        resolve
      );
    });

    await new Promise((resolve) => {
      players[3].client.emit(
        'day:vote',
        { roomCode, token: players[3].token, targetPlayerId: null },
        resolve
      );
    });

    await new Promise((resolve) => {
      players[4].client.emit(
        'day:vote',
        { roomCode, token: players[4].token, targetPlayerId: null },
        resolve
      );
    });

    await new Promise((resolve) => {
      players[5].client.emit(
        'day:vote',
        { roomCode, token: players[5].token, targetPlayerId: null },
        resolve
      );
    });

    // Mọi người đã gửi phiếu -> Host chốt sớm thành công
    const tallyRes: any = await new Promise((resolve) => {
      hostClient.emit('day:finalizePublicVote', { roomCode, token: hostToken }, resolve);
    });
    expect(tallyRes.ok).toBe(true);

    const tally = room.lastVoteTally;
    expect(tally).toBeDefined();

    // Player 2 nhận 2 phiếu (từ player 0 và 1)
    expect(tally!.tallies[players[2].id]).toBe(2);
    // Player 3 nhận 1 phiếu (từ player 2)
    expect(tally!.tallies[players[3].id]).toBe(1);
    // Phiếu trắng: player 3, 4, 5 chọn null = 3
    expect(tally!.abstainCount).toBe(3);

    // TUYỆT ĐỐI không có thông tin cá nhân ai vote ai trong tally
    expect((tally as any).ballots).toBeUndefined();
    expect((tally as any).voters).toBeUndefined();
    expect((tally as any).voterDetails).toBeUndefined();
  });

  it('khi hết giờ timer, người không gửi phiếu tự động tính là abstain và Trưởng làng có 2 phiếu', async () => {
    const { roomCode, players, room } = await setupDayGame();

    // Chỉ định Player 0 làm Trưởng làng với trọng số 2 phiếu
    room.gameState!.mayorId = players[0].id;
    const mayorState = room.gameState!.players.find((p) => p.id === players[0].id)!;
    mayorState.voteWeight = 2;

    // Trưởng làng (Player 0) vote cho Player 1 -> được tính 2 phiếu
    await new Promise((resolve) => {
      players[0].client.emit(
        'day:vote',
        { roomCode, token: players[0].token, targetPlayerId: players[1].id },
        resolve
      );
    });

    // Player 1 vote cho Player 0 -> được tính 1 phiếu
    await new Promise((resolve) => {
      players[1].client.emit(
        'day:vote',
        { roomCode, token: players[1].token, targetPlayerId: players[0].id },
        resolve
      );
    });

    // Player 2, 3, 4, 5 không vote (chưa gửi hoặc disconnect)
    // Server tự động chốt khi hết giờ timer thảo luận
    gateway.executeFinalizeDayVote(room);

    const tally = room.lastVoteTally!;
    expect(tally).toBeDefined();
    expect(tally.tallies[players[1].id]).toBe(2); // Trọng số 2 phiếu của Trưởng làng
    expect(tally.tallies[players[0].id]).toBe(1);
    // 4 người còn lại không gửi -> tính là 4 phiếu trắng
    expect(tally.abstainCount).toBe(4);
  });

  it('F-10: cập nhật lastVoteTally khi kết thúc vòng biểu quyết Runoff', async () => {
    const { roomCode, players, room } = await setupDayGame();

    // Thiết lập vòng Runoff giữa Player 1 và Player 2
    room.gameState!.phase = 'DAY_RUNOFF';
    room.gameState!.dayState!.runoffCandidates = [players[1].id, players[2].id];
    room.gameState!.dayState!.runoffBallots = {
      [players[0].id]: players[1].id,
      [players[1].id]: players[2].id,
      [players[2].id]: players[1].id,
      [players[3].id]: players[1].id,
      [players[4].id]: null, // Abstain
      // Player 5 chưa gửi
    };

    // Chốt vòng Runoff
    (gateway as any).finalizeRunoffVote(room);

    // Chờ queue xử lý
    await new Promise((r) => setTimeout(r, 20));

    const tally = room.lastVoteTally;
    expect(tally).toBeDefined();
    // Player 1 nhận 3 phiếu (từ player 0, 2, 3)
    expect(tally!.tallies[players[1].id]).toBe(3);
    // Player 2 nhận 1 phiếu (từ player 1)
    expect(tally!.tallies[players[2].id]).toBe(1);
    // Phiếu trắng: player 4 (1) + player 5 (1) = 2
    expect(tally!.abstainCount).toBe(2);
    const pubView = createPublicRoomView(room);
    expect(
      pubView.publicTimeline.some(
        (i) => i.actionType === 'VOTE_EXECUTION' && i.text.includes(players[1].name)
      )
    ).toBe(true);
    expect(
      pubView.publicLogs.some((l) => l.includes(players[1].name) && l.includes('treo cổ'))
    ).toBe(true);
    expect(
      room.gameState!.eventLog.some(
        (e) => e.actionType === 'VOTE_EXECUTION' && e.metadata?.vote?.voteKind === 'RUNOFF'
      )
    ).toBe(true);
  });

  it('executeFinalizeDayVote cập nhật runoffCandidates/runoffBallots khi hòa phiếu RUNOFF và không ghi log trời sáng trước NIGHT', async () => {
    const { roomCode, players, room } = await setupDayGame();
    room.settings.tieVoteMode = 'RUNOFF';
    room.gameState!.settings.tieVoteMode = 'RUNOFF';

    // Hòa phiếu giữa players[1] và players[2]
    await new Promise((r) =>
      players[0].client.emit('day:vote', { roomCode, token: players[0].token, targetPlayerId: players[1].id }, r)
    );
    await new Promise((r) =>
      players[3].client.emit('day:vote', { roomCode, token: players[3].token, targetPlayerId: players[2].id }, r)
    );

    gateway.executeFinalizeDayVote(room);

    expect(room.gameState!.phase).toBe('DAY_RUNOFF');
    expect(room.gameState!.dayState?.runoffCandidates).toEqual([players[1].id, players[2].id]);
    expect(room.gameState!.dayState?.runoffBallots).toEqual({});
    expect(
      createPublicRoomView(room).publicTimeline.some(
        (i) => i.actionType === 'VOTE_TALLY' && i.text.includes('Runoff')
      )
    ).toBe(true);

    // Vòng 2: cả làng tha bổng -> sang NIGHT mà không có log "Trời đã sáng"
    (gateway as any).finalizeRunoffVote(room);
    await new Promise((r) => setTimeout(r, 20));

    expect(room.gameState!.phase).toBe('NIGHT');
    const pubView = createPublicRoomView(room);
    expect(
      pubView.publicTimeline.some(
        (i) => i.text.includes('Trời đã sáng') || i.actionType === 'DAWN_SUMMARY'
      )
    ).toBe(false);
    expect(pubView.publicLogs.some((l) => l.includes('Trời đã sáng'))).toBe(false);
    expect(room.gameState!.eventLog.some((e) => e.stage === 'DAY_ANNOUNCEMENT')).toBe(false);
  });

  it('finalizeRunoffVote chuyển MAYOR_SUCCESSION và khởi động timer khi Trưởng làng bị treo cổ', async () => {
    const { players, room } = await setupDayGame();
    room.gameState!.mayorId = players[1].id;
    room.gameState!.players.find((p) => p.id === players[1].id)!.voteWeight = 2;

    room.gameState!.phase = 'DAY_RUNOFF';
    room.gameState!.dayState!.runoffCandidates = [players[1].id, players[2].id];
    room.gameState!.dayState!.runoffBallots = {
      [players[0].id]: players[1].id,
      [players[2].id]: players[1].id,
      [players[3].id]: players[1].id,
      [players[4].id]: players[1].id,
    };

    (gateway as any).finalizeRunoffVote(room);
    await new Promise((r) => setTimeout(r, 20));

    expect(room.gameState!.phase).toBe('MAYOR_SUCCESSION');
    expect(room.gameState!.pendingMayorSuccessionPlayerId).toBe(players[1].id);
    expect(room.timers.phase).toBe('MAYOR_SUCCESSION');
    expect(room.timers.deadlineAt).not.toBeNull();
  });

  it('emergencyEliminate qua SocketGateway chuyển HUNTER_SHOT và khởi động timer', async () => {
    const { hostClient, roomCode, hostToken, room } = await setupDayGame();
    // Thay một villager thành hunter
    const villager = room.gameState!.players.find((p) => p.roleId === 'villager')!;
    villager.roleId = 'hunter';
    villager.initialRoleId = 'hunter';

    const res: any = await new Promise((resolve) => {
      hostClient.emit(
        'host:emergencyEliminate',
        { roomCode, token: hostToken, targetPlayerId: villager.id },
        resolve
      );
    });
    expect(res.ok).toBe(true);
    expect(room.gameState!.phase).toBe('HUNTER_SHOT');
    expect(room.timers.phase).toBe('HUNTER_SHOT');
    expect(room.timers.deadlineAt).not.toBeNull();
  });

  it('bảo vệ phase & generation cho double-finalize và stale timer callbacks', async () => {
    const { hostClient, roomCode, hostToken, players, room } = await setupDayGame();

    // 1. Host chốt DAY_MAYOR_ELECTION trực tiếp qua day:finalizePublicVote (không bị double-enqueue)
    room.gameState!.phase = 'DAY_MAYOR_ELECTION';
    room.gameState!.dayState = createInitialDayState();
    room.gameState!.dayState.mayorBallots = { [players[0].id]: players[1].id };

    const mayorRes: any = await new Promise((resolve) => {
      hostClient.emit('day:finalizePublicVote', { roomCode, token: hostToken }, resolve);
    });
    expect(mayorRes.ok).toBe(true);
    expect(room.gameState!.phase).toBe('DAY_DISCUSS');
    expect(room.gameState!.mayorId).toBe(players[1].id);

    // 2. Stale callback từ DAY_MAYOR_ELECTION không làm hỏng DAY_DISCUSS
    const timelineLenBeforeStale = createPublicRoomView(room).publicTimeline.length;
    const publicLogsLenBeforeStale = createPublicRoomView(room).publicLogs.length;
    const eventLogLenBeforeStale = room.gameState!.eventLog.length;
    gateway.executeFinalizeMayorElection(room);
    expect(room.gameState!.phase).toBe('DAY_DISCUSS');
    expect(createPublicRoomView(room).publicTimeline.length).toBe(timelineLenBeforeStale);
    expect(createPublicRoomView(room).publicLogs.length).toBe(publicLogsLenBeforeStale);
    expect(room.gameState!.eventLog.length).toBe(eventLogLenBeforeStale);

    // 3. Stale generation cho executeFinalizeDayVote / executeFinalizeRunoffVote / advanceNightTurn
    gateway.executeFinalizeDayVote(room, room.gameGeneration - 1);
    expect(room.gameState!.phase).toBe('DAY_DISCUSS');

    room.gameState!.phase = 'DAY_RUNOFF';
    room.gameState!.dayState!.runoffCandidates = [players[0].id, players[1].id];
    room.gameState!.dayState!.runoffBallots = {};
    gateway.executeFinalizeRunoffVote(room, room.gameGeneration - 1);
    expect(room.gameState!.phase).toBe('DAY_RUNOFF');

    // Host chốt DAY_RUNOFF qua day:finalizePublicVote (không double-enqueue) -> chuyển sang NIGHT
    const runoffRes: any = await new Promise((resolve) => {
      hostClient.emit('day:finalizePublicVote', { roomCode, token: hostToken }, resolve);
    });
    expect(runoffRes.ok).toBe(true);
    expect(room.gameState!.phase).toBe('NIGHT');

    // Stale advanceNightTurn với generation cũ hoặc turnIndex cũ không tăng currentNightTurnIndex
    const turnIdxBefore = room.currentNightTurnIndex;
    (gateway as any).advanceNightTurn(room, room.gameGeneration - 1, turnIdxBefore);
    (gateway as any).advanceNightTurn(room, room.gameGeneration, turnIdxBefore + 1);
    await new Promise((r) => setTimeout(r, 20));
    expect(room.currentNightTurnIndex).toBe(turnIdxBefore);
  });

  it('chained HUNTER_SHOT qua SocketGateway khởi động lại HunterShotTimer cho Thợ săn kế tiếp (không soft-lock)', async () => {
    const { hostClient, roomCode, hostToken, players, room } = await setupDayGame();
    // Chừa đúng 1 Ma sói và gán 2 Thợ săn ở phe Dân để sau 2 mạng ngã xuống ván chưa thắng ngay
    const wolves = room.gameState!.players.filter((p) => p.faction === 'WEREWOLF');
    for (let i = 1; i < wolves.length; i++) {
      wolves[i].roleId = 'villager';
      wolves[i].initialRoleId = 'villager';
      wolves[i].faction = 'VILLAGER';
    }
    const villageSide = room.gameState!.players.filter((p) => p.faction === 'VILLAGER');
    const hunter1 = villageSide[0];
    const hunter2 = villageSide[1];
    hunter1.roleId = 'hunter';
    hunter1.initialRoleId = 'hunter';
    hunter2.roleId = 'hunter';
    hunter2.initialRoleId = 'hunter';

    // Bầu treo cổ hunter1 qua day vote -> vào HUNTER_SHOT (hunter1 vẫn giữ playerToken hợp lệ để nổ súng)
    const h1Info = players.find((p) => p.id === hunter1.id)!;
    const h2Info = players.find((p) => p.id === hunter2.id)!;
    await new Promise((resolve) =>
      h2Info.client.emit(
        'day:vote',
        { roomCode, token: h2Info.token, targetPlayerId: hunter1.id },
        resolve
      )
    );
    gateway.executeFinalizeDayVote(room);
    expect(room.gameState!.phase).toBe('HUNTER_SHOT');
    expect(room.gameState!.pendingHunterShotPlayerId).toBe(hunter1.id);

    // Trong lúc hunter1 đang HUNTER_SHOT, Host loại khẩn cấp hunter2 (thu hồi token & xếp hàng đợi sau hunter1)
    await new Promise((resolve) => {
      hostClient.emit(
        'host:emergencyEliminate',
        { roomCode, token: hostToken, targetPlayerId: hunter2.id },
        resolve
      );
    });
    expect(room.gameState!.phase).toBe('HUNTER_SHOT');
    expect(room.gameState!.pendingHunterShotPlayerId).toBe(hunter1.id);

    // hunter1 bắn 1 dân -> phải tiếp tục phase HUNTER_SHOT cho hunter2 và khởi động timer mới (chống soft-lock)
    const villagerTarget = villageSide[2];
    const shotRes: any = await new Promise((resolve) => {
      h1Info.client.emit(
        'hunter:shot',
        { roomCode, token: h1Info.token, targetPlayerId: villagerTarget.id },
        resolve
      );
    });
    expect(shotRes.ok).toBe(true);
    expect(room.gameState!.phase).toBe('HUNTER_SHOT');
    expect(room.gameState!.pendingHunterShotPlayerId).toBe(hunter2.id);
    expect(room.timers.phase).toBe('HUNTER_SHOT');
    expect(room.timers.deadlineAt).not.toBeNull();
  });

  it('executeFinalizeMayorElection cập nhật lastVoteTally và ẩn/hiện voterDetails theo revealVoterIdentities', async () => {
    const { hostClient, roomCode, hostToken, players, room } = await setupDayGame();
    room.gameState!.phase = 'DAY_MAYOR_ELECTION';
    room.gameState!.dayState = createInitialDayState();

    await new Promise((r) =>
      players[0].client.emit('mayor:elect', { roomCode, token: players[0].token, candidateId: players[1].id }, r)
    );
    await new Promise((r) =>
      players[2].client.emit('mayor:elect', { roomCode, token: players[2].token, candidateId: players[1].id }, r)
    );
    await new Promise((r) =>
      players[3].client.emit('mayor:elect', { roomCode, token: players[3].token, candidateId: null }, r)
    );

    const mayorRes: any = await new Promise((resolve) => {
      hostClient.emit('day:finalizePublicVote', { roomCode, token: hostToken }, resolve);
    });
    expect(mayorRes.ok).toBe(true);
    expect(room.lastVoteTally).toBeDefined();
    expect(room.lastVoteTally!.tallies[players[1].id]).toBe(2);
    // 4 phiếu trắng: player 3 (null) + players 1, 4, 5 (chưa gửi)
    expect(room.lastVoteTally!.abstainCount).toBe(4);
    expect(room.lastVoteTally!.voterDetails).toBeUndefined();

    // Kiểm tra khi bật revealVoterIdentities = true
    room.settings.revealVoterIdentities = true;
    room.gameState!.phase = 'DAY_MAYOR_ELECTION';
    room.gameState!.dayState = createInitialDayState();
    room.gameState!.dayState.mayorBallots = {
      [players[0].id]: players[2].id,
      [players[1].id]: players[2].id,
    };
    gateway.executeFinalizeMayorElection(room);
    expect(room.lastVoteTally?.voterDetails?.[players[2].id]).toEqual([players[0].id, players[1].id]);
  });

  it('executeFinalizeDayVote & executeFinalizeRunoffVote bỏ qua nạn nhân đã bị trục xuất giữa ngày (không tính tally hoặc doubleVoteDay target 2)', async () => {
    const { hostClient, roomCode, hostToken, players, room } = await setupDayGame();
    // Giữ đúng 1 Ma sói và 5 Dân để loại 1 người chưa kết thúc game
    const wolfState = room.gameState!.players.find((p) => p.faction === 'WEREWOLF')!;
    for (const p of room.gameState!.players) {
      if (p.id !== wolfState.id) {
        p.roleId = 'villager';
        p.initialRoleId = 'villager';
        p.faction = 'VILLAGER';
      }
    }
    const livingVillagers = players.filter((p) => p.id !== wolfState.id);
    const wolfClient = players.find((p) => p.id === wolfState.id)!;

    room.gameState!.doubleVoteDay = true;
    // v[0], v[1] vote cho v[3]; wolf, v[2] vote cho v[4] (bị trục xuất); v[3] vote cho v[2]
    await new Promise((r) =>
      livingVillagers[0].client.emit(
        'day:vote',
        { roomCode, token: livingVillagers[0].token, targetPlayerId: livingVillagers[3].id },
        r
      )
    );
    await new Promise((r) =>
      livingVillagers[1].client.emit(
        'day:vote',
        { roomCode, token: livingVillagers[1].token, targetPlayerId: livingVillagers[3].id },
        r
      )
    );
    await new Promise((r) =>
      wolfClient.client.emit(
        'day:vote',
        { roomCode, token: wolfClient.token, targetPlayerId: livingVillagers[4].id },
        r
      )
    );
    await new Promise((r) =>
      livingVillagers[2].client.emit(
        'day:vote',
        { roomCode, token: livingVillagers[2].token, targetPlayerId: livingVillagers[4].id },
        r
      )
    );
    await new Promise((r) =>
      livingVillagers[3].client.emit(
        'day:vote',
        { roomCode, token: livingVillagers[3].token, targetPlayerId: livingVillagers[2].id },
        r
      )
    );

    // Host trục xuất khẩn cấp livingVillagers[4] giữa ngày
    const elimRes: any = await new Promise((resolve) => {
      hostClient.emit(
        'host:emergencyEliminate',
        { roomCode, token: hostToken, targetPlayerId: livingVillagers[4].id },
        resolve
      );
    });
    expect(elimRes.ok).toBe(true);
    expect(room.gameState!.players.find((p) => p.id === livingVillagers[4].id)?.isAlive).toBe(false);

    // Chốt phiếu ngày: livingVillagers[4] đã chết nên phiếu vào người này tính là abstain,
    // target 2 của doubleVoteDay phải là livingVillagers[2] (1 phiếu), KHÔNG phải người đã chết
    gateway.executeFinalizeDayVote(room);
    expect(room.lastVoteTally?.tallies[livingVillagers[4].id]).toBeUndefined();
    expect(room.lastVoteTally?.tallies[livingVillagers[3].id]).toBe(2);
    expect(room.lastVoteTally?.tallies[livingVillagers[2].id]).toBe(1);
    expect(room.gameState!.players.find((p) => p.id === livingVillagers[3].id)?.isAlive).toBe(false);
    expect(room.gameState!.players.find((p) => p.id === livingVillagers[2].id)?.isAlive).toBe(false);
    expect(room.gameState!.deaths.filter((d) => d.playerId === livingVillagers[4].id).length).toBe(1);

    // Kiểm tra executeFinalizeRunoffVote cũng lọc target.isAlive trong lastVoteTally
    // Giữ thêm 1 dân sống để sau khi trục xuất không kích hoạt GAME_OVER ngay
    room.gameState!.players.find((p) => p.id === livingVillagers[2].id)!.isAlive = true;
    room.gameState!.phase = 'DAY_RUNOFF';
    room.gameState!.roundNumber = 2;
    room.gameState!.dayState = createInitialDayState();
    room.gameState!.dayState.runoffCandidates = [livingVillagers[0].id, livingVillagers[1].id];
    room.gameState!.dayState.runoffBallots = {
      [wolfClient.id]: livingVillagers[0].id,
      [livingVillagers[0].id]: livingVillagers[1].id,
    };
    // Trục xuất livingVillagers[1] giữa vòng Runoff
    await new Promise((resolve) => {
      hostClient.emit(
        'host:emergencyEliminate',
        { roomCode, token: hostToken, targetPlayerId: livingVillagers[1].id },
        resolve
      );
    });
    gateway.executeFinalizeRunoffVote(room);
    expect(room.lastVoteTally?.tallies[livingVillagers[1].id]).toBeUndefined();
    expect(room.lastVoteTally?.tallies[livingVillagers[0].id]).toBe(1);
    expect(room.gameState!.players.find((p) => p.id === livingVillagers[0].id)?.isAlive).toBe(
      false
    );
  });

  it('host:unlockVote thêm thông báo mở hòm phiếu sớm vào publicLogs và tự dọn sạch khi sang NIGHT / Ngày 2 / GAME_OVER', async () => {
    const { hostClient, roomCode, hostToken, players, room } = await setupDayGame();
    room.gameState!.dayState!.voteLocked = true;
    room.gameState!.dayState!.voteLockRemainingSeconds = 40;
    timerManager.startDayDiscussTimer(room, () => undefined, () => undefined, 180, 40);

    const unlockRes: any = await new Promise((resolve) => {
      hostClient.emit('host:unlockVote', { roomCode, token: hostToken }, resolve);
    });
    expect(unlockRes.ok).toBe(true);
    expect(unlockRes.data.unlocked).toBe(true);

    // Ngay cả trước Bình minh 1 (publicTimeline rỗng), publicLogs vẫn hiển thị thông báo mở phiếu sớm
    const pubDuringDay1 = createPublicRoomView(room);
    expect(pubDuringDay1.publicTimeline).toEqual([]);
    expect(pubDuringDay1.publicLogs).toEqual(['Quản trò đã mở hòm phiếu sớm!']);

    // Chốt vote để sang NIGHT -> thông báo mở phiếu sớm của Ngày 1 phải bị dọn sạch
    gateway.executeFinalizeDayVote(room);
    expect(room.gameState!.phase).toBe('NIGHT');
    expect(room.publicHistoryLogs).not.toContain('Quản trò đã mở hòm phiếu sớm!');
    expect(createPublicRoomView(room).publicLogs).not.toContain('Quản trò đã mở hòm phiếu sớm!');

    // Mở khóa lại lần nữa ở Ngày 2 rồi kết thúc game -> không chảy sang GAME_OVER
    room.gameState!.phase = 'DAY_DISCUSS';
    room.gameState!.dayState = createInitialDayState();
    timerManager.startDayDiscussTimer(room, () => undefined, () => undefined, 180, 40);
    await new Promise((resolve) => {
      hostClient.emit('host:unlockVote', { roomCode, token: hostToken }, resolve);
    });
    expect(createPublicRoomView(room).publicLogs).toContain('Quản trò đã mở hòm phiếu sớm!');

    // Trục xuất cả 2 sói để vào GAME_OVER
    const wolves = room.gameState!.players.filter((p) => p.faction === 'WEREWOLF');
    for (const w of wolves) {
      await new Promise((resolve) => {
        hostClient.emit('host:emergencyEliminate', { roomCode, token: hostToken, targetPlayerId: w.id }, resolve);
      });
    }
    expect(room.gameState!.phase).toBe('GAME_OVER');
    expect(room.publicHistoryLogs).not.toContain('Quản trò đã mở hòm phiếu sớm!');
    expect(createPublicRoomView(room).publicLogs).not.toContain('Quản trò đã mở hòm phiếu sớm!');
  });
});
