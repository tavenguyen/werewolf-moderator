import { ROLES, type Faction, type RoleDefinition, type RoleTier } from './roles';

// =========================================================================
// 1. Data Types & Interfaces
// =========================================================================

export type MatchReasonType = 'name' | 'acronym' | 'english' | 'alias';

export interface RoleMatchReason {
  type: MatchReasonType;
  label?: string; // VD: 'Kỹ năng', 'Tiếng Anh', 'Viết tắt'
  value?: string; // VD: 'bắn', 'witch', 'pt'
}

export interface RoleSearchResult {
  role: RoleDefinition;
  score: number;
  reason?: RoleMatchReason;
}

export interface SearchRolesOptions {
  faction?: Faction | 'ALL';
  onlyImplemented?: boolean;
  limit?: number;
}

// =========================================================================
// 2. Pruned Semantic Aliases Dictionary (Chỉ lưu kỹ năng & hành động thực tế)
// =========================================================================

export const ROLE_SEMANTIC_ALIASES: Record<string, string[]> = {
  witch: ['cứu', 'độc', 'thuốc', 'bình', 'giết', 'poison', 'heal'],
  seer: ['soi', 'kiểm tra', 'check', 'nhìn', 'bói'],
  hunter: ['bắn', 'súng', 'kéo theo', 'chết chùm', 'nổ súng', 'shoot'],
  bodyguard: ['khiên', 'bảo kê', 'đỡ', 'shield', 'protect'],
  cupid: ['ghép đôi', 'yêu', 'tình nhân', 'cặp đôi', 'tình yêu', 'bắn tên', 'lovers'],
  wolf_cub: ['cắn 2 người', 'trả thù', 'hai mạng', 'double bite'],
  dream_wolf: ['ngủ', 'chiêm bao', 'không thức', 'ngủ quên'],
  white_wolf: ['sói solo', 'đơn độc', 'cắn đồng đội'],
  minion: ['phản bội', 'đệ sói', 'tay sai', 'theo sói'],
  sorcerer: ['pháp sư', 'soi tiên tri', 'tìm tiên tri'],
  tanner: ['tự tử', 'muốn chết', 'treo cổ', 'chán đời', 'suicide'],
  elder: ['2 mạng', 'giáp', 'mất phép'],
  village_idiot: ['thằng ngốc', 'ngốc', 'khờ', 'miễn treo cổ'],
  lycan: ['lai sói', 'dân soi ra sói'],
  cursed: ['bị nguyền', 'hóa sói'],
  tough_guy: ['cứng cỏi', 'sống thêm một ngày', 'chết hoãn'],
  prince: ['hoàng tử', 'lật vai thoát chết'],
};

// =========================================================================
// 3. Normalization Utilities
// =========================================================================

/**
 * Loại bỏ dấu tiếng Việt chuẩn xác (NFD -> NFC)
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();
}

/**
 * Lấy chữ cái đầu của mỗi từ tiếng Việt để làm mã viết tắt (Acronym)
 * VD: "Phù thủy" -> "pt", "Tiên tri" -> "tt", "Sói con" -> "sc"
 */
export function getAcronym(text: string): string {
  const words = removeVietnameseTones(text).split(/\s+/).filter(Boolean);
  return words.map((w) => w[0] || '').join('');
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =========================================================================
// 4. Pragmatic 4-Tier Search Engine
// =========================================================================

export function searchRoles(
  roles: RoleDefinition[] = ROLES,
  rawQuery: string,
  options: SearchRolesOptions = {}
): RoleSearchResult[] {
  const query = rawQuery.trim();
  const { faction = 'ALL', onlyImplemented = false, limit } = options;

  // Lọc theo điều kiện cơ bản trước
  let candidateRoles = roles;
  if (onlyImplemented) {
    candidateRoles = candidateRoles.filter((r) => r.implementedInEngine);
  }
  if (faction !== 'ALL') {
    candidateRoles = candidateRoles.filter((r) => r.faction === faction);
  }

  // Nếu ô tìm kiếm rỗng, trả về danh sách ứng viên
  if (!query) {
    return candidateRoles.map((role) => ({
      role,
      score: role.tier === 'core' ? 50 : 0,
    }));
  }

  const q = removeVietnameseTones(query);
  const qNoSpace = q.replace(/\s+/g, '');
  const rawLower = query.toLowerCase();
  const isAccentedQuery = removeVietnameseTones(query) !== rawLower;

  const results: RoleSearchResult[] = [];

  for (const role of candidateRoles) {
    const nameViNorm = removeVietnameseTones(role.nameVi);
    const nameViNoSpace = nameViNorm.replace(/\s+/g, '');
    const nameEnNorm = role.nameEn.toLowerCase().trim();
    const acronym = getAcronym(role.nameVi);
    const aliases = ROLE_SEMANTIC_ALIASES[role.id] || [];

    let score = 0;
    let reason: RoleMatchReason | undefined;

    // -----------------------------------------------------------------------
    // TẦNG 1 (1000đ): Khớp chính xác (Exact) Tên Việt / Tên Anh / Acronym
    // -----------------------------------------------------------------------
    if (nameViNorm === q || role.nameVi.toLowerCase() === rawLower) {
      score = 1000;
      reason = { type: 'name' };
    } else if (nameEnNorm === q || role.id === q || role.nameEn.toLowerCase() === rawLower) {
      score = 1000;
      reason = { type: 'english', label: 'Tiếng Anh', value: role.nameEn };
    } else if (q.length >= 2 && acronym === q) {
      score = 1000;
      reason = { type: 'acronym', label: 'Viết tắt', value: acronym.toUpperCase() };
    }

    // -----------------------------------------------------------------------
    // TẦNG 2 (800đ): Khớp đầu từ (Prefix / Word boundary) trên Tên Việt hoặc Anh
    // -----------------------------------------------------------------------
    else {
      const wordBoundaryVi = isAccentedQuery
        ? new RegExp(`(^|\\s)${escapeRegExp(rawLower)}`, 'i').test(role.nameVi.toLowerCase())
        : new RegExp(`(^|\\s)${escapeRegExp(q)}`, 'i').test(nameViNorm);

      const wordBoundaryEn =
        new RegExp(`(^|\\s)${escapeRegExp(q)}`, 'i').test(nameEnNorm) ||
        nameEnNorm.endsWith(q) ||
        role.id.startsWith(q);

      if (wordBoundaryVi) {
        score = 800;
        reason = { type: 'name' };
      } else if (wordBoundaryEn) {
        score = 800;
        reason = { type: 'english', label: 'Tiếng Anh', value: role.nameEn };
      }

      // -----------------------------------------------------------------------
      // TẦNG 3 (600đ): Khớp viết liền không dấu hoặc Substring trong tên
      // -----------------------------------------------------------------------
      else {
        const substringVi = isAccentedQuery
          ? role.nameVi.toLowerCase().includes(rawLower)
          : (q.length >= 3 && nameViNoSpace.includes(qNoSpace)) || nameViNorm.includes(q);

        const substringEn = nameEnNorm.includes(q);

        if (substringVi) {
          score = 600;
          reason = { type: 'name' };
        } else if (substringEn) {
          score = 600;
          reason = { type: 'english', label: 'Tiếng Anh', value: role.nameEn };
        }

        // -----------------------------------------------------------------------
        // TẦNG 4 (400đ): Khớp từ khóa kỹ năng (Semantic Aliases)
        // -----------------------------------------------------------------------
        else {
          for (const alias of aliases) {
            const aliasNorm = removeVietnameseTones(alias);
            const isExactAlias = alias === rawLower || aliasNorm === q;
            const isSubstringAlias = q.length >= 3 && (alias.includes(rawLower) || aliasNorm.includes(q));

            if (isExactAlias) {
              score = 450;
              reason = { type: 'alias', label: 'Kỹ năng', value: alias };
              break;
            } else if (isSubstringAlias) {
              score = 400;
              reason = { type: 'alias', label: 'Kỹ năng', value: alias };
              break;
            }
          }
        }
      }
    }

    // Nếu có điểm, tính thêm Tie-breakers
    if (score > 0) {
      // Tie-breaker 1: Vai cơ bản nhận thêm 50 điểm
      const coreBonus = role.tier === 'core' ? 50 : 0;
      // Tie-breaker 2: Tên ngắn hơn được cộng tối đa 20 điểm (giúp "Ma sói" thắng "Sói con")
      const lengthBonus = Math.max(0, 20 - role.nameVi.length);

      const totalScore = score + coreBonus + lengthBonus;

      results.push({
        role,
        score: totalScore,
        reason,
      });
    }
  }

  // Sắp xếp giảm dần theo điểm số
  results.sort((a, b) => b.score - a.score);

  if (typeof limit === 'number' && limit > 0) {
    return results.slice(0, limit);
  }

  return results;
}
