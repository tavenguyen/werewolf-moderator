import { describe, expect, it } from 'bun:test';
import { getAllImplementedRoleIds, runFuzzBatch, runSingleFuzzGame } from './fuzz/fuzzRunner';

describe('Engine - Fuzzing & Property-Based Testing (10.000 Headless Games)', () => {
  it('hồi quy trực tiếp các seed từng phát hiện bug hoặc edge-case (410, 3950)', () => {
    for (const seed of [410, 3950]) {
      const summary = runSingleFuzzGame(seed, { checkImmutability: true });
      expect(summary.winner).not.toBeNull();
    }
  });

  it('chạy 10.000 ván đấu ngẫu nhiên phủ đủ 39 vai trò, 19 công tắc luật và mọi bất biến toàn vẹn', () => {
    const singleSeed = process.env.FUZZ_SEED ? Number(process.env.FUZZ_SEED) : null;
    if (singleSeed !== null && Number.isFinite(singleSeed)) {
      const summary = runSingleFuzzGame(singleSeed, { checkImmutability: true });
      expect(summary.winner).not.toBeNull();
      return;
    }

    const totalGames = process.env.FUZZ_GAMES ? Number(process.env.FUZZ_GAMES) : 10_000;
    const stats = runFuzzBatch(totalGames, 1);

    expect(stats.gamesPlayed).toBe(totalGames);

    if (totalGames >= 500) {
      // Bảo đảm cả 39 vai trò đều thực sự xuất hiện qua tập fuzzing
      const allRoleIds = getAllImplementedRoleIds();
      expect(allRoleIds.length).toBe(39);
      for (const roleId of allRoleIds) {
        expect(stats.rolesAppeared.has(roleId)).toBe(true);
      }

      // Bảo đảm đủ các công tắc boolean & enum trọng yếu đều được thử cả 2 trạng thái
      const booleanSwitches = [
        'revealOnDeath',
        'allowWolfSkip',
        'allowWolfFriendlyFire',
        'witchKnowsVictim',
        'witchWasteHealOnEmpty',
        'allowWitchSelfHeal',
        'allowWitchBothPotionsSameNight',
        'witchDoubleProtectKills',
        'hasMayor',
        'allowBodyguardSelfProtect',
        'firstNightNoKill',
        'allowCupidSelfMatch',
        'revealVoterIdentities',
        'hunterShootsOnPoison',
        'allowHunterSkipShot',
      ];
      for (const key of booleanSwitches) {
        expect(stats.settingsTrueSeen.has(key)).toBe(true);
        expect(stats.settingsFalseSeen.has(key)).toBe(true);
      }
      expect(stats.settingsTrueSeen.has('witchHealMode:AOE')).toBe(true);
      expect(stats.settingsFalseSeen.has('witchHealMode:SINGLE')).toBe(true);
      expect(stats.settingsTrueSeen.has('tieVoteMode:RUNOFF')).toBe(true);
      expect(stats.settingsFalseSeen.has('tieVoteMode:ESCAPE')).toBe(true);
      expect(stats.settingsTrueSeen.has('seerRevealMode:EXACT_ROLE')).toBe(true);
      expect(stats.settingsFalseSeen.has('seerRevealMode:FACTION')).toBe(true);
      expect(stats.settingsTrueSeen.has('lynchThreshold:MAJORITY')).toBe(true);
      expect(stats.settingsFalseSeen.has('lynchThreshold:PLURALITY')).toBe(true);
    }
  }, 360_000);
});
