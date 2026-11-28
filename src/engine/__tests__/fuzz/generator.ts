import { ROLE_PRESETS, isNightHuntingWolf } from '../../presets';
import { ROLES, ROLES_BY_ID } from '../../roles';
import type { NightTurnPlanItem } from '../../turnPlan';
import type { GameState, NightActions, PlayerId, RoomSettings } from '../../types';
import { SeededRng } from './prng';

export interface FuzzMatchConfig {
  playerCount: number;
  players: Array<{ id: PlayerId; name: string; seatIndex: number }>;
  roleIds: string[];
  settings: Partial<RoomSettings>;
}

const ALL_ENGINE_ROLE_IDS = ROLES.filter((r) => r.implementedInEngine).map((r) => r.id);
const UNIQUE_OR_LIMIT_ONE_ROLES = new Set(
  ALL_ENGINE_ROLE_IDS.filter((id) => id !== 'werewolf' && id !== 'villager' && id !== 'mason' && id !== 'hunter')
);

const HIGH_CHAOS_SUBSETS: string[][] = [
  ['doppelganger', 'wild_child', 'drunk', 'cursed', 'hunter', 'werewolf'],
  ['wolf_cub', 'big_bad_wolf', 'bodyguard', 'witch', 'elder', 'tough_guy'],
  ['pied_piper', 'cult_leader', 'cupid', 'angel', 'tanner', 'werewolf'],
  ['troublemaker', 'prince', 'village_idiot', 'hunter', 'hunter', 'werewolf'],
  ['seer', 'apprentice_seer', 'aura_seer', 'sorcerer', 'lycan', 'wolf_accursed'],
  ['dire_wolf', 'dream_wolf', 'rusty_knight', 'bear_tamer', 'spellcaster', 'lone_wolf'],
  ['mason', 'mason', 'minion', 'hoodlum', 'fox', 'pi', 'white_wolf'],
];

/**
 * Sinh cấu hình bàn đấu + 19 công tắc luật hoàn toàn tất định từ PRNG.
 */
export function generateFuzzMatchConfig(rng: SeededRng): FuzzMatchConfig {
  const playerCount = rng.nextInt(6, 16);

  const settings: Partial<RoomSettings> = {
    revealOnDeath: rng.chance(0.5),
    allowWolfSkip: rng.chance(0.5),
    allowWolfFriendlyFire: rng.chance(0.5),
    witchHealMode: rng.chance(0.5) ? 'AOE' : 'SINGLE',
    witchKnowsVictim: rng.chance(0.5),
    witchWasteHealOnEmpty: rng.chance(0.5),
    allowWitchSelfHeal: rng.chance(0.5),
    allowWitchBothPotionsSameNight: rng.chance(0.5),
    witchDoubleProtectKills: rng.chance(0.5),
    tieVoteMode: rng.chance(0.5) ? 'RUNOFF' : 'ESCAPE',
    ghostMode: rng.chance(0.5),
    hasMayor: rng.chance(0.5),
    allowBodyguardSelfProtect: rng.chance(0.5),
    firstNightNoKill: rng.chance(0.5),
    seerRevealMode: rng.chance(0.5) ? 'EXACT_ROLE' : 'FACTION',
    allowCupidSelfMatch: rng.chance(0.5),
    revealVoterIdentities: rng.chance(0.5),
    lynchThreshold: rng.chance(0.5) ? 'MAJORITY' : 'PLURALITY',
    hunterShootsOnPoison: rng.chance(0.5),
    allowHunterSkipShot: rng.chance(0.5),
  };

  let roleIds: string[] = [];
  const strategyRoll = rng.next();

  if (strategyRoll < 0.35) {
    // 1. Lấy từ catalog 44 presets rồi trộn lại
    const presetsForCount = ROLE_PRESETS.filter((p) => p.playerCount === playerCount);
    roleIds = [...rng.pick(presetsForCount).roles];
  } else if (strategyRoll < 0.6) {
    // 2. Bơm các bộ stress tương tác chéo cao rồi điền nốt cho đủ playerCount
    const coreSeed = rng.pick(HIGH_CHAOS_SUBSETS);
    for (const r of coreSeed) {
      if (roleIds.length < playerCount) roleIds.push(r);
    }
  }

  // 3. Nếu chưa đủ playerCount (hoặc chiến lược 40% random phủ đủ 39 vai): điền ngẫu nhiên có kiểm soát
  const wolfRoles = ALL_ENGINE_ROLE_IDS.filter((id) => isNightHuntingWolf(id));
  while (roleIds.length < playerCount) {
    if (!roleIds.some((id) => isNightHuntingWolf(id))) {
      roleIds.push(rng.pick(wolfRoles));
      continue;
    }

    const candidate = rng.pick(ALL_ENGINE_ROLE_IDS);
    if (UNIQUE_OR_LIMIT_ONE_ROLES.has(candidate) && roleIds.includes(candidate)) {
      continue;
    }
    if (candidate === 'lone_wolf' && roleIds.includes('white_wolf')) continue;
    if (candidate === 'white_wolf' && roleIds.includes('lone_wolf')) continue;
    roleIds.push(candidate);
  }

  // Bảo đảm luôn có ít nhất 1 Sói cắn đêm hợp lệ
  if (!roleIds.some((id) => isNightHuntingWolf(id))) {
    roleIds[0] = rng.pick(wolfRoles);
  }

  roleIds = rng.shuffle(roleIds);

  const players = Array.from({ length: playerCount }, (_, idx) => ({
    id: `p${idx + 1}`,
    name: `P${idx + 1}`,
    seatIndex: idx,
  }));

  return {
    playerCount,
    players,
    roleIds,
    settings,
  };
}

/**
 * Sinh hành động đêm dựa trên NightTurnPlan hiện tại và xác suất timeout ngẫu nhiên.
 */
export function generateFuzzNightActions(
  state: GameState,
  plan: NightTurnPlanItem[],
  rng: SeededRng,
  forceProgress: boolean
): NightActions {
  const actions: NightActions = {};
  const aliveIds = state.players.filter((p) => p.isAlive).map((p) => p.id);
  if (aliveIds.length === 0) return actions;

  // Giả lập tỷ lệ nhỏ không ai gửi action đêm (hoặc timeout một vài lượt)
  const timeoutRate = forceProgress ? 0 : 0.14;

  for (const turn of plan) {
    if (turn.isFake || !turn.canAct || turn.activePlayerIds.length === 0) continue;

    // Trừ lượt Sói khi đang forceProgress, cho phép timeout ngẫu nhiên ở các vai khác
    const canSkipTurn = !(forceProgress && (turn.turnKey === 'wolf_pack' || turn.turnKey === 'white_wolf'));
    if (canSkipTurn && rng.chance(timeoutRate)) {
      continue;
    }

    const actorId = turn.activePlayerIds[0];

    switch (turn.turnKey) {
      case 'cupid': {
        const pool =
          state.settings.allowCupidSelfMatch === false && rng.chance(0.8)
            ? aliveIds.filter((id) => id !== actorId)
            : aliveIds;
        if (pool.length >= 2) {
          const picked = rng.pickMany(pool, 2);
          actions.cupid = { target1: picked[0], target2: picked[1] };
        }
        break;
      }

      case 'doppelganger': {
        const others = aliveIds.filter((id) => id !== actorId);
        if (others.length > 0) actions.doppelganger = { targetId: rng.pick(others) };
        break;
      }

      case 'wild_child': {
        const others = aliveIds.filter((id) => id !== actorId);
        if (others.length > 0) actions.wildChild = { targetId: rng.pick(others) };
        break;
      }

      case 'hoodlum': {
        const others = aliveIds.filter((id) => id !== actorId);
        if (others.length >= 2) {
          const picked = rng.pickMany(others, 2);
          actions.hoodlum = { target1: picked[0], target2: picked[1] };
        }
        break;
      }

      case 'dire_wolf': {
        const others = aliveIds.filter((id) => id !== actorId);
        if (others.length > 0) actions.direWolf = { targetId: rng.pick(others) };
        break;
      }

      case 'bodyguard': {
        let pool = aliveIds;
        if (!state.settings.allowBodyguardSelfProtect && rng.chance(0.8)) {
          pool = pool.filter((id) => id !== actorId);
        }
        if (state.lastProtectedPlayerId && rng.chance(0.75)) {
          const filtered = pool.filter((id) => id !== state.lastProtectedPlayerId);
          if (filtered.length > 0) pool = filtered;
        }
        if (pool.length > 0) actions.bodyguard = { targetId: rng.pick(pool) };
        break;
      }

      case 'wolf_pack': {
        const nonWolves = state.players
          .filter((p) => p.isAlive && p.faction !== 'WEREWOLF' && p.roleId !== 'white_wolf')
          .map((p) => p.id);
        const votePool =
          state.settings.allowWolfFriendlyFire && rng.chance(0.15)
            ? aliveIds
            : nonWolves.length > 0
              ? nonWolves
              : aliveIds;

        if (!forceProgress && state.settings.allowWolfSkip && rng.chance(0.12)) {
          actions.wolfPack = { isSkip: true };
          break;
        }

        if (state.wolfCubDoubleKillNextNight) {
          const multiVotes: Record<PlayerId, PlayerId[]> = {};
          for (const wId of turn.activePlayerIds) {
            multiVotes[wId] = rng.pickMany(votePool, Math.min(2, votePool.length));
          }
          actions.wolfPack = { multiVotes };
        } else {
          const individualVotes: Record<PlayerId, PlayerId | null> = {};
          for (const wId of turn.activePlayerIds) {
            if (!forceProgress && rng.chance(0.1)) {
              individualVotes[wId] = null;
            } else {
              individualVotes[wId] = rng.pick(votePool);
            }
          }
          actions.wolfPack = { individualVotes };
        }
        break;
      }

      case 'wolf_accursed': {
        if (!state.accursedWolfUsed && rng.chance(0.45)) {
          // Chọn một nạn nhân không phải phe sói để nguyền
          const cands = state.players
            .filter((p) => p.isAlive && p.faction !== 'WEREWOLF' && p.roleId !== 'white_wolf')
            .map((p) => p.id);
          if (cands.length > 0) {
            actions.accursedWolf = { curseTargetId: rng.pick(cands) };
          }
        }
        break;
      }

      case 'big_bad_wolf': {
        const cands = state.players
          .filter((p) => p.isAlive && p.faction !== 'WEREWOLF' && p.roleId !== 'white_wolf')
          .map((p) => p.id);
        const fallback = cands.length > 0 ? cands : aliveIds;
        if (fallback.length > 0) {
          actions.bigBadWolf = { targetId: rng.pick(fallback) };
        }
        break;
      }

      case 'white_wolf': {
        const others = aliveIds.filter((id) => id !== actorId);
        if (others.length > 0 && (forceProgress || rng.chance(0.75))) {
          actions.whiteWolf = { targetId: rng.pick(others) };
        } else {
          actions.whiteWolf = { targetId: null };
        }
        break;
      }

      case 'seer':
      case 'apprentice_seer': {
        const targetId = rng.pick(aliveIds);
        if (turn.turnKey === 'seer') actions.seer = { targetId };
        else actions.apprenticeSeer = { targetId };
        break;
      }

      case 'sorcerer':
        actions.sorcerer = { targetId: rng.pick(aliveIds) };
        break;

      case 'aura_seer':
        actions.auraSeer = { targetId: rng.pick(aliveIds) };
        break;

      case 'pi':
        actions.pi = { targetId: rng.pick(aliveIds) };
        break;

      case 'fox':
        if (rng.chance(0.15)) actions.fox = { targetId: aliveIds[0], isSkip: true };
        else actions.fox = { targetId: rng.pick(aliveIds) };
        break;

      case 'witch': {
        const witchAction: NonNullable<NightActions['witch']> = {};
        if (!state.witchHealUsed && !forceProgress && rng.chance(0.45)) {
          witchAction.heal = true;
          witchAction.healTargetId = rng.pick(aliveIds);
        }
        if (!state.witchPoisonUsed && rng.chance(forceProgress ? 0.5 : 0.35)) {
          const nonSelf = aliveIds.filter((id) => id !== actorId);
          if (nonSelf.length > 0) {
            witchAction.poisonTargetId = rng.pick(nonSelf);
          }
        }
        if (witchAction.heal || witchAction.poisonTargetId) {
          actions.witch = witchAction;
        }
        break;
      }

      case 'spellcaster': {
        const nonMuted = aliveIds.filter((id) => id !== state.lastMutedPlayerId);
        if (nonMuted.length > 0) {
          actions.spellcaster = { targetId: rng.pick(nonMuted) };
        }
        break;
      }

      case 'troublemaker':
        if (rng.chance(0.45)) {
          actions.troublemaker = { activate: true };
        }
        break;

      case 'pied_piper': {
        const nonEnchanted = state.players
          .filter((p) => p.isAlive && p.id !== actorId && !p.isEnchanted)
          .map((p) => p.id);
        if (nonEnchanted.length > 0) {
          actions.piedPiper = { targetIds: rng.pickMany(nonEnchanted, Math.min(2, nonEnchanted.length)) };
        } else {
          actions.piedPiper = { targetIds: [] };
        }
        break;
      }

      case 'cult_leader': {
        const nonCult = state.players
          .filter((p) => p.isAlive && p.id !== actorId && !p.isCultMember)
          .map((p) => p.id);
        if (nonCult.length > 0) {
          actions.cultLeader = { targetId: rng.pick(nonCult) };
        }
        break;
      }
    }
  }

  return actions;
}

/**
 * Chọn mục tiêu ngẫu nhiên có chủ đích trong các pha bầu/bắn.
 * Khi forceProgress = true, ưu tiên dồn phiếu để đảm bảo kết thúc hữu hạn nếu ván kéo dài.
 */
export function pickFuzzVoteTarget(
  state: GameState,
  candidatePool: PlayerId[],
  rng: SeededRng,
  forceProgress: boolean
): PlayerId | null {
  if (candidatePool.length === 0) return null;
  if (!forceProgress && rng.chance(0.2)) return null;

  if (forceProgress) {
    // Ưu tiên treo Ma sói hoặc người không phải Hoàng tử/Thằng ngốc đã lộ để ván tiến triển
    const priorityTarget = state.players.find(
      (p) =>
        p.isAlive &&
        candidatePool.includes(p.id) &&
        !(p.roleId === 'prince' && !state.princeRevealed) &&
        !(p.roleId === 'village_idiot' && p.voteWeight > 0)
    );
    return priorityTarget?.id ?? candidatePool[0];
  }

  return rng.pick(candidatePool);
}

export function isEligibleFuzzRole(roleId: string): boolean {
  return Boolean(ROLES_BY_ID[roleId]?.implementedInEngine);
}
