import type {
  DeathRecord,
  GamePhase,
  GameState,
  NightActions,
  NightResolutionEvent,
  PlayerId,
  RoomSettings,
  WinOutcome,
} from '../engine/types';
import type { Faction, SeerResult } from '../engine/roles';
import type { NightTurnPlanItem } from '../engine/turnPlan';

// -------------------------------------------------------------
// Response Envelope & Error Codes
// -------------------------------------------------------------

export type ServerResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ServerErrorCode; message: string } };

export type ServerErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NAME_TAKEN'
  | 'INVALID_TOKEN'
  | 'NOT_HOST'
  | 'NOT_AUTHORIZED'
  | 'NOT_ENOUGH_PLAYERS'
  | 'TOO_MANY_PLAYERS'
  | 'GAME_ALREADY_STARTED'
  | 'GAME_NOT_STARTED'
  | 'INVALID_PHASE'
  | 'NOT_YOUR_TURN'
  | 'PLAYER_DEAD'
  | 'ALREADY_ACTED'
  | 'ALREADY_VOTED'
  | 'VOTE_LOCKED'
  | 'INVALID_TARGET'
  | 'MAX_EXTENSIONS_REACHED'
  | 'PAUSE_NOT_ALLOWED'
  | 'CANNOT_TALLY_YET'
  | 'INVALID_SETTINGS'
  | 'INTERNAL_ERROR';

// -------------------------------------------------------------
// Room State in RAM (Multi-Device)
// -------------------------------------------------------------

export interface RoomPlayer {
  id: PlayerId;
  name: string;
  normalizedName: string; // trim().toLowerCase()
  playerToken: string; // CSPRNG secret
  socketId: string | null;
  seatIndex: number;
  isAlive: boolean;
  isConnected: boolean;
}

export interface RoomHost {
  hostToken: string; // CSPRNG secret
  socketId: string | null;
  isPlayer: boolean;
  playerId?: PlayerId; // null nếu là host bảng trung tâm
}

export interface RoomTimers {
  timerId: NodeJS.Timeout | null;
  deadlineAt: number | null; // Mốc client đếm ngược về 0
  serverCutoffAt: number | null; // Mốc server ngắt lệnh = deadlineAt + 1000ms
  isPaused: boolean;
  phase: GamePhase;
  turnKey?: string;
  remainingBeforePause?: number;
  voteLockDeadlineAt?: number;
  remainingVoteLockMs?: number;
}

export interface RoomState {
  roomCode: string; // 4 chữ số ngẫu nhiên không trùng lặp
  createdAt: number;
  lastActivityAt: number;
  gameGeneration: number;
  host: RoomHost;
  players: Map<PlayerId, RoomPlayer>;
  settings: RoomSettings;
  gameState: GameState | null;

  // Lượt đêm
  currentNightTurnIndex: number;
  nightTurnPlan: NightTurnPlanItem[];
  nightActionsAccumulator: NightActions;
  nightActionAcks: Set<PlayerId>;
  currentNightSeed?: number;

  // Timers
  timers: RoomTimers;

  // Log công khai an toàn (không chứa thông tin đêm nhạy cảm)
  publicHistoryLogs: string[];

  // Kết quả điều tra tạm thời trong đêm (chỉ gửi riêng cho người có quyền)
  seerInvestigationResult?: { targetId: PlayerId; result: SeerResult | string };
  sorcererInvestigationResult?: { targetId: PlayerId; isSeer: boolean };
  auraInvestigationResult?: { targetId: PlayerId; result: 'NORMAL' | 'SPECIAL' };
  piInvestigationResult?: { targetId: PlayerId; hasWerewolf: boolean; inspectedPlayerIds: PlayerId[] };
  foxInvestigationResult?: { targetId: PlayerId; hasWerewolf: boolean; inspectedPlayerIds: PlayerId[] };

  // Kết quả vote công khai sau cùng
  lastVoteTally?: {
    tallies: Record<PlayerId, number>;
    abstainCount: number;
    voterDetails?: Record<PlayerId, PlayerId[]>;
  };
}

// -------------------------------------------------------------
// Projections (Dữ liệu gửi tới từng loại Client)
// -------------------------------------------------------------

export interface PublicPlayerView {
  id: PlayerId;
  name: string;
  seatIndex: number;
  isAlive: boolean;
  isConnected: boolean;
  voteWeight: number;
  isMayor: boolean;
}

export interface PublicRoomView {
  roomCode: string;
  gameGeneration: number;
  phase: GamePhase;
  roundNumber: number;
  players: PublicPlayerView[];
  deadlineAt: number | null;
  isPaused: boolean;
  pausedRemainingSeconds?: number | null;
  voteLocked: boolean;
  voteLockRemainingSeconds: number | null;
  extensionsUsed: number;
  settings: RoomSettings;
  deaths: DeathRecord[];
  publicLogs: string[];
  currentTurnInfo?: {
    turnKey: string;
    titleVi: string;
    titleEn: string;
    turnIndex?: number;
    totalTurns?: number;
    nextTurnTitleVi?: string | null;
  };
  lastVoteTally?: {
    tallies: Record<PlayerId, number>;
    abstainCount: number;
    voterDetails?: Record<PlayerId, PlayerId[]>;
  };
  bearGrowled?: boolean;
  princeRevealed?: boolean;
  mutedPlayerId?: PlayerId | null;
  doubleVoteDay?: boolean;
  runoffCandidates?: PlayerId[];
  voteProgress?: { submitted: number; total: number } | null;
  dayVerdict?: { headline: string; detail: string; isPendingNextNight: boolean } | null;
  nightIntroUntil?: number | null;
}

export interface HostBoardView {
  publicRoom: PublicRoomView;
  isHostPlayer: boolean;
  hostPlayerId?: PlayerId | null;
  canStart: boolean;
  canPause: boolean;
  canResume: boolean;
  canExtend: boolean;
  canTallyEarly: boolean;
  connectedPlayerCount: number;
}

export interface PlayerPrivateView {
  playerId: PlayerId;
  seatIndex: number;
  isAlive: boolean;
  roleId: string; // Role của chính mình
  initialRoleId: string;
  faction: Faction;
  isMayor: boolean;
  loverId?: PlayerId | null;
  isCrossFactionCouple?: boolean;
  canActCurrentTurn: boolean;
  turnKey: string | null;
  validTargets: PlayerId[];
  skills: {
    witchHealUsed?: boolean;
    witchPoisonUsed?: boolean;
    witchVictimId?: PlayerId | null; // Chỉ có khi Phù thủy thức và settings.witchKnowsVictim = true
    witchVictimIds?: PlayerId[]; // Toàn bộ nạn nhân bị bầy Sói cắn đêm nay (khi Sói con chết / Sói đại ca)
    wolfCubDoubleKillNextNight?: boolean;
    lastProtectedPlayerId?: PlayerId | null;
    elderHp?: number;
    masonPartnerIds?: PlayerId[];
    roleModelId?: PlayerId | null;
    companionId?: PlayerId | null;
    hoodlumTargetIds?: [PlayerId, PlayerId] | null;
    wolfPackVictimId?: PlayerId | null;
    accursedWolfUsed?: boolean;
    isMuted?: boolean;
    foxLostPower?: boolean;
    piUsed?: boolean;
    troublemakerUsed?: boolean;
    isEnchanted?: boolean;
    isCultMember?: boolean;
    doppelgangerTargetId?: PlayerId | null;
    drunkRealRoleId?: string | null;
  };
  teammates: Array<{ id: PlayerId; name: string; roleId: string }>;
  investigationResult?: {
    targetId: PlayerId;
    result: SeerResult | boolean | 'NORMAL' | 'SPECIAL' | string;
    hasWerewolf?: boolean;
    inspectedPlayerIds?: PlayerId[];
  } | null;
}

export interface PostGameView {
  winOutcome: WinOutcome | null;
  allRoles: Array<{
    id: PlayerId;
    name: string;
    seatIndex: number;
    initialRoleId: string;
    finalRoleId: string;
    faction: Faction;
    isAlive: boolean;
  }>;
  deaths: DeathRecord[];
  historyLogs: string[];
  timeline: NightResolutionEvent[];
}

// -------------------------------------------------------------
// Socket Event Payloads
// -------------------------------------------------------------

export interface ClientCreateRoomPayload {
  isPlayer: boolean;
  username?: string;
}

export interface ClientJoinRoomPayload {
  roomCode: string;
  username: string;
}

export interface ClientResumePayload {
  roomCode: string;
  token: string;
}

export interface ClientLeavePayload {
  roomCode: string;
  token: string;
}

export interface ClientUpdateSettingsPayload {
  roomCode: string;
  token: string;
  settings: Partial<RoomSettings>;
}

export interface ClientStartGamePayload {
  roomCode: string;
  token: string;
  customRoleIds?: string[];
}

export interface ClientNightActionPayload {
  roomCode: string;
  token: string;
  roleId: string;
  action: {
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
  };
}

export interface ClientDayVotePayload {
  roomCode: string;
  token: string;
  targetPlayerId: PlayerId | null; // null = abstain
}

export interface ClientHunterShotPayload {
  roomCode: string;
  token: string;
  targetPlayerId: PlayerId | null;
}

export interface ClientMayorTransferPayload {
  roomCode: string;
  token: string;
  successorPlayerId: PlayerId | null;
}

export interface ClientMayorElectPayload {
  roomCode: string;
  token: string;
  candidateId: PlayerId | null;
}

export interface ClientHostControlPayload {
  roomCode: string;
  token: string;
}

export interface ClientEmergencyEliminatePayload {
  roomCode: string;
  token: string;
  targetPlayerId: PlayerId;
}

export interface TimerSnapshotPayload {
  deadlineAt: number | null;
  isPaused: boolean;
  phase: GamePhase;
  turnKey?: string;
  discussionSecondsRemaining?: number;
  voteLockRemainingSeconds?: number;
  voteLocked?: boolean;
  extensionsUsed?: number;
  titleVi?: string;
  titleEn?: string;
}
