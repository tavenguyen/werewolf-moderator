import { ROLES_BY_ID } from '../screens/home/roles';
import type { DeathInput } from './deathCascade';
import { processDeathCascade } from './deathCascade';
import { getAliveNeighbors } from './seating';
import type {
  DeathRecord,
  GameState,
  NightActions,
  NightInfoResults,
  PlayerId,
} from './types';

export interface NightResolutionOutput {
  newDeaths: DeathRecord[];
  infoResults: NightInfoResults;
}

/**
 * Phân giải ban đêm (Night Resolution Engine):
 * Thực thi tuần tự các hành động đêm độc lập với UI/Socket,
 * bảo đảm tính tất định và xử lý trọn vẹn mọi Edge Case.
 */
export function resolveNight(state: GameState, actions: NightActions): NightResolutionOutput {
  const infoResults: NightInfoResults = {};
  const pendingDeaths: DeathInput[] = [];

  // =========================================================================
  // 1. TỈNH RƯỢU Ở ĐẦU ĐÊM 3 (Kẻ say rượu - Drunk)
  // =========================================================================
  if (state.roundNumber === 3) {
    for (const player of state.players) {
      if (player.roleId === 'drunk' && player.drunkRealRoleId) {
        player.roleId = player.drunkRealRoleId;
        const realDef = ROLES_BY_ID[player.drunkRealRoleId];
        if (realDef) {
          player.faction = realDef.faction;
        }
        state.historyLogs.push(
          `Đầu Đêm 3: Kẻ say rượu (${player.name}) đã tỉnh rượu và mở khóa vai trò thật [${player.roleId}]!`
        );
      }
    }
  }

  // =========================================================================
  // 2. KHIÊN BẢO VỆ (Bodyguard Shield)
  // =========================================================================
  let protectedPlayerId: PlayerId | null = null;
  if (actions.bodyguard?.targetId && !state.villagePowerStripped) {
    const target = actions.bodyguard.targetId;
    // Kiểm tra quy tắc không bảo vệ 1 người 2 đêm liên tiếp
    if (target !== state.lastProtectedPlayerId) {
      protectedPlayerId = target;
      state.lastProtectedPlayerId = target;
    } else {
      state.historyLogs.push('Bảo vệ chọn trùng mục tiêu đêm trước -> Khiên vô hiệu!');
      state.lastProtectedPlayerId = null;
    }
  } else {
    state.lastProtectedPlayerId = null;
  }

  // =========================================================================
  // 3. ĐÒN CẮN CỦA BẦY MA SÓI (Wolf Pack Attacks)
  // =========================================================================
  let wolfVictims: PlayerId[] = [];
  if (actions.wolfPack && !actions.wolfPack.isSkip) {
    const rawTargets = actions.wolfPack.targets ?? [];
    // Lọc bỏ mục tiêu được Bảo vệ che chắn
    for (const tId of rawTargets) {
      if (tId === protectedPlayerId) {
        state.historyLogs.push(`Bảo vệ đã đỡ trúng vết cắn của Sói nhắm vào [${tId}]!`);
      } else {
        wolfVictims.push(tId);
      }
    }
  }

  // =========================================================================
  // 4. SÓI NGUYỀN (Accursed Wolf-Father)
  // =========================================================================
  if (actions.accursedWolf?.curseTargetId && !state.accursedWolfUsed) {
    const curseId = actions.accursedWolf.curseTargetId;
    state.accursedWolfUsed = true;

    if (wolfVictims.includes(curseId)) {
      // Biến đổi nạn nhân thành Sói thay vì giết chết
      wolfVictims = wolfVictims.filter((id) => id !== curseId);
      const victim = state.players.find((p) => p.id === curseId);
      if (victim) {
        victim.faction = 'WEREWOLF';
        victim.roleId = 'werewolf'; // Mất sạch chức năng cũ, thành Sói thường
        state.historyLogs.push(
          `Sói nguyền đã nguyền rủa (${victim.name}). Nạn nhân không chết mà hóa Ma sói!`
        );
      }
    } else {
      state.historyLogs.push('Sói nguyền đã nguyền trượt hoặc mục tiêu đã được bảo vệ che chở!');
    }
  }

  // =========================================================================
  // 5. SÓI ĐẠI CA CẮN MẠNG THỨ HAI (Big Bad Wolf)
  // =========================================================================
  let bigBadWolfVictim: PlayerId | null = null;
  const anyWolfDied = state.deaths.some((d) => {
    const def = ROLES_BY_ID[d.roleId];
    return def?.faction === 'WEREWOLF';
  });

  if (!anyWolfDied && actions.bigBadWolf?.targetId) {
    const bbwTarget = actions.bigBadWolf.targetId;
    if (bbwTarget === protectedPlayerId) {
      state.historyLogs.push(`Bảo vệ đã đỡ trúng đòn cắn của Sói đại ca nhắm vào [${bbwTarget}]!`);
    } else {
      bigBadWolfVictim = bbwTarget;
    }
  }

  // =========================================================================
  // 6. SÓI TRẮNG ÁM SÁT RIÊNG (White Wolf)
  // =========================================================================
  let whiteWolfVictim: PlayerId | null = null;
  if (state.roundNumber % 2 === 0 && actions.whiteWolf?.targetId) {
    whiteWolfVictim = actions.whiteWolf.targetId;
  }

  // =========================================================================
  // 7. PHÙ THỦY CỨU & NÉM ĐỘC (Witch Potion)
  // =========================================================================
  let poisonVictim: PlayerId | null = null;
  if (!state.villagePowerStripped && actions.witch) {
    // 7a. Dùng bình Cứu
    if (actions.witch.heal && !state.witchHealUsed) {
      state.witchHealUsed = true;
      if (state.settings.witchHealMode === 'AOE') {
        // Cứu toàn bộ nạn nhân của bầy Sói và Sói đại ca
        wolfVictims = [];
        bigBadWolfVictim = null;
        state.historyLogs.push('Phù thủy dùng bình Cứu AoE giải cứu tất cả nạn nhân bị Sói cắn!');
      } else {
        // Cứu 1 nạn nhân đầu tiên
        if (wolfVictims.length > 0) {
          const saved = wolfVictims.shift();
          state.historyLogs.push(`Phù thủy dùng bình Cứu giải cứu nạn nhân [${saved}]!`);
        } else if (bigBadWolfVictim) {
          bigBadWolfVictim = null;
          state.historyLogs.push('Phù thủy giải cứu nạn nhân của Sói đại ca!');
        }
      }
    }

    // 7b. Dùng bình Độc
    if (actions.witch.poisonTargetId && !state.witchPoisonUsed) {
      state.witchPoisonUsed = true;
      poisonVictim = actions.witch.poisonTargetId;
      state.historyLogs.push(`Phù thủy ném bình Độc vào mục tiêu [${poisonVictim}]!`);
    }
  }

  // =========================================================================
  // 8. CÁC VAI THU THẬP THÔNG TIN (Seer, Aura Seer, P.I., Fox, Sorcerer)
  // =========================================================================
  // Tiên tri (Seer / Apprentice Seer)
  if (actions.seer?.targetId && !state.villagePowerStripped) {
    const target = state.players.find((p) => p.id === actions.seer!.targetId);
    if (target) {
      const def = ROLES_BY_ID[target.roleId];
      infoResults.seerResult = {
        targetId: target.id,
        result: def?.seerResult ?? 'VILLAGER',
      };
    }
  }

  // Tiên tri hào quang (Aura Seer)
  if (actions.auraSeer?.targetId && !state.villagePowerStripped) {
    const target = state.players.find((p) => p.id === actions.auraSeer!.targetId);
    if (target) {
      const isNormal = target.roleId === 'villager' || target.roleId === 'werewolf';
      infoResults.auraResult = {
        targetId: target.id,
        result: isNormal ? 'NORMAL' : 'SPECIAL',
      };
    }
  }

  // Thám tử (P.I.)
  if (actions.pi?.targetId && !state.piUsed && !state.villagePowerStripped) {
    state.piUsed = true;
    const neighbors = getAliveNeighbors(state.players, actions.pi.targetId);
    if (neighbors) {
      const hasWerewolf = neighbors.group.some((p) => p.faction === 'WEREWOLF');
      infoResults.piResult = {
        targetId: actions.pi.targetId,
        hasWerewolf,
        inspectedPlayerIds: neighbors.group.map((p) => p.id),
      };
    }
  }

  // Con cáo (Fox)
  if (actions.fox?.targetId && !state.foxLostPower && !state.villagePowerStripped) {
    const neighbors = getAliveNeighbors(state.players, actions.fox.targetId);
    if (neighbors) {
      const hasWerewolf = neighbors.group.some((p) => p.faction === 'WEREWOLF');
      infoResults.foxResult = {
        targetId: actions.fox.targetId,
        hasWerewolf,
        inspectedPlayerIds: neighbors.group.map((p) => p.id),
      };
      if (!hasWerewolf) {
        state.foxLostPower = true;
        state.historyLogs.push('Con cáo đã soi trúng nhóm 3 Dân -> Mất phép vĩnh viễn!');
      }
    }
  }

  // Pháp sư sói (Sorcerer)
  if (actions.sorcerer?.targetId) {
    const target = state.players.find((p) => p.id === actions.sorcerer!.targetId);
    infoResults.sorcererResult = {
      targetId: actions.sorcerer.targetId,
      isSeer: target?.roleId === 'seer',
    };
  }

  // =========================================================================
  // 9. CÁC VAI THAO TÚNG (Spellcaster, Troublemaker, Pied Piper, Cult Leader)
  // =========================================================================
  // Reset trạng thái câm của ngày trước
  state.players.forEach((p) => {
    p.isMuted = false;
  });

  if (actions.spellcaster?.targetId) {
    const muted = state.players.find((p) => p.id === actions.spellcaster!.targetId);
    if (muted) {
      muted.isMuted = true;
      state.historyLogs.push(`Người phù phép đã yểm bùa câm lặng lên (${muted.name})!`);
    }
  }

  if (actions.troublemaker?.activate && !state.troublemakerUsed) {
    state.troublemakerUsed = true;
    state.doubleVoteDay = true;
    state.historyLogs.push('Kẻ phá rối kích hoạt: Ngày mai sẽ có 2 lượt biểu quyết treo cổ liên tiếp!');
  }

  if (actions.piedPiper?.targetIds) {
    for (const id of actions.piedPiper.targetIds) {
      const p = state.players.find((pl) => pl.id === id);
      if (p) p.isEnchanted = true;
    }
  }

  if (actions.cultLeader?.targetId) {
    const p = state.players.find((pl) => pl.id === actions.cultLeader!.targetId);
    if (p) p.isCultMember = true;
  }

  // =========================================================================
  // 10. CHỐT SÁT THƯƠNG & CHUYỂN HÓA CUỐI ĐÊM (Night Resolution)
  // =========================================================================
  const combinedWolfBites = [...wolfVictims];
  if (bigBadWolfVictim) {
    combinedWolfBites.push(bigBadWolfVictim);
  }

  // 10a. Xử lý vết cắn của Ma sói
  for (const victimId of combinedWolfBites) {
    const victim = state.players.find((p) => p.id === victimId);
    if (!victim || !victim.isAlive) continue;

    // Kẻ bị nguyền (Cursed) biến thành Sói khi bị cắn thật
    if (victim.roleId === 'cursed') {
      victim.faction = 'WEREWOLF';
      victim.roleId = 'werewolf';
      state.historyLogs.push(`Kẻ bị nguyền (${victim.name}) đã bị cắn và thức tỉnh thành Ma sói!`);
      continue;
    }

    // Người cứng cỏi (Tough Guy) hoãn cái chết sang cuối đêm hôm sau
    if (victim.roleId === 'tough_guy') {
      if (!victim.toughGuyBittenNight) {
        victim.toughGuyBittenNight = state.roundNumber;
        state.historyLogs.push(`Người cứng cỏi (${victim.name}) bị Sói cắn nhưng gắng gượng sống sót qua ngày!`);
        continue;
      }
    }

    // Già làng (Elder) có 2 giáp trước đòn cắn của Sói
    if (victim.roleId === 'elder') {
      if ((victim.elderHp ?? 2) > 1) {
        victim.elderHp = 1;
        state.historyLogs.push(`Già làng (${victim.name}) bị Sói cắn mất 1 giáp (còn 1 giáp)!`);
        continue;
      }
    }

    // Nạn nhân thông thường
    pendingDeaths.push({ playerId: victim.id, cause: 'WOLF_PACK' });
  }

  // 10b. Xử lý đòn ám sát của Sói trắng (White Wolf)
  if (whiteWolfVictim) {
    pendingDeaths.push({ playerId: whiteWolfVictim, cause: 'WHITE_WOLF' });
  }

  // 10c. Xử lý thuốc độc của Phù thủy (Witch Poison)
  if (poisonVictim) {
    pendingDeaths.push({ playerId: poisonVictim, cause: 'WITCH_POISON' });
  }

  // 10d. Xử lý phát tác uốn ván của Kỵ sĩ gỉ sắt (Rusty Knight Tetanus)
  for (const player of state.players) {
    if (player.isAlive && player.infectedWithTetanus) {
      player.infectedWithTetanus = false;
      pendingDeaths.push({ playerId: player.id, cause: 'TETANUS' });
      state.historyLogs.push(`Ma sói (${player.name}) đã chết vì vết thương uốn ván từ Kỵ sĩ gỉ sắt!`);
    }
  }

  // 10e. Xử lý kiệt sức của Người cứng cỏi (Tough Guy Collapse)
  for (const player of state.players) {
    if (
      player.isAlive &&
      player.roleId === 'tough_guy' &&
      player.toughGuyBittenNight &&
      state.roundNumber > player.toughGuyBittenNight
    ) {
      pendingDeaths.push({ playerId: player.id, cause: 'TOUGH_GUY_COLLAPSE' });
      state.historyLogs.push(`Người cứng cỏi (${player.name}) đã kiệt sức và trút hơi thở cuối cùng!`);
    }
  }

  // =========================================================================
  // 11. XỬ LÝ CHUỖI TỬ VONG LIÊN HOÀN (Process Death Cascade)
  // =========================================================================
  const newDeaths = processDeathCascade(state, pendingDeaths);

  return {
    newDeaths,
    infoResults,
  };
}
