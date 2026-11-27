import type {
  HostBoardView,
  PlayerPrivateView,
  PostGameView,
  PublicRoomView,
  TimerSnapshotPayload,
} from '../server/types';
import type { PlayerId, RoomSettings } from '../engine/types';

export type DeviceMode = 'SINGLE_DEVICE' | 'MULTI_DEVICE';
export type HostMode = 'CENTER_BOARD' | 'PLAYER_HOST';

export interface GameSessionState {
  roomCode: string;
  deviceMode: DeviceMode;
  hostMode: HostMode;
  isHost: boolean;
  playerId?: PlayerId;
  mySeatIndex?: number;
  publicView: PublicRoomView | null;
  privateView: PlayerPrivateView | null;
  hostView: HostBoardView | null;
  postGameView: PostGameView | null;
  timerSnapshot: TimerSnapshotPayload | null;
  isConnected: boolean;
  isConnecting: boolean;
  error?: { code: string; message: string } | null;
}

export interface CreateRoomOptions {
  isPlayer: boolean;
  username?: string;
  deviceMode?: DeviceMode;
  hostMode?: HostMode;
  initialPlayerCount?: number;
}

export interface NightActionInput {
  targetId?: PlayerId | null;
  target1?: PlayerId;
  target2?: PlayerId;
  targetIds?: PlayerId[];
  heal?: boolean;
  healTargetId?: PlayerId | null;
  poisonTargetId?: PlayerId | null;
  isSkip?: boolean;
  curseTargetId?: PlayerId | null;
  activate?: boolean;
}

export interface GameSessionAdapter {
  getState(): GameSessionState;
  subscribe(listener: (state: GameSessionState) => void): () => void;

  createRoom(options: CreateRoomOptions): Promise<{ roomCode: string }>;
  joinRoom(roomCode: string, username: string): Promise<{ playerId: PlayerId; seatIndex: number }>;
  resumeSession(): Promise<boolean>;
  hasRecoverableSession?(): boolean;
  leaveRoom(): Promise<void>;

  updateSettings(settings: Partial<RoomSettings>): Promise<void>;
  startGame(customRoleIds?: string[]): Promise<void>;
  startFirstNight?(): Promise<void>;

  sendNightAction(roleId: string, action: NightActionInput): Promise<void>;
  sendDayVote(targetPlayerId: PlayerId | null): Promise<void>;
  sendHunterShot(targetPlayerId: PlayerId | null): Promise<void>;
  sendMayorTransfer(successorPlayerId: PlayerId | null): Promise<void>;
  sendMayorElect(candidateId: PlayerId | null): Promise<void>;
  finalizePublicVote(): Promise<void>;

  hostPause(): Promise<void>;
  hostResume(): Promise<void>;
  hostExtendTime(): Promise<void>;
  hostEmergencyEliminate(targetPlayerId: PlayerId): Promise<void>;
  hostRematch(): Promise<void>;
  abortGameToLobby?(): Promise<void>;
  endGameToSummary?(): Promise<void>;

  // Dành riêng cho chế độ Single-device 1 máy chung
  setLocalActivePlayer?(playerId: PlayerId): void;
  advanceLocalTurn?(): void;
  addOfflinePlayer?(name: string): void;
  removeOfflinePlayer?(playerId: PlayerId): void;
  submitPublicHandVotes?(tallies: Record<PlayerId, number>): Promise<void>;
  proceedToNextNight?(): Promise<void>;
}
