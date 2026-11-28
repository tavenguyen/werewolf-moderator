import type { Faction, SeerResult } from './roles';

export type PlayerId = string;

export type GamePhase =
  | 'LOBBY'
  | 'FIRST_NIGHT_SETUP'
  | 'NIGHT'
  | 'DAY_DISCUSS'
  | 'DAY_MAYOR_ELECTION'
  | 'DAY_VOTE'
  | 'DAY_RUNOFF'
  | 'HUNTER_SHOT'
  | 'MAYOR_SUCCESSION'
  | 'GAME_OVER';

export type DeathCause =
  | 'WOLF_PACK'
  | 'WHITE_WOLF'
  | 'WITCH_POISON'
  | 'HUNTER_SHOT'
  | 'VILLAGE_VOTE'
  | 'EMERGENCY_ELIMINATE'
  | 'COUPLE_HEARTBREAK'
  | 'COMPANION_DEATH'
  | 'TETANUS'
  | 'TOUGH_GUY_COLLAPSE';

export type MatchLogStage =
  | 'SETUP'
  | 'NIGHT'
  | 'DAY_ANNOUNCEMENT'
  | 'DAY_VOTE'
  | 'GAME_END';

export type MatchLogVisibility = 'PUBLIC' | 'SECRET_NIGHT' | 'SYSTEM_DEBUG';

export type MatchEventOutcome =
  | 'SUCCESS'
  | 'BLOCKED_BY_BODYGUARD'
  | 'SAVED_BY_WITCH'
  | 'OVERRIDDEN_BY_POISON'
  | 'OVERDOSE_DOUBLE_PROTECT'
  | 'IMMUNE'
  | 'NO_EFFECT'
  | 'SKIPPED'
  | 'LOST_POWER'
  | 'TIED_ESCAPE'
  | 'TIED_RUNOFF'
  | 'BELOW_MAJORITY';

export type MatchActionType =
  // SETUP (Đêm 1)
  | 'PAIR_LOVERS'
  | 'CHOOSE_IDOL'
  | 'CHOOSE_COPY_TARGET'
  | 'CHOOSE_HOODLUM_TARGETS'
  | 'CHOOSE_COMPANION'
  | 'MASON_MEET'
  | 'MINION_REVEAL'
  | 'DRUNK_SLEEP'
  // NIGHT
  | 'PROTECT'
  | 'ATTACK'
  | 'CURSE'
  | 'HEAL'
  | 'POISON'
  | 'INSPECT'
  | 'SILENCE'
  | 'DOUBLE_VOTE_SABOTAGE'
  | 'ENCHANT'
  | 'CONVERT_CULT'
  | 'NIGHT_IDLE_SUMMARY'
  // TRANSFORMATIONS & DELAYED EFFECTS
  | 'DRUNK_AWAKEN'
  | 'DREAM_WOLF_AWAKEN'
  | 'CURSED_TURN'
  | 'WILD_CHILD_TURN'
  | 'DOPPELGANGER_INHERIT'
  | 'ELDER_SHIELD_HIT'
  | 'ELDER_CURSE_VILLAGE'
  | 'TOUGH_GUY_WOUNDED'
  | 'TOUGH_GUY_COLLAPSE'
  | 'RUSTY_KNIGHT_INFECT'
  | 'TETANUS_DEATH'
  | 'WOLF_CUB_ENRAGE'
  | 'PIED_PIPER_CLEAR'
  | 'CULT_DISBAND'
  | 'ANGEL_TO_VILLAGER'
  // DAWN & DAY
  | 'DAWN_SUMMARY'
  | 'BEAR_GROWL'
  | 'MUTE_ANNOUNCE'
  | 'TROUBLEMAKER_ANNOUNCE'
  | 'MAYOR_ELECTED'
  | 'MAYOR_TIE'
  | 'MAYOR_SUCCESSION'
  | 'VOTE_TALLY'
  | 'VOTE_EXECUTION'
  | 'VOTE_SURVIVED_REVEAL'
  | 'VOTE_NO_EXECUTION'
  | 'HUNTER_SHOT'
  | 'CASCADE_DEATH'
  | 'EMERGENCY_ELIMINATE'
  // GAME END
  | 'WIN';

export interface EventParticipantSnapshot {
  playerId: PlayerId;
  name: string;
  seatIndex: number;
  roleId: string;
  faction: Faction;
  drunkRealRoleId?: string | null;
}

export interface MatchEventMetadata {
  investigation?: {
    kind: 'SEER_FACTION' | 'SEER_EXACT' | 'SORCERER' | 'AURA' | 'GROUP_HAS_WOLF';
    resultLabel: string;
    rawValue: string | boolean;
    inspectedPlayers?: EventParticipantSnapshot[];
    keptPower?: boolean;
  };
  wolfPack?: {
    individualVotes?: Array<{
      wolf: EventParticipantSnapshot;
      target: EventParticipantSnapshot | null;
      targets?: EventParticipantSnapshot[];
    }>;
    tieBreakRandom?: boolean;
    isDoubleKill?: boolean;
    isBigBadWolfExtra?: boolean;
    firstNightPeaceRule?: boolean;
    friendlyFireBlocked?: boolean;
    skipWon?: boolean;
  };
  protector?: EventParticipantSnapshot;
  healer?: EventParticipantSnapshot;
  witch?: {
    mode?: 'SINGLE' | 'AOE';
    wastedHeal?: boolean;
    refundedHeal?: boolean;
    blockedByBodyguard?: boolean;
    selfHealBlocked?: boolean;
    blockedByBothRule?: boolean;
  };
  vote?: {
    voteKind: 'MAYOR' | 'DAY' | 'RUNOFF';
    tallies: Array<{
      target: EventParticipantSnapshot;
      votes: number;
      voters?: EventParticipantSnapshot[];
    }>;
    abstainVotes: number;
    totalEligibleWeight?: number;
    isDoubleVoteDay?: boolean;
    executionStep?: 1 | 2;
    cancelledReason?: 'IMMEDIATE_WIN' | 'ALREADY_DEAD';
    majorityThreshold?: number;
    tiedCandidates?: EventParticipantSnapshot[];
  };
  roleChange?: {
    oldRoleId: string;
    newRoleId: string;
    oldFaction: Faction;
    newFaction: Faction;
    drunkRealRoleId?: string;
    inheritedWitchHealUsed?: boolean;
    inheritedWitchPoisonUsed?: boolean;
    inheritedFrom?: EventParticipantSnapshot;
  };
  delayedSourceRound?: number;
  dawnDeaths?: Array<{
    victim: EventParticipantSnapshot;
    cause: DeathCause;
    sourceRoleId?: string;
  }>;
  win?: {
    winner: NonNullable<WinOutcome['winner']>;
    winningPlayers: EventParticipantSnapshot[];
    coWinners?: EventParticipantSnapshot[];
    reason: string;
  };
  setup?: {
    isCrossFactionCouple?: boolean;
    drunkRealRoleId?: string;
    soloMason?: boolean;
  };
  idleNotes?: string[];
  cascadeCause?: DeathCause;
  noShotReason?: 'DOPPELGANGER_HUNTER_BY_HUNTER' | 'POISON_BLOCKED' | 'TIMEOUT_OR_SKIP';
  note?: string;
}

export interface MatchEvent {
  id: string;
  seq: number;
  roundNumber: number;
  stage: MatchLogStage;
  actionType: MatchActionType;
  visibility: MatchLogVisibility;
  actor: EventParticipantSnapshot | null;
  coActors?: EventParticipantSnapshot[];
  targets: EventParticipantSnapshot[];
  outcome: MatchEventOutcome;
  parentEventId?: string | null;
  involvedPlayerIds: PlayerId[];
  metadata?: MatchEventMetadata;
}

export interface PublicMatchLogItem {
  id: string;
  seq: number;
  roundNumber: number;
  stage: Extract<MatchLogStage, 'DAY_ANNOUNCEMENT' | 'DAY_VOTE' | 'GAME_END'>;
  actionType: MatchActionType;
  text: string;
  isHighlight: boolean;
}

export interface DeathRecord {
  playerId: PlayerId;
  roleId: string;
  roundNumber: number;
  phase: GamePhase;
  cause: DeathCause;
  cascadeDepth: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  seatIndex: number;
  roleId: string;
  initialRoleId: string;
  faction: Faction;
  isAlive: boolean;
  elderHp?: number; // 2 giáp cho Già làng
  voteWeight: number; // 1 mặc định, 0 cho Thằng ngốc sau lật bài, 2 cho Trưởng làng
  loverId?: PlayerId | null; // Cặp đôi Cupid
  isCrossFactionCouple?: boolean; // Tách thành Phe Thứ 3 nếu 2 người khác phe
  isMuted?: boolean;
  isCultMember?: boolean;
  isEnchanted?: boolean;
  infectedWithTetanus?: boolean;
  tetanusInfectionRound?: number;
  toughGuyBittenNight?: number | null;
  roleModelId?: PlayerId | null;
  doppelgangerTargetId?: PlayerId | null;
  companionId?: PlayerId | null;
  hoodlumTargetIds?: [PlayerId, PlayerId] | null;
  drunkRealRoleId?: string | null;
}

export interface RoomSettings {
  revealOnDeath: boolean;
  allowWolfSkip: boolean;
  allowWolfFriendlyFire: boolean;
  witchHealMode: 'SINGLE' | 'AOE';
  witchKnowsVictim: boolean;
  witchWasteHealOnEmpty: boolean;
  allowWitchSelfHeal: boolean;
  tieVoteMode: 'ESCAPE' | 'RUNOFF';
  ghostMode: boolean;
  hasMayor: boolean;
  customDeck?: Record<string, number>;

  // Variant rules - Bodyguard & Witch
  allowBodyguardSelfProtect?: boolean;
  allowWitchBothPotionsSameNight?: boolean;
  witchDoubleProtectKills?: boolean;

  // Variant rules - Seer, Cupid & Wolves
  firstNightNoKill?: boolean;
  seerRevealMode?: 'FACTION' | 'EXACT_ROLE';
  allowCupidSelfMatch?: boolean;

  // Variant rules - Day & Timing
  dayDiscussionSeconds?: number;
  dayVoteLockSeconds?: number;
  revealVoterIdentities?: boolean;
  lynchThreshold?: 'PLURALITY' | 'MAJORITY';

  // Variant rules - Hunter
  hunterShootsOnPoison?: boolean;
  allowHunterSkipShot?: boolean;
}

export interface NightActions {
  cupid?: { target1: PlayerId; target2: PlayerId };
  bodyguard?: { targetId: PlayerId };
  wolfPack?: {
    targets?: PlayerId[];
    isSkip?: boolean;
    individualVotes?: Record<PlayerId, PlayerId | null>; // voterId -> targetId | null (skip)
    multiVotes?: Record<PlayerId, PlayerId[]>; // voterId -> up to 2 targetIds (Wolf Cub double kill)
  };
  whiteWolf?: { targetId: PlayerId | null };
  seer?: { targetId: PlayerId };
  sorcerer?: { targetId: PlayerId };
  witch?: {
    heal?: boolean;
    healTargetId?: PlayerId | null;
    poisonTargetId?: PlayerId | null;
  };
  // Non-MVP fields kept for compatibility
  accursedWolf?: { curseTargetId: PlayerId | null };
  bigBadWolf?: { targetId: PlayerId | null };
  auraSeer?: { targetId: PlayerId };
  apprenticeSeer?: { targetId: PlayerId };
  pi?: { targetId: PlayerId };
  fox?: { targetId: PlayerId; isSkip?: boolean };
  spellcaster?: { targetId: PlayerId };
  troublemaker?: { activate?: boolean };
  piedPiper?: { targetIds: PlayerId[] };
  cultLeader?: { targetId: PlayerId };
  doppelganger?: { targetId: PlayerId };
  wildChild?: { targetId: PlayerId };
  hoodlum?: { target1: PlayerId; target2: PlayerId };
  direWolf?: { targetId: PlayerId };
}

export interface NightInfoResults {
  seerResult?: { targetId: PlayerId; result: SeerResult | string };
  sorcererResult?: { targetId: PlayerId; isSeer: boolean };
  auraResult?: { targetId: PlayerId; result: 'NORMAL' | 'SPECIAL' };
  piResult?: { targetId: PlayerId; hasWerewolf: boolean; inspectedPlayerIds: PlayerId[] };
  foxResult?: { targetId: PlayerId; hasWerewolf: boolean; inspectedPlayerIds: PlayerId[] };
  apprenticeSeerResult?: { targetId: PlayerId; result: SeerResult | string };
}

export interface NightResolutionEvent {
  type:
    | 'PROTECTED'
    | 'WOLF_ATTACK'
    | 'WITCH_HEAL'
    | 'WITCH_POISON'
    | 'WHITE_WOLF_ATTACK'
    | 'DEATH'
    | 'SURVIVED'
    | 'AWAKENED';
  sourceRole?: string;
  targetPlayerId: PlayerId;
  isPublic: boolean;
  details?: string;
}

export interface DayState {
  discussionSecondsRemaining: number;
  voteLockRemainingSeconds: number;
  voteLocked: boolean;
  isPaused: boolean;
  extensionsUsed: number;
  ballots: Record<PlayerId, PlayerId | null>;
  runoffCandidates?: PlayerId[];
  runoffBallots?: Record<PlayerId, PlayerId | null>;
  mayorBallots?: Record<PlayerId, PlayerId | null>;
}

export interface WinOutcome {
  winner:
    | 'VILLAGER'
    | 'WEREWOLF'
    | 'TANNER'
    | 'COUPLE'
    | 'WHITE_WOLF'
    | 'ANGEL'
    | 'PIED_PIPER'
    | 'CULT_LEADER'
    | 'HOODLUM'
    | 'LONE_WOLF'
    | 'DRAW'
    | null;
  reason: string;
  winningPlayerIds: PlayerId[];
}

export interface GameState {
  generation: number;
  roundNumber: number;
  phase: GamePhase;
  players: PlayerState[];
  settings: RoomSettings;
  deaths: DeathRecord[];
  lastProtectedPlayerId?: PlayerId | null;
  lastMutedPlayerId?: PlayerId | null;
  mutedPlayerId?: PlayerId | null;
  witchHealUsed: boolean;
  witchPoisonUsed: boolean;
  wolfCubDoubleKillNextNight: boolean;
  dreamWolfAwakened: boolean;
  foxLostPower: boolean;
  piUsed: boolean;
  troublemakerUsed: boolean;
  accursedWolfUsed: boolean;
  doubleVoteDay: boolean;
  villagePowerStripped: boolean;
  bearGrowled?: boolean;
  princeRevealed?: boolean;
  mayorId: PlayerId | null;
  pendingHunterShotPlayerId?: PlayerId | null;
  pendingHunterQueue?: PlayerId[];
  pendingHunterDeathEventIds?: Record<PlayerId, string>;
  pendingMayorSuccessionPlayerId?: PlayerId | null;
  morningAnnouncedRound?: number;
  interruptedPhaseDuringNight?: boolean;
  previousPhaseBeforeHunter?: GamePhase;
  previousPhaseBeforeMayorSuccession?: GamePhase;
  dayState?: DayState;
  resolvedEvents?: NightResolutionEvent[];
  historyLogs: string[];
  eventLog: MatchEvent[];
  eventSeq: number;
}
