import { io, type Socket } from 'socket.io-client';
import type {
  CreateRoomOptions,
  GameSessionAdapter,
  GameSessionState,
  HostMode,
  NightActionInput,
} from './types';
import type {
  ClientCreateRoomPayload,
  ClientDayVotePayload,
  ClientEmergencyEliminatePayload,
  ClientHostControlPayload,
  ClientHunterShotPayload,
  ClientJoinRoomPayload,
  ClientMayorElectPayload,
  ClientMayorTransferPayload,
  ClientNightActionPayload,
  ClientResumePayload,
  ClientStartGamePayload,
  ClientUpdateSettingsPayload,
  HostBoardView,
  PlayerPrivateView,
  PostGameView,
  PublicRoomView,
  ServerResponse,
  TimerSnapshotPayload,
} from '../server/types';
import type { PlayerId, RoomSettings } from '../engine/types';

const STORAGE_KEY = 'werewolf_socket_session';

interface StoredSession {
  roomCode: string;
  token: string;
  isHost: boolean;
  hostMode: HostMode;
  playerId?: PlayerId;
  mySeatIndex?: number;
}

export class SocketAdapter implements GameSessionAdapter {
  private socket: Socket | null = null;
  private serverUrl: string;
  private state: GameSessionState;
  private listeners: Set<(state: GameSessionState) => void> = new Set();
  private token: string | null = null;

  constructor(serverUrl?: string) {
    if (serverUrl) {
      this.serverUrl = serverUrl;
    } else if (typeof window !== 'undefined') {
      const hostname = window.location.hostname || 'localhost';
      // Mặc định kết nối backend Phase 2 trên port 3001
      this.serverUrl = `${window.location.protocol}//${hostname}:3001`;
    } else {
      this.serverUrl = 'http://localhost:3001';
    }

    this.state = {
      roomCode: '',
      deviceMode: 'MULTI_DEVICE',
      hostMode: 'CENTER_BOARD',
      isHost: false,
      publicView: null,
      privateView: null,
      hostView: null,
      postGameView: null,
      timerSnapshot: null,
      isConnected: false,
      isConnecting: false,
      error: null,
    };
  }

  public getState(): GameSessionState {
    return this.state;
  }

  public subscribe(listener: (state: GameSessionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateState(partial: Partial<GameSessionState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        // ignore listener errors
      }
    }
  }

  private ensureSocket(): Socket {
    if (this.socket) {
      return this.socket;
    }

    this.updateState({ isConnecting: true });

    this.socket = io(this.serverUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      this.updateState({ isConnected: true, isConnecting: false, error: null });
      // Tự động khôi phục phiên (resume) nếu có token lưu trong localStorage để tránh zombie connection
      const saved = this.getStoredSession();
      if (saved && saved.roomCode && saved.token) {
        void this.resumeSession().catch(() => {
          // ignore reconnect error
        });
      }
    });

    this.socket.on('disconnect', () => {
      this.updateState({ isConnected: false, isConnecting: false });
    });

    this.socket.on('connect_error', (err) => {
      this.updateState({
        isConnected: false,
        isConnecting: false,
        error: { code: 'CONNECT_ERROR', message: `Không thể kết nối máy chủ: ${err.message}` },
      });
    });

    // Projections
    this.socket.on('room:publicSnapshot', (view: PublicRoomView) => {
      this.updateState({ publicView: view, roomCode: view.roomCode });
    });

    this.socket.on('timer:snapshot', (snapshot: TimerSnapshotPayload) => {
      this.updateState({ timerSnapshot: snapshot });
    });

    this.socket.on('room:hostSnapshot', (hostView: HostBoardView) => {
      this.updateState({ hostView });
    });

    this.socket.on('room:playerSnapshot', (privateView: PlayerPrivateView) => {
      this.updateState({
        privateView,
        playerId: privateView.playerId,
        mySeatIndex: privateView.seatIndex,
      });
    });

    this.socket.on('game:postGame', (postGameView: PostGameView) => {
      this.updateState({ postGameView });
    });

    return this.socket;
  }

  private emitWithAck<T>(event: string, payload: unknown): Promise<T> {
    const socket = this.ensureSocket();
    return new Promise((resolve, reject) => {
      socket.emit(event, payload, (res: ServerResponse<T>) => {
        if (!res) {
          reject(new Error('Máy chủ không phản hồi'));
          return;
        }
        if (res.ok) {
          resolve(res.data);
        } else {
          this.updateState({ error: { code: res.error.code, message: res.error.message } });
          reject(new Error(res.error.message));
        }
      });
    });
  }

  private saveSession(session: StoredSession): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // ignore storage error
    }
  }

  private clearStoredSession(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  private getStoredSession(): StoredSession | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? (JSON.parse(data) as StoredSession) : null;
    } catch {
      return null;
    }
  }

  public async createRoom(options: CreateRoomOptions): Promise<{ roomCode: string }> {
    this.ensureSocket();
    const payload: ClientCreateRoomPayload = {
      isPlayer: options.isPlayer,
      username: options.username,
    };

    interface CreateResponse {
      roomCode: string;
      hostToken: string;
      playerId?: PlayerId;
      playerToken?: string;
    }

    const data = await this.emitWithAck<CreateResponse>('room:create', payload);

    this.token = data.hostToken;
    const hostMode: HostMode = options.isPlayer ? 'PLAYER_HOST' : 'CENTER_BOARD';

    this.updateState({
      roomCode: data.roomCode,
      isHost: true,
      hostMode,
      playerId: data.playerId,
      deviceMode: 'MULTI_DEVICE',
      error: null,
    });

    this.saveSession({
      roomCode: data.roomCode,
      token: data.hostToken,
      isHost: true,
      hostMode,
      playerId: data.playerId,
    });

    return { roomCode: data.roomCode };
  }

  public async joinRoom(
    roomCode: string,
    username: string
  ): Promise<{ playerId: PlayerId; seatIndex: number }> {
    this.ensureSocket();
    const payload: ClientJoinRoomPayload = { roomCode, username };

    interface JoinResponse {
      playerId: PlayerId;
      playerToken: string;
      seatIndex: number;
    }

    const data = await this.emitWithAck<JoinResponse>('room:join', payload);

    this.token = data.playerToken;

    this.updateState({
      roomCode,
      isHost: false,
      hostMode: 'CENTER_BOARD',
      playerId: data.playerId,
      mySeatIndex: data.seatIndex,
      deviceMode: 'MULTI_DEVICE',
      error: null,
    });

    this.saveSession({
      roomCode,
      token: data.playerToken,
      isHost: false,
      hostMode: 'CENTER_BOARD',
      playerId: data.playerId,
      mySeatIndex: data.seatIndex,
    });

    return { playerId: data.playerId, seatIndex: data.seatIndex };
  }

  public async resumeSession(): Promise<boolean> {
    const saved = this.getStoredSession();
    if (!saved || !saved.roomCode || !saved.token) {
      return false;
    }

    this.ensureSocket();
    this.token = saved.token;

    const payload: ClientResumePayload = {
      roomCode: saved.roomCode,
      token: saved.token,
    };

    interface ResumeResponse {
      isHost: boolean;
      isPlayer?: boolean;
      playerId?: PlayerId;
    }

    try {
      const data = await this.emitWithAck<ResumeResponse>('room:resume', payload);
      this.updateState({
        roomCode: saved.roomCode,
        isHost: data.isHost,
        hostMode: saved.hostMode,
        playerId: data.playerId ?? saved.playerId,
        mySeatIndex: saved.mySeatIndex,
        deviceMode: 'MULTI_DEVICE',
        error: null,
      });
      return true;
    } catch {
      this.clearStoredSession();
      return false;
    }
  }

  public async leaveRoom(): Promise<void> {
    if (this.state.roomCode && this.token) {
      try {
        await this.emitWithAck('room:leave', {
          roomCode: this.state.roomCode,
          token: this.token,
        });
      } catch {
        // ignore
      }
    }

    this.clearStoredSession();
    this.token = null;
    this.updateState({
      roomCode: '',
      isHost: false,
      publicView: null,
      privateView: null,
      hostView: null,
      postGameView: null,
      timerSnapshot: null,
      error: null,
    });
  }

  public async updateSettings(settings: Partial<RoomSettings>): Promise<void> {
    if (!this.token) throw new Error('Chưa xác thực');
    const payload: ClientUpdateSettingsPayload = {
      roomCode: this.state.roomCode,
      token: this.token,
      settings,
    };
    await this.emitWithAck('lobby:updateSettings', payload);
  }

  public async startGame(customRoleIds?: string[]): Promise<void> {
    if (!this.token) throw new Error('Chưa xác thực');
    const payload: ClientStartGamePayload = {
      roomCode: this.state.roomCode,
      token: this.token,
      customRoleIds,
    };
    await this.emitWithAck('lobby:start', payload);
  }

  public async sendNightAction(roleId: string, action: NightActionInput): Promise<void> {
    if (!this.token) throw new Error('Chưa xác thực');
    const payload: ClientNightActionPayload = {
      roomCode: this.state.roomCode,
      token: this.token,
      roleId,
      action,
    };
    await this.emitWithAck('night:action', payload);
  }

  public async sendDayVote(targetPlayerId: PlayerId | null): Promise<void> {
    if (!this.token) throw new Error('Chưa xác thực');
    const payload: ClientDayVotePayload = {
      roomCode: this.state.roomCode,
      token: this.token,
      targetPlayerId,
    };
    await this.emitWithAck('day:vote', payload);
  }

  public async sendHunterShot(targetPlayerId: PlayerId | null): Promise<void> {
    if (!this.token) throw new Error('Chưa xác thực');
    const payload: ClientHunterShotPayload = {
      roomCode: this.state.roomCode,
      token: this.token,
      targetPlayerId,
    };
    await this.emitWithAck('hunter:shot', payload);
  }

  public async sendMayorTransfer(successorPlayerId: PlayerId | null): Promise<void> {
    if (!this.token) throw new Error('Chưa xác thực');
    const payload: ClientMayorTransferPayload = {
      roomCode: this.state.roomCode,
      token: this.token,
      successorPlayerId,
    };
    await this.emitWithAck('mayor:transfer', payload);
  }

  public async sendMayorElect(candidateId: PlayerId | null): Promise<void> {
    if (!this.token) throw new Error('Chưa xác thực');
    const payload: ClientMayorElectPayload = {
      roomCode: this.state.roomCode,
      token: this.token,
      candidateId,
    };
    await this.emitWithAck('mayor:elect', payload);
  }

  public async finalizePublicVote(): Promise<void> {
    if (!this.token) throw new Error('Chưa xác thực');
    const payload: ClientHostControlPayload = {
      roomCode: this.state.roomCode,
      token: this.token,
    };
    await this.emitWithAck('day:finalizePublicVote', payload);
  }

  public async hostPause(): Promise<void> {
    if (!this.token) throw new Error('Chưa xác thực');
    const payload: ClientHostControlPayload = {
      roomCode: this.state.roomCode,
      token: this.token,
    };
    await this.emitWithAck('host:pause', payload);
  }

  public async hostResume(): Promise<void> {
    if (!this.token) throw new Error('Chưa xác thực');
    const payload: ClientHostControlPayload = {
      roomCode: this.state.roomCode,
      token: this.token,
    };
    await this.emitWithAck('host:resume', payload);
  }

  public async hostExtendTime(): Promise<void> {
    if (!this.token) throw new Error('Chưa xác thực');
    const payload: ClientHostControlPayload = {
      roomCode: this.state.roomCode,
      token: this.token,
    };
    await this.emitWithAck('host:extendTime', payload);
  }

  public async hostEmergencyEliminate(targetPlayerId: PlayerId): Promise<void> {
    if (!this.token) throw new Error('Chưa xác thực');
    const payload: ClientEmergencyEliminatePayload = {
      roomCode: this.state.roomCode,
      token: this.token,
      targetPlayerId,
    };
    await this.emitWithAck('host:emergencyEliminate', payload);
  }

  public async hostRematch(): Promise<void> {
    if (!this.token) throw new Error('Chưa xác thực');
    const payload: ClientHostControlPayload = {
      roomCode: this.state.roomCode,
      token: this.token,
    };
    await this.emitWithAck('host:rematch', payload);
  }
}
