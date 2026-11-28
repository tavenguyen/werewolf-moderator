import { buildPublicTimeline, getMorningAnnouncements } from '../../matchLog';
import { formatMatchEventText } from '../../matchLogFormatter';
import { ROLES_BY_ID } from '../../roles';
import type { NightTurnPlanItem } from '../../turnPlan';
import type { GameState } from '../../types';
import { checkWinCondition } from '../../winConditions';

export interface InvariantContext {
  seed: number;
  stepLabel: string;
  trace: string[];
  verifiedEventCount?: number;
}

export class InvariantViolationError extends Error {
  public readonly seed: number;
  public readonly invariantId: string;
  public readonly stepLabel: string;
  public readonly trace: string[];

  constructor(
    invariantId: string,
    message: string,
    ctx: InvariantContext
  ) {
    const recentTrace = ctx.trace.slice(-12).join('\n  -> ');
    super(
      `[FUZZ INVARIANT ${invariantId}] Seed=${ctx.seed} Step=${ctx.stepLabel}: ${message}\nRecent trace:\n  -> ${recentTrace}`
    );
    this.name = 'InvariantViolationError';
    this.seed = ctx.seed;
    this.invariantId = invariantId;
    this.stepLabel = ctx.stepLabel;
    this.trace = ctx.trace;
  }
}

function fail(id: string, message: string, ctx: InvariantContext): never {
  throw new InvariantViolationError(id, message, ctx);
}

/**
 * Bất biến I3: Kiểm tra tính toàn vẹn của NightTurnPlan.
 */
export function assertTurnPlanInvariants(
  state: GameState,
  plan: NightTurnPlanItem[],
  ctx: InvariantContext
): void {
  if (!Array.isArray(plan)) {
    fail('I3', 'NightTurnPlan is not an array', ctx);
  }

  const playerById = new Map(state.players.map((p) => [p.id, p] as const));
  const seenTurnKeys = new Set<string>();
  let prevPriority = -Infinity;

  for (let idx = 0; idx < plan.length; idx++) {
    const item = plan[idx];
    if (!item || typeof item !== 'object') {
      fail('I3', `NightTurnPlan slot ${idx} is undefined/null`, ctx);
    }
    if (!item.turnKey || !item.roleId || !item.titleVi || !item.titleEn) {
      fail('I3', `NightTurnPlan item ${idx} has empty metadata: ${JSON.stringify(item)}`, ctx);
    }
    if (seenTurnKeys.has(item.turnKey)) {
      fail('I3', `Duplicate turnKey in NightTurnPlan: ${item.turnKey}`, ctx);
    }
    seenTurnKeys.add(item.turnKey);

    if (item.priority < prevPriority) {
      fail(
        'I3',
        `NightTurnPlan not sorted by priority at ${item.turnKey} (${item.priority} < ${prevPriority})`,
        ctx
      );
    }
    prevPriority = item.priority;

    if (item.isFake !== !item.canAct) {
      fail('I3', `NightTurnPlan ${item.turnKey} has inconsistent isFake=${item.isFake} & canAct=${item.canAct}`, ctx);
    }

    if (item.isFake && item.activePlayerIds.length > 0) {
      fail('I3', `Fake NightTurnPlan ${item.turnKey} still contains activePlayerIds`, ctx);
    }
    if (!item.isFake && item.activePlayerIds.length === 0) {
      fail('I3', `Active NightTurnPlan ${item.turnKey} has empty activePlayerIds`, ctx);
    }

    if (item.turnKey === 'wolf_pack' && item.maxTargets !== undefined && item.maxTargets > 2) {
      fail('LUNAR', `wolf_pack maxTargets=${item.maxTargets} exceeds 2`, ctx);
    }

    for (const pId of item.activePlayerIds) {
      const player = playerById.get(pId);
      if (!player) {
        fail('I3', `NightTurnPlan ${item.turnKey} references missing player ${pId}`, ctx);
      }
      if (!player.isAlive) {
        fail('I3', `NightTurnPlan ${item.turnKey} wakes dead player ${pId}`, ctx);
      }
    }
  }
}

/**
 * Bất biến I1, I2, I4, I6, I7, I8 trên GameState tại mỗi mốc pha.
 */
export function assertGameStateInvariants(
  state: GameState,
  ctx: InvariantContext
): void {
  const playerById = new Map(state.players.map((p) => [p.id, p] as const));

  // I1: Không chết 2 lần & nhất quán giữa players[].isAlive và deaths[]
  const deathPlayerIds = new Set<string>();
  for (const d of state.deaths) {
    if (deathPlayerIds.has(d.playerId)) {
      fail('I1', `Player ${d.playerId} died more than once in state.deaths`, ctx);
    }
    deathPlayerIds.add(d.playerId);
    const p = playerById.get(d.playerId);
    if (!p) {
      fail('I1', `Death record points to unknown player ${d.playerId}`, ctx);
    }
    if (p.isAlive) {
      fail('I1', `Player ${d.playerId} is in deaths[] yet still isAlive=true`, ctx);
    }
  }
  for (const p of state.players) {
    if (!p.isAlive && !deathPlayerIds.has(p.id)) {
      fail('I1', `Player ${p.id} is isAlive=false yet missing from deaths[]`, ctx);
    }
  }

  // I2: Trọng số lá phiếu & Trưởng làng
  for (const p of state.players) {
    if (p.voteWeight !== 0 && p.voteWeight !== 1 && p.voteWeight !== 2) {
      fail('I2', `Invalid voteWeight ${p.voteWeight} on ${p.id}`, ctx);
    }
    if (
      p.voteWeight === 0 &&
      p.roleId !== 'village_idiot' &&
      p.initialRoleId !== 'village_idiot'
    ) {
      fail('I2', `Non-village_idiot player ${p.id} (${p.roleId}) has voteWeight=0`, ctx);
    }
  }
  if (state.mayorId) {
    const mayor = playerById.get(state.mayorId);
    if (!mayor || !mayor.isAlive) {
      fail('I2', `mayorId=${state.mayorId} does not refer to an alive player`, ctx);
    }
    if (mayor.voteWeight !== 2 && mayor.roleId !== 'village_idiot') {
      fail('I2', `Alive mayor ${mayor.id} (${mayor.roleId}) has voteWeight=${mayor.voteWeight}`, ctx);
    }
  }

  // I4: Tính hợp lệ của pha chuyển tiếp đặc biệt
  if (state.phase === 'HUNTER_SHOT') {
    const hId = state.pendingHunterShotPlayerId;
    if (!hId) {
      fail('I4', 'Phase is HUNTER_SHOT but pendingHunterShotPlayerId is null/empty', ctx);
    }
    const hunter = playerById.get(hId);
    if (!hunter || hunter.isAlive) {
      fail('I4', `HUNTER_SHOT shooter ${hId} missing or still alive`, ctx);
    }
  }
  if (state.phase === 'MAYOR_SUCCESSION') {
    const mId = state.pendingMayorSuccessionPlayerId;
    if (!mId) {
      fail('I4', 'Phase is MAYOR_SUCCESSION but pendingMayorSuccessionPlayerId is null/empty', ctx);
    }
    const deadMayor = playerById.get(mId);
    if (!deadMayor || deadMayor.isAlive) {
      fail('I4', `MAYOR_SUCCESSION player ${mId} missing or still alive`, ctx);
    }
  }

  // I6: Vai trò biến đổi & trạng thái phụ
  for (const p of state.players) {
    if (p.elderHp !== undefined && p.elderHp !== 1 && p.elderHp !== 2) {
      fail('I6', `Invalid elderHp=${p.elderHp} on ${p.id}`, ctx);
    }
    if (p.roleId === 'drunk' && p.isAlive && state.roundNumber >= 4 && p.drunkRealRoleId) {
      fail('I6', `Drunk ${p.id} survived past Night 3 without awakening`, ctx);
    }
    if (!ROLES_BY_ID[p.roleId]?.implementedInEngine) {
      fail('I6', `Player ${p.id} holds unimplemented roleId=${p.roleId}`, ctx);
    }
  }

  const hasLivingPiedPiper = state.players.some((p) => p.isAlive && p.roleId === 'pied_piper');
  if (!hasLivingPiedPiper && state.players.some((p) => p.isEnchanted)) {
    fail('I6', 'Enchantment persisted after all Pied Pipers died', ctx);
  }
  const hasLivingCultLeader = state.players.some((p) => p.isAlive && p.roleId === 'cult_leader');
  if (!hasLivingCultLeader && state.players.some((p) => p.isCultMember)) {
    fail('I6', 'Cult membership persisted after all Cult Leaders died', ctx);
  }

  // Nếu Elder chỉ chết bởi WOLF_PACK hoặc EMERGENCY_ELIMINATE (không có cái chết oan khác), không mất phép Dân
  const hasUnjustElderDeath = state.deaths.some(
    (d) => d.roleId === 'elder' && d.cause !== 'WOLF_PACK' && d.cause !== 'EMERGENCY_ELIMINATE'
  );
  if (state.villagePowerStripped && !hasUnjustElderDeath) {
    fail('I6', 'villagePowerStripped is true without an unjust Elder death', ctx);
  }

  // LUNAR: Kiểm tra bất biến LunarEventState
  if (state.lunarState) {
    for (const [targetId, count] of Object.entries(state.lunarState.todayPenaltyVotes)) {
      if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
        fail('LUNAR', `Invalid todayPenaltyVotes[${targetId}]=${count}`, ctx);
      }
      if (!playerById.has(targetId)) {
        fail('LUNAR', `todayPenaltyVotes references unknown player ${targetId}`, ctx);
      }
    }
    for (const [targetId, count] of Object.entries(state.lunarState.penaltyVotesNextDay)) {
      if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
        fail('LUNAR', `Invalid penaltyVotesNextDay[${targetId}]=${count}`, ctx);
      }
      if (!playerById.has(targetId)) {
        fail('LUNAR', `penaltyVotesNextDay references unknown player ${targetId}`, ctx);
      }
    }
    for (const pid of state.lunarState.bloodMoonRevealedPlayerIds) {
      const death = state.deaths.find((d) => d.playerId === pid);
      if (!death) {
        fail('LUNAR', `bloodMoonRevealedPlayerIds contains ${pid} who is not in state.deaths`, ctx);
      }
      if (death.phase !== 'NIGHT') {
        fail('LUNAR', `bloodMoonRevealedPlayerIds contains ${pid} who died in phase ${death.phase}`, ctx);
      }
    }
  }

  // I7: MatchEvent monotonicity & an toàn format
  let prevSeq = 0;
  const seenEvtIds = new Set<string>();
  // Trọng số tối đa lịch sử trong phòng tại bất kỳ vòng nào (khi hasMayor bật, +1 cho 1 Trưởng làng; khi lunarEventsEnabled bật, Cơn Thịnh Nộ Của Hàng Xóm có thể x2 phiếu + phiếu phạt Last Echo)
  const maxHistoricalVoteWeight = state.settings.lunarEventsEnabled
    ? state.players.length * 4
    : state.players.length + (state.settings.hasMayor ? 1 : 0);
  const events = state.eventLog ?? [];
  const startFormatIdx =
    ctx.stepLabel === 'FINAL' ? 0 : Math.min(ctx.verifiedEventCount ?? 0, events.length);

  for (let i = 0; i < events.length; i++) {
    const evt = events[i];
    if (evt.seq <= prevSeq) {
      fail('I7', `eventLog seq not strictly increasing (${evt.seq} <= ${prevSeq})`, ctx);
    }
    prevSeq = evt.seq;
    if (seenEvtIds.has(evt.id)) {
      fail('I7', `Duplicate eventLog id: ${evt.id}`, ctx);
    }
    seenEvtIds.add(evt.id);

    if (evt.visibility === 'SYSTEM_DEBUG') {
      fail('I7', `Unexpected SYSTEM_DEBUG event in engine eventLog: ${evt.id}`, ctx);
    }
    if (evt.roundNumber < 1) {
      fail('I7', `Event ${evt.id} has invalid roundNumber=${evt.roundNumber}`, ctx);
    }

    if (i >= startFormatIdx) {
      const postText = formatMatchEventText(evt, { mode: 'POST_GAME' });
      if (
        !postText ||
        postText.includes('undefined') ||
        postText.includes('NaN') ||
        postText.includes('[object Object]') ||
        /\[p\d+\]/.test(postText)
      ) {
        fail('I7', `Unsafe/malformed POST_GAME text for ${evt.id} (${evt.actionType}): "${postText}"`, ctx);
      }

      if (evt.visibility === 'PUBLIC') {
        const pubText = formatMatchEventText(evt, {
          mode: 'PUBLIC',
          revealOnDeath: state.settings.revealOnDeath,
        });
        if (
          !pubText ||
          pubText.includes('undefined') ||
          pubText.includes('NaN') ||
          pubText.includes('[object Object]') ||
          /\[p\d+\]/.test(pubText)
        ) {
          fail('I7', `Unsafe/malformed PUBLIC text for ${evt.id} (${evt.actionType}): "${pubText}"`, ctx);
        }
      }
    }

    if (
      (evt.actionType === 'VOTE_TALLY' || evt.actionType === 'MAYOR_ELECTED' || evt.actionType === 'MAYOR_TIE') &&
      evt.metadata?.vote
    ) {
      const castSum = evt.metadata.vote.tallies.reduce((sum, item) => sum + item.votes, 0);
      const totalChecked = castSum + evt.metadata.vote.abstainVotes;
      if (totalChecked > maxHistoricalVoteWeight) {
        fail(
          'I2',
          `Vote tally + abstain (${totalChecked}) exceeds maximum possible player weight (${maxHistoricalVoteWeight}) on ${evt.id}`,
          ctx
        );
      }
    }
  }
  ctx.verifiedEventCount = events.length;

  // I8: Chống rò rỉ thông tin ở tầng PublicTimeline & morningAnnouncements
  const publicTimeline = buildPublicTimeline(state);
  const publicIds = new Set(publicTimeline.map((item) => item.id));
  for (let i = startFormatIdx; i < events.length; i++) {
    const evt = events[i];
    if (evt.visibility === 'SECRET_NIGHT' && publicIds.has(evt.id)) {
      fail('I8', `SECRET_NIGHT event ${evt.id} leaked into buildPublicTimeline`, ctx);
    }
    if (evt.actionType === 'LUNAR_MIRROR_REFLECTION') {
      const pubText = formatMatchEventText(evt, { mode: 'PUBLIC', revealOnDeath: false });
      if (evt.actor !== null || evt.targets.length > 0) {
        fail('I8', `LUNAR_MIRROR_REFLECTION must not carry actor/targets`, ctx);
      }
      for (const p of state.players) {
        if (pubText.includes(p.name)) {
          fail('I8', `LUNAR_MIRROR_REFLECTION leaked player name ${p.name}: "${pubText}"`, ctx);
        }
      }
    }
    if (!state.settings.revealOnDeath && publicIds.has(evt.id)) {
      const pubText = formatMatchEventText(evt, { mode: 'PUBLIC', revealOnDeath: false });
      if (evt.actionType === 'CASCADE_DEATH') {
        if (pubText.includes('bạn đồng hành') || pubText.includes('người yêu')) {
          fail('I8', `CASCADE_DEATH leaked hidden link when revealOnDeath=false: "${pubText}"`, ctx);
        }
      }
      const hasBloodMoonForceReveal =
        Boolean(evt.metadata?.lunar?.forceReveal) ||
        (evt.actionType === 'DAWN_SUMMARY' &&
          Boolean(evt.metadata?.dawnDeaths?.some((d) => d.forceReveal)));
      if (!hasBloodMoonForceReveal && pubText.includes('Nhân bản')) {
        fail('I8', `Public timeline leaked Nhân bản origin before GAME_OVER: "${pubText}"`, ctx);
      }
    }
  }

  const morningList = getMorningAnnouncements(publicTimeline, state.roundNumber);
  const hasDawn = morningList.some((m) => m.actionType === 'DAWN_SUMMARY');
  if (hasDawn && morningList[0]?.actionType !== 'DAWN_SUMMARY') {
    fail(
      'I8',
      `morningAnnouncements[0] was ${morningList[0]?.actionType} instead of DAWN_SUMMARY`,
      ctx
    );
  }
}

/**
 * Bất biến cuối ván I4 & I7: Ván phải kết thúc GAME_OVER hợp lệ và ghi nhận sự kiện WIN tương ứng.
 */
export function assertFinalMatchInvariants(
  finalState: GameState,
  ctx: InvariantContext
): void {
  if (finalState.phase !== 'GAME_OVER') {
    fail('I4', `Game failed to reach GAME_OVER (stuck in ${finalState.phase} at round ${finalState.roundNumber})`, ctx);
  }

  const winOutcome = checkWinCondition(finalState);
  if (!winOutcome || !winOutcome.winner) {
    fail('I4', `GAME_OVER reached without non-null checkWinCondition result`, ctx);
  }

  const winEvent = (finalState.eventLog ?? []).find((e) => e.actionType === 'WIN');
  if (!winEvent) {
    fail('I7', 'GAME_OVER reached without recording WIN event in eventLog', ctx);
  }
  if (winEvent.metadata?.win?.winner !== winOutcome.winner) {
    fail(
      'I7',
      `WIN event winner (${winEvent.metadata?.win?.winner}) mismatches checkWinCondition (${winOutcome.winner})`,
      ctx
    );
  }

  assertGameStateInvariants(finalState, ctx);
}
