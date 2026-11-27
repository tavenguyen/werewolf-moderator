import {
  createInitialGameState,
  executeDayVote,
  executeHunterShot,
  executeMayorSuccession,
  executeNightPhase,
  DEFAULT_ROOM_SETTINGS,
} from '../engine/gameEngine';
import { processDeathCascade } from '../engine/deathCascade';
import { checkWinCondition } from '../engine/winConditions';
import { ROLES_BY_ID } from '../engine/roles';
import { generateNightTurnPlan } from '../engine/turnPlan';
import { getSmartPreset } from '../engine/presets';
import { getAliveNeighbors } from '../engine/seating';
import { getAuraSeerResult, isWerewolfForInvestigation } from '../engine/nightResolution';
import { tallyDayVotes, tallyMayorElection, tallyRunoffVotes } from '../engine/voting';
import {
  createHostBoardView,
  createPlayerPrivateView,
  createPostGameView,
  createPublicRoomView,
} from '../server/projections';
import type {
  CreateRoomOptions,
  GameSessionAdapter,
  GameSessionState,
  HostMode,
  NightActionInput,
} from './types';
import type { PlayerId, RoomSettings } from '../engine/types';
import type { RoomPlayer, RoomState } from '../server/types';
import { audioController, NARRATION_PROMPTS } from '../audio/audioController';

const LOCAL_STORAGE_KEY = 'werewolf_local_game_session';

export class LocalEngineAdapter implements GameSessionAdapter {
  private roomState: RoomState;
  private state: GameSessionState;
  private listeners: Set<(state: GameSessionState) => void> = new Set();
  private activeLocalPlayerId?: PlayerId;
  private nextPlayerIdSeq: number = 1;
  private dayTimerInterval: number | null = null;
  private nightIntroTimer: ReturnType<typeof setTimeout> | null = null;
  private nightIntroUntil: number | null = null;
  private pendingDayVerdict: { headline: string; detail: string; isPendingNextNight: boolean } | null = null;

  constructor() {
    this.roomState = this.createEmptyRoomState('7290', false);
    this.state = {
      roomCode: '7290',
      deviceMode: 'SINGLE_DEVICE',
      hostMode: 'CENTER_BOARD',
      isHost: true,
      publicView: null,
      privateView: null,
      hostView: null,
      postGameView: null,
      timerSnapshot: null,
      isConnected: true,
      isConnecting: false,
      error: null,
    };
    this.emitState(false);
  }

  private createEmptyRoomState(
    roomCode: string,
    isPlayer = false,
    hostUsername?: string
  ): RoomState {
    const playersMap = new Map<PlayerId, RoomPlayer>();
    let hostPlayerId: PlayerId | undefined = undefined;

    if (isPlayer) {
      const name = hostUsername?.trim() || 'Host';
      hostPlayerId = 'player_1';
      this.nextPlayerIdSeq = 2;
      playersMap.set(hostPlayerId, {
        id: hostPlayerId,
        name,
        normalizedName: name.toLowerCase(),
        playerToken: 'local_token_1',
        socketId: null,
        seatIndex: 1,
        isAlive: true,
        isConnected: true,
      });
    } else {
      this.nextPlayerIdSeq = 1;
    }

    return {
      roomCode,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      gameGeneration: 1,
      host: {
        hostToken: 'local_host_token',
        socketId: null,
        isPlayer,
        playerId: hostPlayerId,
      },
      players: playersMap,
      settings: { ...DEFAULT_ROOM_SETTINGS },
      gameState: null,
      currentNightTurnIndex: 0,
      nightTurnPlan: [],
      nightActionsAccumulator: {},
      nightActionAcks: new Set(),
      timers: {
        timerId: null,
        deadlineAt: null,
        serverCutoffAt: null,
        isPaused: false,
        phase: 'LOBBY',
      },
      publicHistoryLogs: [],
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

  private emitState(shouldPersist = true): void {
    const publicView = createPublicRoomView(this.roomState);
    publicView.dayVerdict = this.pendingDayVerdict;
    publicView.nightIntroUntil = this.nightIntroUntil;
    const hostView = createHostBoardView(this.roomState);
    let postGameView = createPostGameView(this.roomState);
    if (postGameView && !postGameView.winOutcome) {
      postGameView = {
        ...postGameView,
        winOutcome: {
          winner: 'DRAW',
          reason: 'Quản trò đã kết thúc ván chơi.',
          winningPlayerIds: [],
        },
      };
    }

    let privateView = null;
    const playerId = this.activeLocalPlayerId ?? Array.from(this.roomState.players.keys())[0];
    if (this.roomState.gameState && playerId) {
      privateView = createPlayerPrivateView(this.roomState, playerId);
    }

    this.state = {
      ...this.state,
      roomCode: this.roomState.roomCode,
      publicView,
      hostView,
      privateView,
      postGameView,
      playerId,
      error: null,
    };

    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        // ignore
      }
    }

    if (shouldPersist) {
      this.persistState();
    }
  }

  private persistState(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const serializable = {
        roomCode: this.roomState.roomCode,
        gameGeneration: this.roomState.gameGeneration,
        hostMode: this.state.hostMode,
        activePlayerId: this.activeLocalPlayerId,
        nextPlayerIdSeq: this.nextPlayerIdSeq,
        settings: this.roomState.settings,
        gameState: this.roomState.gameState,
        players: Array.from(this.roomState.players.values()),
        currentNightTurnIndex: this.roomState.currentNightTurnIndex,
        nightTurnPlan: this.roomState.nightTurnPlan,
        nightActionsAccumulator: this.roomState.nightActionsAccumulator,
        nightActionAcks: Array.from(this.roomState.nightActionAcks),
        timers: {
          deadlineAt: this.roomState.timers.deadlineAt,
          serverCutoffAt: this.roomState.timers.serverCutoffAt,
          isPaused: this.roomState.timers.isPaused,
          phase: this.roomState.timers.phase,
          turnKey: this.roomState.timers.turnKey,
          remainingBeforePause: this.roomState.timers.remainingBeforePause,
          voteLockDeadlineAt: this.roomState.timers.voteLockDeadlineAt,
          remainingVoteLockMs: this.roomState.timers.remainingVoteLockMs,
        },
        seerInvestigationResult: this.roomState.seerInvestigationResult,
        sorcererInvestigationResult: this.roomState.sorcererInvestigationResult,
        auraInvestigationResult: this.roomState.auraInvestigationResult,
        foxInvestigationResult: this.roomState.foxInvestigationResult,
        piInvestigationResult: this.roomState.piInvestigationResult,
        publicHistoryLogs: this.roomState.publicHistoryLogs,
        pendingDayVerdict: this.pendingDayVerdict,
        savedAt: Date.now(),
        expiresAt: Date.now() + 3 * 60 * 60 * 1000, // Hạn 3 giờ
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(serializable));
    } catch {
      // ignore
    }
  }

  public hasRecoverableSession(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.roomCode || !data.players) return false;
      if (data.expiresAt && Date.now() > data.expiresAt) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  public async resumeSession(): Promise<boolean> {
    if (typeof localStorage === 'undefined') return false;
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return false;

      const data = JSON.parse(raw);
      if (!data || !data.roomCode || !data.players) return false;

      // Tự dọn nếu phiên offline đã quá hạn 3 giờ
      if (data.expiresAt && Date.now() > data.expiresAt) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        return false;
      }

      this.clearNightIntroTimer();
      this.clearDayTimer();
      this.nightIntroUntil = null;
      this.pendingDayVerdict = data.pendingDayVerdict ?? null;

      this.roomState.roomCode = data.roomCode;
      this.roomState.gameGeneration = data.gameGeneration || 1;
      this.roomState.settings = data.settings || { ...DEFAULT_ROOM_SETTINGS };
      this.roomState.gameState = data.gameState ?? null;
      this.roomState.currentNightTurnIndex = data.currentNightTurnIndex || 0;
      this.roomState.nightTurnPlan = data.nightTurnPlan || [];
      this.roomState.nightActionsAccumulator = data.nightActionsAccumulator || {};
      this.roomState.nightActionAcks = new Set(
        Array.isArray(data.nightActionAcks) ? data.nightActionAcks : []
      );
      this.roomState.seerInvestigationResult = data.seerInvestigationResult;
      this.roomState.sorcererInvestigationResult = data.sorcererInvestigationResult;
      this.roomState.auraInvestigationResult = data.auraInvestigationResult;
      this.roomState.foxInvestigationResult = data.foxInvestigationResult;
      this.roomState.piInvestigationResult = data.piInvestigationResult;
      this.roomState.publicHistoryLogs = data.publicHistoryLogs || [];

      if (data.timers) {
        this.roomState.timers = {
          timerId: null,
          deadlineAt: data.timers.deadlineAt ?? null,
          serverCutoffAt: data.timers.serverCutoffAt ?? null,
          isPaused: Boolean(data.timers.isPaused),
          phase: data.timers.phase ?? this.roomState.gameState?.phase ?? 'LOBBY',
          turnKey: data.timers.turnKey,
          remainingBeforePause: data.timers.remainingBeforePause,
          voteLockDeadlineAt: data.timers.voteLockDeadlineAt,
          remainingVoteLockMs: data.timers.remainingVoteLockMs,
        };
      }

      this.roomState.players.clear();
      let maxSeq = 0;
      for (const p of data.players) {
        this.roomState.players.set(p.id, p);
        const match = /^player_(\d+)$/.exec(p.id);
        if (match) {
          maxSeq = Math.max(maxSeq, Number(match[1]));
        }
      }

      this.nextPlayerIdSeq =
        typeof data.nextPlayerIdSeq === 'number' && data.nextPlayerIdSeq >= 1
          ? data.nextPlayerIdSeq
          : Math.max(maxSeq + 1, this.roomState.players.size + 1);

      this.activeLocalPlayerId = data.activePlayerId;
      this.state.hostMode = data.hostMode || 'CENTER_BOARD';

      const restoredPhase = this.roomState.gameState?.phase;
      if (
        (restoredPhase === 'DAY_DISCUSS' ||
          restoredPhase === 'DAY_MAYOR_ELECTION' ||
          restoredPhase === 'DAY_RUNOFF') &&
        !this.roomState.timers.isPaused &&
        !this.pendingDayVerdict?.isPendingNextNight
      ) {
        this.startLocalDayTimer(true);
      }

      this.emitState();
      return true;
    } catch {
      return false;
    }
  }

  public async createRoom(options: CreateRoomOptions): Promise<{ roomCode: string }> {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const isPlayer = Boolean(options.isPlayer);
    this.roomState = this.createEmptyRoomState(code, isPlayer, options.username);

    const hostMode: HostMode = isPlayer ? 'PLAYER_HOST' : 'CENTER_BOARD';
    this.activeLocalPlayerId = this.roomState.host.playerId;

    this.state.hostMode = hostMode;
    this.state.isHost = true;
    this.state.deviceMode = 'SINGLE_DEVICE';

    this.emitState();
    return { roomCode: code };
  }

  public async joinRoom(
    _roomCode: string,
    username: string
  ): Promise<{ playerId: PlayerId; seatIndex: number }> {
    const seq = this.nextPlayerIdSeq++;
    const seatIndex = this.roomState.players.size + 1;
    const id = `player_${seq}`;
    const newPlayer: RoomPlayer = {
      id,
      name: username,
      normalizedName: username.trim().toLowerCase(),
      playerToken: `local_token_${seq}`,
      socketId: null,
      seatIndex,
      isAlive: true,
      isConnected: true,
    };
    this.roomState.players.set(id, newPlayer);
    this.activeLocalPlayerId = id;
    this.emitState();
    return { playerId: id, seatIndex };
  }

  public async leaveRoom(): Promise<void> {
    this.clearNightIntroTimer();
    this.clearDayTimer();
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    this.roomState = this.createEmptyRoomState('7290', false);
    this.emitState();
  }

  public async updateSettings(settings: Partial<RoomSettings>): Promise<void> {
    this.roomState.settings = { ...this.roomState.settings, ...settings };
    if (this.roomState.gameState) {
      this.roomState.gameState.settings = { ...this.roomState.gameState.settings, ...settings };
    }
    this.emitState();
  }

  public async startGame(customRoleIds?: string[]): Promise<void> {
    const playersList = Array.from(this.roomState.players.values()).sort(
      (a, b) => a.seatIndex - b.seatIndex
    );
    const count = playersList.length;

    let roles = customRoleIds;
    if (!roles || roles.length !== count) {
      const preset = getSmartPreset(count);
      if (!preset) {
        throw new Error(`Số lượng người chơi (${count}) không hợp lệ (cần 6–16 người)`);
      }
      roles = preset.roles;
    }

    // Xáo trộn vai ngẫu nhiên
    const shuffledRoles = [...roles].sort(() => Math.random() - 0.5);

    this.roomState.gameState = createInitialGameState(
      playersList.map((p) => ({ id: p.id, name: p.name, seatIndex: p.seatIndex })),
      shuffledRoles,
      this.roomState.settings,
      this.roomState.gameGeneration
    );

    // Chuyển sang FIRST_NIGHT_SETUP để lần lượt từng người xem vai bí mật (1 máy dùng chung)
    this.roomState.gameState.phase = 'FIRST_NIGHT_SETUP';
    this.activeLocalPlayerId = playersList[0]?.id;
    this.emitState();
  }

  public async startFirstNight(): Promise<void> {
    if (!this.roomState.gameState) return;
    this.roomState.gameState.phase = 'NIGHT';
    this.roomState.nightTurnPlan = generateNightTurnPlan(this.roomState.gameState);
    this.roomState.currentNightTurnIndex = 0;
    this.roomState.nightActionsAccumulator = {};
    this.roomState.nightActionAcks.clear();
    this.roomState.seerInvestigationResult = undefined;
    this.roomState.sorcererInvestigationResult = undefined;
    this.roomState.auraInvestigationResult = undefined;
    this.roomState.foxInvestigationResult = undefined;
    this.roomState.piInvestigationResult = undefined;

    const firstTurn = this.roomState.nightTurnPlan[0];
    if (firstTurn && firstTurn.activePlayerIds.length > 0) {
      this.activeLocalPlayerId = firstTurn.activePlayerIds[0];
    }

    this.startNightIntroAndFirstTurn();
    this.emitState();
  }

  private clearNightIntroTimer(): void {
    if (this.nightIntroTimer !== null) {
      clearTimeout(this.nightIntroTimer);
      this.nightIntroTimer = null;
    }
    this.nightIntroUntil = null;
  }

  private startNightIntroAndFirstTurn(): void {
    this.clearNightIntroTimer();
    audioController.resetLastPlayedTurn();
    audioController.playNightBGM();

    const nightStartPromptDuration = NARRATION_PROMPTS.night_start?.durationMs ?? 5000;
    const introDurationMs = Math.max(5000, nightStartPromptDuration) + 3500;
    this.nightIntroUntil = Date.now() + introDurationMs;

    let announced = false;
    let audioDone = false;
    let bufferDone = false;

    const tryAnnounceFirst = () => {
      if (announced) return;
      if (!audioDone || !bufferDone) return;
      announced = true;
      this.clearNightIntroTimer();
      if (
        this.roomState.gameState?.phase === 'NIGHT' &&
        this.roomState.currentNightTurnIndex === 0
      ) {
        this.emitState(false);
        this.announceCurrentNightTurn();
      }
    };

    const forceFinish = () => {
      audioDone = true;
      bufferDone = true;
      tryAnnounceFirst();
    };

    if (typeof window !== 'undefined') {
      this.nightIntroTimer = setTimeout(forceFinish, introDurationMs);
    }

    audioController.playTurnNarration('night_start', () => {
      audioDone = true;
      if (announced) return;
      if (typeof window === 'undefined' || typeof window.Audio === 'undefined') {
        bufferDone = true;
        tryAnnounceFirst();
        return;
      }
      if (this.nightIntroTimer !== null) {
        clearTimeout(this.nightIntroTimer);
        this.nightIntroTimer = null;
      }
      this.nightIntroTimer = setTimeout(() => {
        bufferDone = true;
        tryAnnounceFirst();
      }, 3500);
    });
  }

  private announceCurrentNightTurn(): void {
    const currentTurn = this.roomState.nightTurnPlan[this.roomState.currentNightTurnIndex];
    if (currentTurn) {
      audioController.playTurnNarration(currentTurn.turnKey);
    }
  }

  public setLocalActivePlayer(playerId: PlayerId): void {
    this.activeLocalPlayerId = playerId;
    this.emitState();
  }

  public addOfflinePlayer(name: string): void {
    if (this.roomState.gameState) return;
    if (this.roomState.players.size >= 16) return;
    const seq = this.nextPlayerIdSeq++;
    const seatIndex = this.roomState.players.size + 1;
    const id = `player_${seq}`;
    this.roomState.players.set(id, {
      id,
      name,
      normalizedName: name.trim().toLowerCase(),
      playerToken: `local_token_${seq}`,
      socketId: null,
      seatIndex,
      isAlive: true,
      isConnected: true,
    });
    this.emitState();
  }

  public removeOfflinePlayer(playerId: PlayerId): void {
    if (this.roomState.gameState) return;
    this.roomState.players.delete(playerId);
    // Cập nhật lại seat index
    let idx = 1;
    for (const p of this.roomState.players.values()) {
      p.seatIndex = idx++;
    }
    if (this.activeLocalPlayerId === playerId) {
      this.activeLocalPlayerId = Array.from(this.roomState.players.keys())[0];
    }
    this.emitState();
  }

  public async sendNightAction(_roleId: string, action: NightActionInput): Promise<void> {
    const currentTurn = this.roomState.nightTurnPlan[this.roomState.currentNightTurnIndex];
    if (!currentTurn || !currentTurn.canAct) return;

    const acc = this.roomState.nightActionsAccumulator;
    const actorId = this.activeLocalPlayerId ?? currentTurn.activePlayerIds[0];

    switch (currentTurn.turnKey) {
      case 'cupid':
        if (action.target1 && action.target2) {
          acc.cupid = { target1: action.target1, target2: action.target2 };
        }
        break;
      case 'bodyguard':
        if (action.targetId) {
          acc.bodyguard = { targetId: action.targetId };
        }
        break;
      case 'wolf_pack': {
        if (!acc.wolfPack) {
          acc.wolfPack = { targets: [] };
        }
        const maxTargets = this.roomState.gameState?.wolfCubDoubleKillNextNight ? 2 : 1;
        if (action.isSkip) {
          acc.wolfPack.isSkip = true;
          acc.wolfPack.targets = [];
        } else if (action.targetIds && action.targetIds.length > 0) {
          acc.wolfPack.isSkip = false;
          acc.wolfPack.targets = Array.from(new Set(action.targetIds)).slice(0, maxTargets);
        } else if (action.targetId) {
          acc.wolfPack.isSkip = false;
          acc.wolfPack.targets = [action.targetId];
        }
        break;
      }
      case 'white_wolf':
        acc.whiteWolf = { targetId: action.targetId ?? null };
        break;
      case 'seer':
      case 'apprentice_seer':
        if (action.targetId) {
          acc.seer = { targetId: action.targetId };
          const target = this.roomState.gameState?.players.find((p) => p.id === action.targetId);
          if (target && this.roomState.gameState) {
            const effectiveRoleId =
              target.roleId === 'drunk' &&
              this.roomState.gameState.roundNumber >= 3 &&
              target.drunkRealRoleId
                ? target.drunkRealRoleId
                : target.roleId;
            const def = ROLES_BY_ID[effectiveRoleId];
            let result: string = def?.seerResult ?? 'VILLAGER';
            if (this.roomState.settings.seerRevealMode === 'EXACT_ROLE') {
              result = effectiveRoleId;
            } else {
              if (effectiveRoleId === 'lycan') result = 'WEREWOLF';
              if (effectiveRoleId === 'minion') result = 'VILLAGER';
            }
            this.roomState.seerInvestigationResult = {
              targetId: action.targetId,
              result,
            };
          }
        }
        break;
      case 'sorcerer':
        if (action.targetId) {
          acc.sorcerer = { targetId: action.targetId };
          const target = this.roomState.gameState?.players.find((p) => p.id === action.targetId);
          if (target && this.roomState.gameState) {
            const effectiveRoleId =
              target.roleId === 'drunk' &&
              this.roomState.gameState.roundNumber >= 3 &&
              target.drunkRealRoleId
                ? target.drunkRealRoleId
                : target.roleId;
            this.roomState.sorcererInvestigationResult = {
              targetId: action.targetId,
              isSeer: effectiveRoleId === 'seer',
            };
          }
        }
        break;
      case 'witch': {
        const disallowBoth = this.roomState.settings.allowWitchBothPotionsSameNight === false;
        const canHeal = Boolean(action.heal && !this.roomState.gameState?.witchHealUsed);
        const poisonTargetId =
          disallowBoth && canHeal ? null : (action.poisonTargetId ?? null);
        acc.witch = {
          heal: action.heal,
          healTargetId: action.healTargetId ?? null,
          poisonTargetId,
        };
        break;
      }
      case 'wild_child':
      case 'night_wild_child':
        if (action.targetId) {
          acc.wildChild = { targetId: action.targetId };
        }
        break;
      case 'dire_wolf':
      case 'night_dire_wolf':
        if (action.targetId) {
          acc.direWolf = { targetId: action.targetId };
        }
        break;
      case 'hoodlum':
      case 'night_hoodlum':
        if (action.target1 && action.target2) {
          acc.hoodlum = { target1: action.target1, target2: action.target2 };
        }
        break;
      case 'mason':
      case 'night_mason':
        // Xác nhận lượt (acknowledgement)
        break;
      case 'wolf_accursed':
      case 'night_wolf_accursed':
        acc.accursedWolf = { curseTargetId: action.curseTargetId ?? null };
        break;
      case 'big_bad_wolf':
      case 'night_big_bad_wolf':
        acc.bigBadWolf = { targetId: action.targetId ?? null };
        break;
      case 'aura_seer':
      case 'night_aura_seer':
        if (action.targetId) {
          acc.auraSeer = { targetId: action.targetId };
          const target = this.roomState.gameState?.players.find((p) => p.id === action.targetId);
          if (target && this.roomState.gameState) {
            this.roomState.auraInvestigationResult = {
              targetId: action.targetId,
              result: getAuraSeerResult(target, this.roomState.gameState.roundNumber),
            };
          }
        }
        break;
      case 'pi':
      case 'night_pi':
        if (action.targetId && this.roomState.gameState) {
          acc.pi = { targetId: action.targetId };
          const neighbors = getAliveNeighbors(this.roomState.gameState.players, action.targetId);
          const group = neighbors ? neighbors.group : [];
          const inspectedPlayerIds = group.map((p) => p.id);
          const roundNumber = this.roomState.gameState.roundNumber;
          const hasWerewolf = group.some((p) => isWerewolfForInvestigation(p, roundNumber));
          this.roomState.piInvestigationResult = {
            targetId: action.targetId,
            hasWerewolf,
            inspectedPlayerIds,
          };
        }
        break;
      case 'fox':
      case 'night_fox':
        if (this.roomState.gameState?.foxLostPower) {
          acc.fox = { targetId: '', isSkip: true };
          break;
        }
        acc.fox = { targetId: action.targetId ?? '', isSkip: action.isSkip };
        if (action.targetId && !action.isSkip && this.roomState.gameState) {
          const neighbors = getAliveNeighbors(this.roomState.gameState.players, action.targetId);
          const group = neighbors ? neighbors.group : [];
          const inspectedPlayerIds = group.map((p) => p.id);
          const roundNumber = this.roomState.gameState.roundNumber;
          const hasWerewolf = group.some((p) => isWerewolfForInvestigation(p, roundNumber));
          this.roomState.foxInvestigationResult = {
            targetId: action.targetId,
            hasWerewolf,
            inspectedPlayerIds,
          };
        }
        break;
      case 'spellcaster':
      case 'night_spellcaster':
        if (action.targetId) {
          acc.spellcaster = { targetId: action.targetId };
        }
        break;
      case 'troublemaker':
      case 'night_troublemaker':
        acc.troublemaker = { activate: Boolean(action.activate) };
        break;
      case 'doppelganger':
      case 'night_doppelganger':
        if (action.targetId) {
          acc.doppelganger = { targetId: action.targetId };
        }
        break;
      case 'pied_piper':
      case 'night_pied_piper':
        if (action.targetIds) {
          acc.piedPiper = { targetIds: action.targetIds };
        }
        break;
      case 'cult_leader':
      case 'night_cult_leader':
        if (action.targetId) {
          acc.cultLeader = { targetId: action.targetId };
        }
        break;
    }

    if (actorId) {
      this.roomState.nightActionAcks.add(actorId);
    }

    this.emitState();
  }

  public advanceLocalTurn(): void {
    if (this.roomState.gameState?.phase !== 'NIGHT') return;
    this.clearNightIntroTimer();

    this.roomState.currentNightTurnIndex += 1;

    if (this.roomState.currentNightTurnIndex < this.roomState.nightTurnPlan.length) {
      this.roomState.nightActionAcks.clear();
      const currentTurn = this.roomState.nightTurnPlan[this.roomState.currentNightTurnIndex];
      if (currentTurn && currentTurn.activePlayerIds.length > 0) {
        this.activeLocalPlayerId = currentTurn.activePlayerIds[0];
      }
      this.announceCurrentNightTurn();
      this.emitState();
    } else {
      // Hết các lượt đêm -> Phân giải đêm
      this.resolveLocalNight();
    }
  }

  private resolveLocalNight(): void {
    if (!this.roomState.gameState) return;
    this.clearNightIntroTimer();

    audioController.stopNightBGM();

    const { nextState, winOutcome } = executeNightPhase(
      this.roomState.gameState,
      this.roomState.nightActionsAccumulator
    );

    this.roomState.gameState = nextState;

    if (winOutcome) {
      this.roomState.gameState.phase = 'GAME_OVER';
      this.emitState();
      return;
    }

    const roundDeaths = this.roomState.gameState.deaths.filter(
      (d) => d.roundNumber === this.roomState.gameState!.roundNumber && d.phase === 'NIGHT'
    );
    if (roundDeaths.length > 0) {
      const victimNames = roundDeaths
        .map(
          (d) =>
            this.roomState.players.get(d.playerId)?.name ??
            this.roomState.gameState!.players.find((p) => p.id === d.playerId)?.name ??
            d.playerId
        )
        .filter(Boolean)
        .join(', ');
      this.roomState.publicHistoryLogs.push(
        `Trời đã sáng. Đêm qua ${victimNames} đã ngã xuống!`
      );
    } else {
      this.roomState.publicHistoryLogs.push('Trời đã sáng. Một đêm bình yên, không ai ngã xuống!');
    }

    if (this.roomState.gameState.phase === 'HUNTER_SHOT') {
      if (this.roomState.gameState.pendingHunterShotPlayerId) {
        this.activeLocalPlayerId = this.roomState.gameState.pendingHunterShotPlayerId;
      }
    } else if (this.roomState.gameState.phase === 'MAYOR_SUCCESSION') {
      if (this.roomState.gameState.pendingMayorSuccessionPlayerId) {
        this.activeLocalPlayerId = this.roomState.gameState.pendingMayorSuccessionPlayerId;
      }
    } else if (
      this.roomState.gameState.phase === 'DAY_DISCUSS' ||
      this.roomState.gameState.phase === 'DAY_MAYOR_ELECTION'
    ) {
      this.startLocalDayTimer(false, undefined, true);
    }

    const resolvedRound = this.roomState.gameState.roundNumber;
    const resolvedGeneration = this.roomState.gameGeneration;
    const resolvedPhase = this.roomState.gameState.phase;
    audioController.playTurnNarration('night_end', () => {
      const current = this.roomState.gameState;
      if (
        !current ||
        this.roomState.gameGeneration !== resolvedGeneration ||
        current.roundNumber !== resolvedRound ||
        current.phase !== resolvedPhase
      ) {
        return;
      }
      if (current.phase === 'DAY_MAYOR_ELECTION') {
        audioController.playTurnNarration('mayor_election');
      } else if (current.phase === 'DAY_DISCUSS') {
        audioController.playTurnNarration('day_discuss');
      }
    });

    this.emitState();
  }

  private clearDayTimer(): void {
    if (this.dayTimerInterval !== null) {
      clearInterval(this.dayTimerInterval);
      this.dayTimerInterval = null;
    }
  }

  private startLocalDayTimer(
    isResume: boolean = false,
    customDurationSec?: number,
    skipNarration: boolean = false
  ): void {
    this.clearDayTimer();

    const durationSec = customDurationSec ?? this.roomState.settings.dayDiscussionSeconds ?? 180;
    const lockSec = this.roomState.settings.dayVoteLockSeconds ?? 60;

    if (!isResume) {
      this.roomState.timers.deadlineAt = Date.now() + durationSec * 1000;
      this.roomState.timers.isPaused = false;
      this.roomState.timers.remainingBeforePause = undefined;

      // DAY_RUNOFF never locks voting
      const phase = this.roomState.gameState?.phase;
      const isRunoff = phase === 'DAY_RUNOFF';
      if (this.roomState.gameState?.dayState) {
        this.roomState.gameState.dayState.voteLocked = !isRunoff && lockSec > 0;
        this.roomState.gameState.dayState.voteLockRemainingSeconds = isRunoff ? 0 : lockSec;
      }

      if (!isRunoff && !skipNarration) {
        if (phase === 'DAY_MAYOR_ELECTION') {
          audioController.playTurnNarration('mayor_election');
        } else {
          audioController.playTurnNarration('day_discuss');
        }
      }
    } else if (this.roomState.timers.deadlineAt === null) {
      this.roomState.timers.deadlineAt = Date.now() + durationSec * 1000;
    }

    this.dayTimerInterval = setInterval(() => {
      if (this.roomState.timers.isPaused) return;

      const remainingSec = Math.max(
        0,
        Math.ceil(((this.roomState.timers.deadlineAt ?? 0) - Date.now()) / 1000)
      );

      // Tách đếm voteLockRemainingSeconds giảm độc lập theo giây để +30s không kéo dài khóa vote 60s
      const dayState = this.roomState.gameState?.dayState;
      if (dayState && dayState.voteLocked) {
        const nextLock = Math.max(0, dayState.voteLockRemainingSeconds - 1);
        dayState.voteLockRemainingSeconds = nextLock;
        if (nextLock <= 0) {
          dayState.voteLocked = false;
        }
      }

      if (remainingSec <= 0) {
        this.clearDayTimer();
        // Hết giờ thảo luận -> Có thể chốt vote
      }

      this.emitState();
    }, 1000) as unknown as number;
  }

  public async sendDayVote(targetPlayerId: PlayerId | null): Promise<void> {
    if (!this.roomState.gameState) return;
    const actorId = this.activeLocalPlayerId;
    if (!actorId) return;

    if (!this.roomState.gameState.dayState) return;
    if (this.roomState.gameState.phase === 'DAY_RUNOFF') {
      if (!this.roomState.gameState.dayState.runoffBallots) {
        this.roomState.gameState.dayState.runoffBallots = {};
      }
      this.roomState.gameState.dayState.runoffBallots[actorId] = targetPlayerId ?? null;
    } else {
      this.roomState.gameState.dayState.ballots[actorId] = targetPlayerId ?? '';
    }
    this.emitState();
  }

  private startNewLocalNight(): void {
    if (!this.roomState.gameState) return;
    this.roomState.nightTurnPlan = generateNightTurnPlan(this.roomState.gameState);
    this.roomState.currentNightTurnIndex = 0;
    this.roomState.nightActionsAccumulator = {};
    this.roomState.nightActionAcks.clear();
    this.roomState.seerInvestigationResult = undefined;
    this.roomState.sorcererInvestigationResult = undefined;
    this.roomState.auraInvestigationResult = undefined;
    this.roomState.foxInvestigationResult = undefined;
    this.roomState.piInvestigationResult = undefined;

    const firstTurn = this.roomState.nightTurnPlan[0];
    if (firstTurn && firstTurn.activePlayerIds.length > 0) {
      this.activeLocalPlayerId = firstTurn.activePlayerIds[0];
    }

    this.startNightIntroAndFirstTurn();
  }

  public async sendHunterShot(targetPlayerId: PlayerId | null): Promise<void> {
    if (!this.roomState.gameState) return;
    const { nextState, winOutcome } = executeHunterShot(this.roomState.gameState, targetPlayerId);
    this.roomState.gameState = nextState;
    if (winOutcome) {
      this.roomState.gameState.phase = 'GAME_OVER';
      this.clearDayTimer();
      this.clearNightIntroTimer();
    } else if (this.roomState.gameState.phase === 'MAYOR_SUCCESSION') {
      if (this.roomState.gameState.pendingMayorSuccessionPlayerId) {
        this.activeLocalPlayerId = this.roomState.gameState.pendingMayorSuccessionPlayerId;
      }
    } else if (
      this.roomState.gameState.phase === 'DAY_DISCUSS' ||
      this.roomState.gameState.phase === 'DAY_MAYOR_ELECTION'
    ) {
      this.startLocalDayTimer();
    } else if (this.roomState.gameState.phase === 'NIGHT') {
      this.startNewLocalNight();
    }
    this.emitState();
  }

  public async sendMayorTransfer(successorPlayerId: PlayerId | null): Promise<void> {
    if (!this.roomState.gameState) return;
    const { nextState, winOutcome } = executeMayorSuccession(
      this.roomState.gameState,
      successorPlayerId
    );
    this.roomState.gameState = nextState;
    if (winOutcome) {
      this.roomState.gameState.phase = 'GAME_OVER';
      this.clearDayTimer();
      this.clearNightIntroTimer();
    } else if (
      this.roomState.gameState.phase === 'DAY_DISCUSS' ||
      this.roomState.gameState.phase === 'DAY_MAYOR_ELECTION'
    ) {
      this.startLocalDayTimer();
    } else if (this.roomState.gameState.phase === 'NIGHT') {
      this.startNewLocalNight();
    }
    this.emitState();
  }

  public async sendMayorElect(candidateId: PlayerId | null): Promise<void> {
    if (!this.roomState.gameState) return;
    const actorId = this.activeLocalPlayerId;
    if (!actorId) return;
    if (!this.roomState.gameState.dayState) return;
    if (!this.roomState.gameState.dayState.mayorBallots) {
      this.roomState.gameState.dayState.mayorBallots = {};
    }
    this.roomState.gameState.dayState.mayorBallots[actorId] = candidateId ?? '';
    this.emitState();
  }

  public async finalizePublicVote(): Promise<void> {
    if (!this.roomState.gameState) return;
    if (this.dayTimerInterval) {
      clearInterval(this.dayTimerInterval);
      this.dayTimerInterval = null;
    }

    if (this.roomState.gameState.phase === 'DAY_MAYOR_ELECTION') {
      const livingVoters = this.roomState.gameState.players.filter((p) => p.isAlive);
      const mayorBallots = this.roomState.gameState.dayState?.mayorBallots ?? {};
      const tallies: Record<PlayerId, number> = {};
      const voterDetails: Record<PlayerId, PlayerId[]> = {};
      let abstainCount = 0;

      for (const voter of livingVoters) {
        const targetId = mayorBallots[voter.id];
        if (!targetId) {
          abstainCount += 1;
          continue;
        }
        const target = this.roomState.gameState.players.find((pl) => pl.id === targetId && pl.isAlive);
        if (!target) {
          abstainCount += 1;
          continue;
        }
        tallies[targetId] = (tallies[targetId] ?? 0) + 1;
        if (!voterDetails[targetId]) voterDetails[targetId] = [];
        voterDetails[targetId].push(voter.id);
      }

      this.roomState.lastVoteTally = this.roomState.settings.revealVoterIdentities
        ? { tallies, abstainCount, voterDetails }
        : { tallies, abstainCount };

      const { nextState, electedMayorId } = tallyMayorElection(this.roomState.gameState);
      this.roomState.gameState = nextState;
      if (electedMayorId) {
        const mayor = this.roomState.gameState.players.find((p) => p.id === electedMayorId);
        this.roomState.publicHistoryLogs.push(
          `Ngày ${this.roomState.gameState.roundNumber}: ${mayor?.name ?? 'Người chơi'} được bầu làm Trưởng làng (lá phiếu tính x2).`
        );
      }
      this.startLocalDayTimer();
      this.emitState();
      return;
    }

    const isRunoff = this.roomState.gameState.phase === 'DAY_RUNOFF';
    const livingVoters = this.roomState.gameState.players.filter(
      (p) => p.isAlive && p.voteWeight > 0
    );
    const ballots = isRunoff
      ? (this.roomState.gameState.dayState?.runoffBallots ?? {})
      : (this.roomState.gameState.dayState?.ballots ?? {});

    const tallies: Record<PlayerId, number> = {};
    const voterDetails: Record<PlayerId, PlayerId[]> = {};
    let abstainCount = 0;

    for (const voter of livingVoters) {
      const targetId = ballots[voter.id];
      if (!targetId) {
        abstainCount += voter.voteWeight;
        continue;
      }

      const target = this.roomState.gameState.players.find(
        (pl) => pl.id === targetId && pl.isAlive
      );
      if (!target) {
        abstainCount += voter.voteWeight;
        continue;
      }

      tallies[targetId] = (tallies[targetId] ?? 0) + voter.voteWeight;
      if (!voterDetails[targetId]) voterDetails[targetId] = [];
      voterDetails[targetId].push(voter.id);
    }

    if (this.roomState.settings.revealVoterIdentities) {
      this.roomState.lastVoteTally = { tallies, abstainCount, voterDetails };
    } else {
      this.roomState.lastVoteTally = { tallies, abstainCount };
    }

    let targetsToExecute: PlayerId[] = [];

    if (isRunoff) {
      const { nextState: runoffState, outcome } = tallyRunoffVotes(this.roomState.gameState);
      this.roomState.gameState = runoffState;
      this.roomState.publicHistoryLogs.push(outcome.reason);
      if (outcome.type === 'EXECUTE' && outcome.targetPlayerId) {
        targetsToExecute = [outcome.targetPlayerId];
      }
    } else {
      const { nextState: talliedState, outcome } = tallyDayVotes(this.roomState.gameState);
      this.roomState.gameState = talliedState;
      this.roomState.publicHistoryLogs.push(outcome.reason);

      if (outcome.type === 'RUNOFF' && outcome.candidateIds) {
        this.roomState.timers.deadlineAt = Date.now() + 30 * 1000;
        this.emitState();
        return;
      }

      if (outcome.type === 'EXECUTE' && outcome.targetPlayerId) {
        targetsToExecute = [outcome.targetPlayerId];

        if (this.roomState.gameState.doubleVoteDay) {
          const secondCandidate = Object.entries(tallies)
            .sort((a, b) => b[1] - a[1])
            .find(([id]) => id !== outcome.targetPlayerId);
          if (secondCandidate) {
            targetsToExecute.push(secondCandidate[0]);
          }
        }
      }
    }

    const prevHistoryLen = this.roomState.gameState.historyLogs.length;
    this.applyDayVoteExecution(targetsToExecute, prevHistoryLen);
  }

  private applyDayVoteExecution(targetsToExecute: PlayerId[], prevHistoryLen: number): void {
    if (!this.roomState.gameState) return;
    const { nextState, survivedByReveal, winOutcome } = executeDayVote(
      this.roomState.gameState,
      targetsToExecute.length > 0 ? targetsToExecute : null
    );
    this.roomState.gameState = nextState;

    if (survivedByReveal) {
      const newLogs = nextState.historyLogs.slice(prevHistoryLen);
      for (const log of newLogs) {
        if (log.includes('Thằng ngốc') || log.includes('Hoàng tử')) {
          this.roomState.publicHistoryLogs.push(log);
        }
      }
    }

    if (winOutcome) {
      this.roomState.gameState.phase = 'GAME_OVER';
      this.pendingDayVerdict = null;
      this.clearDayTimer();
      this.clearNightIntroTimer();
    } else if (this.roomState.gameState.phase === 'HUNTER_SHOT') {
      this.pendingDayVerdict = null;
      if (this.roomState.gameState.pendingHunterShotPlayerId) {
        this.activeLocalPlayerId = this.roomState.gameState.pendingHunterShotPlayerId;
      }
    } else if (this.roomState.gameState.phase === 'MAYOR_SUCCESSION') {
      this.pendingDayVerdict = null;
      if (this.roomState.gameState.pendingMayorSuccessionPlayerId) {
        this.activeLocalPlayerId = this.roomState.gameState.pendingMayorSuccessionPlayerId;
      }
    } else if (this.roomState.gameState.phase === 'NIGHT') {
      // Giữ ở màn hình Ban Ngày để mọi người đọc kết quả trước khi bấm sang Đêm tiếp theo
      this.clearDayTimer();
      this.roomState.gameState.phase = 'DAY_DISCUSS';
      this.roomState.timers.deadlineAt = null;
      this.roomState.timers.isPaused = false;
      this.roomState.timers.phase = 'DAY_DISCUSS';

      if (targetsToExecute.length === 0) {
        this.pendingDayVerdict = {
          headline: 'Không ai bị treo cổ',
          detail: 'Hòa phiếu hoặc bỏ phiếu trắng — cả làng bình an bước vào đêm mới.',
          isPendingNextNight: true,
        };
      } else {
        const deadParts: string[] = [];
        const revealParts: string[] = [];
        for (const tId of targetsToExecute) {
          const p = nextState.players.find((pl) => pl.id === tId);
          if (!p) continue;
          if (!p.isAlive) {
            const roleName = ROLES_BY_ID[p.roleId]?.nameVi ?? p.roleId;
            deadParts.push(
              this.roomState.settings.revealOnDeath ? `${p.name} (${roleName})` : p.name
            );
          } else if (p.roleId === 'prince') {
            revealParts.push(`${p.name} lật bài Hoàng tử thoát chết!`);
          } else if (p.roleId === 'village_idiot') {
            revealParts.push(`${p.name} lật bài Thằng ngốc thoát chết nhưng mất quyền bỏ phiếu!`);
          }
        }

        const headline =
          deadParts.length > 0
            ? `${deadParts.join(', ')} đã bị treo cổ`
            : revealParts.length > 0
              ? 'Lật bài thoát chết!'
              : 'Không ai bị treo cổ';

        const detailParts: string[] = [];
        if (deadParts.length > 0) {
          detailParts.push(`${deadParts.join(', ')} đã bị loại khỏi làng.`);
        }
        if (revealParts.length > 0) {
          detailParts.push(revealParts.join(' '));
        }

        this.pendingDayVerdict = {
          headline,
          detail:
            detailParts.join(' ') || 'Đã có kết quả biểu quyết ban ngày. Sẵn sàng sang đêm mới.',
          isPendingNextNight: true,
        };
      }
    }

    this.emitState();
  }

  public async proceedToNextNight(): Promise<void> {
    if (!this.roomState.gameState) return;
    this.pendingDayVerdict = null;
    this.roomState.gameState.phase = 'NIGHT';
    this.startNewLocalNight();
    this.emitState();
  }

  public async submitPublicHandVotes(rawTallies: Record<PlayerId, number>): Promise<void> {
    if (!this.roomState.gameState) return;
    if (this.dayTimerInterval) {
      clearInterval(this.dayTimerInterval);
      this.dayTimerInterval = null;
    }

    const gameState = this.roomState.gameState;
    const phase = gameState.phase;
    const isRunoff = phase === 'DAY_RUNOFF';
    const runoffSet =
      isRunoff && gameState.dayState?.runoffCandidates?.length
        ? new Set(gameState.dayState.runoffCandidates)
        : null;

    const sanitizedTallies: Record<PlayerId, number> = {};
    let totalVotesCast = 0;

    for (const player of gameState.players) {
      if (!player.isAlive) continue;
      if (runoffSet && !runoffSet.has(player.id)) continue;
      const rawCount = rawTallies[player.id] ?? 0;
      const count = Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0;
      if (count > 0) {
        sanitizedTallies[player.id] = count;
        totalVotesCast += count;
      }
    }

    if (phase === 'DAY_MAYOR_ELECTION') {
      const livingCount = gameState.players.filter((p) => p.isAlive).length;
      const abstainCount = Math.max(0, livingCount - totalVotesCast);
      this.roomState.lastVoteTally = { tallies: sanitizedTallies, abstainCount };

      const sorted = Object.entries(sanitizedTallies).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        const highest = sorted[0][1];
        const top = sorted.filter((entry) => entry[1] === highest);
        if (top.length === 1) {
          const winnerId = top[0][0];
          const mayor = gameState.players.find((p) => p.id === winnerId);
          if (mayor) {
            gameState.mayorId = winnerId;
            mayor.voteWeight = 2;
            this.roomState.publicHistoryLogs.push(
              `Ngày ${gameState.roundNumber}: ${mayor.name} được bầu làm Trưởng làng (lá phiếu tính x2).`
            );
          }
        } else {
          this.roomState.publicHistoryLogs.push(
            'Hòa phiếu bầu Trưởng làng. Ván đấu tiếp tục mà không có Trưởng làng!'
          );
        }
      } else {
        this.roomState.publicHistoryLogs.push(
          'Không có ai nhận được phiếu bầu Trưởng làng. Không có Trưởng làng!'
        );
      }

      gameState.phase = 'DAY_DISCUSS';
      this.startLocalDayTimer();
      this.emitState();
      return;
    }

    const totalPossibleWeight = gameState.players
      .filter((p) => p.isAlive && p.voteWeight > 0)
      .reduce((sum, p) => sum + p.voteWeight, 0);
    const abstainCount = Math.max(0, totalPossibleWeight - totalVotesCast);
    this.roomState.lastVoteTally = { tallies: sanitizedTallies, abstainCount };

    const sorted = Object.entries(sanitizedTallies).sort((a, b) => b[1] - a[1]);
    let targetsToExecute: PlayerId[] = [];

    if (sorted.length === 0) {
      this.roomState.publicHistoryLogs.push('Không ai nhận được phiếu treo cổ hôm nay.');
    } else {
      const highestWeight = sorted[0][1];
      const topCandidates = sorted.filter((entry) => entry[1] === highestWeight);

      if (topCandidates.length === 1) {
        const targetId = topCandidates[0][0];
        const targetName =
          gameState.players.find((p) => p.id === targetId)?.name ?? targetId;
        if (!isRunoff && gameState.settings.lynchThreshold === 'MAJORITY') {
          const livingCount = gameState.players.filter((p) => p.isAlive).length;
          if (highestWeight <= livingCount / 2) {
            this.roomState.publicHistoryLogs.push(
              `${targetName} nhận nhiều phiếu nhất (${highestWeight}) nhưng chưa đạt quá bán (> ${Math.floor(livingCount / 2)}/${livingCount} phiếu). Cả làng tha bổng hôm nay.`
            );
            const prevHistoryLen = gameState.historyLogs.length;
            this.applyDayVoteExecution([], prevHistoryLen);
            return;
          }
        }

        targetsToExecute = [targetId];
        this.roomState.publicHistoryLogs.push(
          `${targetName} nhận số phiếu cao nhất (${highestWeight} phiếu).`
        );

        if (!isRunoff && gameState.doubleVoteDay && sorted.length > 1) {
          targetsToExecute.push(sorted[1][0]);
        }
      } else if (!isRunoff && this.roomState.settings.tieVoteMode === 'RUNOFF') {
        const candidateIds = topCandidates.map((c) => c[0]);
        gameState.phase = 'DAY_RUNOFF';
        if (!gameState.dayState) {
          gameState.dayState = {
            discussionSecondsRemaining: 180,
            voteLockRemainingSeconds: 0,
            voteLocked: false,
            isPaused: false,
            extensionsUsed: 0,
            ballots: {},
          };
        }
        gameState.dayState.runoffCandidates = candidateIds;
        gameState.dayState.runoffBallots = {};
        this.roomState.publicHistoryLogs.push(
          `Hòa phiếu giữa ${candidateIds.length} người. Bắt đầu vòng biểu quyết Runoff!`
        );
        this.roomState.timers.deadlineAt = Date.now() + 30 * 1000;
        this.emitState();
        return;
      } else {
        this.roomState.publicHistoryLogs.push(
          isRunoff
            ? 'Vòng Runoff hòa phiếu: Cả làng tha bổng, không ai bị treo cổ hôm nay.'
            : 'Hòa phiếu: Cả làng tha bổng, không ai bị treo cổ hôm nay.'
        );
      }
    }

    const prevHistoryLen = gameState.historyLogs.length;
    this.applyDayVoteExecution(targetsToExecute, prevHistoryLen);
  }

  public async hostPause(): Promise<void> {
    if (this.roomState.timers.isPaused) return;
    this.roomState.timers.isPaused = true;
    if (this.roomState.timers.deadlineAt) {
      const remainingMs = Math.max(0, this.roomState.timers.deadlineAt - Date.now());
      this.roomState.timers.remainingBeforePause = remainingMs;
    }
    this.emitState();
  }

  public async hostResume(): Promise<void> {
    if (!this.roomState.timers.isPaused) return;
    this.roomState.timers.isPaused = false;
    if (this.roomState.timers.remainingBeforePause !== undefined) {
      this.roomState.timers.deadlineAt = Date.now() + this.roomState.timers.remainingBeforePause;
      this.roomState.timers.remainingBeforePause = undefined;
    }
    this.emitState();
  }

  public async hostUnlockVote(): Promise<void> {
    const gameState = this.roomState.gameState;
    if (!gameState || gameState.phase !== 'DAY_DISCUSS' || !gameState.dayState?.voteLocked) {
      return;
    }
    gameState.dayState.voteLocked = false;
    gameState.dayState.voteLockRemainingSeconds = 0;
    this.roomState.timers.voteLockDeadlineAt = undefined;
    this.roomState.timers.remainingVoteLockMs = undefined;
    this.emitState();
  }

  public async hostExtendTime(): Promise<void> {
    if (!this.roomState.gameState?.dayState) return;
    const ext = this.roomState.gameState.dayState.extensionsUsed;
    if (ext >= 2) return;
    this.roomState.gameState.dayState.extensionsUsed += 1;
    if (this.roomState.timers.isPaused && this.roomState.timers.remainingBeforePause !== undefined) {
      this.roomState.timers.remainingBeforePause += 30 * 1000;
    }
    if (this.roomState.timers.deadlineAt) {
      this.roomState.timers.deadlineAt += 30 * 1000;
    }
    this.emitState();
  }

  public async hostEmergencyEliminate(targetPlayerId: PlayerId): Promise<void> {
    if (!this.roomState.gameState) return;
    const p = this.roomState.gameState.players.find((pl) => pl.id === targetPlayerId);
    if (p && p.isAlive) {
      const prevPhase = this.roomState.gameState.phase;
      processDeathCascade(this.roomState.gameState, [{ playerId: targetPlayerId, cause: 'VILLAGE_VOTE' }]);
      this.roomState.publicHistoryLogs.push(`Quản trò đã trục xuất khẩn cấp [${p.name}] khỏi bàn.`);

      const hasAlivePlayers = this.roomState.gameState.players.some((pl) => pl.isAlive);
      if (this.roomState.gameState.pendingHunterShotPlayerId && hasAlivePlayers) {
        this.roomState.gameState.previousPhaseBeforeHunter = prevPhase;
        this.roomState.gameState.phase = 'HUNTER_SHOT';
        this.activeLocalPlayerId = this.roomState.gameState.pendingHunterShotPlayerId;
        this.clearDayTimer();
        this.clearNightIntroTimer();
      } else if (this.roomState.gameState.pendingMayorSuccessionPlayerId && hasAlivePlayers) {
        this.roomState.gameState.previousPhaseBeforeMayorSuccession = prevPhase;
        this.roomState.gameState.phase = 'MAYOR_SUCCESSION';
        this.activeLocalPlayerId = this.roomState.gameState.pendingMayorSuccessionPlayerId;
        this.clearDayTimer();
        this.clearNightIntroTimer();
      } else {
        const winOutcome = checkWinCondition(this.roomState.gameState);
        if (winOutcome) {
          this.roomState.gameState.phase = 'GAME_OVER';
          this.clearDayTimer();
          this.clearNightIntroTimer();
        }
      }

      if (this.roomState.gameState.phase === 'NIGHT') {
        const aliveIds = new Set(
          this.roomState.gameState.players.filter((pl) => pl.isAlive).map((pl) => pl.id)
        );
        if (!this.activeLocalPlayerId || !aliveIds.has(this.activeLocalPlayerId)) {
          const currentTurn = this.roomState.nightTurnPlan[this.roomState.currentNightTurnIndex];
          const nextTurnActor = currentTurn?.activePlayerIds.find((id) => aliveIds.has(id));
          this.activeLocalPlayerId = nextTurnActor ?? Array.from(aliveIds)[0];
        }
      }
    }
    this.emitState();
  }

  private resetRoomToLobby(): void {
    this.clearNightIntroTimer();
    this.clearDayTimer();
    audioController.stopAll();

    this.roomState.gameState = null;
    this.roomState.gameGeneration += 1;
    for (const p of this.roomState.players.values()) {
      p.isAlive = true;
    }

    this.roomState.currentNightTurnIndex = 0;
    this.roomState.nightTurnPlan = [];
    this.roomState.nightActionsAccumulator = {};
    this.roomState.nightActionAcks.clear();
    this.roomState.currentNightSeed = undefined;
    this.roomState.publicHistoryLogs = [];
    this.roomState.seerInvestigationResult = undefined;
    this.roomState.sorcererInvestigationResult = undefined;
    this.roomState.auraInvestigationResult = undefined;
    this.roomState.foxInvestigationResult = undefined;
    this.roomState.piInvestigationResult = undefined;
    this.roomState.lastVoteTally = undefined;
    this.roomState.timers = {
      timerId: null,
      deadlineAt: null,
      serverCutoffAt: null,
      isPaused: false,
      phase: 'LOBBY',
    };

    this.pendingDayVerdict = null;
    this.nightIntroUntil = null;
    const playersList = Array.from(this.roomState.players.values()).sort(
      (a, b) => a.seatIndex - b.seatIndex
    );
    this.activeLocalPlayerId = this.roomState.host.playerId ?? playersList[0]?.id;

    this.state.postGameView = null;
    this.state.privateView = null;
    this.emitState(true);
  }

  public async hostRematch(): Promise<void> {
    this.resetRoomToLobby();
  }

  public async abortGameToLobby(): Promise<void> {
    this.resetRoomToLobby();
  }

  public async endGameToSummary(): Promise<void> {
    this.clearNightIntroTimer();
    this.clearDayTimer();
    audioController.stopNightBGM();
    this.pendingDayVerdict = null;
    this.nightIntroUntil = null;

    if (this.roomState.gameState) {
      this.roomState.gameState.phase = 'GAME_OVER';
    }
    this.emitState(true);
  }
}
