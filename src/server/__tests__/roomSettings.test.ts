import { describe, expect, it } from 'bun:test';
import { RoomService } from '../roomService';
import type { GameState, RoomSettings } from '../../engine/types';
import { createInitialGameState } from '../../engine/gameEngine';
import { resolveNight } from '../../engine/nightResolution';
import { processDeathCascade } from '../../engine/deathCascade';
import { tallyDayVotes } from '../../engine/voting';

describe('Realtime Backend - Room Settings Customization', () => {
  it('cập nhật partial settings cho tất cả các tùy chọn luật thành công', () => {
    const service = new RoomService();
    const created = service.createRoom(false);

    // Initial check: default values
    const room = service.getRoom(created.roomCode);
    expect(room).toBeDefined();
    expect(room?.settings.revealOnDeath).toBe(false);
    expect(room?.settings.allowWolfSkip).toBe(false);
    expect(room?.settings.allowWolfFriendlyFire).toBe(false);
    expect(room?.settings.allowWitchSelfHeal).toBe(true);
    expect(room?.settings.witchKnowsVictim).toBe(true);
    expect(room?.settings.witchHealMode).toBe('AOE');
    expect(room?.settings.witchWasteHealOnEmpty).toBe(false);
    expect(room?.settings.hasMayor).toBe(false);
    expect(room?.settings.tieVoteMode).toBe('ESCAPE');

    // Update settings: customize variant rules
    const patch: Partial<RoomSettings> = {
      allowWolfSkip: true,
      allowWolfFriendlyFire: true,
      allowBodyguardSelfProtect: false,
      allowWitchBothPotionsSameNight: false,
      witchDoubleProtectKills: true,
      firstNightNoKill: true,
      seerRevealMode: 'EXACT_ROLE',
      allowCupidSelfMatch: false,
      dayDiscussionSeconds: 120,
      dayVoteLockSeconds: 30,
      revealVoterIdentities: true,
      lynchThreshold: 'MAJORITY',
      hunterShootsOnPoison: false,
      allowHunterSkipShot: false,
    };

    const updated = service.updateSettings(created.roomCode, created.hostToken, patch);

    expect(updated.allowWolfSkip).toBe(true);
    expect(updated.allowWolfFriendlyFire).toBe(true);
    expect(updated.allowBodyguardSelfProtect).toBe(false);
    expect(updated.allowWitchBothPotionsSameNight).toBe(false);
    expect(updated.witchDoubleProtectKills).toBe(true);
    expect(updated.firstNightNoKill).toBe(true);
    expect(updated.seerRevealMode).toBe('EXACT_ROLE');
    expect(updated.allowCupidSelfMatch).toBe(false);
    expect(updated.dayDiscussionSeconds).toBe(120);
    expect(updated.dayVoteLockSeconds).toBe(30);
    expect(updated.revealVoterIdentities).toBe(true);
    expect(updated.lynchThreshold).toBe('MAJORITY');
    expect(updated.hunterShootsOnPoison).toBe(false);
    expect(updated.allowHunterSkipShot).toBe(false);
  });

  it('từ chối khi token không phải là Host', () => {
    const service = new RoomService();
    const created = service.createRoom(false);

    expect(() => {
      service.updateSettings(created.roomCode, 'invalid_token_xyz', {
        hasMayor: true,
      });
    }).toThrow('Chỉ Host mới có quyền thay đổi cài đặt.');
  });

  it('từ chối thay đổi settings khi ván chơi đã bắt đầu', () => {
    const service = new RoomService();
    const created = service.createRoom(false);

    // Thêm đủ 6 người chơi
    for (let i = 1; i <= 6; i++) {
      service.joinRoom(created.roomCode, `Player_${i}`);
    }

    const deck = ['werewolf', 'werewolf', 'seer', 'bodyguard', 'villager', 'villager'];
    service.startGame(created.roomCode, created.hostToken, deck);

    expect(() => {
      service.updateSettings(created.roomCode, created.hostToken, {
        allowWolfSkip: true,
      });
    }).toThrow('Không thể thay đổi cài đặt khi ván chơi đã bắt đầu.');
  });

  it('bảo toàn trọn vẹn room settings tùy chỉnh khi tái đấu (Rematch)', () => {
    const service = new RoomService();
    const created = service.createRoom(false);

    // Host tùy chỉnh các luật biến thể
    service.updateSettings(created.roomCode, created.hostToken, {
      firstNightNoKill: true,
      seerRevealMode: 'EXACT_ROLE',
      lynchThreshold: 'MAJORITY',
    });

    for (let i = 1; i <= 6; i++) {
      service.joinRoom(created.roomCode, `Player_${i}`);
    }

    const deck = ['werewolf', 'werewolf', 'seer', 'bodyguard', 'villager', 'villager'];
    service.startGame(created.roomCode, created.hostToken, deck);

    const room = service.getRoom(created.roomCode);
    expect(room).toBeDefined();
    if (!room || !room.gameState) throw new Error('Game state should exist');

    // Giả lập kết thúc ván
    room.gameState.phase = 'GAME_OVER';

    // Host bấm Rematch
    service.rematch(created.roomCode, created.hostToken);

    // Kiểm tra settings vẫn được giữ nguyên
    expect(room.settings.firstNightNoKill).toBe(true);
    expect(room.settings.seerRevealMode).toBe('EXACT_ROLE');
    expect(room.settings.lynchThreshold).toBe('MAJORITY');
  });

  describe('Tác động của các luật biến thể lên Game Engine', () => {
    function makeState(roles: string[], settings: Partial<RoomSettings> = {}): GameState {
      const players = roles.map((r, i) => ({
        id: `p${i + 1}`,
        name: `Player_${i + 1}`,
        seatIndex: i + 1,
      }));
      return createInitialGameState(players, roles, settings);
    }

    it('firstNightNoKill: Đêm 1 Sói cắn không có ai chết', () => {
      const state = makeState(
        ['werewolf', 'werewolf', 'seer', 'bodyguard', 'villager', 'villager'],
        { firstNightNoKill: true }
      );
      state.roundNumber = 1;

      const { output } = resolveNight(state, {
        wolfPack: { targets: ['p5'] },
      });

      expect(output.newDeaths.length).toBe(0);
    });

    it('allowBodyguardSelfProtect = false: Bảo vệ tự chọn mình bị vô hiệu khiên', () => {
      // p4 là bodyguard, Sói cắn p4, p4 tự bảo vệ chính mình
      const state = makeState(
        ['werewolf', 'werewolf', 'seer', 'bodyguard', 'villager', 'villager'],
        { allowBodyguardSelfProtect: false }
      );
      state.roundNumber = 2;

      const { output } = resolveNight(state, {
        bodyguard: { targetId: 'p4' },
        wolfPack: { targets: ['p4'] },
      });

      // Khiên vô hiệu -> p4 bị Sói cắn chết
      expect(output.newDeaths.some((d) => d.playerId === 'p4')).toBe(true);
    });

    it('witchDoubleProtectKills = true: Vừa được Bảo vệ vừa được Phù thủy cứu -> Quá liều tử vong', () => {
      // p5 là villager. Sói cắn p5, Bảo vệ che p5, Phù thủy dùng bình cứu p5
      const state = makeState(
        ['werewolf', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'],
        { witchDoubleProtectKills: true, witchHealMode: 'SINGLE' }
      );
      state.roundNumber = 2;

      const { output } = resolveNight(state, {
        wolfPack: { targets: ['p6'] },
        bodyguard: { targetId: 'p6' },
        witch: { heal: true, healTargetId: 'p6' },
      });

      // Biến thể thuốc quá liều: p6 chết vì cả 2 cùng cứu
      expect(output.newDeaths.some((d) => d.playerId === 'p6')).toBe(true);
    });

    it('allowWitchBothPotionsSameNight = false: Phù thủy dùng cả 2 bình thì bình độc bị chặn', () => {
      const state = makeState(
        ['werewolf', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'],
        { allowWitchBothPotionsSameNight: false }
      );
      state.roundNumber = 2;

      const { nextState, output } = resolveNight(state, {
        wolfPack: { targets: ['p6'] },
        witch: { heal: true, poisonTargetId: 'p1' },
      });

      // Bình cứu được dùng, bình độc bị khóa
      expect(nextState.witchHealUsed).toBe(true);
      expect(nextState.witchPoisonUsed).toBe(false);
      expect(output.newDeaths.some((d) => d.playerId === 'p1')).toBe(false);
    });

    it('seerRevealMode = EXACT_ROLE: Tiên tri soi thấy vai trò cụ thể', () => {
      const state = makeState(
        ['werewolf', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager'],
        { seerRevealMode: 'EXACT_ROLE' }
      );

      const { output } = resolveNight(state, {
        seer: { targetId: 'p4' }, // Bodyguard
      });

      expect(output.infoResults.seerResult?.result).toBe('bodyguard');
    });

    it('allowCupidSelfMatch = false: Cupid tự ghép mình thì mũi tên vô hiệu', () => {
      // p5 là cupid, tự ghép p5 với p6
      const state = makeState(
        ['werewolf', 'werewolf', 'seer', 'bodyguard', 'cupid', 'villager'],
        { allowCupidSelfMatch: false }
      );
      state.roundNumber = 1;

      const { nextState } = resolveNight(state, {
        cupid: { target1: 'p5', target2: 'p6' },
      });

      const p5 = nextState.players.find((p) => p.id === 'p5');
      expect(p5?.loverId).toBeUndefined();
    });

    it('hunterShootsOnPoison = false: Thợ săn chết vì độc Phù thủy không nổ súng', () => {
      // p5 là hunter
      const state = makeState(
        ['werewolf', 'werewolf', 'seer', 'bodyguard', 'hunter', 'villager'],
        { hunterShootsOnPoison: false }
      );

      processDeathCascade(state, [{ playerId: 'p5', cause: 'WITCH_POISON' }]);

      // Thợ săn không được mở lượt bắn
      expect(state.pendingHunterShotPlayerId).toBeNull();
    });

    it('lynchThreshold = MAJORITY: Đạt nhiều phiếu nhất nhưng chưa quá bán thì thoát án treo', () => {
      const state = makeState([
        'werewolf',
        'werewolf',
        'seer',
        'bodyguard',
        'villager',
        'villager',
      ], { lynchThreshold: 'MAJORITY' });

      // 6 người sống. p1 nhận 2 phiếu, 4 người bỏ phiếu trắng.
      // 2 <= 6 / 2 (3) -> Chưa quá bán!
      state.dayState = {
        ballots: {
          p2: 'p1',
          p3: 'p1',
          p4: null,
          p5: null,
          p6: null,
        },
        hasVoted: { p2: true, p3: true, p4: true, p5: true, p6: true },
        voteLocked: false,
        voteLockRemainingSeconds: 0,
      };

      const { outcome } = tallyDayVotes(state);
      expect(outcome.type).toBe('ESCAPE');
      expect(outcome.reason).toContain('chưa đạt quá bán');
    });
  });
});
