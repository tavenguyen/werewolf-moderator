import { ROLES_BY_ID, type Faction } from './roles';
import type {
  DeathCause,
  EventParticipantSnapshot,
  MatchEvent,
  PlayerId,
} from './types';

export type MatchTextSegment =
  | { type: 'text'; value: string }
  | {
      type: 'player';
      playerId: PlayerId;
      name: string;
      roleId?: string;
      faction?: Faction;
      showRole: boolean;
    }
  | {
      type: 'emphasis';
      value: string;
      tone?: 'wolf' | 'village' | 'third' | 'danger' | 'safe' | 'warn' | 'muted';
    };

export interface FormatMatchEventOptions {
  mode: 'PUBLIC' | 'POST_GAME';
  revealOnDeath?: boolean;
}

export interface OutcomeBadgeInfo {
  label: string;
  tone: 'success' | 'blocked' | 'saved' | 'danger' | 'neutral' | 'transform';
}

/**
 * Lấy tên vai trò tiếng Việt chuẩn hóa từ catalog.
 */
export function getRoleNameVi(roleId: string): string {
  return ROLES_BY_ID[roleId]?.nameVi ?? roleId;
}

/**
 * Lấy nhãn kết quả điều tra chuẩn hóa.
 */
export function getFactionTone(faction?: Faction): 'wolf' | 'village' | 'third' {
  if (faction === 'WEREWOLF') return 'wolf';
  if (faction === 'THIRD_PARTY') return 'third';
  return 'village';
}

function getCauseLabelVi(cause: DeathCause): string {
  switch (cause) {
    case 'WOLF_PACK':
      return 'Sói cắn';
    case 'WHITE_WOLF':
      return 'Sói trắng ám sát';
    case 'WITCH_POISON':
      return 'trúng độc Phù thủy';
    case 'HUNTER_SHOT':
      return 'bị Thợ săn bắn';
    case 'VILLAGE_VOTE':
      return 'treo cổ';
    case 'EMERGENCY_ELIMINATE':
      return 'trục xuất khẩn cấp';
    case 'COUPLE_HEARTBREAK':
      return 'chết theo người yêu';
    case 'COMPANION_DEATH':
      return 'chết theo bạn đồng hành';
    case 'TETANUS':
      return 'nhiễm uốn ván từ Kỵ sĩ gỉ sắt';
    case 'TOUGH_GUY_COLLAPSE':
      return 'kiệt sức do vết cắn đêm trước';
  }
}

function shouldRevealParticipantRole(
  event: MatchEvent,
  participant: EventParticipantSnapshot,
  options: FormatMatchEventOptions
): { showRole: boolean; roleIdOverride?: string } {
  if (options.mode === 'POST_GAME') {
    return { showRole: true };
  }

  // 3 ngoại lệ bắt buộc lộ diện công khai ngay cả khi tắt revealOnDeath
  if (
    event.actionType === 'VOTE_SURVIVED_REVEAL' &&
    event.actor?.playerId === participant.playerId &&
    (participant.roleId === 'prince' || participant.roleId === 'village_idiot')
  ) {
    return { showRole: true };
  }

  if (
    event.actionType === 'HUNTER_SHOT' &&
    event.actor?.playerId === participant.playerId &&
    participant.roleId === 'hunter'
  ) {
    return { showRole: true, roleIdOverride: 'hunter' };
  }

  // Nạn nhân đã chết trong sự kiện công khai: chỉ lộ vai khi bật revealOnDeath
  const isDeathOrExecution =
    event.actionType === 'DAWN_SUMMARY' ||
    event.actionType === 'VOTE_EXECUTION' ||
    event.actionType === 'CASCADE_DEATH' ||
    event.actionType === 'EMERGENCY_ELIMINATE' ||
    (event.actionType === 'HUNTER_SHOT' &&
      event.targets.some((t) => t.playerId === participant.playerId));

  if (isDeathOrExecution && options.revealOnDeath) {
    return { showRole: true };
  }

  return { showRole: false };
}

function playerSeg(
  event: MatchEvent,
  p: EventParticipantSnapshot,
  options: FormatMatchEventOptions,
  forceShowRole?: boolean
): MatchTextSegment {
  const rule = shouldRevealParticipantRole(event, p, options);
  const showRole = forceShowRole !== undefined ? forceShowRole : rule.showRole;
  return {
    type: 'player',
    playerId: p.playerId,
    name: p.name,
    roleId: rule.roleIdOverride ?? p.roleId,
    faction: p.faction,
    showRole,
  };
}

function txt(value: string): MatchTextSegment {
  return { type: 'text', value };
}

function emp(
  value: string,
  tone?: 'wolf' | 'village' | 'third' | 'danger' | 'safe' | 'warn' | 'muted'
): MatchTextSegment {
  return { type: 'emphasis', value, tone };
}

function joinSegmentsList(
  items: MatchTextSegment[][],
  separator = ', '
): MatchTextSegment[] {
  const out: MatchTextSegment[] = [];
  items.forEach((segs, idx) => {
    if (idx > 0) out.push(txt(separator));
    out.push(...segs);
  });
  return out;
}

/**
 * Chuyển đổi một MatchEvent thành danh sách segment an toàn cho cả plain-text lẫn React UI.
 */
export function formatMatchEventSegments(
  event: MatchEvent,
  options: FormatMatchEventOptions
): MatchTextSegment[] {
  const actor = event.actor;
  const targets = event.targets;
  const t0 = targets[0];
  const t1 = targets[1];

  switch (event.actionType) {
    // -------------------------------------------------------------------
    // SETUP (Đêm 1)
    // -------------------------------------------------------------------
    case 'PAIR_LOVERS': {
      if (!actor) return [txt('Thần tình yêu không chọn được cặp đôi.')];
      if (event.outcome === 'NO_EFFECT') {
        return [
          txt('Thần tình yêu '),
          playerSeg(event, actor, options, false),
          txt(' tự ghép bản thân nhưng luật phòng cấm (mũi tên vô hiệu).'),
        ];
      }
      if (event.outcome === 'SKIPPED' || !t0 || !t1) {
        return [
          txt('Thần tình yêu '),
          playerSeg(event, actor, options, false),
          txt(' hết giờ chưa chọn cặp đôi.'),
        ];
      }
      const coupleTag = event.metadata?.setup?.isCrossFactionCouple
        ? 'Cặp đôi khác phe — Phe Thứ 3'
        : 'Cặp đôi cùng phe';
      return [
        txt('Thần tình yêu '),
        playerSeg(event, actor, options, false),
        txt(' ghép đôi '),
        playerSeg(event, t0, options),
        txt(' & '),
        playerSeg(event, t1, options),
        txt(' ('),
        emp(coupleTag, event.metadata?.setup?.isCrossFactionCouple ? 'third' : 'village'),
        txt(').'),
      ];
    }

    case 'CHOOSE_IDOL': {
      if (!actor) return [txt('Đứa con hoang chưa chọn thần tượng.')];
      if (event.outcome === 'SKIPPED' || !t0) {
        return [
          txt('Đứa con hoang '),
          playerSeg(event, actor, options, false),
          txt(' hết giờ chưa chọn thần tượng.'),
        ];
      }
      return [
        txt('Đứa con hoang '),
        playerSeg(event, actor, options, false),
        txt(' chọn '),
        playerSeg(event, t0, options, false),
        txt(' làm thần tượng.'),
      ];
    }

    case 'CHOOSE_COPY_TARGET': {
      if (!actor) return [txt('Nhân bản chưa chọn bản sao.')];
      if (event.outcome === 'SKIPPED' || !t0) {
        return [
          txt('Nhân bản '),
          playerSeg(event, actor, options, false),
          txt(' hết giờ chưa chọn bản sao.'),
        ];
      }
      return [
        txt('Nhân bản '),
        playerSeg(event, actor, options, false),
        txt(' chọn sao chép '),
        playerSeg(event, t0, options),
        txt('.'),
      ];
    }

    case 'CHOOSE_HOODLUM_TARGETS': {
      if (!actor) return [txt('Du côn chưa chọn mục tiêu.')];
      if (event.outcome === 'SKIPPED' || !t0 || !t1) {
        return [
          txt('Du côn '),
          playerSeg(event, actor, options, false),
          txt(' hết giờ chưa chọn mục tiêu.'),
        ];
      }
      return [
        txt('Du côn '),
        playerSeg(event, actor, options, false),
        txt(' đưa '),
        playerSeg(event, t0, options, false),
        txt(' và '),
        playerSeg(event, t1, options, false),
        txt(' vào tầm ngắm.'),
      ];
    }

    case 'CHOOSE_COMPANION': {
      if (!actor) return [txt('Sói tuyết chưa chọn bạn đồng hành.')];
      if (event.outcome === 'SKIPPED' || !t0) {
        return [
          txt('Sói tuyết '),
          playerSeg(event, actor, options, false),
          txt(' hết giờ chưa chọn bạn đồng hành.'),
        ];
      }
      return [
        txt('Sói tuyết '),
        playerSeg(event, actor, options, false),
        txt(' chọn '),
        playerSeg(event, t0, options),
        txt(' làm bạn đồng hành.'),
      ];
    }

    case 'MASON_MEET': {
      const masons = event.coActors ?? [];
      if (masons.length <= 1 && masons[0]) {
        return [
          txt('Hội Tam Điểm '),
          playerSeg(event, masons[0], options, false),
          txt(' thức dậy một mình (không có đồng hội khác).'),
        ];
      }
      return [
        txt('Hội Tam Điểm ('),
        ...joinSegmentsList(masons.map((m) => [playerSeg(event, m, options, false)])),
        txt(') thức dậy nhận mặt nhau.'),
      ];
    }

    case 'MINION_REVEAL': {
      if (!actor) return [txt('Kẻ phản bội nhận diện bầy Sói.')];
      if (targets.length === 0) {
        return [
          txt('Kẻ phản bội '),
          playerSeg(event, actor, options, false),
          txt(' thức dậy nhưng không có Sói cắn nào trong bầy.'),
        ];
      }
      return [
        txt('Kẻ phản bội '),
        playerSeg(event, actor, options, false),
        txt(' nhận diện bầy Sói: '),
        ...joinSegmentsList(targets.map((w) => [playerSeg(event, w, options)])),
        txt('.'),
      ];
    }

    case 'DRUNK_SLEEP': {
      if (!actor) return [txt('Kẻ say rượu ngủ suốt đêm.')];
      const realId = event.metadata?.setup?.drunkRealRoleId ?? actor.drunkRealRoleId;
      const realLabel = realId ? getRoleNameVi(realId) : 'chưa rõ';
      return [
        txt('Kẻ say rượu '),
        playerSeg(event, actor, options, false),
        txt(' ngủ quên, lầm tưởng mình là Dân làng (vai ẩn: '),
        emp(realLabel, 'warn'),
        txt(').'),
      ];
    }

    // -------------------------------------------------------------------
    // NIGHT ACTIONS
    // -------------------------------------------------------------------
    case 'PROTECT': {
      if (!actor) return [txt('Bảo vệ hành động trong đêm.')];
      if (event.outcome === 'NO_EFFECT') {
        return [
          txt('Bảo vệ '),
          playerSeg(event, actor, options, false),
          txt(
            event.metadata?.note
              ? ` ${event.metadata.note}`
              : ' đặt khiên không hợp lệ (khiên vô hiệu).'
          ),
        ];
      }
      if (!t0) {
        return [
          txt('Bảo vệ '),
          playerSeg(event, actor, options, false),
          txt(' không chọn mục tiêu đêm nay.'),
        ];
      }
      return [
        txt('Bảo vệ '),
        playerSeg(event, actor, options, false),
        txt(' canh gác cho '),
        playerSeg(event, t0, options),
        txt(' (bình an).'),
      ];
    }

    case 'ATTACK': {
      const isWhiteWolf = actor?.roleId === 'white_wolf';
      const isBigBadWolf = Boolean(event.metadata?.wolfPack?.isBigBadWolfExtra);
      const packActors = event.coActors && event.coActors.length > 0 ? event.coActors : [];

      if (event.metadata?.wolfPack?.firstNightPeaceRule) {
        return [txt('Đêm 1 luật hòa bình: bầy Sói chỉ nhận mặt nhau, không cắn ai.')];
      }

      if (event.outcome === 'SKIPPED') {
        if (isWhiteWolf && actor) {
          return [
            txt('Sói trắng '),
            playerSeg(event, actor, options, false),
            txt(' bỏ qua lượt ám sát riêng.'),
          ];
        }
        if (event.metadata?.wolfPack?.skipWon) {
          return [txt('Bầy Sói chọn bỏ qua không cắn ai đêm nay.')];
        }
        return [txt('Bầy Sói không chọn được mục tiêu cắn đêm nay.')];
      }

      if (!t0) {
        return [txt('Đòn tấn công ban đêm không có mục tiêu.')];
      }

      const attackerPrefix: MatchTextSegment[] = isWhiteWolf && actor
        ? [txt('Sói trắng '), playerSeg(event, actor, options, false), txt(' ám sát riêng ')]
        : isBigBadWolf && actor
          ? [txt('Sói đại ca '), playerSeg(event, actor, options, false), txt(' cắn riêng ')]
          : packActors.length > 0
            ? [
                txt('Bầy Sói ('),
                ...joinSegmentsList(packActors.map((w) => [playerSeg(event, w, options, false)])),
                txt(') cắn '),
              ]
            : [txt('Bầy Sói cắn ')];

      const tieNote = event.metadata?.wolfPack?.tieBreakRandom
        ? ' (hòa phiếu Sói, hệ thống chọn ngẫu nhiên)'
        : '';

      if (event.outcome === 'BLOCKED_BY_BODYGUARD') {
        const protector = event.metadata?.protector;
        return [
          ...attackerPrefix,
          playerSeg(event, t0, options),
          txt(', nhưng bị '),
          ...(protector
            ? [playerSeg(event, protector, options), txt(' che chắn.')]
            : [emp('Bảo vệ', 'safe'), txt(' che chắn.')]),
          ...(tieNote ? [emp(tieNote, 'muted')] : []),
        ];
      }

      if (event.outcome === 'SAVED_BY_WITCH') {
        const healer = event.metadata?.healer;
        return [
          ...attackerPrefix,
          playerSeg(event, t0, options),
          txt(', nhưng được '),
          ...(healer
            ? [playerSeg(event, healer, options), txt(' cứu sống.')]
            : [emp('Phù thủy', 'safe'), txt(' cứu sống.')]),
          ...(tieNote ? [emp(tieNote, 'muted')] : []),
        ];
      }

      if (event.outcome === 'IMMUNE') {
        if (t0.roleId === 'tough_guy') {
          return [
            ...attackerPrefix,
            playerSeg(event, t0, options),
            txt(' — '),
            emp('vết thương trì hoãn đến đêm sau', 'warn'),
            txt('.'),
            ...(tieNote ? [emp(tieNote, 'muted')] : []),
          ];
        }
        if (t0.roleId === 'elder') {
          return [
            ...attackerPrefix,
            playerSeg(event, t0, options),
            txt(' — '),
            emp('mất 1 giáp, vẫn sống sót', 'warn'),
            txt('.'),
            ...(tieNote ? [emp(tieNote, 'muted')] : []),
          ];
        }
      }

      if (event.outcome === 'OVERRIDDEN_BY_POISON') {
        return [
          ...attackerPrefix,
          playerSeg(event, t0, options),
          txt(' (nạn nhân đồng thời trúng độc Phù thủy trong đêm).'),
        ];
      }

      if (event.outcome === 'NO_EFFECT') {
        return [
          ...attackerPrefix,
          playerSeg(event, t0, options),
          txt(
            event.metadata?.note
              ? ` nhưng vô hiệu (${event.metadata.note}).`
              : ' nhưng đòn tấn công vô hiệu.'
          ),
        ];
      }

      // SUCCESS kill (hoặc selfHealBlocked)
      const selfHealNote = event.metadata?.witch?.selfHealBlocked
        ? ' (luật cấm Phù thủy tự cứu)'
        : '';
      const killVerb = isWhiteWolf ? 'ám sát chết ' : isBigBadWolf ? 'cắn riêng chết ' : 'cắn chết ';
      const killerPrefix: MatchTextSegment[] = isWhiteWolf && actor
        ? [txt('Sói trắng '), playerSeg(event, actor, options, false), txt(` ${killVerb}`)]
        : isBigBadWolf && actor
          ? [txt('Sói đại ca '), playerSeg(event, actor, options, false), txt(` ${killVerb}`)]
          : packActors.length > 0
            ? [
                txt('Bầy Sói ('),
                ...joinSegmentsList(packActors.map((w) => [playerSeg(event, w, options, false)])),
                txt(') cắn chết '),
              ]
            : [txt('Bầy Sói cắn chết ')];

      return [
        ...killerPrefix,
        playerSeg(event, t0, options),
        txt('.'),
        ...(selfHealNote ? [emp(selfHealNote, 'danger')] : []),
        ...(tieNote ? [emp(tieNote, 'muted')] : []),
      ];
    }

    case 'CURSE': {
      if (!actor || !t0) return [txt('Sói nguyền hành động trong đêm.')];
      if (event.outcome === 'BLOCKED_BY_BODYGUARD') {
        const protector = event.metadata?.protector;
        return [
          txt('Sói nguyền '),
          playerSeg(event, actor, options, false),
          txt(' định nguyền '),
          playerSeg(event, t0, options),
          txt(', nhưng bị '),
          ...(protector ? [playerSeg(event, protector, options)] : [emp('Bảo vệ', 'safe')]),
          txt(' chặn nên lời nguyền thất bại (hoàn trả phép).'),
        ];
      }
      return [
        txt('Sói nguyền '),
        playerSeg(event, actor, options, false),
        txt(' nguyền '),
        playerSeg(event, t0, options),
        txt(' hóa thành '),
        emp('Ma sói', 'wolf'),
        txt('.'),
      ];
    }

    case 'HEAL': {
      if (!actor) return [txt('Phù thủy dùng bình cứu.')];
      if (event.outcome === 'OVERDOSE_DOUBLE_PROTECT' && t0) {
        const protector = event.metadata?.protector;
        return [
          ...(protector
            ? [playerSeg(event, protector, options), txt(' đỡ trúng ')]
            : [txt('Bảo vệ đỡ trúng ')]),
          playerSeg(event, t0, options),
          txt(', nhưng Phù thủy '),
          playerSeg(event, actor, options, false),
          txt(' cứu trùng gây '),
          emp('sốc thuốc tử vong', 'danger'),
          txt('.'),
        ];
      }
      if (event.outcome === 'NO_EFFECT') {
        const refunded = event.metadata?.witch?.refundedHeal;
        const blockedByBg = event.metadata?.witch?.blockedByBodyguard;
        if (event.metadata?.witch?.selfHealBlocked) {
          return [
            txt('Phù thủy '),
            playerSeg(event, actor, options, false),
            txt(' dùng bình cứu khi tự bị Sói cắn nhưng luật phòng cấm tự cứu (không thể tự cứu).'),
          ];
        }
        if (blockedByBg) {
          return [
            txt('Phù thủy '),
            playerSeg(event, actor, options, false),
            txt(
              refunded
                ? ' dùng bình cứu nhưng Bảo vệ đã chặn đòn trước nên bình cứu dư thừa (hoàn bình).'
                : ' dùng bình cứu nhưng Bảo vệ đã chặn đòn trước nên bình cứu dư thừa (mất bình).'
            ),
          ];
        }
        if (event.metadata?.note) {
          return [
            txt('Phù thủy '),
            playerSeg(event, actor, options, false),
            ...(t0
              ? [txt(' dùng bình cứu '), playerSeg(event, t0, options), txt(' — ')]
              : [txt(' dùng bình cứu — ')]),
            txt(`${event.metadata.note}.`),
          ];
        }
        return [
          txt('Phù thủy '),
          playerSeg(event, actor, options, false),
          txt(
            refunded
              ? ' kích hoạt bình cứu mù khi không có nạn nhân (hoàn bình).'
              : ' kích hoạt bình cứu mù khi không có ai bị cắn (mất bình).'
          ),
        ];
      }
      if (targets.length > 0) {
        return [
          txt('Phù thủy '),
          playerSeg(event, actor, options, false),
          txt(' dùng bình cứu giải cứu '),
          ...joinSegmentsList(targets.map((v) => [playerSeg(event, v, options)])),
          txt('.'),
        ];
      }
      return [
        txt('Phù thủy '),
        playerSeg(event, actor, options, false),
        txt(' dùng bình cứu.'),
      ];
    }

    case 'POISON': {
      if (!actor || !t0) return [txt('Phù thủy ném bình độc.')];
      if (event.outcome === 'NO_EFFECT' && event.metadata?.witch?.blockedByBothRule) {
        return [
          txt('Phù thủy '),
          playerSeg(event, actor, options, false),
          txt(' định ném độc '),
          playerSeg(event, t0, options),
          txt(' nhưng luật phòng cấm dùng 2 bình trong cùng đêm.'),
        ];
      }
      if (event.outcome === 'NO_EFFECT') {
        return [
          txt('Phù thủy '),
          playerSeg(event, actor, options, false),
          txt(' định ném độc '),
          playerSeg(event, t0, options),
          txt(
            event.metadata?.note
              ? ` nhưng vô hiệu (${event.metadata.note}).`
              : ' nhưng bình độc vô hiệu.'
          ),
        ];
      }
      if (event.outcome === 'OVERRIDDEN_BY_POISON') {
        return [
          txt('Phù thủy '),
          playerSeg(event, actor, options, false),
          txt(' ném bình độc giết chết '),
          playerSeg(event, t0, options),
          txt(' ('),
          emp('đè lên bình cứu', 'danger'),
          txt(').'),
        ];
      }
      return [
        txt('Phù thủy '),
        playerSeg(event, actor, options, false),
        txt(' ném bình độc giết chết '),
        playerSeg(event, t0, options),
        txt('.'),
      ];
    }

    case 'INSPECT': {
      if (!actor) return [txt('Lượt điều tra trong đêm.')];
      if (event.outcome === 'SKIPPED') {
        return [
          txt(`${getRoleNameVi(actor.roleId)} `),
          playerSeg(event, actor, options, false),
          txt(' bỏ qua lượt đánh hơi đêm nay.'),
        ];
      }
      if (!t0) return [txt('Lượt điều tra không có mục tiêu.')];
      const inv = event.metadata?.investigation;
      if (!inv) {
        return [
          txt(`${getRoleNameVi(actor.roleId)} `),
          playerSeg(event, actor, options, false),
          ...(actor.roleId === 'apprentice_seer' ? [txt(' (kế thừa Tiên tri)')] : []),
          txt(' soi '),
          playerSeg(event, t0, options),
          txt('.'),
        ];
      }

      if (inv.kind === 'GROUP_HAS_WOLF') {
        const roleTitle = actor.roleId === 'pi' ? 'Thám tử' : 'Con cáo';
        const cluster = inv.inspectedPlayers ?? [t0];
        const powerNote =
          actor.roleId === 'pi'
            ? ' (hết phép)'
            : inv.keptPower
              ? ' (giữ phép)'
              : ' (mất phép vĩnh viễn)';
        return [
          txt(`${roleTitle} `),
          playerSeg(event, actor, options, false),
          txt(' kiểm tra cụm ['),
          ...joinSegmentsList(cluster.map((c) => [playerSeg(event, c, options, false)])),
          txt('] → Kết quả: '),
          emp(inv.resultLabel, inv.rawValue ? 'wolf' : 'village'),
          txt(`${powerNote}.`),
        ];
      }

      const actorTitle =
        actor.roleId === 'apprentice_seer'
          ? 'Tiên tri tập sự'
          : actor.roleId === 'sorcerer'
            ? 'Pháp sư sói'
            : actor.roleId === 'aura_seer'
              ? 'Tiên tri hào quang'
              : 'Tiên tri';
      const resultTone =
        inv.rawValue === 'WEREWOLF' || inv.rawValue === true
          ? 'wolf'
          : inv.rawValue === 'SPECIAL'
            ? 'warn'
            : 'village';

      return [
        txt(`${actorTitle} `),
        playerSeg(event, actor, options, false),
        ...(actor.roleId === 'apprentice_seer' ? [txt(' (kế thừa Tiên tri)')] : []),
        txt(' soi '),
        playerSeg(event, t0, options),
        txt(' → Kết quả: '),
        emp(inv.resultLabel, resultTone),
        txt('.'),
      ];
    }

    case 'SILENCE': {
      if (!actor || !t0) return [txt('Người phù phép khóa miệng một người.')];
      if (event.outcome === 'NO_EFFECT') {
        return [
          txt('Người phù phép '),
          playerSeg(event, actor, options, false),
          txt(' định khóa miệng '),
          playerSeg(event, t0, options),
          txt(
            event.metadata?.note
              ? ` (${event.metadata.note}).`
              : ' nhưng nạn nhân không chịu hiệu ứng.'
          ),
        ];
      }
      return [
        txt('Người phù phép '),
        playerSeg(event, actor, options, false),
        txt(' phù phép cấm nói '),
        playerSeg(event, t0, options),
        txt(' vào hôm sau.'),
      ];
    }

    case 'DOUBLE_VOTE_SABOTAGE': {
      if (!actor) return [txt('Kẻ phá rối kích hoạt treo cổ 2 người.')];
      return [
        txt('Kẻ phá rối '),
        playerSeg(event, actor, options, false),
        txt(' kích hoạt quyền '),
        emp('treo cổ 2 người', 'warn'),
        txt(' vào ngày mai.'),
      ];
    }

    case 'ENCHANT': {
      if (!actor) return [txt('Người thổi sáo thực hiện thôi miên.')];
      if (targets.length === 0) {
        return [
          txt('Người thổi sáo '),
          playerSeg(event, actor, options, false),
          txt(' không thôi miên thêm ai đêm nay.'),
        ];
      }
      return [
        txt('Người thổi sáo '),
        playerSeg(event, actor, options, false),
        txt(' thôi miên '),
        ...joinSegmentsList(targets.map((t) => [playerSeg(event, t, options)]), ' và '),
        txt('.'),
      ];
    }

    case 'CONVERT_CULT': {
      if (!actor || !t0) return [txt('Trưởng giáo phái kết nạp thành viên.')];
      return [
        txt('Trưởng giáo phái '),
        playerSeg(event, actor, options, false),
        txt(' kết nạp '),
        playerSeg(event, t0, options),
        txt(' vào giáo phái.'),
      ];
    }

    case 'NIGHT_IDLE_SUMMARY': {
      const notes = event.metadata?.idleNotes ?? [];
      if (notes.length === 0) return [txt('Không có hành động khác trong đêm.')];
      return [emp(notes.join(' · '), 'muted')];
    }

    // -------------------------------------------------------------------
    // TRANSFORMATIONS & DELAYED EFFECTS
    // -------------------------------------------------------------------
    case 'DRUNK_AWAKEN': {
      if (!actor) return [txt('Kẻ say rượu tỉnh rượu.')];
      const newRoleId = event.metadata?.roleChange?.newRoleId ?? actor.roleId;
      return [
        playerSeg(event, actor, options, false),
        txt(' (Kẻ say rượu) tỉnh rượu, nhận thân phận thật là '),
        emp(getRoleNameVi(newRoleId), getFactionTone(event.metadata?.roleChange?.newFaction)),
        txt('.'),
      ];
    }

    case 'DREAM_WOLF_AWAKEN': {
      if (!actor) return [txt('Sói chiêm bao thức tỉnh.')];
      return [
        txt('Sói chiêm bao '),
        playerSeg(event, actor, options, false),
        txt(' thức tỉnh, tham gia săn mồi cùng bầy từ đêm sau.'),
      ];
    }

    case 'CURSED_TURN': {
      if (!actor) return [txt('Kẻ bị nguyền biến thành Ma sói.')];
      return [
        txt('Bầy Sói cắn trúng '),
        playerSeg(event, actor, options, false),
        txt(' (Kẻ bị nguyền) → '),
        emp('Hóa thành Ma sói', 'wolf'),
        txt('.'),
      ];
    }

    case 'WILD_CHILD_TURN': {
      if (!actor) return [txt('Đứa con hoang biến thành Ma sói.')];
      const idol = t0;
      return [
        ...(idol
          ? [txt('Thần tượng '), playerSeg(event, idol, options), txt(' ngã xuống, ')]
          : []),
        txt('Đứa con hoang '),
        playerSeg(event, actor, options, false),
        txt(' hóa thành '),
        emp('Ma sói', 'wolf'),
        txt('.'),
      ];
    }

    case 'DOPPELGANGER_INHERIT': {
      if (!actor) return [txt('Nhân bản kế thừa vai trò.')];
      const rc = event.metadata?.roleChange;
      const newRoleName = rc ? getRoleNameVi(rc.newRoleId) : getRoleNameVi(actor.roleId);
      const from = rc?.inheritedFrom ?? t0;
      let extra = '';
      if (rc?.newRoleId === 'witch') {
        const pots: string[] = [];
        if (!rc.inheritedWitchHealUsed) pots.push('bình Cứu');
        if (!rc.inheritedWitchPoisonUsed) pots.push('bình Độc');
        extra = pots.length > 0 ? ` (còn ${pots.join(' & ')})` : ' (đã hết bình)';
      } else if (rc?.drunkRealRoleId) {
        extra = ' (từ lá ẩn của Kẻ say rượu)';
      } else if (event.metadata?.note) {
        extra = ` (${event.metadata.note})`;
      }
      return [
        txt('Nhân bản '),
        playerSeg(event, actor, options, false),
        txt(' kế thừa vai trò '),
        emp(newRoleName, getFactionTone(rc?.newFaction)),
        ...(from ? [txt(' từ '), playerSeg(event, from, options)] : []),
        txt(`${extra}.`),
      ];
    }

    case 'ELDER_SHIELD_HIT': {
      if (!actor) return [txt('Già làng mất 1 giáp.')];
      return [
        txt('Già làng '),
        playerSeg(event, actor, options, false),
        txt(' chịu 1 vết cắn của Sói, còn '),
        emp('1 giáp', 'warn'),
        txt('.'),
      ];
    }

    case 'ELDER_CURSE_VILLAGE': {
      if (!actor) return [txt('Già làng chết oan, phe Dân mất phép.')];
      return [
        txt('Già làng '),
        playerSeg(event, actor, options, false),
        txt(' chết oan → '),
        emp('Toàn bộ vai trò đặc biệt phe Dân mất năng lực', 'danger'),
        txt('.'),
      ];
    }

    case 'TOUGH_GUY_WOUNDED': {
      if (!actor) return [txt('Người cứng cỏi bị thương nặng.')];
      return [
        txt('Người cứng cỏi '),
        playerSeg(event, actor, options, false),
        txt(' bị Sói cắn, vết thương trì hoãn đến đêm sau.'),
      ];
    }

    case 'TOUGH_GUY_COLLAPSE': {
      if (!actor) return [txt('Người cứng cỏi kiệt sức tử vong.')];
      const srcRound = event.metadata?.delayedSourceRound;
      return [
        playerSeg(event, actor, options),
        txt(
          srcRound
            ? ` kiệt sức tử vong do vết cắn của Sói từ Đêm ${srcRound}.`
            : ' kiệt sức tử vong do vết cắn đêm trước.'
        ),
      ];
    }

    case 'RUSTY_KNIGHT_INFECT': {
      if (!actor || !t0) return [txt('Kỵ sĩ gỉ sắt lây uốn ván cho một Ma sói.')];
      return [
        txt('Kỵ sĩ gỉ sắt '),
        playerSeg(event, actor, options, false),
        txt(' làm '),
        playerSeg(event, t0, options),
        txt(' nhiễm uốn ván trước khi chết.'),
      ];
    }

    case 'TETANUS_DEATH': {
      if (!actor) return [txt('Ma sói chết vì nhiễm uốn ván.')];
      const srcRound = event.metadata?.delayedSourceRound;
      return [
        playerSeg(event, actor, options),
        txt(
          srcRound
            ? ` chết vì nhiễm uốn ván từ Kỵ sĩ gỉ sắt ở Đêm ${srcRound}.`
            : ' chết vì nhiễm uốn ván từ Kỵ sĩ gỉ sắt.'
        ),
      ];
    }

    case 'WOLF_CUB_ENRAGE': {
      if (!actor) return [txt('Sói con chết, đêm sau bầy Sói được cắn 2 người.')];
      return [
        txt('Sói con '),
        playerSeg(event, actor, options, false),
        txt(' chết → Đêm sau bầy Sói được '),
        emp('cắn 2 người', 'wolf'),
        txt('.'),
      ];
    }

    case 'PIED_PIPER_CLEAR': {
      const transformed = event.metadata?.note === 'transformed_to_werewolf';
      if (!actor) {
        return [
          txt(
            transformed
              ? 'Người thổi sáo bị nguyền thành Ma sói, toàn bộ bùa mê tan biến.'
              : 'Người thổi sáo chết, toàn bộ bùa mê tan biến.'
          ),
        ];
      }
      return [
        txt('Người thổi sáo '),
        playerSeg(event, actor, options, false),
        txt(
          transformed
            ? ' bị nguyền thành Ma sói → Toàn bộ bùa thôi miên tan biến.'
            : ' chết → Toàn bộ bùa thôi miên tan biến.'
        ),
      ];
    }

    case 'CULT_DISBAND': {
      const transformed = event.metadata?.note === 'transformed_to_werewolf';
      if (!actor) {
        return [
          txt(
            transformed
              ? 'Trưởng giáo phái bị nguyền thành Ma sói, giáo phái giải tán.'
              : 'Trưởng giáo phái chết, giáo phái giải tán.'
          ),
        ];
      }
      return [
        txt('Trưởng giáo phái '),
        playerSeg(event, actor, options, false),
        txt(
          transformed
            ? ' bị nguyền thành Ma sói → Giáo phái giải tán.'
            : ' chết → Giáo phái giải tán.'
        ),
      ];
    }

    case 'ANGEL_TO_VILLAGER': {
      if (!actor) return [txt('Thiên sứ sống qua Ngày 1, trở thành Dân làng.')];
      return [
        txt('Thiên sứ '),
        playerSeg(event, actor, options, false),
        txt(' sống sót qua Ngày 1, hòa mình thành '),
        emp('Dân làng', 'village'),
        txt('.'),
      ];
    }

    // -------------------------------------------------------------------
    // DAWN & DAY
    // -------------------------------------------------------------------
    case 'DAWN_SUMMARY': {
      const deaths = event.metadata?.dawnDeaths ?? [];
      if (deaths.length === 0) {
        return [
          emp(`Bình minh Ngày ${event.roundNumber}: Đêm bình yên, không ai ngã xuống.`, 'safe'),
        ];
      }
      const deathChunks = deaths.map((d) => [
        playerSeg(event, d.victim, options),
        ...(options.mode === 'POST_GAME'
          ? [txt(` (${getCauseLabelVi(d.cause)})`)]
          : []),
      ]);
      return [
        txt(`Bình minh Ngày ${event.roundNumber}: `),
        ...joinSegmentsList(deathChunks),
        txt(' đã ngã xuống.'),
      ];
    }

    case 'BEAR_GROWL':
      return [emp('Gấu gầm vang khắp làng! (Có Ma Sói ngồi cạnh Người thuần gấu)', 'warn')];

    case 'MUTE_ANNOUNCE': {
      if (!t0) return [txt('Có người bị phù phép cấm nói hôm nay.')];
      return [
        playerSeg(event, t0, options, false),
        txt(' bị phù phép '),
        emp('cấm nói', 'danger'),
        txt(' trong ngày hôm nay.'),
      ];
    }

    case 'TROUBLEMAKER_ANNOUNCE':
      return [emp('Kẻ phá rối ra tay: hôm nay cả làng phải treo cổ 2 người!', 'warn')];

    case 'MAYOR_ELECTED': {
      if (!t0) return [txt('Không có Trưởng làng được bầu.')];
      return [
        playerSeg(event, t0, options, false),
        txt(' đắc cử '),
        emp('Trưởng làng', 'warn'),
        txt(' (lá phiếu tính x2).'),
      ];
    }

    case 'MAYOR_TIE':
      return [txt('Bầu Trưởng làng hòa phiếu hoặc không có phiếu: ván đấu không có Trưởng làng.')];

    case 'MAYOR_SUCCESSION': {
      if (!t0) {
        return [txt('Hết giờ truyền ngôi: danh hiệu Trưởng làng biến mất vĩnh viễn.')];
      }
      return [
        ...(actor
          ? [txt('Trưởng làng '), playerSeg(event, actor, options, false), txt(' trao lại huy hiệu cho ')]
          : [txt('Huy hiệu Trưởng làng được trao lại cho ')]),
        playerSeg(event, t0, options, false),
        txt('.'),
      ];
    }

    case 'VOTE_TALLY': {
      const voteMeta = event.metadata?.vote;
      if (!voteMeta) return [txt('Tổng kết biểu quyết ban ngày.')];
      const prefix = voteMeta.voteKind === 'RUNOFF' ? 'Vòng Runoff: ' : '';
      if (event.outcome === 'TIED_RUNOFF') {
        const tied = voteMeta.tiedCandidates ?? [];
        const topVotes = voteMeta.tallies[0]?.votes;
        return [
          txt(`${prefix}Hòa phiếu`),
          ...(topVotes !== undefined ? [txt(` (${topVotes} phiếu)`)] : []),
          ...(tied.length > 0
            ? [
                txt(' giữa '),
                ...joinSegmentsList(tied.map((c) => [playerSeg(event, c, options, false)]), ' và '),
              ]
            : []),
          txt(' → Bỏ phiếu lại (Runoff).'),
        ];
      }
      if (event.outcome === 'TIED_ESCAPE') {
        const tied = voteMeta.tiedCandidates ?? [];
        const countsLabel =
          tied.length >= 2 && voteMeta.tallies.length >= 2
            ? ` (${voteMeta.tallies[0].votes}–${voteMeta.tallies[1].votes})`
            : '';
        return [
          txt(`${prefix}Không ai bị treo cổ (Hòa phiếu${countsLabel}`),
          ...(tied.length > 0
            ? [
                txt(' giữa '),
                ...joinSegmentsList(tied.map((c) => [playerSeg(event, c, options, false)]), ' và '),
              ]
            : []),
          txt(').'),
        ];
      }
      if (event.outcome === 'BELOW_MAJORITY' && t0) {
        const topCount = voteMeta.tallies[0]?.votes ?? 0;
        const threshold = voteMeta.majorityThreshold ?? 0;
        return [
          playerSeg(event, t0, options, false),
          txt(
            ` nhiều phiếu nhất (${topCount} phiếu) nhưng chưa đạt quá bán (> ${threshold}) → Tha bổng.`
          ),
        ];
      }
      if (event.outcome === 'NO_EFFECT') {
        return [txt(`${prefix}Không ai nhận được phiếu treo cổ hôm nay.`)];
      }
      return [txt(`${prefix}Đã chốt kết quả biểu quyết.`)];
    }

    case 'VOTE_NO_EXECUTION':
      return [txt('Cả làng không treo cổ ai trong hôm nay.')];

    case 'VOTE_SURVIVED_REVEAL': {
      if (!actor) return [txt('Một người chơi lật bài thoát án treo cổ!')];
      const stepLabel =
        event.metadata?.vote?.executionStep !== undefined
          ? `Lượt xử ${event.metadata.vote.executionStep}: `
          : '';
      if (actor.roleId === 'prince') {
        return [
          txt(`${stepLabel}Làng bỏ phiếu treo `),
          playerSeg(event, actor, options, false),
          txt(' (Hoàng tử) → '),
          emp('Hoàng tử lật bài thoát chết', 'safe'),
          txt(' (giữ quyền bỏ phiếu).'),
        ];
      }
      return [
        txt(`${stepLabel}Làng bỏ phiếu treo `),
        playerSeg(event, actor, options, false),
        txt(' (Thằng ngốc) → '),
        emp('Thằng ngốc lật bài thoát chết', 'safe'),
        txt(' (mất quyền bỏ phiếu).'),
      ];
    }

    case 'VOTE_EXECUTION': {
      if (!t0) return [txt('Một người bị treo cổ.')];
      const voteMeta = event.metadata?.vote;
      if (voteMeta?.cancelledReason === 'IMMEDIATE_WIN') {
        return [
          txt(`Lượt xử ${voteMeta.executionStep ?? 2} nhắm vào `),
          playerSeg(event, t0, options, false),
          txt(' bị hủy vì ván đấu đã kết thúc ngay ở lượt trước.'),
        ];
      }
      if (voteMeta?.cancelledReason === 'ALREADY_DEAD') {
        return [
          txt(`Lượt xử ${voteMeta.executionStep ?? 2} nhắm vào `),
          playerSeg(event, t0, options),
          txt(' được bỏ qua vì nạn nhân đã tử vong trong chuỗi sự kiện trước đó.'),
        ];
      }
      const stepPrefix =
        voteMeta?.isDoubleVoteDay && voteMeta.executionStep
          ? `Lượt xử ${voteMeta.executionStep}: `
          : '';
      const targetTally = voteMeta?.tallies.find((t) => t.target.playerId === t0.playerId);
      const totalVotesCast =
        voteMeta?.tallies.reduce((sum, item) => sum + item.votes, 0) ?? 0;
      const voteSuffix =
        targetTally && totalVotesCast > 0
          ? ` với ${targetTally.votes}/${totalVotesCast} phiếu`
          : targetTally
            ? ` với ${targetTally.votes} phiếu`
            : '';
      return [
        txt(`${stepPrefix}Cả làng treo cổ `),
        playerSeg(event, t0, options),
        txt(`${voteSuffix}.`),
      ];
    }

    case 'HUNTER_SHOT': {
      if (!actor) return [txt('Thợ săn nổ súng.')];
      if (event.outcome === 'NO_EFFECT') {
        if (event.metadata?.noShotReason === 'DOPPELGANGER_HUNTER_BY_HUNTER') {
          return options.mode === 'POST_GAME'
            ? [
                txt('Nhân bản '),
                playerSeg(event, actor, options, false),
                txt(' bị Thợ săn bắn chết nên không được nổ phát súng thứ 2.'),
              ]
            : [
                playerSeg(event, actor, options, false),
                txt(' ngã xuống.'),
              ];
        }
        if (event.metadata?.noShotReason === 'POISON_BLOCKED') {
          return [
            txt('Thợ săn '),
            playerSeg(event, actor, options, false),
            txt(' chết vì trúng độc trong giấc ngủ nên không thể nổ súng.'),
          ];
        }
        return [
          txt('Thợ săn '),
          playerSeg(event, actor, options, false),
          txt(' không chọn mục tiêu (bắn trượt).'),
        ];
      }
      if (!t0) return [txt('Thợ săn không bắn ai.')];
      return [
        txt('Trước khi chết, Thợ săn '),
        playerSeg(event, actor, options, false),
        txt(' nổ súng bắn chết '),
        playerSeg(event, t0, options),
        txt('.'),
      ];
    }

    case 'CASCADE_DEATH': {
      if (!t0) return [txt('Một người chết theo trong chuỗi dây chuyền.')];
      if (options.mode === 'PUBLIC' && !options.revealOnDeath) {
        return [
          playerSeg(event, t0, options),
          ...(actor
            ? [txt(' chết theo sau cái chết của '), playerSeg(event, actor, options, false)]
            : [txt(' chết theo trong chuỗi dây chuyền')]),
          txt('.'),
        ];
      }
      const cause = event.metadata?.cascadeCause;
      if (cause === 'COUPLE_HEARTBREAK') {
        return [
          txt('Vì đau tim, '),
          playerSeg(event, t0, options),
          ...(actor
            ? [txt(' (người yêu của '), playerSeg(event, actor, options, false), txt(')')]
            : []),
          txt(' chết theo.'),
        ];
      }
      if (cause === 'COMPANION_DEATH') {
        return [
          txt('Vì bạn đồng hành '),
          ...(actor ? [playerSeg(event, actor, options, false), txt(' ')] : []),
          txt('tử vong, '),
          playerSeg(event, t0, options),
          txt(' chết theo.'),
        ];
      }
      return [
        playerSeg(event, t0, options),
        txt(' chết trong chuỗi dây chuyền.'),
      ];
    }

    case 'EMERGENCY_ELIMINATE': {
      if (!t0) return [txt('Quản trò đã trục xuất một người chơi khỏi bàn.')];
      return [
        txt('Quản trò trục xuất khẩn cấp '),
        playerSeg(event, t0, options),
        txt(' khỏi bàn (rời trận).'),
      ];
    }

    // -------------------------------------------------------------------
    // GAME END
    // -------------------------------------------------------------------
    case 'WIN': {
      const winMeta = event.metadata?.win;
      if (!winMeta) return [emp('Ván đấu kết thúc.', 'warn')];
      const coWinners = (winMeta.coWinners ?? []).filter((cw) => {
        const escaped = cw.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nameMentioned = new RegExp(
          `(?:^|[^\\p{L}\\p{N}_])${escaped}(?:$|[^\\p{L}\\p{N}_])`,
          'u'
        ).test(winMeta.reason);
        return !nameMentioned;
      });
      const coSegs: MatchTextSegment[] =
        coWinners.length > 0
          ? [
              txt(' '),
              ...joinSegmentsList(
                coWinners.map((cw) => [
                  playerSeg(event, cw, options),
                  txt(' còn sống và cả 2 mục tiêu đã chết → '),
                  emp('Đồng chiến thắng', 'third'),
                  txt('.'),
                ])
              ),
            ]
          : [];

      const winnersList = winMeta.winningPlayers;
      if (
        (winMeta.winner === 'PIED_PIPER' ||
          winMeta.winner === 'CULT_LEADER' ||
          winMeta.winner === 'LONE_WOLF' ||
          winMeta.winner === 'WHITE_WOLF' ||
          winMeta.winner === 'TANNER' ||
          winMeta.winner === 'ANGEL') &&
        winnersList.length === 1
      ) {
        return [
          playerSeg(event, winnersList[0], options),
          txt(`: ${winMeta.reason}`),
        ];
      }

      if (winMeta.winner === 'COUPLE' && winnersList.length >= 2) {
        return [
          txt('Cặp đôi '),
          playerSeg(event, winnersList[0], options),
          txt(' & '),
          playerSeg(event, winnersList[1], options),
          txt(` chiến thắng: ${winMeta.reason}`),
          ...coSegs,
        ];
      }

      return [emp(winMeta.reason, 'safe'), ...coSegs];
    }
  }
}

/**
 * Render MatchEvent thành chuỗi văn bản thuần (dùng cho publicLogs / test / accessibility).
 */
export function formatMatchEventText(
  event: MatchEvent,
  options: FormatMatchEventOptions
): string {
  const segments = formatMatchEventSegments(event, options);
  return segments
    .map((seg) => {
      if (seg.type === 'player') {
        if (seg.showRole && seg.roleId) {
          return `${seg.name} (${getRoleNameVi(seg.roleId)})`;
        }
        return seg.name;
      }
      return seg.value;
    })
    .join('');
}

/**
 * Nhãn trạng thái ngắn gọn hiển thị bên phải mỗi dòng hành động trong Timeline.
 */
export function getOutcomeBadge(event: MatchEvent): OutcomeBadgeInfo | null {
  if (
    event.actionType === 'DAWN_SUMMARY' ||
    event.actionType === 'NIGHT_IDLE_SUMMARY' ||
    event.actionType === 'WIN' ||
    event.actionType === 'BEAR_GROWL' ||
    event.actionType === 'MUTE_ANNOUNCE' ||
    event.actionType === 'TROUBLEMAKER_ANNOUNCE'
  ) {
    return null;
  }

  switch (event.outcome) {
    case 'SUCCESS':
      if (
        event.actionType === 'ATTACK' ||
        event.actionType === 'POISON' ||
        event.actionType === 'VOTE_EXECUTION' ||
        event.actionType === 'HUNTER_SHOT' ||
        event.actionType === 'CASCADE_DEATH' ||
        event.actionType === 'EMERGENCY_ELIMINATE' ||
        event.actionType === 'TOUGH_GUY_COLLAPSE' ||
        event.actionType === 'TETANUS_DEATH'
      ) {
        return { label: 'Tử vong', tone: 'danger' };
      }
      if (
        event.actionType === 'CURSED_TURN' ||
        event.actionType === 'WILD_CHILD_TURN' ||
        event.actionType === 'DOPPELGANGER_INHERIT' ||
        event.actionType === 'DRUNK_AWAKEN' ||
        event.actionType === 'DREAM_WOLF_AWAKEN' ||
        event.actionType === 'ANGEL_TO_VILLAGER' ||
        event.actionType === 'CURSE'
      ) {
        return { label: 'Biến đổi', tone: 'transform' };
      }
      return { label: 'Thành công', tone: 'success' };
    case 'BLOCKED_BY_BODYGUARD':
      return { label: 'Bị chặn', tone: 'blocked' };
    case 'SAVED_BY_WITCH':
      return { label: 'Được cứu', tone: 'saved' };
    case 'OVERRIDDEN_BY_POISON':
      return { label: 'Độc đè cứu', tone: 'danger' };
    case 'OVERDOSE_DOUBLE_PROTECT':
      return { label: 'Sốc thuốc', tone: 'danger' };
    case 'IMMUNE':
      return { label: 'Thoát chết', tone: 'saved' };
    case 'NO_EFFECT':
      return { label: 'Vô hiệu', tone: 'neutral' };
    case 'SKIPPED':
      return { label: 'Bỏ qua', tone: 'neutral' };
    case 'LOST_POWER':
      return { label: 'Mất phép', tone: 'danger' };
    case 'TIED_ESCAPE':
    case 'BELOW_MAJORITY':
      return { label: 'Tha bổng', tone: 'neutral' };
    case 'TIED_RUNOFF':
      return { label: 'Vote lại', tone: 'neutral' };
  }
}
