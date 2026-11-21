import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { RoomService } from '../roomService';
import { TimerManager } from '../timerManager';
import { SocketGateway } from '../socketGateway';
import { createMockIoServer, type MockSocketIOServer, type MockClientSocket } from './mockSocket';
import { createInitialDayState } from '../../engine/voting';

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
  });
});
