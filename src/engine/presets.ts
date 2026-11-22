import {
  calculateBalanceScore,
  isMvpRole,
  ROLES_BY_ID,
  type MvpRoleId,
} from './roles';

export type PresetTheme = 'CLASSIC' | 'DEDUCTION' | 'CHAOS' | 'WOLVES';

export interface RolePreset {
  id: string;
  nameVi: string;
  theme: PresetTheme;
  playerCount: number;
  roles: string[];
  balanceScore: number;
  isMultiDeviceOnly: boolean;
  descriptionVi?: string;
}

export interface DeckGeneratorOptions {
  playerCount: number;
  theme?: PresetTheme;
  isSingleDevice?: boolean;
  preferredRoleIds?: string[];
}

export const NIGHT_HUNTING_WOLF_IDS = [
  'werewolf',
  'wolf_cub',
  'dream_wolf',
  'white_wolf',
  'dire_wolf',
  'lone_wolf',
  'big_bad_wolf',
  'wolf_accursed',
] as const;

export type NightHuntingWolfId = (typeof NIGHT_HUNTING_WOLF_IDS)[number];

export function isNightHuntingWolf(roleId: string): boolean {
  return (NIGHT_HUNTING_WOLF_IDS as readonly string[]).includes(roleId);
}

export function isPresetMultiDeviceOnly(roles: string[]): boolean {
  return roles.some((rId) => Boolean(ROLES_BY_ID[rId]?.multiDeviceOnly));
}

interface RawPresetDef {
  id: string;
  nameVi: string;
  theme: PresetTheme;
  playerCount: number;
  roles: string[];
  descriptionVi?: string;
}

const RAW_PRESETS: RawPresetDef[] = [
  // ------------------ 6 NGƯỜI ------------------
  {
    id: '6_classic',
    nameVi: 'Cổ Điển Cân Bằng',
    theme: 'CLASSIC',
    playerCount: 6,
    roles: ['werewolf', 'werewolf', 'seer', 'bodyguard', 'villager', 'villager'],
    descriptionVi: 'Cổ điển chuẩn mực cho bàn 6 người, dễ chơi và công bằng.',
  },
  {
    id: '6_deduction',
    nameVi: 'Trinh Thám Cơ Bản',
    theme: 'DEDUCTION',
    playerCount: 6,
    roles: ['werewolf', 'dream_wolf', 'seer', 'hunter', 'villager', 'villager'],
    descriptionVi: 'Sói chiêm bao âm thầm chờ đợi đối đầu cùng Thợ săn sắc bén.',
  },
  {
    id: '6_chaos',
    nameVi: 'Thiên Sứ Lạc Lối',
    theme: 'CHAOS',
    playerCount: 6,
    roles: ['werewolf', 'wolf_cub', 'seer', 'witch', 'angel', 'tough_guy'],
    descriptionVi: 'Thiên sứ tìm kiếm cơ hội thắng nhanh giữa bầy sói cuồng nộ.',
  },
  {
    id: '6_wolves',
    nameVi: 'Sói Tuyết Săn Mồi',
    theme: 'WOLVES',
    playerCount: 6,
    roles: ['werewolf', 'dire_wolf', 'seer', 'witch', 'bodyguard', 'villager'],
    descriptionVi: 'Sói tuyết kết bạn đồng hành cùng bầy sói săn lùng dân làng.',
  },

  // ------------------ 7 NGƯỜI ------------------
  {
    id: '7_classic',
    nameVi: 'Cổ Điển Nguy Cơ',
    theme: 'CLASSIC',
    playerCount: 7,
    roles: ['werewolf', 'werewolf', 'seer', 'bodyguard', 'lycan', 'villager', 'villager'],
    descriptionVi: 'Người lai sói gây nhiễu loạn thông tin soi của Tiên tri.',
  },
  {
    id: '7_deduction',
    nameVi: 'Gấu & Manh Mối',
    theme: 'DEDUCTION',
    playerCount: 7,
    roles: ['werewolf', 'werewolf', 'seer', 'bear_tamer', 'bodyguard', 'lycan', 'villager'],
    descriptionVi: 'Tiếng gầm của Gấu cảnh báo nguy hiểm rình rập quanh bàn.',
  },
  {
    id: '7_chaos',
    nameVi: 'Kẻ Chán Đời',
    theme: 'CHAOS',
    playerCount: 7,
    roles: ['werewolf', 'werewolf', 'seer', 'witch', 'tanner', 'hunter', 'villager'],
    descriptionVi: 'Kẻ chán đời khao khát được treo cổ, làm rối loạn suy luận.',
  },
  {
    id: '7_wolves',
    nameVi: 'Sói Nguyền Trỗi Dậy',
    theme: 'WOLVES',
    playerCount: 7,
    roles: ['wolf_accursed', 'werewolf', 'seer', 'witch', 'tough_guy', 'villager', 'villager'],
    descriptionVi: 'Sói nguyền cha mang khả năng lôi kéo nạn nhân gia nhập đàn sói.',
  },

  // ------------------ 8 NGƯỜI ------------------
  {
    id: '8_classic',
    nameVi: 'Cổ Điển Cân Bằng',
    theme: 'CLASSIC',
    playerCount: 8,
    roles: ['werewolf', 'werewolf', 'seer', 'bodyguard', 'witch', 'tanner', 'villager', 'villager'],
    descriptionVi: 'Đội hình kinh điển với đầy đủ bộ ba Tiên tri, Phù thủy, Bảo vệ.',
  },
  {
    id: '8_deduction',
    nameVi: 'Cáo & Thám Tử',
    theme: 'DEDUCTION',
    playerCount: 8,
    roles: ['werewolf', 'werewolf', 'seer', 'fox', 'pi', 'cursed', 'villager', 'villager'],
    descriptionVi: 'Cáo và Thám tử phối hợp điều tra nhóm người khả nghi.',
  },
  {
    id: '8_chaos',
    nameVi: 'Khúc Nhạc Mê Hoặc',
    theme: 'CHAOS',
    playerCount: 8,
    roles: ['werewolf', 'wolf_cub', 'pied_piper', 'seer', 'witch', 'bodyguard', 'hunter', 'prince'],
    descriptionVi: 'Người thổi sáo mê hoặc dân làng, Hoàng tử kháng án treo cổ.',
  },
  {
    id: '8_wolves',
    nameVi: 'Sói Đại Ca Xuất Trận',
    theme: 'WOLVES',
    playerCount: 8,
    roles: ['big_bad_wolf', 'werewolf', 'seer', 'witch', 'tough_guy', 'rusty_knight', 'lycan', 'villager'],
    descriptionVi: 'Sói đại ca cắn hai nạn nhân mỗi đêm đe dọa sinh tồn dân làng.',
  },

  // ------------------ 9 NGƯỜI ------------------
  {
    id: '9_classic',
    nameVi: 'Mũi Tên Định Mệnh',
    theme: 'CLASSIC',
    playerCount: 9,
    roles: ['werewolf', 'werewolf', 'seer', 'bodyguard', 'witch', 'cupid', 'hunter', 'lycan', 'villager'],
    descriptionVi: 'Thần tình yêu gieo duyên trớ trêu giữa bão táp ma sói.',
  },
  {
    id: '9_deduction',
    nameVi: 'Hào Quang & Tiếng Gầm',
    theme: 'DEDUCTION',
    playerCount: 9,
    roles: ['werewolf', 'sorcerer', 'dream_wolf', 'seer', 'aura_seer', 'bear_tamer', 'bodyguard', 'lycan', 'villager'],
    descriptionVi: 'Pháp sư sói truy tìm Tiên tri, Tiên tri hào quang phát hiện vai đặc biệt.',
  },
  {
    id: '9_chaos',
    nameVi: 'Giáo Phái Huyền Bí',
    theme: 'CHAOS',
    playerCount: 9,
    roles: ['werewolf', 'werewolf', 'cult_leader', 'seer', 'witch', 'bodyguard', 'prince', 'troublemaker', 'villager'],
    descriptionVi: 'Trưởng giáo phái thu nạp tín đồ cạnh tranh cùng bầy sói hung bạo.',
  },
  {
    id: '9_wolves',
    nameVi: 'Bầy Sói Khát Máu',
    theme: 'WOLVES',
    playerCount: 9,
    roles: ['dire_wolf', 'werewolf', 'wolf_cub', 'seer', 'witch', 'tough_guy', 'rusty_knight', 'prince', 'villager'],
    descriptionVi: 'Sói tuyết và Sói con cùng hợp lực đẩy nhanh nhịp độ tàn sát.',
  },

  // ------------------ 10 NGƯỜI ------------------
  {
    id: '10_classic',
    nameVi: 'Cổ Điển Đại Ngàn',
    theme: 'CLASSIC',
    playerCount: 10,
    roles: ['werewolf', 'werewolf', 'wolf_cub', 'seer', 'bodyguard', 'witch', 'hunter', 'elder', 'cupid', 'villager'],
    descriptionVi: 'Già làng hai mạng cùng Thần tình yêu tạo nên chiều sâu chiến thuật.',
  },
  {
    id: '10_deduction',
    nameVi: 'Hội Tam Điểm & Tiên Tri',
    theme: 'DEDUCTION',
    playerCount: 10,
    roles: ['werewolf', 'werewolf', 'sorcerer', 'mason', 'mason', 'seer', 'apprentice_seer', 'lycan', 'villager', 'villager'],
    descriptionVi: 'Hội Tam Điểm nhận diện đồng minh, Tiên tri tập sự sẵn sàng kế nghiệp.',
  },
  {
    id: '10_chaos',
    nameVi: 'Giai Điệu & Bùa Chú',
    theme: 'CHAOS',
    playerCount: 10,
    roles: ['werewolf', 'werewolf', 'pied_piper', 'seer', 'witch', 'bodyguard', 'spellcaster', 'angel', 'prince', 'villager'],
    descriptionVi: 'Người phù phép cấm nói đối đầu tiếng sáo ma thuật mê đắm.',
  },
  {
    id: '10_wolves',
    nameVi: 'Đêm Trăng Máu',
    theme: 'WOLVES',
    playerCount: 10,
    roles: ['big_bad_wolf', 'wolf_accursed', 'werewolf', 'seer', 'witch', 'bodyguard', 'tough_guy', 'rusty_knight', 'villager', 'villager'],
    descriptionVi: 'Song sát Sói đại ca và Sói nguyền đẩy ngôi làng vào thảm cảnh.',
  },

  // ------------------ 11 NGƯỜI ------------------
  {
    id: '11_classic',
    nameVi: 'Làng Quê Sóng Gió',
    theme: 'CLASSIC',
    playerCount: 11,
    roles: ['werewolf', 'werewolf', 'wolf_cub', 'seer', 'bodyguard', 'witch', 'hunter', 'elder', 'village_idiot', 'cupid', 'villager'],
    descriptionVi: 'Thằng ngốc thoát án treo cổ, tăng thêm bất ngờ cho cuộc tranh luận.',
  },
  {
    id: '11_deduction',
    nameVi: 'Mạng Lưới Thám Tử',
    theme: 'DEDUCTION',
    playerCount: 11,
    roles: ['werewolf', 'werewolf', 'minion', 'mason', 'mason', 'seer', 'fox', 'pi', 'bodyguard', 'lycan', 'villager'],
    descriptionVi: 'Mạng lưới thông tin dày đặc giữa Cáo, Thám tử và Hội Tam Điểm.',
  },
  {
    id: '11_chaos',
    nameVi: 'Giáo Phái & Du Côn',
    theme: 'CHAOS',
    playerCount: 11,
    roles: ['werewolf', 'werewolf', 'cult_leader', 'hoodlum', 'seer', 'witch', 'bodyguard', 'hunter', 'prince', 'troublemaker', 'villager'],
    descriptionVi: 'Du côn chọn mục tiêu ám sát, Giáo phái bí mật kết nạp thành viên.',
  },
  {
    id: '11_wolves',
    nameVi: 'Song Sói Hung Hãn',
    theme: 'WOLVES',
    playerCount: 11,
    roles: ['big_bad_wolf', 'dire_wolf', 'werewolf', 'seer', 'witch', 'bodyguard', 'tough_guy', 'rusty_knight', 'elder', 'lycan', 'villager'],
    descriptionVi: 'Sói đại ca kết hợp Sói tuyết tạo nên thế gọng kìm chết người.',
  },

  // ------------------ 12 NGƯỜI ------------------
  {
    id: '12_classic',
    nameVi: 'Bóng Đêm Sói Trắng',
    theme: 'CLASSIC',
    playerCount: 12,
    roles: ['werewolf', 'werewolf', 'white_wolf', 'seer', 'bodyguard', 'witch', 'hunter', 'elder', 'cupid', 'village_idiot', 'villager', 'villager'],
    descriptionVi: 'Sói trắng đơn độc săn lùng cả làng lẫn đồng loại bầy sói.',
  },
  {
    id: '12_deduction',
    nameVi: 'Liên Minh Điều Tra',
    theme: 'DEDUCTION',
    playerCount: 12,
    roles: ['werewolf', 'werewolf', 'werewolf', 'sorcerer', 'mason', 'mason', 'seer', 'apprentice_seer', 'bear_tamer', 'bodyguard', 'lycan', 'villager'],
    descriptionVi: 'Liên minh điều tra gồm Người thuần gấu, Tiên tri và Hội Tam Điểm.',
  },
  {
    id: '12_chaos',
    nameVi: 'Khúc Sáo Trầm Luân',
    theme: 'CHAOS',
    playerCount: 12,
    roles: ['werewolf', 'werewolf', 'wolf_cub', 'pied_piper', 'seer', 'witch', 'bodyguard', 'hunter', 'prince', 'spellcaster', 'troublemaker', 'elder'],
    descriptionVi: 'Kẻ phá rối kích hoạt bỏ phiếu kép, đẩy người chơi vào thế lưỡng nan.',
  },
  {
    id: '12_wolves',
    nameVi: 'Đế Chế Ma Sói',
    theme: 'WOLVES',
    playerCount: 12,
    roles: ['wolf_accursed', 'big_bad_wolf', 'werewolf', 'seer', 'witch', 'bodyguard', 'tough_guy', 'rusty_knight', 'prince', 'lycan', 'villager', 'villager'],
    descriptionVi: 'Đế chế sói với đầy đủ thủ lĩnh tối cao thử thách tinh thần dân làng.',
  },

  // ------------------ 13 NGƯỜI ------------------
  {
    id: '13_classic',
    nameVi: 'Cổ Điển Hoàng Gia',
    theme: 'CLASSIC',
    playerCount: 13,
    roles: ['werewolf', 'werewolf', 'werewolf', 'wolf_cub', 'seer', 'bodyguard', 'witch', 'hunter', 'elder', 'cupid', 'prince', 'village_idiot', 'villager'],
    descriptionVi: 'Hoàng tử và Thần tình yêu đối đầu bầy sói 4 con hung bạo.',
  },
  {
    id: '13_deduction',
    nameVi: 'Manh Mối Bủa Vây',
    theme: 'DEDUCTION',
    playerCount: 13,
    roles: ['werewolf', 'werewolf', 'minion', 'sorcerer', 'mason', 'mason', 'seer', 'aura_seer', 'fox', 'bear_tamer', 'bodyguard', 'lycan', 'villager'],
    descriptionVi: 'Manh mối bủa vây từ Cáo, Tiên tri hào quang và Người thuần gấu.',
  },
  {
    id: '13_chaos',
    nameVi: 'Hội Kín & Du Côn',
    theme: 'CHAOS',
    playerCount: 13,
    roles: ['werewolf', 'werewolf', 'dire_wolf', 'cult_leader', 'hoodlum', 'seer', 'witch', 'elder', 'bodyguard', 'hunter', 'prince', 'tough_guy', 'village_idiot'],
    descriptionVi: 'Trưởng giáo phái và Du côn biến bàn cờ thành cuộc đấu ba bề bốn bên.',
  },
  {
    id: '13_wolves',
    nameVi: 'Tứ Đại Ma Sói',
    theme: 'WOLVES',
    playerCount: 13,
    roles: ['big_bad_wolf', 'wolf_accursed', 'dire_wolf', 'werewolf', 'seer', 'witch', 'bodyguard', 'tough_guy', 'rusty_knight', 'elder', 'prince', 'villager', 'villager'],
    descriptionVi: 'Tứ đại ma sói gồm Sói đại ca, Sói nguyền, Sói tuyết và Sói thường.',
  },

  // ------------------ 14 NGƯỜI ------------------
  {
    id: '14_classic',
    nameVi: 'Sói Trắng & Hoàng Tử',
    theme: 'CLASSIC',
    playerCount: 14,
    roles: ['werewolf', 'werewolf', 'werewolf', 'white_wolf', 'seer', 'bodyguard', 'witch', 'hunter', 'elder', 'cupid', 'prince', 'tough_guy', 'village_idiot', 'villager'],
    descriptionVi: 'Sói trắng đơn độc len lỏi giữa triều đình và bầy sói đói khát.',
  },
  {
    id: '14_deduction',
    nameVi: 'Tam Điểm 3 Người',
    theme: 'DEDUCTION',
    playerCount: 14,
    roles: ['werewolf', 'werewolf', 'werewolf', 'minion', 'sorcerer', 'mason', 'mason', 'mason', 'seer', 'apprentice_seer', 'fox', 'pi', 'bodyguard', 'lycan'],
    descriptionVi: 'Bộ ba Tam Điểm liên minh cùng Tiên tri tập sự và Thám tử.',
  },
  {
    id: '14_chaos',
    nameVi: 'Sáo Mê & Giáo Phái',
    theme: 'CHAOS',
    playerCount: 14,
    roles: ['werewolf', 'werewolf', 'werewolf', 'pied_piper', 'cult_leader', 'seer', 'witch', 'bodyguard', 'hunter', 'elder', 'prince', 'rusty_knight', 'troublemaker', 'tough_guy'],
    descriptionVi: 'Cuộc chiến giành giật tâm trí giữa Người thổi sáo và Giáo phái.',
  },
  {
    id: '14_wolves',
    nameVi: 'Vương Triều Sói Ma',
    theme: 'WOLVES',
    playerCount: 14,
    roles: ['big_bad_wolf', 'wolf_accursed', 'dire_wolf', 'werewolf', 'seer', 'witch', 'bodyguard', 'tough_guy', 'rusty_knight', 'elder', 'prince', 'hunter', 'villager', 'villager'],
    descriptionVi: 'Dân làng trang bị đầy đủ Thợ săn, Kỵ sĩ gỉ sắt và Người cứng cỏi chống sói.',
  },

  // ------------------ 15 NGƯỜI ------------------
  {
    id: '15_classic',
    nameVi: 'Hào Khí Làng Quê',
    theme: 'CLASSIC',
    playerCount: 15,
    roles: ['werewolf', 'werewolf', 'werewolf', 'wolf_cub', 'seer', 'bodyguard', 'witch', 'hunter', 'elder', 'cupid', 'prince', 'rusty_knight', 'village_idiot', 'lycan', 'villager'],
    descriptionVi: 'Bàn chơi đông đúc tái hiện trọn vẹn hào khí làng quê ma sói truyền thống.',
  },
  {
    id: '15_deduction',
    nameVi: 'Đại Trận Trinh Thám',
    theme: 'DEDUCTION',
    playerCount: 15,
    roles: ['werewolf', 'werewolf', 'werewolf', 'minion', 'sorcerer', 'mason', 'mason', 'seer', 'apprentice_seer', 'bear_tamer', 'fox', 'pi', 'bodyguard', 'lycan', 'villager'],
    descriptionVi: 'Trận đồ suy luận quy mô lớn với đầy đủ các vai thu thập manh mối.',
  },
  {
    id: '15_chaos',
    nameVi: 'Loạn Thế Tranh Hùng',
    theme: 'CHAOS',
    playerCount: 15,
    roles: ['werewolf', 'werewolf', 'werewolf', 'pied_piper', 'tanner', 'hoodlum', 'seer', 'witch', 'bodyguard', 'hunter', 'elder', 'prince', 'spellcaster', 'troublemaker', 'tough_guy'],
    descriptionVi: 'Phe thứ ba đa dạng tạo nên kịch bản loạn thế tranh hùng khó đoán định.',
  },
  {
    id: '15_wolves',
    nameVi: 'Liên Quân Sói Hắc Ám',
    theme: 'WOLVES',
    playerCount: 15,
    roles: ['big_bad_wolf', 'wolf_accursed', 'dire_wolf', 'wolf_cub', 'seer', 'witch', 'bodyguard', 'tough_guy', 'rusty_knight', 'elder', 'prince', 'hunter', 'village_idiot', 'villager', 'villager'],
    descriptionVi: 'Liên quân 4 dòng giống sói đặc biệt mang đến thử thách sinh tồn cực đại.',
  },

  // ------------------ 16 NGƯỜI ------------------
  {
    id: '16_classic',
    nameVi: 'Đại Chiến 16 Người',
    theme: 'CLASSIC',
    playerCount: 16,
    roles: ['werewolf', 'werewolf', 'werewolf', 'werewolf', 'white_wolf', 'seer', 'bodyguard', 'witch', 'hunter', 'elder', 'cupid', 'prince', 'rusty_knight', 'tough_guy', 'village_idiot', 'bear_tamer'],
    descriptionVi: 'Đại chiến 16 người quy mô tối đa với Sói trắng và toàn bộ tướng tài dân làng.',
  },
  {
    id: '16_deduction',
    nameVi: 'Thần Thám & Tam Điểm',
    theme: 'DEDUCTION',
    playerCount: 16,
    roles: ['werewolf', 'werewolf', 'werewolf', 'minion', 'sorcerer', 'mason', 'mason', 'mason', 'seer', 'apprentice_seer', 'aura_seer', 'bear_tamer', 'fox', 'bodyguard', 'lycan', 'tanner'],
    descriptionVi: 'Đỉnh cao của nghệ thuật suy luận logic và phối hợp thông tin tổ chức.',
  },
  {
    id: '16_chaos',
    nameVi: 'Hỗn Loạn Cực Đại',
    theme: 'CHAOS',
    playerCount: 16,
    roles: ['werewolf', 'werewolf', 'werewolf', 'pied_piper', 'cult_leader', 'hoodlum', 'seer', 'witch', 'bodyguard', 'hunter', 'elder', 'prince', 'troublemaker', 'tough_guy', 'rusty_knight', 'bear_tamer'],
    descriptionVi: 'Mọi thế lực phe thứ ba hội tụ tạo nên một ván chơi kịch tính và hỗn loạn.',
  },
  {
    id: '16_wolves',
    nameVi: 'Quân Đoàn Ma Sói',
    theme: 'WOLVES',
    playerCount: 16,
    roles: ['big_bad_wolf', 'wolf_accursed', 'dire_wolf', 'werewolf', 'werewolf', 'seer', 'witch', 'bodyguard', 'tough_guy', 'rusty_knight', 'elder', 'prince', 'hunter', 'village_idiot', 'bear_tamer', 'villager'],
    descriptionVi: 'Quân đoàn ma sói 5 con hùng mạnh càn quét ngôi làng đông đúc.',
  },
];

export const ROLE_PRESETS: RolePreset[] = RAW_PRESETS.map((preset) => ({
  ...preset,
  balanceScore: calculateBalanceScore(preset.roles),
  isMultiDeviceOnly: isPresetMultiDeviceOnly(preset.roles),
}));

export const PRESETS = ROLE_PRESETS;

export function getPresetsForPlayerCount(
  playerCount: number,
  options?: { theme?: PresetTheme; isSingleDevice?: boolean }
): RolePreset[] {
  return ROLE_PRESETS.filter((preset) => {
    if (preset.playerCount !== playerCount) return false;
    if (options?.theme && preset.theme !== options.theme) return false;
    if (options?.isSingleDevice && preset.isMultiDeviceOnly) return false;
    return true;
  });
}

// -----------------------------------------------------------------------------
// Backwards Compatibility Exports
// -----------------------------------------------------------------------------
export type SmartPreset = RolePreset;

export const SMART_PRESETS: Record<number, SmartPreset> = Object.fromEntries(
  ROLE_PRESETS.filter((p) => p.theme === 'CLASSIC').map((p) => [p.playerCount, p])
);

export function getSmartPreset(playerCount: number): SmartPreset | null {
  if (playerCount < 6 || playerCount > 16) return null;
  return SMART_PRESETS[playerCount] ?? null;
}

export function validateRoleList(roleIds: string[]): { isValid: boolean; reason?: string } {
  if (roleIds.length < 6 || roleIds.length > 16) {
    return { isValid: false, reason: `Số người chơi phải từ 6 đến 16 (hiện tại: ${roleIds.length})` };
  }

  for (const roleId of roleIds) {
    if (!isMvpRole(roleId)) {
      return { isValid: false, reason: `Vai trò [${roleId}] chưa được hỗ trợ trong engine MVP` };
    }
  }

  return { isValid: true };
}

// -----------------------------------------------------------------------------
// Thuật toán sinh ngẫu nhiên có ràng buộc (generateDynamicBalancedDeck)
// -----------------------------------------------------------------------------
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function validateDeckConstraints(
  roles: string[],
  playerCount: number,
  isSingleDevice?: boolean
): boolean {
  if (roles.length !== playerCount) return false;

  // 1. Luôn có >= 1 sói săn đêm
  const hasHuntingWolf = roles.some((id) => isNightHuntingWolf(id));
  if (!hasHuntingWolf) return false;

  // 2. Cấm chọn đồng thời lone_wolf và white_wolf
  if (roles.includes('lone_wolf') && roles.includes('white_wolf')) return false;

  // 3. Ràng buộc phụ thuộc Tiên tri: apprentice_seer hoặc sorcerer CHỈ ĐƯỢC CHỌN KHI CÓ seer
  const hasSeer = roles.includes('seer');
  if (!hasSeer && (roles.includes('apprentice_seer') || roles.includes('sorcerer'))) {
    return false;
  }

  // 4. Nếu có mason, số lượng phải >= 2
  const masonCount = roles.filter((id) => id === 'mason').length;
  if (masonCount > 0 && masonCount < 2) return false;

  // 5. Nếu isSingleDevice === true, loại trừ vai multiDeviceOnly
  if (isSingleDevice && isPresetMultiDeviceOnly(roles)) return false;

  // 6. Điểm số cân bằng nằm trong [-2, +2]
  const score = calculateBalanceScore(roles);
  if (score < -2 || score > 2) return false;

  return true;
}

export function generateDynamicBalancedDeck(options: DeckGeneratorOptions): RolePreset {
  const { playerCount, theme, isSingleDevice, preferredRoleIds = [] } = options;

  if (playerCount < 6 || playerCount > 16) {
    throw new Error(`Số lượng người chơi phải từ 6 đến 16 (hiện tại: ${playerCount})`);
  }

  // 1. Lọc và chuẩn hóa preferredRoleIds
  let sanitizedPreferred: string[] = [];
  for (const roleId of preferredRoleIds) {
    if (!ROLES_BY_ID[roleId]) continue;
    if (isSingleDevice && ROLES_BY_ID[roleId]?.multiDeviceOnly) continue;
    if (roleId === 'lone_wolf' && sanitizedPreferred.includes('white_wolf')) continue;
    if (roleId === 'white_wolf' && sanitizedPreferred.includes('lone_wolf')) continue;
    if (
      roleId !== 'werewolf' &&
      roleId !== 'villager' &&
      roleId !== 'mason' &&
      sanitizedPreferred.includes(roleId)
    ) {
      continue;
    }
    sanitizedPreferred.push(roleId);
  }

  // Nếu có apprentice_seer hoặc sorcerer mà chưa có seer, cố gắng bổ sung seer
  if (
    (sanitizedPreferred.includes('apprentice_seer') || sanitizedPreferred.includes('sorcerer')) &&
    !sanitizedPreferred.includes('seer')
  ) {
    if (sanitizedPreferred.length < playerCount) {
      sanitizedPreferred.push('seer');
    } else {
      sanitizedPreferred = sanitizedPreferred.filter(
        (id) => id !== 'apprentice_seer' && id !== 'sorcerer'
      );
    }
  }

  // Nếu có 1 mason, cố gắng thêm mason thứ 2 nếu còn chỗ
  const initialMasonCount = sanitizedPreferred.filter((id) => id === 'mason').length;
  if (initialMasonCount === 1) {
    if (sanitizedPreferred.length < playerCount) {
      sanitizedPreferred.push('mason');
    } else {
      sanitizedPreferred = sanitizedPreferred.filter((id) => id !== 'mason');
    }
  }

  if (sanitizedPreferred.length > playerCount) {
    sanitizedPreferred = sanitizedPreferred.slice(0, playerCount);
  }

  // Tập sói săn đêm khả dụng
  const availableHuntingWolves = NIGHT_HUNTING_WOLF_IDS.filter((id) => {
    if (isSingleDevice && ROLES_BY_ID[id]?.multiDeviceOnly) return false;
    return true;
  });

  // Theme roles
  const themeRolePools: Record<PresetTheme, string[]> = {
    CLASSIC: [
      'werewolf',
      'wolf_cub',
      'white_wolf',
      'seer',
      'bodyguard',
      'witch',
      'hunter',
      'elder',
      'cupid',
      'village_idiot',
      'prince',
      'tough_guy',
      'tanner',
      'lycan',
      'villager',
    ],
    DEDUCTION: [
      'werewolf',
      'dream_wolf',
      'minion',
      'sorcerer',
      'lone_wolf',
      'seer',
      'apprentice_seer',
      'aura_seer',
      'fox',
      'pi',
      'bear_tamer',
      'mason',
      'lycan',
      'bodyguard',
      'rusty_knight',
      'villager',
    ],
    CHAOS: [
      'werewolf',
      'wolf_cub',
      'white_wolf',
      'pied_piper',
      'cult_leader',
      'hoodlum',
      'tanner',
      'angel',
      'spellcaster',
      'troublemaker',
      'doppelganger',
      'cursed',
      'wild_child',
      'drunk',
      'prince',
      'elder',
      'tough_guy',
      'villager',
    ],
    WOLVES: [
      'big_bad_wolf',
      'wolf_accursed',
      'dire_wolf',
      'wolf_cub',
      'werewolf',
      'dream_wolf',
      'tough_guy',
      'rusty_knight',
      'elder',
      'prince',
      'hunter',
      'witch',
      'seer',
      'village_idiot',
      'bodyguard',
      'lycan',
      'villager',
    ],
  };

  const selectedTheme = theme ?? 'CLASSIC';
  const rawThemePool = themeRolePools[selectedTheme] ?? themeRolePools.CLASSIC;
  const filteredThemePool = rawThemePool.filter((id) => {
    if (isSingleDevice && ROLES_BY_ID[id]?.multiDeviceOnly) return false;
    return true;
  });

  const positiveFillers = ['villager', 'tough_guy', 'hunter', 'bodyguard', 'prince', 'elder', 'witch'];
  const negativeFillers = ['lycan', 'tanner', 'werewolf', 'cupid', 'angel'];

  // Thử sinh ngẫu nhiên tối đa 400 lần
  for (let attempt = 0; attempt < 400; attempt++) {
    const roles = [...sanitizedPreferred];

    // Quyết định số sói săn đêm mục tiêu
    const targetWolves =
      playerCount <= 8
        ? Math.random() < 0.75
          ? 2
          : 1
        : playerCount <= 12
          ? Math.random() < 0.5
            ? 2
            : 3
          : Math.random() < 0.6
            ? 3
            : 4;

    let currentHuntingWolfCount = roles.filter((id) => isNightHuntingWolf(id)).length;

    while (currentHuntingWolfCount < targetWolves && roles.length < playerCount) {
      const candidates = availableHuntingWolves.filter((id) => {
        if (id === 'lone_wolf' && roles.includes('white_wolf')) return false;
        if (id === 'white_wolf' && roles.includes('lone_wolf')) return false;
        if (id !== 'werewolf' && roles.includes(id)) return false;
        return true;
      });
      if (candidates.length === 0) break;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      roles.push(pick);
      currentHuntingWolfCount++;
    }

    // Đảm bảo luôn có ít nhất 1 sói săn đêm
    if (!roles.some((id) => isNightHuntingWolf(id))) {
      if (roles.length < playerCount) {
        roles.push('werewolf');
      } else {
        roles[roles.length - 1] = 'werewolf';
      }
    }

    // Thêm Seer (xác suất cao nếu chưa có)
    if (!roles.includes('seer') && roles.length < playerCount && Math.random() < 0.8) {
      roles.push('seer');
    }

    // Điền các vai từ theme pool
    const shuffledThemePool = shuffleArray(filteredThemePool);
    for (const candidate of shuffledThemePool) {
      if (roles.length >= playerCount - 1) break;
      if (candidate === 'lone_wolf' && roles.includes('white_wolf')) continue;
      if (candidate === 'white_wolf' && roles.includes('lone_wolf')) continue;
      if (
        candidate !== 'werewolf' &&
        candidate !== 'villager' &&
        candidate !== 'mason' &&
        roles.includes(candidate)
      ) {
        continue;
      }
      if ((candidate === 'apprentice_seer' || candidate === 'sorcerer') && !roles.includes('seer')) {
        if (roles.length <= playerCount - 2) {
          roles.push('seer');
          roles.push(candidate);
        }
        continue;
      }
      if (candidate === 'mason') {
        if (roles.length <= playerCount - 2 && roles.filter((id) => id === 'mason').length === 0) {
          roles.push('mason');
          roles.push('mason');
        }
        continue;
      }
      roles.push(candidate);
    }

    // Điền nốt các slot còn lại để cân bằng
    while (roles.length < playerCount) {
      const currentScore = calculateBalanceScore(roles);
      const remainingSlots = playerCount - roles.length;

      if (remainingSlots === 1) {
        const minW = -2 - currentScore;
        const maxW = 2 - currentScore;
        const candidates = filteredThemePool.filter((id) => {
          const w = ROLES_BY_ID[id]?.balanceWeight ?? 0;
          if (w < minW || w > maxW) return false;
          if (id === 'lone_wolf' && roles.includes('white_wolf')) return false;
          if (id === 'white_wolf' && roles.includes('lone_wolf')) return false;
          if ((id === 'apprentice_seer' || id === 'sorcerer') && !roles.includes('seer')) return false;
          if (id === 'mason' && roles.filter((r) => r === 'mason').length === 0) return false;
          if (id !== 'werewolf' && id !== 'villager' && id !== 'mason' && roles.includes(id)) return false;
          return true;
        });

        if (candidates.length > 0) {
          roles.push(candidates[Math.floor(Math.random() * candidates.length)]);
        } else {
          roles.push('villager');
        }
      } else {
        if (currentScore < -2) {
          const cands = positiveFillers.filter((id) => {
            if (isSingleDevice && ROLES_BY_ID[id]?.multiDeviceOnly) return false;
            if (id !== 'villager' && roles.includes(id)) return false;
            return true;
          });
          roles.push(cands.length > 0 ? cands[Math.floor(Math.random() * cands.length)] : 'villager');
        } else if (currentScore > 2) {
          const cands = negativeFillers.filter((id) => {
            if (isSingleDevice && ROLES_BY_ID[id]?.multiDeviceOnly) return false;
            if (id === 'lone_wolf' && roles.includes('white_wolf')) return false;
            if (id === 'white_wolf' && roles.includes('lone_wolf')) return false;
            if (id !== 'werewolf' && roles.includes(id)) return false;
            return true;
          });
          roles.push(cands.length > 0 ? cands[Math.floor(Math.random() * cands.length)] : 'werewolf');
        } else {
          roles.push('villager');
        }
      }
    }

    // Kiểm tra tính hợp lệ toàn diện
    if (validateDeckConstraints(roles, playerCount, isSingleDevice)) {
      const finalRoles = shuffleArray(roles);
      return {
        id: `custom_${playerCount}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        nameVi: `Bộ bài Ngẫu nhiên ${playerCount} người`,
        theme: selectedTheme,
        playerCount,
        roles: finalRoles,
        balanceScore: calculateBalanceScore(finalRoles),
        isMultiDeviceOnly: isPresetMultiDeviceOnly(finalRoles),
        descriptionVi: 'Bộ bài ngẫu nhiên được tối ưu hóa cân bằng theo thuật toán.',
      };
    }
  }

  // Fallback an toàn 100%: chọn preset chuẩn từ catalog 44 presets
  const fallbackCandidates = ROLE_PRESETS.filter((p) => {
    if (p.playerCount !== playerCount) return false;
    if (isSingleDevice && p.isMultiDeviceOnly) return false;
    return true;
  });

  const fallbackPreset =
    fallbackCandidates.find((p) => p.theme === selectedTheme) ??
    fallbackCandidates.find((p) => p.theme === 'CLASSIC') ??
    fallbackCandidates[0];

  const fallbackRoles = shuffleArray(fallbackPreset.roles);

  return {
    id: `custom_${playerCount}_${Date.now()}_fallback`,
    nameVi: `Bộ bài Ngẫu nhiên ${playerCount} người`,
    theme: fallbackPreset.theme,
    playerCount,
    roles: fallbackRoles,
    balanceScore: calculateBalanceScore(fallbackRoles),
    isMultiDeviceOnly: isPresetMultiDeviceOnly(fallbackRoles),
    descriptionVi: 'Bộ bài ngẫu nhiên được sinh dựa trên mẫu chuẩn hóa.',
  };
}
