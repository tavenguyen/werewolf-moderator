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
  savedAt?: number;
  expiresAt?: number;
}

export class SocketAdapter implements GameSessionAdapter {
  private socket: Socket | null = null;
  private serverUrl: string;
  private resumeTimeoutMs: number;
  private socketFactory?: (url: string) => Socket;
  private state: GameSessionState;
  private listeners: Set<(state: GameSessionState) => void> = new Set();
  private token: string | null = null;
  private sessionEpoch = 0;

  constructor(
    serverUrl?: string,
    options?: { resumeTimeoutMs?: number; socketFactory?: (url: string) => Socket }
  ) {
    this.resumeTimeoutMs = options?.resumeTimeoutMs ?? 5000;
    this.socketFactory = options?.socketFactory;
    if (serverUrl) {
      this.serverUrl = serverUrl;
    } else if (typeof window !== 'undefined') {
      const envUrl = (import.meta as unknown as { env?: { VITE_SERVER_URL?: string } }).env?.VITE_SERVER_URL;
      if (envUrl) {
        this.serverUrl = envUrl;
      } else {
        // Mặc định kết nối cùng origin (trực tiếp qua Vite dev server plugin hoặc reverse proxy)
        this.serverUrl = window.location.origin;
      }
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

    this.socket = this.socketFactory
      ? this.socketFactory(this.serverUrl)
      : io(this.serverUrl, {
          autoConnect: true,
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          transports: ['websocket', 'polling'],
        });

    this.socket.on('connect', () => {
      const hadActiveSession = Boolean(this.state.roomCode && this.hasRecoverableSession());
      this.updateState({ isConnected: true, isConnecting: false, error: null });
      // Chỉ tự động khôi phục phiên (resume) khi adapter đã có phiên phòng hoạt động trước khi rớt mạng
      if (hadActiveSession) {
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

  private isEpochActive(expectedEpoch?: number): boolean {
    return expectedEpoch === undefined || expectedEpoch === this.sessionEpoch;
  }

  private async emitWithAck<T>(
    event: string,
    payload: unknown,
    timeoutMs = 15000,
    onProgress?: (msg: string) => void,
    expectedEpoch?: number
  ): Promise<T> {
    const socket = this.ensureSocket();

    // Nếu socket chưa kết nối, chờ kết nối với thông báo tiến trình (hỗ trợ cold-start Render)
    if (!socket.connected) {
      if (socket.disconnected) {
        socket.connect();
      }
      await new Promise<void>((resolve, reject) => {
        let progressiveTimer: ReturnType<typeof setTimeout> | null =
          timeoutMs > 3200
            ? setTimeout(() => {
                const msg = 'Đang đánh thức máy chủ, vui lòng đợi trong giây lát...';
                if (this.isEpochActive(expectedEpoch)) {
                  this.updateState({ error: { code: 'COLD_START_WAKING', message: msg } });
                }
                onProgress?.(msg);
              }, 3200)
            : null;

        const connectTimer = setTimeout(() => {
          if (progressiveTimer) clearTimeout(progressiveTimer);
          socket.off('connect', onConnect);
          socket.off('connect_error', onError);
          const errMsg = 'Không thể kết nối đến máy chủ. Vui lòng thử lại sau vài giây.';
          if (this.isEpochActive(expectedEpoch)) {
            this.updateState({
              isConnecting: false,
              error: { code: 'CONNECT_TIMEOUT', message: errMsg },
            });
          }
          reject(new Error(errMsg));
        }, timeoutMs);

        const onConnect = () => {
          if (progressiveTimer) clearTimeout(progressiveTimer);
          clearTimeout(connectTimer);
          socket.off('connect_error', onError);
          if (this.isEpochActive(expectedEpoch)) {
            this.updateState({ isConnecting: false, error: null });
          }
          resolve();
        };

        const onError = (err: Error) => {
          if (progressiveTimer) clearTimeout(progressiveTimer);
          clearTimeout(connectTimer);
          socket.off('connect', onConnect);
          const errMsg = `Không thể kết nối đến máy chủ: ${err.message}`;
          if (this.isEpochActive(expectedEpoch)) {
            this.updateState({
              isConnecting: false,
              error: { code: 'CONNECT_ERROR', message: errMsg },
            });
          }
          reject(new Error(errMsg));
        };

        socket.once('connect', onConnect);
        socket.once('connect_error', onError);
      });
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const ackTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          const errMsg = 'Máy chủ chưa phản hồi. Vui lòng thử lại.';
          if (this.isEpochActive(expectedEpoch)) {
            this.updateState({
              isConnecting: false,
              error: { code: 'TIMEOUT', message: errMsg },
            });
          }
          reject(new Error(errMsg));
        }
      }, timeoutMs);

      socket.emit(event, payload, (res: ServerResponse<T>) => {
        if (settled) return;
        settled = true;
        clearTimeout(ackTimer);

        if (!res) {
          const errMsg = 'Máy chủ không phản hồi';
          if (this.isEpochActive(expectedEpoch)) {
            this.updateState({ error: { code: 'NO_RESPONSE', message: errMsg } });
          }
          reject(new Error(errMsg));
          return;
        }
        if (res.ok) {
          resolve(res.data);
        } else {
          if (this.isEpochActive(expectedEpoch)) {
            this.updateState({ error: { code: res.error.code, message: res.error.message } });
          }
          reject(new Error(res.error.message));
        }
      });
    });
  }

  private saveSession(session: StoredSession): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const now = Date.now();
      const withExpiry: StoredSession = {
        ...session,
        savedAt: now,
        expiresAt: now + 3 * 60 * 60 * 1000, // Hạn 3 giờ khớp với vòng đời phòng server
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(withExpiry));
    } catch {
      // ignore storage error
    }
  }

  public clearStoredSession(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  public getStoredSession(): StoredSession | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return null;
      const session = JSON.parse(data) as StoredSession;
      if (session.expiresAt && Date.now() > session.expiresAt) {
        this.clearStoredSession();
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  public hasRecoverableSession(): boolean {
    const session = this.getStoredSession();
    return Boolean(session && session.roomCode && session.token);
  }

  public async createRoom(options: CreateRoomOptions): Promise<{ roomCode: string }> {
    const epoch = ++this.sessionEpoch;
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

    const data = await this.emitWithAck<CreateResponse>(
      'room:create',
      payload,
      undefined,
      undefined,
      epoch
    );

    if (epoch !== this.sessionEpoch) {
      return { roomCode: data.roomCode };
    }

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
    const epoch = ++this.sessionEpoch;
    this.ensureSocket();
    const payload: ClientJoinRoomPayload = { roomCode, username };

    interface JoinResponse {
      playerId: PlayerId;
      playerToken: string;
      seatIndex: number;
    }

    const data = await this.emitWithAck<JoinResponse>(
      'room:join',
      payload,
      undefined,
      undefined,
      epoch
    );

    if (epoch !== this.sessionEpoch) {
      return { playerId: data.playerId, seatIndex: data.seatIndex };
    }

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
    const myEpoch = this.sessionEpoch;
    const saved = this.getStoredSession();
    if (!saved || !saved.roomCode || !saved.token) {
      return false;
    }

    this.ensureSocket();

    const payload: ClientResumePayload = {
      roomCode: saved.roomCode,
      token: saved.token,
    };

    interface ResumeResponse {
      isHost: boolean;
      isPlayer?: boolean;
      playerId?: PlayerId;
    }

    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      const data = await Promise.race([
        this.emitWithAck<ResumeResponse>(
          'room:resume',
          payload,
          this.resumeTimeoutMs,
          undefined,
          myEpoch
        ),
        new Promise<never>((_, reject) => {
          fallbackTimer = setTimeout(() => {
            reject(new Error('RESUME_TIMEOUT'));
          }, this.resumeTimeoutMs);
        }),
      ]);
      if (myEpoch !== this.sessionEpoch) {
        return false;
      }
      this.token = saved.token;
      this.updateState({
        roomCode: saved.roomCode,
        isHost: data.isHost,
        hostMode: saved.hostMode,
        playerId: data.playerId ?? saved.playerId,
        mySeatIndex: saved.mySeatIndex,
        deviceMode: 'MULTI_DEVICE',
        isConnecting: false,
        error: null,
      });
      return true;
    } catch {
      if (myEpoch !== this.sessionEpoch) {
        return false;
      }
      const errorCode = this.state.error?.code;
      if (errorCode === 'ROOM_NOT_FOUND' || errorCode === 'INVALID_TOKEN') {
        this.clearStoredSession();
      }
      this.updateState({ isConnecting: false });
      return false;
    } finally {
      if (fallbackTimer !== null) {
        clearTimeout(fallbackTimer);
      }
    }
  }

  public async leaveRoom(): Promise<void> {
    this.sessionEpoch += 1;
    const roomCode = this.state.roomCode;
    const token = this.token;
    this.clearStoredSession();
    this.token = null;
    if (roomCode && token) {
      try {
        await this.emitWithAck('room:leave', {
          roomCode,
          token,
        });
      } catch {
        // ignore
      }
    }

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
