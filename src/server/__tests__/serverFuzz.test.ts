import { describe, expect, it } from 'bun:test';
import { LocalEngineAdapter } from '../../adapters/localEngineAdapter';
import { SEANCE_QUESTIONS } from '../../engine/lunarEvents';
import type { SeanceQuestionId } from '../../engine/types';
import { generateNightTurnPlan } from '../../engine/turnPlan';
import { generateFuzzMatchConfig, generateFuzzNightActions, pickFuzzVoteTarget } from '../../engine/__tests__/fuzz/generator';
import {
  assertFinalMatchInvariants,
  assertGameStateInvariants,
  InvariantViolationError,
  type InvariantContext,
} from '../../engine/__tests__/fuzz/invariants';
import { SeededRng } from '../../engine/__tests__/fuzz/prng';
import {
  createHostBoardView,
  createPlayerPrivateView,
  createPostGameView,
  createPublicRoomView,
} from '../projections';
import { RoomService } from '../roomService';
import { SocketGateway } from '../socketGateway';
import { TimerManager } from '../timerManager';
import { createMockIoServer, type MockClientSocket } from './mockSocket';

const SEANCE_QUESTION_IDS = Object.keys(SEANCE_QUESTIONS) as SeanceQuestionId[];

describe('Server & Adapter - Seeded Fuzzing (Disconnect, Reconnect, Timeout & Secrecy)', () => {
  it('chạy 150 ván SocketGateway headless với disconnect/resume ngẫu nhiên, timeout & trục xuất giữa pha', async () => {
    const gamesCount = 150;

    for (let g = 0; g < gamesCount; g++) {
      const seed = 50_000 + g;
      const rng = new SeededRng(seed);
      const config = generateFuzzMatchConfig(rng);
      const mockIo = createMockIoServer();
      const roomService = new RoomService();
      const timerManager = new TimerManager({ minNightDelaySec: 5, maxNightDelaySec: 5 });
      const gateway = new SocketGateway(mockIo as any, roomService, timerManager);
      gateway.registerEvents();
      const sockets: MockClientSocket[] = [];

      const trace: string[] = [`ServerFuzz Init (${config.playerCount}p)`];
      const ctx: InvariantContext = { seed, stepLabel: 'INIT', trace };
      let activeRoomCode: string | null = null;
      let openBallotActiveForLastTally = false;

      try {
        const hostSocket = mockIo.createClientSocket();
        sockets.push(hostSocket);
        const createRes: any = await new Promise((resolve) => {
          hostSocket.emit('room:create', { isPlayer: false }, resolve);
        });
        const { roomCode, hostToken } = createRes.data;
        activeRoomCode = roomCode;

        const playersInfo: Array<{
          id: string;
          token: string;
          client: MockClientSocket;
          disconnected: boolean;
        }> = [];

        for (let i = 0; i < config.playerCount; i++) {
          const c = mockIo.createClientSocket();
          sockets.push(c);
          const joinRes: any = await new Promise((resolve) => {
            c.emit('room:join', { roomCode, username: `SP${i + 1}` }, resolve);
          });
          playersInfo.push({
            id: joinRes.data.playerId,
            token: joinRes.data.playerToken,
            client: c,
            disconnected: false,
          });
        }

        // Cập nhật cài đặt ngẫu nhiên trước khi start
        await new Promise((resolve) => {
          hostSocket.emit(
            'lobby:updateSettings',
            { roomCode, token: hostToken, settings: config.settings },
            resolve
          );
        });
        await new Promise((resolve) => {
          hostSocket.emit(
            'lobby:start',
            { roomCode, token: hostToken, customRoleIds: config.roleIds },
            resolve
          );
        });

        const room = roomService.getRoom(roomCode)!;
        let roundGuard = 0;
        const maxSteps = config.playerCount * 3 + 6;

        const checkProjectionInvariants = (stepLabel: string) => {
          ctx.stepLabel = stepLabel;
          const gs = room.gameState!;
          assertGameStateInvariants(gs, ctx);

          // Kiểm tra đồng bộ isAlive giữa RoomPlayer và GameState (Bất biến I9)
          for (const p of gs.players) {
            const rp = room.players.get(p.id);
            if (!rp || rp.isAlive !== p.isAlive) {
              throw new InvariantViolationError(
                'I9',
                `RoomPlayer.isAlive mismatch for ${p.id}: rp=${rp?.isAlive}, gs=${p.isAlive}`,
                ctx
              );
            }
          }

          const pub = createPublicRoomView(room);
          const hostView = createHostBoardView(room);
          const post = createPostGameView(room);

          if (gs.phase !== 'GAME_OVER' && post !== null) {
            throw new InvariantViolationError('I8', `PostGameView leaked before GAME_OVER in ${gs.phase}`, ctx);
          }

          if (!room.settings.revealOnDeath) {
            const bloodMoonRevealedIds = gs.lunarState?.bloodMoonRevealedPlayerIds ?? [];
            for (const d of pub.deaths) {
              const isPublicCause =
                d.cause === 'VILLAGE_VOTE' ||
                d.cause === 'HUNTER_SHOT' ||
                d.cause === 'EMERGENCY_ELIMINATE';
              const isBloodMoonRevealed = bloodMoonRevealedIds.includes(d.playerId);
              if (
                (!isBloodMoonRevealed && d.roleId !== 'unknown') ||
                d.cascadeDepth !== undefined ||
                (!isPublicCause && d.cause !== 'UNKNOWN')
              ) {
                throw new InvariantViolationError(
                  'I8',
                  `PublicRoomView.deaths leaked roleId=${d.roleId}, cause=${d.cause}, or cascadeDepth=${d.cascadeDepth} when revealOnDeath=false`,
                  ctx
                );
              }
            }
            for (const hd of hostView.publicRoom.deaths) {
              const isBloodMoonRevealed = bloodMoonRevealedIds.includes(hd.playerId);
              if (!isBloodMoonRevealed && hd.roleId !== 'unknown') {
                throw new InvariantViolationError('I8', `HostView deaths leaked roleId=${hd.roleId}`, ctx);
              }
            }
          }

          if (
            !room.settings.revealVoterIdentities &&
            !gs.lunarState?.openBallotActiveToday &&
            !openBallotActiveForLastTally &&
            pub.lastVoteTally?.voterDetails !== undefined
          ) {
            throw new InvariantViolationError(
              'I8',
              'PublicRoomView.lastVoteTally leaked voterDetails when revealVoterIdentities=false',
              ctx
            );
          }

          // Kiểm tra HostView không rò bảng private roles
          if (hostView.publicRoom.phase !== pub.phase) {
            throw new InvariantViolationError('I9', 'HostView phase mismatch', ctx);
          }

          // Kiểm tra privateView không rò teammate cho Dân làng
          for (const pl of gs.players) {
            const priv = createPlayerPrivateView(room, pl.id);
            if (!priv) continue;
            if (pl.roleId === 'villager' && priv.teammates.length > 0) {
              throw new InvariantViolationError(
                'I9',
                `Villager ${pl.id} received non-empty teammates`,
                ctx
              );
            }
          }
        };

        while (room.gameState && room.gameState.phase !== 'GAME_OVER' && roundGuard < maxSteps) {
          roundGuard += 1;
          const gs = room.gameState;
          const forceProgress = roundGuard > config.playerCount + 1;

          // Ngẫu nhiên disconnect và room:resume một vài người chơi
          for (const pInfo of playersInfo) {
            if (!pInfo.disconnected && rng.chance(0.1)) {
              pInfo.client.disconnect();
              pInfo.disconnected = true;
            } else if (pInfo.disconnected && rng.chance(0.6)) {
              const newClient = mockIo.createClientSocket();
              sockets.push(newClient);
              const resumeRes: any = await new Promise((resolve) => {
                newClient.emit('room:resume', { roomCode, token: pInfo.token }, resolve);
              });
              if (resumeRes?.ok) {
                pInfo.client = newClient;
                pInfo.disconnected = false;
              }
            }
          }

          if (gs.phase === 'NIGHT') {
            room.nightTurnPlan = generateNightTurnPlan(gs);
            // Thử gửi night:action qua socket + kiểm tra idempotency ALREADY_ACTED khi lượt đầu phù hợp
            const firstTurn = room.nightTurnPlan[room.currentNightTurnIndex];
            if (
              firstTurn &&
              firstTurn.canAct &&
              (firstTurn.turnKey === 'seer' ||
                firstTurn.turnKey === 'bodyguard' ||
                firstTurn.turnKey === 'aura_seer')
            ) {
              const actorId = firstTurn.activePlayerIds[0];
              const actorInfo = playersInfo.find((p) => p.id === actorId && !p.disconnected);
              const targetId = gs.players.find((p) => p.isAlive && p.id !== actorId)?.id;
              if (actorInfo && targetId) {
                const firstAck: any = await new Promise((resolve) => {
                  actorInfo.client.emit(
                    'night:action',
                    {
                      roomCode,
                      token: actorInfo.token,
                      roleId: firstTurn.turnKey,
                      action: { targetId },
                    },
                    resolve
                  );
                });
                if (firstAck?.ok) {
                  const dupAck: any = await new Promise((resolve) => {
                    actorInfo.client.emit(
                      'night:action',
                      {
                        roomCode,
                        token: actorInfo.token,
                        roleId: firstTurn.turnKey,
                        action: { targetId },
                      },
                      resolve
                    );
                  });
                  expect(dupAck?.ok).toBe(false);
                }
              }
            }
            const actions = generateFuzzNightActions(gs, room.nightTurnPlan, rng, forceProgress);
            room.nightActionsAccumulator = actions;
            // Cho timeout / kết thúc lượt đêm qua private helper
            (gateway as any).resolveNightAndTransition(room);
            checkProjectionInvariants(`R${gs.roundNumber}:PostNight`);
          } else if (gs.phase === 'HUNTER_SHOT') {
            const shooterId = gs.pendingHunterShotPlayerId!;
            const pInfo = playersInfo.find((p) => p.id === shooterId);
            const aliveTargets = gs.players.filter((p) => p.isAlive).map((p) => p.id);
            if (
              pInfo &&
              pInfo.token &&
              !pInfo.disconnected &&
              aliveTargets.length > 0 &&
              (forceProgress || rng.chance(0.8))
            ) {
              const target = rng.pick(aliveTargets);
              await new Promise((resolve) => {
                pInfo.client.emit(
                  'hunter:shot',
                  { roomCode, token: pInfo.token, targetPlayerId: target },
                  resolve
                );
              });
            } else {
              // Giả lập hết giờ nổ súng (timeout) và đợi CommandQueue rút sạch tất định
              (gateway as any).handleHunterTimeout(room, room.gameGeneration);
              await roomService.getCommandQueue(roomCode).enqueue(async () => {});
            }
            checkProjectionInvariants(`R${gs.roundNumber}:PostHunter`);
          } else if (gs.phase === 'MAYOR_SUCCESSION') {
            const oldMayorId = gs.pendingMayorSuccessionPlayerId!;
            const pInfo = playersInfo.find((p) => p.id === oldMayorId);
            const aliveTargets = gs.players.filter((p) => p.isAlive).map((p) => p.id);
            if (pInfo && pInfo.token && !pInfo.disconnected && aliveTargets.length > 0 && rng.chance(0.8)) {
              const target = rng.pick(aliveTargets);
              await new Promise((resolve) => {
                pInfo.client.emit(
                  'mayor:transfer',
                  { roomCode, token: pInfo.token, successorPlayerId: target },
                  resolve
                );
              });
            } else {
              (gateway as any).handleMayorSuccessionTimeout(room, room.gameGeneration);
              await roomService.getCommandQueue(roomCode).enqueue(async () => {});
            }
            checkProjectionInvariants(`R${gs.roundNumber}:PostMayorSucc`);
          } else if (gs.phase === 'LUNAR_SEANCE') {
            const seance = gs.lunarState?.seanceState;
            if (seance?.stage === 'PICK_QUESTION') {
              const pInfo = playersInfo.find((p) => p.id === seance.mediumPlayerId);
              if (pInfo && pInfo.token && !pInfo.disconnected && (forceProgress || rng.chance(0.85))) {
                const questionId = rng.pick(SEANCE_QUESTION_IDS);
                await new Promise((resolve) => {
                  pInfo.client.emit(
                    'seance:pickQuestion',
                    { roomCode, token: pInfo.token, questionId },
                    resolve
                  );
                });
              } else {
                (gateway as any).handleSeanceTimeout(room, room.gameGeneration);
                await roomService.getCommandQueue(roomCode).enqueue(async () => {});
              }
            } else if (seance?.stage === 'WAIT_ANSWER') {
              const pInfo = playersInfo.find((p) => p.id === seance.targetDeadPlayerId);
              if (pInfo && pInfo.token && !pInfo.disconnected && (forceProgress || rng.chance(0.85))) {
                const answer: 'YES' | 'NO' = rng.chance(0.5) ? 'YES' : 'NO';
                await new Promise((resolve) => {
                  pInfo.client.emit(
                    'seance:answer',
                    { roomCode, token: pInfo.token, answer },
                    resolve
                  );
                });
              } else {
                (gateway as any).handleSeanceTimeout(room, room.gameGeneration);
                await roomService.getCommandQueue(roomCode).enqueue(async () => {});
              }
            } else {
              (gateway as any).handleSeanceTimeout(room, room.gameGeneration);
              await roomService.getCommandQueue(roomCode).enqueue(async () => {});
            }
            checkProjectionInvariants(`R${gs.roundNumber}:PostLunarSeance`);
          } else if (gs.phase === 'LAST_ECHO_MARK') {
            const executorId = gs.lunarState?.lastEchoState?.activeExecutorId;
            const pInfo = executorId ? playersInfo.find((p) => p.id === executorId) : undefined;
            const aliveTargets = gs.players.filter((p) => p.isAlive).map((p) => p.id);
            if (pInfo && pInfo.token && !pInfo.disconnected && (forceProgress || rng.chance(0.85))) {
              const target =
                aliveTargets.length > 0 && (forceProgress || rng.chance(0.8))
                  ? rng.pick(aliveTargets)
                  : null;
              await new Promise((resolve) => {
                pInfo.client.emit(
                  'lunar:submitLastEcho',
                  { roomCode, token: pInfo.token, targetPlayerId: target },
                  resolve
                );
              });
            } else {
              (gateway as any).handleLastEchoTimeout(room, room.gameGeneration);
              await roomService.getCommandQueue(roomCode).enqueue(async () => {});
            }
            checkProjectionInvariants(`R${gs.roundNumber}:PostLastEcho`);
          } else if (gs.phase === 'DAY_MAYOR_ELECTION') {
            openBallotActiveForLastTally = Boolean(gs.lunarState?.openBallotActiveToday);
            const aliveIds = gs.players.filter((p) => p.isAlive).map((p) => p.id);
            for (const pInfo of playersInfo) {
              const ps = gs.players.find((p) => p.id === pInfo.id);
              if (!ps?.isAlive || pInfo.disconnected || rng.chance(0.2)) continue;
              await new Promise((resolve) => {
                pInfo.client.emit(
                  'mayor:elect',
                  { roomCode, token: pInfo.token, candidateId: rng.pick(aliveIds) },
                  resolve
                );
              });
            }
            gateway.executeFinalizeMayorElection(room);
            checkProjectionInvariants(`R${gs.roundNumber}:PostMayorElect`);
          } else if (gs.phase === 'DAY_DISCUSS' || gs.phase === 'DAY_VOTE') {
            // Mở khóa vote sớm nếu đang bị khóa
            if (gs.dayState?.voteLocked) {
              await new Promise((resolve) => {
                hostSocket.emit('host:unlockVote', { roomCode, token: hostToken }, resolve);
              });
            }

            if (!forceProgress && rng.chance(0.04)) {
              const alive = gs.players.filter((p) => p.isAlive);
              if (alive.length > 3) {
                const elimTarget = rng.pick(alive);
                const info = playersInfo.find((p) => p.id === elimTarget.id);
                await new Promise((resolve) => {
                  hostSocket.emit(
                    'host:emergencyEliminate',
                    { roomCode, token: hostToken, targetPlayerId: elimTarget.id },
                    resolve
                  );
                });
                if (info) info.token = ''; // Thu hồi token đã bị xóa
                checkProjectionInvariants(`R${gs.roundNumber}:PostDayEmergency`);
                continue;
              }
            }

            const aliveIds = gs.players.filter((p) => p.isAlive).map((p) => p.id);
            const focusedTarget = forceProgress ? pickFuzzVoteTarget(gs, aliveIds, rng, true) : null;
            openBallotActiveForLastTally = Boolean(gs.lunarState?.openBallotActiveToday);
            for (const pInfo of playersInfo) {
              const ps = gs.players.find((p) => p.id === pInfo.id);
              if (!ps?.isAlive || ps.voteWeight <= 0 || pInfo.disconnected) continue;
              const target = forceProgress
                ? focusedTarget
                : pickFuzzVoteTarget(gs, aliveIds, rng, false);
              await new Promise((resolve) => {
                pInfo.client.emit(
                  'day:vote',
                  { roomCode, token: pInfo.token, targetPlayerId: target },
                  resolve
                );
              });
            }
            gateway.executeFinalizeDayVote(room);
            checkProjectionInvariants(`R${gs.roundNumber}:PostDayTally`);
          } else if (gs.phase === 'DAY_RUNOFF') {
            openBallotActiveForLastTally = Boolean(gs.lunarState?.openBallotActiveToday);
            const cands = gs.dayState?.runoffCandidates ?? [];
            const forcedRunoff = forceProgress && cands.length > 0 ? cands[0] : null;
            for (const pInfo of playersInfo) {
              const ps = gs.players.find((p) => p.id === pInfo.id);
              if (!ps?.isAlive || ps.voteWeight <= 0 || pInfo.disconnected) continue;
              const pick = forceProgress ? forcedRunoff : rng.chance(0.2) ? null : rng.pick(cands);
              await new Promise((resolve) => {
                pInfo.client.emit(
                  'day:vote',
                  { roomCode, token: pInfo.token, targetPlayerId: pick },
                  resolve
                );
              });
            }
            gateway.executeFinalizeRunoffVote(room);
            checkProjectionInvariants(`R${gs.roundNumber}:PostRunoffTally`);
          }
        }

        expect(room.gameState).not.toBeNull();
        assertFinalMatchInvariants(room.gameState!, ctx);

        // Kiểm tra rematch đưa về LOBBY sạch sẽ
        const rematchRes: any = await new Promise((resolve) => {
          hostSocket.emit('host:rematch', { roomCode, token: hostToken }, resolve);
        });
        expect(rematchRes.ok).toBe(true);
        expect(room.gameGeneration).toBe(2);
        expect(room.gameState).toBeNull();
        expect(createPublicRoomView(room).publicTimeline).toEqual([]);
        expect(createPostGameView(room)).toBeNull();
      } finally {
        const roomToClean = activeRoomCode ? roomService.getRoom(activeRoomCode) : undefined;
        if (roomToClean) {
          timerManager.clearRoomTimer(roomToClean);
        }
        for (const s of sockets) s.disconnect();
        roomService.destroy();
        mockIo.close();
      }
    }
  }, 20_000);

  it('chạy 150 ván LocalEngineAdapter headless với F5 resumeSession & submitPublicHandVotes/finalizePublicVote', async () => {
    const store = new Map<string, string>();
    const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };

    try {
      for (let g = 0; g < 150; g++) {
        const seed = 70_000 + g;
        const rng = new SeededRng(seed);
        const config = generateFuzzMatchConfig(rng);
        let adapter = new LocalEngineAdapter();
        const stopAdapterTimers = (targetAdapter: LocalEngineAdapter) => {
          const internal = targetAdapter as unknown as {
            clearDayTimer?: () => void;
            clearNightIntroTimer?: () => void;
            clearSeanceTimer?: () => void;
            clearLastEchoTimer?: () => void;
          };
          internal.clearDayTimer?.();
          internal.clearNightIntroTimer?.();
          internal.clearSeanceTimer?.();
          internal.clearLastEchoTimer?.();
        };

        try {
          for (const p of config.players) {
            adapter.addOfflinePlayer(p.name);
          }
          await adapter.updateSettings(config.settings);
          await adapter.startGame(config.roleIds);
          await adapter.startFirstNight();

          const trace: string[] = [`LocalFuzz Init (${config.playerCount}p)`];
          const ctx: InvariantContext = { seed, stepLabel: 'INIT', trace };
          let steps = 0;
          const maxSteps = config.playerCount * 3 + 6;

          while (adapter.getState().publicView?.phase !== 'GAME_OVER' && steps < maxSteps) {
            steps += 1;
            const room = (adapter as unknown as { roomState: any }).roomState;
            const gs = room.gameState!;
            const forceProgress = steps > config.playerCount + 1;

            // Ngẫu nhiên giả lập F5 reload bằng cách tạo adapter mới và resumeSession (dọn timer bản cũ trước)
            if (rng.chance(0.12)) {
              stopAdapterTimers(adapter);
              const reloaded = new LocalEngineAdapter();
              const ok = await reloaded.resumeSession();
              expect(ok).toBe(true);
              adapter = reloaded;
            }

            const pub = adapter.getState().publicView!;
            if (pub.phase === 'NIGHT') {
              const rNow = (adapter as unknown as { roomState: any }).roomState;
              const actions = generateFuzzNightActions(
                rNow.gameState,
                rNow.nightTurnPlan,
                rng,
                forceProgress
              );
              rNow.nightActionsAccumulator = actions;
              (adapter as any).resolveLocalNight();
            } else if (pub.phase === 'HUNTER_SHOT') {
              const aliveIds = pub.players.filter((p) => p.isAlive).map((p) => p.id);
              const target = !forceProgress && rng.chance(0.18) ? null : rng.pick(aliveIds);
              await adapter.sendHunterShot(target);
            } else if (pub.phase === 'MAYOR_SUCCESSION') {
              const aliveIds = pub.players.filter((p) => p.isAlive).map((p) => p.id);
              const target = !forceProgress && rng.chance(0.18) ? null : rng.pick(aliveIds);
              await adapter.sendMayorTransfer(target);
            } else if (pub.phase === 'LUNAR_SEANCE') {
              const rNow = (adapter as unknown as { roomState: any }).roomState;
              const seance = rNow.gameState?.lunarState?.seanceState;
              if (seance?.stage === 'PICK_QUESTION') {
                await adapter.sendSeancePickQuestion(rng.pick(SEANCE_QUESTION_IDS));
              } else if (seance?.stage === 'WAIT_ANSWER') {
                await adapter.sendSeanceAnswer(rng.chance(0.5) ? 'YES' : 'NO');
              } else {
                (adapter as any).handleSeanceTimeout?.();
              }
            } else if (pub.phase === 'LAST_ECHO_MARK') {
              const aliveIds = pub.players.filter((p) => p.isAlive).map((p) => p.id);
              const target =
                aliveIds.length > 0 && (forceProgress || rng.chance(0.8))
                  ? rng.pick(aliveIds)
                  : null;
              await adapter.sendLastEchoTarget(target);
            } else if (pub.phase === 'DAY_MAYOR_ELECTION' || pub.phase === 'DAY_DISCUSS' || pub.phase === 'DAY_RUNOFF') {
              if (pub.dayVerdict?.isPendingNextNight) {
                await adapter.proceedToNextNight();
              } else {
                const rNow = (adapter as unknown as { roomState: any }).roomState;
                const gsNow = rNow.gameState;
                const tallies: Record<string, number> = {};
                if (pub.phase === 'DAY_RUNOFF') {
                  const cands = pub.runoffCandidates ?? [];
                  const target = cands.length > 0 ? (forceProgress ? cands[0] : rng.pick(cands)) : null;
                  if (target) {
                    tallies[target] = gsNow.players.filter((p: any) => p.isAlive && p.voteWeight > 0).length;
                  }
                } else {
                  const aliveIds = pub.players.filter((p) => p.isAlive).map((p) => p.id);
                  const focused = forceProgress
                    ? pickFuzzVoteTarget(gsNow, aliveIds, rng, true)
                    : rng.chance(0.25)
                      ? null
                      : rng.pick(aliveIds);
                  if (focused) {
                    tallies[focused] = gsNow.players.filter((p: any) => p.isAlive && p.voteWeight > 0).length;
                  }
                }
                await adapter.submitPublicHandVotes(tallies);
              }
            }

            const afterRoom = (adapter as unknown as { roomState: any }).roomState;
            if (afterRoom.gameState) {
              assertGameStateInvariants(afterRoom.gameState, ctx);
            }
          }

          const finalRoom = (adapter as unknown as { roomState: any }).roomState;
          assertFinalMatchInvariants(finalRoom.gameState, ctx);
          expect(adapter.getState().postGameView).not.toBeNull();
          await adapter.hostRematch();
          expect(adapter.getState().postGameView).toBeNull();
          expect(adapter.getState().publicView?.phase).toBe('LOBBY');
        } finally {
          stopAdapterTimers(adapter);
        }
      }
    } finally {
      if (prevLocalStorage === undefined) {
        delete (globalThis as Record<string, unknown>).localStorage;
      } else {
        (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
      }
    }
  }, 20_000);
});
