import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { RoomService, ROOM_IDLE_TIMEOUT_MS } from '../roomService';
import { TimerManager } from '../timerManager';
import { SocketGateway } from '../socketGateway';
import { createMockIoServer, type MockSocketIOServer, type MockClientSocket } from './mockSocket';

describe('Realtime Backend - Room Lifecycle & Authentication', () => {
  let mockIo: MockSocketIOServer;
  let roomService: RoomService;
  let timerManager: TimerManager;
  let gateway: SocketGateway;
  const clientSockets: MockClientSocket[] = [];

  beforeEach(() => {
    mockIo = createMockIoServer();
    roomService = new RoomService();
    timerManager = new TimerManager();
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

  it('tạo phòng sinh đúng mã 4 số và token CSPRNG cho Host bảng trung tâm', async () => {
    const client = createClient();

    const res: any = await new Promise((resolve) => {
      client.emit('room:create', { isPlayer: false }, resolve);
    });

    expect(res.ok).toBe(true);
    expect(res.data.roomCode).toMatch(/^\d{4}$/);
    expect(res.data.hostToken).toBeDefined();
    expect(typeof res.data.hostToken).toBe('string');
    expect(res.data.hostToken.length).toBeGreaterThanOrEqual(32);
    expect(res.data.playerToken).toBeUndefined();
    expect(res.data.playerId).toBeUndefined();

    const room = roomService.getRoom(res.data.roomCode);
    expect(room).toBeDefined();
    expect(room?.host.isPlayer).toBe(false);
    expect(room?.players.size).toBe(0);
  });

  it('tạo phòng cho Host kiêm người chơi: có ghế và playerToken', async () => {
    const client = createClient();

    const res: any = await new Promise((resolve) => {
      client.emit('room:create', { isPlayer: true, username: 'Alice Host' }, resolve);
    });

    expect(res.ok).toBe(true);
    expect(res.data.roomCode).toMatch(/^\d{4}$/);
    expect(res.data.hostToken).toBeDefined();
    expect(res.data.playerToken).toBeDefined();
    expect(res.data.playerId).toBeDefined();

    const room = roomService.getRoom(res.data.roomCode);
    expect(room).toBeDefined();
    expect(room?.host.isPlayer).toBe(true);
    expect(room?.players.size).toBe(1);

    const player = room?.players.get(res.data.playerId);
    expect(player?.name).toBe('Alice Host');
    expect(player?.seatIndex).toBe(0);
  });

  it('từ chối tham gia khi phòng không tồn tại với mã lỗi ROOM_NOT_FOUND', async () => {
    const client = createClient();
    const joinRes: any = await new Promise((resolve) => {
      client.emit('room:join', { roomCode: '9999', username: 'Tester' }, resolve);
    });

    expect(joinRes.ok).toBe(false);
    expect(joinRes.error.code).toBe('ROOM_NOT_FOUND');
    expect(joinRes.error.message).toBe('Bàn chưa tồn tại hoặc đã kết thúc.');
  });

  it('từ chối tham gia khi trùng username (case-insensitive & trimmed)', async () => {
    const clientHost = createClient();
    const clientPlayer1 = createClient();
    const clientPlayer2 = createClient();

    const createRes: any = await new Promise((resolve) => {
      clientHost.emit('room:create', { isPlayer: false }, resolve);
    });
    const roomCode = createRes.data.roomCode;

    const join1: any = await new Promise((resolve) => {
      clientPlayer1.emit('room:join', { roomCode, username: '  Minh An  ' }, resolve);
    });
    expect(join1.ok).toBe(true);
    expect(join1.data.seatIndex).toBe(0);

    const join2: any = await new Promise((resolve) => {
      clientPlayer2.emit('room:join', { roomCode, username: 'minh an' }, resolve);
    });
    expect(join2.ok).toBe(false);
    expect(join2.error.code).toBe('NAME_TAKEN');
  });

  it('cho phép reconnect bằng token đúng và từ chối token sai', async () => {
    const client1 = createClient();

    const createRes: any = await new Promise((resolve) => {
      client1.emit('room:create', { isPlayer: true, username: 'HostPlayer' }, resolve);
    });
    const { roomCode, playerToken } = createRes.data;

    // Disconnect client 1
    client1.disconnect();

    // Client mới reconnect bằng đúng token
    const client2 = createClient();
    const resumeRes: any = await new Promise((resolve) => {
      client2.emit('room:resume', { roomCode, token: playerToken }, resolve);
    });

    expect(resumeRes.ok).toBe(true);
    expect(resumeRes.data.playerId).toBeDefined();

    // Token giả mạo bị từ chối
    const fakeClient = createClient();
    const fakeRes: any = await new Promise((resolve) => {
      fakeClient.emit('room:resume', { roomCode, token: 'fake-token-123' }, resolve);
    });
    expect(fakeRes.ok).toBe(false);
    expect(fakeRes.error.code).toBe('INVALID_TOKEN');
  });

  it('tự động dọn phòng khi idle quá 3 giờ', async () => {
    const client = createClient();

    const createRes: any = await new Promise((resolve) => {
      client.emit('room:create', { isPlayer: false }, resolve);
    });
    const roomCode = createRes.data.roomCode;

    const room = roomService.getRoom(roomCode);
    expect(room).toBeDefined();

    // Giả lập thời gian trôi qua hơn 3 giờ
    if (room) {
      room.lastActivityAt = Date.now() - (ROOM_IDLE_TIMEOUT_MS + 1000);
    }

    const cleaned = roomService.cleanupIdleRooms();
    expect(cleaned).toBe(1);
    expect(roomService.getRoom(roomCode)).toBeUndefined();
  });

  it('xử lý sự kiện room:leave thành công trong Lobby', async () => {
    const hostClient = createClient();
    const createRes: any = await new Promise((resolve) => {
      hostClient.emit('room:create', { isPlayer: false }, resolve);
    });
    const roomCode = createRes.data.roomCode;
    const hostToken = createRes.data.hostToken;

    const p1 = createClient();
    const p2 = createClient();

    const j1: any = await new Promise((resolve) => {
      p1.emit('room:join', { roomCode, username: 'Player 1' }, resolve);
    });
    const j2: any = await new Promise((resolve) => {
      p2.emit('room:join', { roomCode, username: 'Player 2' }, resolve);
    });

    const room = roomService.getRoom(roomCode)!;
    expect(room.players.size).toBe(2);

    // Player 1 rời phòng
    const leaveRes: any = await new Promise((resolve) => {
      p1.emit('room:leave', { roomCode, token: j1.data.playerToken }, resolve);
    });
    expect(leaveRes.ok).toBe(true);
    expect(leaveRes.data.left).toBe(true);
    expect(room.players.size).toBe(1);
    // Player 2 được dịch chuyển lên ghế 0
    expect(room.players.get(j2.data.playerId)?.seatIndex).toBe(0);

    // Host rời phòng ở Lobby -> phòng bị hủy
    const hostLeave: any = await new Promise((resolve) => {
      hostClient.emit('room:leave', { roomCode, token: hostToken }, resolve);
    });
    expect(hostLeave.ok).toBe(true);
    expect(roomService.getRoom(roomCode)).toBeUndefined();
  });

  it('từ chối khi Host kiêm người chơi tự loại chính mình qua emergencyEliminate', async () => {
    const hostClient = createClient();
    const createRes: any = await new Promise((resolve) => {
      hostClient.emit('room:create', { isPlayer: true, username: 'Host Alice' }, resolve);
    });
    expect(createRes.ok).toBe(true);
    const roomCode = createRes.data.roomCode;
    const hostToken = createRes.data.hostToken;
    const hostPlayerId = createRes.data.playerId;

    const playerClient = createClient();
    const joinRes: any = await new Promise((resolve) => {
      playerClient.emit('room:join', { roomCode, username: 'Player Bob' }, resolve);
    });
    expect(joinRes.ok).toBe(true);
    const bobPlayerId = joinRes.data.playerId;

    // 1. Host cố tình loại chính mình -> phải thất bại
    const kickSelfRes: any = await new Promise((resolve) => {
      hostClient.emit(
        'host:emergencyEliminate',
        { roomCode, token: hostToken, targetPlayerId: hostPlayerId },
        resolve
      );
    });
    expect(kickSelfRes.ok).toBe(false);
    expect(kickSelfRes.error.message).toContain('Host không thể tự loại chính mình');

    // Kiểm tra trực tiếp qua roomService: phải quăng Exception
    expect(() => {
      roomService.emergencyEliminate(roomCode, hostToken, hostPlayerId);
    }).toThrow('Host không thể tự loại chính mình khỏi bàn.');

    // 2. Host loại người chơi khác (Bob) -> thành công bình thường
    const kickBobRes: any = await new Promise((resolve) => {
      hostClient.emit(
        'host:emergencyEliminate',
        { roomCode, token: hostToken, targetPlayerId: bobPlayerId },
        resolve
      );
    });
    expect(kickBobRes.ok).toBe(true);
    const room = roomService.getRoom(roomCode)!;
    expect(room.players.has(bobPlayerId)).toBe(false);
    expect(room.players.has(hostPlayerId)).toBe(true);
  });

  it('PLAYER_HOST F5 recovery: disconnect đánh dấu offline và room:resume bằng hostToken khôi phục player socketId + nhận room:playerSnapshot', async () => {
    const hostClient1 = createClient();
    const createRes: any = await new Promise((resolve) => {
      hostClient1.emit('room:create', { isPlayer: true, username: 'HostPlayer' }, resolve);
    });
    expect(createRes.ok).toBe(true);
    const { roomCode, hostToken, playerId } = createRes.data;

    // Thêm 5 người chơi nữa cho đủ 6 người
    for (let i = 2; i <= 6; i++) {
      const c = createClient();
      await new Promise((resolve) => {
        c.emit('room:join', { roomCode, username: `Player ${i}` }, resolve);
      });
    }

    await new Promise((resolve) => {
      hostClient1.emit(
        'lobby:start',
        {
          roomCode,
          token: hostToken,
          customRoleIds: ['seer', 'werewolf', 'werewolf', 'villager', 'villager', 'villager'],
        },
        resolve
      );
    });

    const room = roomService.getRoom(roomCode)!;
    expect(room.players.get(playerId)?.isConnected).toBe(true);

    // 1. Host F5 -> socket 1 disconnect
    hostClient1.disconnect();
    await new Promise((r) => setTimeout(r, 15));

    expect(room.host.socketId).toBeNull();
    expect(room.players.get(playerId)?.socketId).toBeNull();
    expect(room.players.get(playerId)?.isConnected).toBe(false);

    // 2. Host kết nối lại bằng socket 2 và room:resume với hostToken
    const hostClient2 = createClient();
    const emittedPrivateSnapshots: Array<{ target: string; event: string }> = [];
    const origTo = mockIo.to.bind(mockIo);
    mockIo.to = ((target: string) => {
      const res = origTo(target);
      return {
        emit: (event: string, ...args: unknown[]) => {
          if (event === 'room:playerSnapshot') {
            emittedPrivateSnapshots.push({ target, event });
          }
          res.emit(event, ...args);
        },
      };
    }) as typeof mockIo.to;

    const resumeRes: any = await new Promise((resolve) => {
      hostClient2.emit('room:resume', { roomCode, token: hostToken }, resolve);
    });
    expect(resumeRes.ok).toBe(true);
    expect(resumeRes.data.isHost).toBe(true);
    expect(resumeRes.data.isPlayer).toBe(true);

    expect(room.players.get(playerId)?.isConnected).toBe(true);
    expect(room.players.get(playerId)?.socketId).toBe(hostClient2.id);
    expect(
      emittedPrivateSnapshots.some((e) => e.target === hostClient2.id)
    ).toBe(true);

    // 3. PLAYER_HOST gửi night:action bằng hostToken sau khi resume vẫn hoạt động
    const seerIdx = room.nightTurnPlan.findIndex((t) => t.turnKey === 'seer');
    const hostRole = room.gameState!.players.find((p) => p.id === playerId)!.roleId;
    if (hostRole === 'seer' && seerIdx >= 0) {
      room.currentNightTurnIndex = seerIdx;
      room.nightActionAcks.clear();
      const target = room.gameState!.players.find((p) => p.id !== playerId)!;
      const actionRes: any = await new Promise((resolve) => {
        hostClient2.emit(
          'night:action',
          { roomCode, token: hostToken, roleId: 'seer', action: { targetId: target.id } },
          resolve
        );
      });
      expect(actionRes.ok).toBe(true);
    }
  });

  it('xử lý an toàn payload null hoặc không phải object cho room:join, room:resume và room:leave', async () => {
    const client = createClient();

    const joinNullRes: any = await new Promise((resolve) => {
      client.emit('room:join', null, resolve);
    });
    expect(joinNullRes.ok).toBe(false);
    expect(joinNullRes.error.code).toBe('INVALID_SETTINGS');

    const joinStrRes: any = await new Promise((resolve) => {
      client.emit('room:join', 'invalid', resolve);
    });
    expect(joinStrRes.ok).toBe(false);
    expect(joinStrRes.error.code).toBe('INVALID_SETTINGS');

    const resumeNullRes: any = await new Promise((resolve) => {
      client.emit('room:resume', null, resolve);
    });
    expect(resumeNullRes.ok).toBe(false);
    expect(resumeNullRes.error.code).toBe('INVALID_TOKEN');

    const leaveNullRes: any = await new Promise((resolve) => {
      client.emit('room:leave', 12345, resolve);
    });
    expect(leaveNullRes.ok).toBe(false);
    expect(leaveNullRes.error.code).toBe('INVALID_TOKEN');
  });
});
