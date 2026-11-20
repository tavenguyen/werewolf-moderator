import type { Faction, SeerResult } from '../screens/home/roles';

export type PlayerId = string;

export type GamePhase =
  | 'LOBBY'
  | 'FIRST_NIGHT_SETUP'
  | 'NIGHT'
  | 'DAY_DISCUSS'
  | 'DAY_VOTE'
  | 'HUNTER_SHOT'
  | 'GAME_OVER';

export type DeathCause =
  | 'WOLF_PACK'
  | 'WHITE_WOLF'
  | 'WITCH_POISON'
  | 'HUNTER_SHOT'
  | 'VILLAGE_VOTE'
  | 'COUPLE_HEARTBREAK'
  | 'COMPANION_DEATH'
  | 'TETANUS'
  | 'TOUGH_GUY_COLLAPSE';

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
  voteWeight: number; // 1 mặc định, 0 cho Thằng ngốc sau lật bài
  isMuted?: boolean; // Bị Người phù phép (Spellcaster) câm lặng
  isCultMember?: boolean; // Tín đồ Trưởng giáo phái (Cult Leader)
  isEnchanted?: boolean; // Bị Người thổi sáo (Pied Piper) thôi miên
  infectedWithTetanus?: boolean; // Bị Kỵ sĩ gỉ sắt (Rusty Knight) lây bệnh
  toughGuyBittenNight?: number | null; // Đêm Người cứng cỏi bị cắn
  loverId?: PlayerId | null; // Cặp đôi Cupid
  roleModelId?: PlayerId | null; // Hình mẫu của Đứa con hoang (Wild Child)
  doppelgangerTargetId?: PlayerId | null; // Mục tiêu sao chép của Nhân bản
  companionId?: PlayerId | null; // Bạn đồng hành của Sói tuyết (Dire Wolf)
  hoodlumTargetIds?: [PlayerId, PlayerId] | null; // 2 mục tiêu của Du côn (Hoodlum)
  drunkRealRoleId?: string | null; // Vai thật bốc ngầm của Kẻ say rượu (Drunk)
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
}

export interface NightActions {
  cupid?: { target1: PlayerId; target2: PlayerId };
  doppelganger?: { targetId: PlayerId };
  wildChild?: { targetId: PlayerId };
  hoodlum?: { target1: PlayerId; target2: PlayerId };
  direWolf?: { targetId: PlayerId };
  bodyguard?: { targetId: PlayerId };
  wolfPack?: { targets: PlayerId[]; isSkip?: boolean };
  accursedWolf?: { curseTargetId: PlayerId | null };
  bigBadWolf?: { targetId: PlayerId | null };
  whiteWolf?: { targetId: PlayerId | null };
  seer?: { targetId: PlayerId };
  auraSeer?: { targetId: PlayerId };
  pi?: { targetId: PlayerId };
  fox?: { targetId: PlayerId; isSkip?: boolean };
  sorcerer?: { targetId: PlayerId };
  witch?: { heal?: boolean; poisonTargetId?: PlayerId | null };
  spellcaster?: { targetId: PlayerId };
  troublemaker?: { activate?: boolean };
  piedPiper?: { targetIds: [PlayerId, PlayerId] };
  cultLeader?: { targetId: PlayerId };
}

export interface NightInfoResults {
  seerResult?: { targetId: PlayerId; result: SeerResult };
  auraResult?: { targetId: PlayerId; result: 'NORMAL' | 'SPECIAL' };
  piResult?: { targetId: PlayerId; hasWerewolf: boolean; inspectedPlayerIds: PlayerId[] };
  foxResult?: { targetId: PlayerId; hasWerewolf: boolean; inspectedPlayerIds: PlayerId[] };
  sorcererResult?: { targetId: PlayerId; isSeer: boolean };
}

export interface WinOutcome {
  winner:
    | 'VILLAGER'
    | 'WEREWOLF'
    | 'TANNER'
    | 'ANGEL'
    | 'PIED_PIPER'
    | 'CULT_LEADER'
    | 'HOODLUM'
    | 'LONE_WOLF'
    | 'COUPLE'
    | 'WHITE_WOLF'
    | 'DRAW'
    | null;
  reason: string;
  winningPlayerIds: PlayerId[];
}

export interface GameState {
  roundNumber: number;
  phase: GamePhase;
  players: PlayerState[];
  settings: RoomSettings;
  deaths: DeathRecord[];
  lastProtectedPlayerId?: PlayerId | null;
  witchHealUsed: boolean;
  witchPoisonUsed: boolean;
  wolfCubDoubleKillNextNight: boolean;
  dreamWolfAwakened: boolean;
  foxLostPower: boolean;
  piUsed: boolean;
  troublemakerUsed: boolean;
  accursedWolfUsed: boolean;
  doubleVoteDay: boolean;
  villagePowerStripped: boolean; // Phạt khi Già làng bị Dân giết
  pendingHunterShotPlayerId?: PlayerId | null;
  historyLogs: string[];
}
