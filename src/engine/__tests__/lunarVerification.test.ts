import { describe, expect, it, spyOn } from 'bun:test';
import { LocalEngineAdapter } from '../../adapters/localEngineAdapter';
import { audioController } from '../../audio/audioController';
import { RoomService } from '../../server/roomService';
import { SocketGateway } from '../../server/socketGateway';
import { TimerManager } from '../../server/timerManager';
import { createMockIoServer } from '../../server/__tests__/mockSocket';
import {
  applyLastEchoChoice,
  applySeanceAnswer,
  applySeancePickQuestion,
  createInitialDayState,
  createInitialGameState,
  createInitialLunarState,
  drawLunarEventIfNeeded,
  resetDayLunarFlagsOnNightStart,
  resolveNight,
} from '../index';
import { formatMatchEventText } from '../matchLogFormatter';
import type { MatchEvent } from '../types';
import { runTargetedToxicGame } from './fuzz/deadlockChecker';
import { runSingleFuzzGame } from './fuzz/fuzzRunner';
import { LUNAR_TOXIC_DEPENDENCY_CLUSTERS } from './fuzz/targetedGenerator';
import { createTestGame } from './testHelpers';

function installMockLocalStorage() {
  const store = new Map<string, string>();
  const prev = (globalThis as Record<string, unknown>).localStorage;
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  };
  return () => {
    (globalThis as Record<string, unknown>).localStorage = prev;
  };
}

describe('Lunar Events - Wave 2C Verification Suite', () => {
  it('Zero-Impact Regression Gate: 500 seeded random matches with lunarEventsEnabled=false emit 0 lunar events and terminate cleanly', () => {
    for (let i = 0; i < 500; i++) {
      const seed = 50_001 + i;
      const summary = runSingleFuzzGame(seed, {
        forceSettings: { lunarEventsEnabled: false },
      });
      expect(summary.winner).not.toBeNull();
      expect(summary.lunarEventCount).toBe(0);
    }
  }, 60_000);

  it('Lunar Toxic Clusters: 60 seeded combinatorial matches across Blood Moon, Last Echo, and Misty Moon clusters terminate without deadlock', () => {
    for (let i = 0; i < 60; i++) {
      const seed = 300_000 + i;
      const summary = runTargetedToxicGame(seed, {
        useLunarClusters: true,
        clusterIndex: i % LUNAR_TOXIC_DEPENDENCY_CLUSTERS.length,
        passiveDayMode: i % 3 === 0,
      });
      expect(summary.winner).not.toBeNull();
    }
  }, 60_000);

  it('Boundary Hygiene: Day/Night boundaries and rematch() reset all transient Lunar flags', async () => {
    const game = createTestGame(
      ['werewolf', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'],
      { lunarEventsEnabled: true, lunarEventCadence: 'EVERY_DAY' }
    );
    game.lunarState = {
      ...createInitialLunarState(),
      flashTrialActiveToday: true,
      openBallotActiveToday: true,
      bloodOathPendingToday: true,
      neighborsFuryPlayerIds: ['p3', 'p4'],
      todayPenaltyVotes: { p5: 1 },
      wolfDoubleKillTonight: true,
      bloodMoonRevealTonight: true,
      silverShieldActiveTonight: true,
      mistyMoonActiveTonight: true,
      mirrorMoonActiveTonight: true,
    };

    resetDayLunarFlagsOnNightStart(game);
    expect(game.lunarState.flashTrialActiveToday).toBe(false);
    expect(game.lunarState.openBallotActiveToday).toBe(false);
    expect(game.lunarState.bloodOathPendingToday).toBe(false);
    expect(game.lunarState.neighborsFuryPlayerIds).toEqual([]);
    expect(game.lunarState.todayPenaltyVotes).toEqual({});

    const { nextState: afterNight } = resolveNight(game, {
      wolfPack: { targets: ['p6'] },
    });
    expect(afterNight.lunarState?.wolfDoubleKillTonight).toBe(false);
    expect(afterNight.lunarState?.bloodMoonRevealTonight).toBe(false);
    expect(afterNight.lunarState?.silverShieldActiveTonight).toBe(false);
    expect(afterNight.lunarState?.mistyMoonActiveTonight).toBe(false);
    expect(afterNight.lunarState?.mirrorMoonActiveTonight).toBe(false);

    // LocalEngineAdapter rematch resets lunarState
    const restoreLS = installMockLocalStorage();
    const adapter = new LocalEngineAdapter();
    try {
      for (let idx = 0; idx < 6; idx++) {
        adapter.addOfflinePlayer(`P${idx + 1}`);
      }
      await adapter.updateSettings({ lunarEventsEnabled: true, lunarEventCadence: 'EVERY_DAY' });
      await adapter.startGame(['werewolf', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager']);
      await adapter.hostRematch();
      const view = adapter.getState().publicView;
      expect(view?.lunarView?.currentDayEvent ?? null).toBeNull();
    } finally {
      await adapter.leaveRoom();
      restoreLS();
    }
  });

  it('MatchLog Formatting: formats all 5 LUNAR_* events cleanly, reveals only Blood Moon victims in PUBLIC mode, and never leaks Mirror Moon names', () => {
    const p1 = { playerId: 'p1', name: 'An', seatIndex: 0, roleId: 'seer', faction: 'VILLAGER' as const };
    const p2 = { playerId: 'p2', name: 'Bình', seatIndex: 1, roleId: 'werewolf', faction: 'WEREWOLF' as const };
    const p3 = { playerId: 'p3', name: 'Chi', seatIndex: 2, roleId: 'witch', faction: 'VILLAGER' as const };

    const drawnEvt: MatchEvent = {
      id: 'evt_1',
      seq: 1,
      roundNumber: 2,
      stage: 'DAY_ANNOUNCEMENT',
      actionType: 'LUNAR_EVENT_DRAWN',
      visibility: 'PUBLIC',
      actor: null,
      targets: [],
      outcome: 'SUCCESS',
      metadata: {
        lunar: {
          eventId: 'blood_moon',
          category: 'CRESCENT',
          titleVi: 'Trăng Máu',
          detailLineVi: 'Đêm nay bầy Sói được cắn 2 nạn nhân.',
        },
      },
    };
    expect(formatMatchEventText(drawnEvt, { mode: 'PUBLIC', revealOnDeath: false })).toBe(
      'Sự kiện Tuần Trăng (Trăng Lưỡi Liềm): Trăng Máu — Đêm nay bầy Sói được cắn 2 nạn nhân.'
    );

    const seanceYes: MatchEvent = {
      id: 'evt_2',
      seq: 2,
      roundNumber: 2,
      stage: 'DAY_ANNOUNCEMENT',
      actionType: 'LUNAR_SEANCE_RESULT',
      visibility: 'PUBLIC',
      actor: p1,
      targets: [p3],
      outcome: 'SUCCESS',
      metadata: {
        lunar: {
          eventId: 'seance',
          category: 'SPIRITISM',
          questionText: 'Bạn có tin bầy Sói không?',
          answer: 'YES',
        },
      },
    };
    expect(formatMatchEventText(seanceYes, { mode: 'PUBLIC', revealOnDeath: false })).toBe(
      'Chiêu Hồn: "Bạn có tin bầy Sói không?" -> Có'
    );

    const seanceSilent: MatchEvent = {
      ...seanceYes,
      id: 'evt_3',
      seq: 3,
      outcome: 'NO_EFFECT',
      metadata: {
        lunar: {
          eventId: 'seance',
          category: 'SPIRITISM',
          questionText: 'Bạn có tin bầy Sói không?',
          answer: null,
        },
      },
    };
    expect(formatMatchEventText(seanceSilent, { mode: 'PUBLIC', revealOnDeath: false })).toBe(
      'Chiêu Hồn: "Bạn có tin bầy Sói không?" -> Giữ im lặng'
    );

    const lastEchoEvt: MatchEvent = {
      id: 'evt_4',
      seq: 4,
      roundNumber: 2,
      stage: 'DAY_VOTE',
      actionType: 'LUNAR_LAST_ECHO',
      visibility: 'PUBLIC',
      actor: p1,
      targets: [p2],
      outcome: 'SUCCESS',
    };
    expect(formatMatchEventText(lastEchoEvt, { mode: 'PUBLIC', revealOnDeath: false })).toBe(
      'Dấu Ấn Di Ngôn: An đánh dấu +1 phiếu bất lợi cho Bình'
    );

    const mirrorEvt: MatchEvent = {
      id: 'evt_5',
      seq: 5,
      roundNumber: 2,
      stage: 'DAY_ANNOUNCEMENT',
      actionType: 'LUNAR_MIRROR_REFLECTION',
      visibility: 'PUBLIC',
      actor: p1,
      targets: [p2],
      outcome: 'SUCCESS',
    };
    const mirrorText = formatMatchEventText(mirrorEvt, { mode: 'PUBLIC', revealOnDeath: false });
    expect(mirrorText).toBe('Ánh trăng đêm qua đã phản chiếu một cặp mắt đỏ.');
    expect(mirrorText).not.toContain('An');
    expect(mirrorText).not.toContain('Bình');

    const oathEvt: MatchEvent = {
      id: 'evt_6',
      seq: 6,
      roundNumber: 2,
      stage: 'DAY_VOTE',
      actionType: 'LUNAR_BLOOD_OATH_TRIGGERED',
      visibility: 'PUBLIC',
      actor: null,
      targets: [],
      outcome: 'SUCCESS',
    };
    expect(formatMatchEventText(oathEvt, { mode: 'PUBLIC', revealOnDeath: false })).toBe(
      'Lời Thề Máu ứng nghiệm: Đêm nay bầy Sói được cắn 2 nạn nhân.'
    );

    // Blood Moon forceReveal on DAWN_SUMMARY vs normal earlier DAWN_SUMMARY when revealOnDeath=false
    const earlierDawn: MatchEvent = {
      id: 'evt_7',
      seq: 7,
      roundNumber: 1,
      stage: 'DAY_ANNOUNCEMENT',
      actionType: 'DAWN_SUMMARY',
      visibility: 'PUBLIC',
      actor: null,
      targets: [p1],
      outcome: 'SUCCESS',
      metadata: {
        dawnDeaths: [{ victim: p1, cause: 'WOLF_PACK' }],
      },
    };
    const bloodMoonDawn: MatchEvent = {
      id: 'evt_8',
      seq: 8,
      roundNumber: 2,
      stage: 'DAY_ANNOUNCEMENT',
      actionType: 'DAWN_SUMMARY',
      visibility: 'PUBLIC',
      actor: null,
      targets: [p3],
      outcome: 'SUCCESS',
      metadata: {
        dawnDeaths: [{ victim: p3, cause: 'WOLF_PACK', forceReveal: true }],
      },
    };
    expect(formatMatchEventText(earlierDawn, { mode: 'PUBLIC', revealOnDeath: false })).toBe(
      'Bình minh Ngày 1: An đã ngã xuống.'
    );
    expect(formatMatchEventText(bloodMoonDawn, { mode: 'PUBLIC', revealOnDeath: false })).toBe(
      'Bình minh Ngày 2: Chi (Phù thủy) đã ngã xuống.'
    );
  });

  it('Differential Parity & Chaos: RoomService vs LocalEngineAdapter Flash Trial / Misty Moon / Seance race & Audio Queue order', async () => {
    // 1. Differential parity on Flash Trial (90s / 15s) & Misty Moon preview
    const restoreLS = installMockLocalStorage();
    const adapter = new LocalEngineAdapter();
    const mockIo = createMockIoServer();
    const roomService = new RoomService();
    const timerManager = new TimerManager({ minNightDelaySec: 5, maxNightDelaySec: 5 });
    const gateway = new SocketGateway(mockIo as any, roomService, timerManager);
    gateway.registerEvents();
    const host = mockIo.createClientSocket();
    const clients = [host];
    let activeRoomCode: string | null = null;

    try {
      const roles = ['werewolf', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'];
      for (let i = 0; i < 6; i++) {
        adapter.addOfflinePlayer(`P${i + 1}`);
      }
      await adapter.updateSettings({
        lunarEventsEnabled: true,
        lunarEventCadence: 'EVERY_DAY',
        dayDiscussionSeconds: 180,
        dayVoteLockSeconds: 60,
      });
      await adapter.startGame(roles);
      const adapterInternal = (adapter as unknown as {
        roomState: {
          gameState: ReturnType<typeof createInitialGameState>;
          timers: { deadlineAt?: number; phase: string };
        };
      }).roomState;
      adapterInternal.gameState.phase = 'DAY_DISCUSS';
      adapterInternal.gameState.roundNumber = 2;
      adapterInternal.gameState.dayState = createInitialDayState();
      adapterInternal.gameState.lunarState = {
        ...createInitialLunarState(),
        flashTrialActiveToday: true,
        mistyMoonActiveTonight: true,
      };
      (adapter as unknown as { startLocalDayTimer: (isResume?: boolean, customDurationSec?: number, skipNarration?: boolean) => void }).startLocalDayTimer(false, undefined, true);
      expect(adapterInternal.gameState.dayState.voteLockRemainingSeconds).toBe(15);
      const remainingMs = (adapterInternal.timers.deadlineAt ?? 0) - Date.now();
      expect(remainingMs).toBeGreaterThan(85_000);
      expect(remainingMs).toBeLessThanOrEqual(90_500);

      // Chaos: endGameToSummary & hostRematch clear orphan timers without throwing
      await adapter.endGameToSummary();
      await adapter.hostRematch();
      expect(adapter.getState().publicView?.phase).toBe('LOBBY');

      // RoomService Flash Trial & rematch parity
      const created: any = await new Promise((r) => host.emit('room:create', { isPlayer: false }, r));
      expect(created.ok).toBe(true);
      activeRoomCode = created.data.roomCode;
      const hostToken = created.data.hostToken;
      for (let i = 0; i < 6; i++) {
        const c = mockIo.createClientSocket();
        clients.push(c);
        await new Promise((r) => c.emit('room:join', { roomCode: activeRoomCode, username: `P${i + 1}` }, r));
      }
      await new Promise((r) =>
        host.emit('lobby:start', { roomCode: activeRoomCode, token: hostToken, customRoleIds: roles }, r)
      );
      const serverRoom = roomService.getRoom(activeRoomCode!)!;
      serverRoom.gameState!.phase = 'GAME_OVER';
      roomService.rematch(activeRoomCode!, hostToken);
      expect(roomService.getRoom(activeRoomCode!)?.gameState).toBeNull();
      expect(roomService.getRoom(activeRoomCode!)?.timers.phase).toBe('LOBBY');
    } finally {
      const roomToClean = activeRoomCode ? roomService.getRoom(activeRoomCode) : undefined;
      if (roomToClean) timerManager.clearRoomTimer(roomToClean);
      for (const c of clients) c.disconnect();
      roomService.destroy();
      mockIo.close();
      await adapter.leaveRoom();
      restoreLS();
    }

    // 2. Duplicate Seance answer / invalid phase guard
    const seanceGame = createTestGame(['werewolf', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'], {
      lunarEventsEnabled: true,
      lunarEventCadence: 'EVERY_DAY',
    });
    seanceGame.roundNumber = 2;
    seanceGame.players[5].isAlive = false;
    seanceGame.deaths.push({
      playerId: 'p6',
      roleId: 'villager',
      roundNumber: 1,
      phase: 'NIGHT',
      cause: 'WOLF_PACK',
      cascadeDepth: 0,
    });
    seanceGame.lunarState!.usedEventIds = [
      'dawns_guarantee',
      'midnight_echo',
      'neighbors_fury',
      'flash_trial',
      'open_ballot',
      'blood_oath',
      'blood_moon',
      'silver_shield',
      'misty_moon',
      'mirror_moon',
      'last_echo',
    ];
    const drawn = drawLunarEventIfNeeded(seanceGame, 42, 'MULTI_DEVICE');
    expect(drawn.phase).toBe('LUNAR_SEANCE');
    const mediumId = drawn.lunarState!.seanceState!.mediumPlayerId;
    const picked = applySeancePickQuestion(drawn, mediumId, 'Q2_WOLVES_CAUSE');
    const answeredOnce = applySeanceAnswer(picked, 'p6', 'YES');
    expect(answeredOnce.phase).toBe('DAY_DISCUSS');
    // Duplicate answer after phase moved to DAY_DISCUSS must be a no-op
    const answeredTwice = applySeanceAnswer(answeredOnce, 'p6', 'NO');
    expect(answeredTwice.lunarState?.seanceState?.answer).toBe('YES');
    expect(answeredTwice.eventLog.filter((e) => e.actionType === 'LUNAR_SEANCE_RESULT').length).toBe(1);

    // 3. Audio queue order: night_end -> moon_chime -> day_lunar_event -> day_discuss
    const callOrder: string[] = [];
    const chimeSpy = spyOn(audioController, 'playLunarChime').mockImplementation(async () => {
      callOrder.push('moon_chime');
    });
    const narrationSpy = spyOn(audioController, 'playTurnNarration').mockImplementation((key, onComplete) => {
      callOrder.push(key);
      onComplete?.();
    });
    try {
      audioController.playTurnNarration('night_end', () => {
        audioController.playLunarAnnouncement('Trăng Máu', 'Trăng Lưỡi Liềm', () => {
          callOrder.push('day_lunar_event');
          audioController.playTurnNarration('day_discuss');
        });
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(callOrder).toEqual(['night_end', 'moon_chime', 'day_lunar_event', 'day_discuss']);
    } finally {
      chimeSpy.mockRestore();
      narrationSpy.mockRestore();
    }
  });
});
