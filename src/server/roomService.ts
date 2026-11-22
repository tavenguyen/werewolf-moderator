import crypto from 'node:crypto';
import { DEFAULT_ROOM_SETTINGS, createInitialGameState, createRematchGameState } from '../engine/gameEngine';
import { getSmartPreset } from '../engine/presets';
import { CommandQueue } from './commandQueue';
import type { PlayerId, RoomSettings } from '../engine/types';
import type { RoomPlayer, RoomState } from './types';
import { processDeathCascade } from '../engine/deathCascade';
import { checkWinCondition } from '../engine/winConditions';

export const ROOM_IDLE_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 giờ

export interface CreateRoomResult {
  roomCode: string;
  hostToken: string;
  playerToken?: string;
  playerId?: PlayerId;
}

export interface JoinRoomResult {
  playerToken: string;
  playerId: PlayerId;
  seatIndex: number;
}

export class RoomService {
  private rooms = new Map<string, RoomState>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private commandQueues = new Map<string, CommandQueue>();

  constructor() {
    // Tự động quét dọn phòng idle mỗi 10 phút
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleRooms();
    }, 10 * 60 * 1000);
    // Cho phép tiến trình Node thoát tự nhiên nếu chỉ còn timer này
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  public getRoom(roomCode: string): RoomState | undefined {
    return this.rooms.get(roomCode);
  }

  public getCommandQueue(roomCode: string): CommandQueue {
    let queue = this.commandQueues.get(roomCode);
    if (!queue) {
      queue = new CommandQueue();
      this.commandQueues.set(roomCode, queue);
    }
    return queue;
  }

  public touchRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (room) {
      room.lastActivityAt = Date.now();
    }
  }

  /**
   * Sinh mã phòng 4 chữ số ngẫu nhiên không trùng lặp ('1000' -> '9999').
   */
  public generateUniqueRoomCode(): string {
    let attempts = 0;
    while (attempts < 10000) {
      // 1000 đến 9999
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      if (!this.rooms.has(code)) {
        return code;
      }
      attempts++;
    }
    throw new Error('Hệ thống hết mã phòng khả dụng!');
  }

  /**
   * Sinh token CSPRNG bảo mật không thể đoán.
   */
  public generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Tạo phòng mới:
   * - Host bảng trung tâm: không username, không chiếm ghế, không nhận vai trò.
   * - Host kiêm người chơi: bắt buộc username, chiếm ghế 0 và nhận vai trò.
   */
  public createRoom(options: {
    isPlayer: boolean;
    username?: string;
    settings?: Partial<RoomSettings>;
  }): CreateRoomResult {
    const roomCode = this.generateUniqueRoomCode();
    const hostToken = this.generateSecureToken();
    const now = Date.now();

    const mergedSettings: RoomSettings = {
      ...DEFAULT_ROOM_SETTINGS,
      ...options.settings,
    };

    const playersMap = new Map<PlayerId, RoomPlayer>();
    let playerToken: string | undefined = undefined;
    let hostPlayerId: PlayerId | undefined = undefined;

    if (options.isPlayer) {
      const trimmedName = options.username?.trim();
      if (!trimmedName) {
        throw new Error('Host kiêm người chơi bắt buộc phải nhập tên người chơi.');
      }

      hostPlayerId = `p_1_${crypto.randomBytes(4).toString('hex')}`;
      playerToken = this.generateSecureToken();

      playersMap.set(hostPlayerId, {
        id: hostPlayerId,
        name: trimmedName,
        normalizedName: trimmedName.toLowerCase(),
        playerToken,
        socketId: null,
        seatIndex: 0,
        isAlive: true,
        isConnected: true,
      });
    }

    const roomState: RoomState = {
      roomCode,
      createdAt: now,
      lastActivityAt: now,
      gameGeneration: 1,
      host: {
        hostToken,
        socketId: null,
        isPlayer: options.isPlayer,
        playerId: hostPlayerId,
      },
      players: playersMap,
      settings: mergedSettings,
      gameState: null,
      currentNightTurnIndex: 0,
      nightTurnPlan: [],
      nightActionsAccumulator: {},
      nightActionAcks: new Set<PlayerId>(),
      publicHistoryLogs: [],
      timers: {
        timerId: null,
        deadlineAt: null,
        serverCutoffAt: null,
        isPaused: false,
        phase: 'LOBBY',
      },
    };

    this.rooms.set(roomCode, roomState);
    this.commandQueues.set(roomCode, new CommandQueue());

    return {
      roomCode,
      hostToken,
      playerToken,
      playerId: hostPlayerId,
    };
  }

  /**
   * Tham gia phòng (Người chơi):
   * Kiểm tra phòng, trạng thái chưa start, trùng tên trim().toLowerCase().
   */
  public joinRoom(roomCode: string, username: string): JoinRoomResult {
    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new Error('Bàn chưa tồn tại hoặc đã kết thúc.');
    }

    if (room.gameState !== null) {
      throw new Error('Ván chơi đã bắt đầu, không thể tham gia lúc này.');
    }

    if (room.players.size >= 16) {
      throw new Error('Phòng đã đủ số lượng tối đa 16 người chơi.');
    }

    const trimmedName = username.trim();
    if (!trimmedName) {
      throw new Error('Tên người chơi không được để trống.');
    }

    const normalized = trimmedName.toLowerCase();
    for (const player of room.players.values()) {
      if (player.normalizedName === normalized) {
        throw new Error(`Tên [${trimmedName}] đã có người sử dụng trong phòng.`);
      }
    }

    const seatIndex = room.players.size;
    const playerId: PlayerId = `p_${seatIndex + 1}_${crypto.randomBytes(4).toString('hex')}`;
    const playerToken = this.generateSecureToken();

    const newPlayer: RoomPlayer = {
      id: playerId,
      name: trimmedName,
      normalizedName: normalized,
      playerToken,
      socketId: null,
      seatIndex,
      isAlive: true,
      isConnected: true,
    };

    room.players.set(playerId, newPlayer);
    this.touchRoom(roomCode);

    return {
      playerToken,
      playerId,
      seatIndex,
    };
  }

  /**
   * Người chơi hoặc Host rời phòng (Leave Room).
   */
  public leaveRoom(roomCode: string, token: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;

    // Nếu là Host rời phòng
    if (room.host.hostToken === token) {
      if (room.gameState === null) {
        // Trong Lobby: xóa phòng hoàn toàn
        this.deleteRoom(roomCode);
        return true;
      }
      // Trong ván: đánh dấu Host disconnect
      room.host.socketId = null;
      this.touchRoom(roomCode);
      return true;
    }

    // Nếu là Player rời phòng
    for (const [id, player] of room.players.entries()) {
      if (player.playerToken === token) {
        if (room.gameState === null) {
          // Trong Lobby: Xóa khỏi danh sách và sắp xếp lại ghế
          room.players.delete(id);
          let seat = 0;
          for (const pl of room.players.values()) {
            pl.seatIndex = seat++;
          }
        } else {
          // Trong ván: Giữ nguyên ghế, chỉ đánh dấu ngắt kết nối
          player.isConnected = false;
          player.socketId = null;
        }
        this.touchRoom(roomCode);
        return true;
      }
    }

    return false;
  }

  /**
   * Reconnect Host:
   * Xác thực hostToken, cập nhật socketId mới.
   */
  public reconnectHost(roomCode: string, hostToken: string, socketId: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;

    if (room.host.hostToken !== hostToken) {
      return false;
    }

    room.host.socketId = socketId;
    this.touchRoom(roomCode);
    return true;
  }

  /**
   * Reconnect Player:
   * Xác thực playerToken, cập nhật socketId và đánh dấu isConnected = true.
   */
  public reconnectPlayer(
    roomCode: string,
    playerToken: string,
    socketId: string
  ): RoomPlayer | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    for (const player of room.players.values()) {
      if (player.playerToken && player.playerToken === playerToken) {
        player.socketId = socketId;
        player.isConnected = true;
        this.touchRoom(roomCode);
        return player;
      }
    }

    return null;
  }

  /**
   * Ngắt kết nối socket:
   * Tìm và đánh dấu socketId đó thành offline, không xóa người chơi.
   */
  public handleSocketDisconnect(socketId: string): {
    roomCode: string;
    isHost: boolean;
    playerId?: PlayerId;
  } | null {
    for (const room of this.rooms.values()) {
      if (room.host.socketId === socketId) {
        room.host.socketId = null;
        return { roomCode: room.roomCode, isHost: true };
      }

      for (const player of room.players.values()) {
        if (player.socketId === socketId) {
          player.socketId = null;
          player.isConnected = false;
          return {
            roomCode: room.roomCode,
            isHost: false,
            playerId: player.id,
          };
        }
      }
    }

    return null;
  }

  /**
   * Bắt đầu ván chơi:
   * Lấy preset ngẫu nhiên hoặc danh sách vai được truyền vào, khởi tạo GameEngine.
   */
  public startGame(roomCode: string, hostToken: string, customRoleIds?: string[]): void {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('Bàn chưa tồn tại hoặc đã kết thúc.');
    if (room.host.hostToken !== hostToken) throw new Error('Chỉ Host mới có quyền bắt đầu ván đấu.');
    if (room.gameState !== null) throw new Error('Ván đấu đã được bắt đầu trước đó.');

    const playerCount = room.players.size;
    if (playerCount < 6 || playerCount > 16) {
      throw new Error(`Số lượng người chơi phải từ 6 đến 16 (hiện tại: ${playerCount}).`);
    }

    let roleIds: string[];
    if (customRoleIds && customRoleIds.length === playerCount) {
      roleIds = [...customRoleIds];
    } else {
      const preset = getSmartPreset(playerCount);
      if (!preset) {
        throw new Error(`Không tìm thấy preset cấu hình vai trò cho ${playerCount} người chơi.`);
      }
      roleIds = [...preset.roles];
    }

    // Shuffle role ngẫu nhiên (Fisher-Yates) bằng CSPRNG
    for (let i = roleIds.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      const temp = roleIds[i];
      roleIds[i] = roleIds[j];
      roleIds[j] = temp;
    }

    const playersInput = Array.from(room.players.values())
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map((p) => ({
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
      }));

    room.gameState = createInitialGameState(
      playersInput,
      roleIds,
      room.settings,
      room.gameGeneration
    );

    // Chuyển sang NIGHT ở lượt đầu
    room.gameState.phase = 'NIGHT';
    this.touchRoom(roomCode);
  }

  /**
   * Cập nhật cài đặt phòng (Lobby):
   */
  public updateSettings(
    roomCode: string,
    hostToken: string,
    settings: Partial<RoomSettings>
  ): RoomSettings {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('Bàn chưa tồn tại hoặc đã kết thúc.');
    if (room.host.hostToken !== hostToken) throw new Error('Chỉ Host mới có quyền thay đổi cài đặt.');
    if (room.gameState !== null) throw new Error('Không thể thay đổi cài đặt khi ván chơi đã bắt đầu.');

    room.settings = { ...room.settings, ...settings };
    this.touchRoom(roomCode);
    return room.settings;
  }

  /**
   * Host loại khẩn cấp (Emergency Eliminate):
   * Thu hồi token ngay lập tức; nếu đang trong ván thì đưa vào xử lý cái chết.
   */
  public emergencyEliminate(roomCode: string, hostToken: string, targetPlayerId: PlayerId): void {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('Bàn chưa tồn tại hoặc đã kết thúc.');
    if (room.host.hostToken !== hostToken) throw new Error('Chỉ Host mới có quyền loại khẩn cấp.');

    // Chặn hoàn toàn trường hợp Host tự loại chính mình
    if (room.host.isPlayer && room.host.playerId === targetPlayerId) {
      throw new Error('Host không thể tự loại chính mình khỏi bàn.');
    }

    const player = room.players.get(targetPlayerId);
    if (!player) throw new Error('Người chơi không tồn tại.');

    // Thu hồi token ngay lập tức
    player.playerToken = '';
    player.isConnected = false;

    if (room.gameState) {
      const pState = room.gameState.players.find((p) => p.id === targetPlayerId);
      if (pState && pState.isAlive) {
        room.gameState.historyLogs.push(
          `Host đã sử dụng quyền LOẠI KHẨN CẤP đối với [${player.name}].`
        );
        processDeathCascade(room.gameState, [{ playerId: targetPlayerId, cause: 'VILLAGE_VOTE' }]);
        player.isAlive = false;

        const win = checkWinCondition(room.gameState);
        if (win) {
          room.gameState.phase = 'GAME_OVER';
        }
      }
    } else {
      // Trong Lobby: Xóa hoàn toàn khỏi ghế và sắp xếp lại seatIndex
      room.players.delete(targetPlayerId);
      let idx = 0;
      for (const pl of room.players.values()) {
        pl.seatIndex = idx++;
      }
    }

    this.touchRoom(roomCode);
  }

  /**
   * Tái đấu (Rematch):
   * Giữ nguyên roster, tokens, tăng gameGeneration, chia role mới.
   */
  public rematch(roomCode: string, hostToken: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('Bàn chưa tồn tại hoặc đã kết thúc.');
    if (room.host.hostToken !== hostToken) throw new Error('Chỉ Host mới có quyền khởi động ván mới.');
    if (!room.gameState || room.gameState.phase !== 'GAME_OVER') {
      throw new Error('Chỉ có thể tái đấu khi ván chơi đã kết thúc (GAME_OVER).');
    }

    const playerCount = room.players.size;
    const preset = getSmartPreset(playerCount);
    if (!preset) {
      throw new Error(`Không tìm thấy preset cấu hình vai trò cho ${playerCount} người chơi.`);
    }

    const roleIds = [...preset.roles];
    for (let i = roleIds.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      const temp = roleIds[i];
      roleIds[i] = roleIds[j];
      roleIds[j] = temp;
    }

    // Reset các biến vòng lặp đêm
    room.currentNightTurnIndex = 0;
    room.nightTurnPlan = [];
    room.nightActionsAccumulator = {};
    room.nightActionAcks.clear();
    room.lastVoteTally = undefined;
    room.publicHistoryLogs = [];
    room.seerInvestigationResult = undefined;
    room.sorcererInvestigationResult = undefined;

    // Reset timers
    if (room.timers.timerId) {
      clearTimeout(room.timers.timerId);
      room.timers.timerId = null;
    }
    room.timers.deadlineAt = null;
    room.timers.serverCutoffAt = null;
    room.timers.isPaused = false;

    // Khởi tạo GameState mới qua pure function engine
    room.gameState = createRematchGameState(room.gameState, roleIds);
    room.gameState.phase = 'NIGHT';
    room.gameGeneration += 1;

    // Đánh dấu lại trạng thái sống của toàn bộ players
    for (const p of room.players.values()) {
      p.isAlive = true;
    }

    this.touchRoom(roomCode);
  }

  /**
   * Quét và hủy các phòng đã không hoạt động quá 3 giờ.
   */
  public cleanupIdleRooms(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [code, room] of this.rooms.entries()) {
      if (now - room.lastActivityAt > ROOM_IDLE_TIMEOUT_MS) {
        if (room.timers.timerId) {
          clearTimeout(room.timers.timerId);
          room.timers.timerId = null;
        }
        const queue = this.commandQueues.get(code);
        if (queue) {
          queue.clear();
          this.commandQueues.delete(code);
        }
        this.rooms.delete(code);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  public deleteRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (room) {
      if (room.timers.timerId) {
        clearTimeout(room.timers.timerId);
        room.timers.timerId = null;
      }
      const queue = this.commandQueues.get(roomCode);
      if (queue) {
        queue.clear();
        this.commandQueues.delete(roomCode);
      }
      this.rooms.delete(roomCode);
    }
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const room of this.rooms.values()) {
      if (room.timers.timerId) {
        clearTimeout(room.timers.timerId);
      }
    }
    this.rooms.clear();
    this.commandQueues.clear();
  }
}
