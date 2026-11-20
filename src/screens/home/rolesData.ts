export type RoleSide = 'village' | 'wolf' | 'third';

export type WakeFrequency =
  | 'Ngủ suốt đêm'
  | 'Mỗi đêm'
  | 'Đêm 1'
  | 'Khi chết'
  | 'Sau khi bị cắn';

export type GameRole = {
  id: string;
  name: string;
  symbol: string;
  side: RoleSide;
  sideLabel: string;
  seerResult: string; // Tiên tri soi ra gì
  wakeFrequency: WakeFrequency; // Tần suất thức dậy
  winCondition: string; // Điều kiện thắng
  description: string; // 1-2 câu ngắn gọn dễ hiểu
  roomRuleNote: string; // Lưu ý luật phòng thực chiến
  auraColor: string;
};

export const gameRoles: GameRole[] = [
  {
    id: 'villager',
    name: 'Dân Làng',
    symbol: '🛡️',
    side: 'village',
    sideLabel: 'Phe Dân Làng',
    seerResult: 'Dân Làng',
    wakeFrequency: 'Ngủ suốt đêm',
    winCondition: 'Tiêu diệt hết Ma Sói',
    description: 'Không có quyền năng ban đêm. Sức mạnh của bạn nằm ở ban ngày: quan sát biểu cảm, lắng nghe lập luận và dùng lá phiếu vote để treo cổ kẻ tình nghi.',
    roomRuleNote: 'Giữ im lặng và úp máy suốt đêm. Khi bị treo cổ hoặc bị cắn chết, người chơi tuyệt đối không được nói hay ra hiệu cho bàn chơi.',
    auraColor: 'var(--forest, #2b583e)',
  },
  {
    id: 'seer',
    name: 'Tiên Tri',
    symbol: '🔮',
    side: 'village',
    sideLabel: 'Phe Dân Làng',
    seerResult: 'Dân Làng',
    wakeFrequency: 'Mỗi đêm',
    winCondition: 'Tiêu diệt hết Ma Sói',
    description: 'Mỗi đêm được quản trò gọi dậy soi danh tính 1 người chơi. Quản trò sẽ bí mật thông báo người đó thuộc phe Dân hay phe Sói.',
    roomRuleNote: 'Soi Kẻ Phản Bội hoặc Bán Sói (chưa bị cắn) đều chỉ ra Dân Làng. Quản trò chỉ báo Dân hay Sói, không báo tên chức năng cụ thể.',
    auraColor: 'var(--twilight, #4d476f)',
  },
  {
    id: 'guard',
    name: 'Bảo Vệ',
    symbol: '⚔️',
    side: 'village',
    sideLabel: 'Phe Dân Làng',
    seerResult: 'Dân Làng',
    wakeFrequency: 'Mỗi đêm',
    winCondition: 'Tiêu diệt hết Ma Sói',
    description: 'Mỗi đêm chọn khiên bảo hộ 1 người chơi. Nếu người đó bị Ma Sói chọn cắn trong đêm, đòn cắn bị vô hiệu và nạn nhân sống sót.',
    roomRuleNote: 'Không được tự bảo vệ bản thân 2 đêm liên tiếp. Khiên Bảo Vệ chỉ đỡ được nanh Sói, không đỡ được thuốc độc của Phù Thủy.',
    auraColor: 'var(--forest, #2b583e)',
  },
  {
    id: 'witch',
    name: 'Phù Thủy',
    symbol: '🧪',
    side: 'village',
    sideLabel: 'Phe Dân Làng',
    seerResult: 'Dân Làng',
    wakeFrequency: 'Mỗi đêm',
    winCondition: 'Tiêu diệt hết Ma Sói',
    description: 'Nắm giữ 2 bình thuốc thần: 1 Bình Cứu (cứu người bị Sói cắn) và 1 Bình Độc (hạ sát 1 kẻ tình nghi). Mỗi bình chỉ dùng 1 lần trong cả ván.',
    roomRuleNote: 'Nếu bật luật "Cứu mù mất bình": bấm cứu khi đêm đó không ai bị cắn sẽ mất trắng bình. Phù Thủy có thể dùng cả 2 bình trong cùng 1 đêm.',
    auraColor: 'var(--twilight, #4d476f)',
  },
  {
    id: 'hunter',
    name: 'Thợ Săn',
    symbol: '🎯',
    side: 'village',
    sideLabel: 'Phe Dân Làng',
    seerResult: 'Dân Làng',
    wakeFrequency: 'Khi chết',
    winCondition: 'Tiêu diệt hết Ma Sói',
    description: 'Khi chết do bị Sói cắn hoặc bị Dân làng bỏ phiếu treo cổ, Thợ Săn được quyền nổ phát súng sau cùng chỉ định 1 người bất kỳ cùng chết.',
    roomRuleNote: 'Nếu chết do thuốc độc của Phù Thủy, Thợ Săn bị câm lặng và KHÔNG được nổ súng.',
    auraColor: 'var(--lantern, #c98638)',
  },
  {
    id: 'wolf',
    name: 'Ma Sói',
    symbol: '🐺',
    side: 'wolf',
    sideLabel: 'Phe Ma Sói',
    seerResult: 'Ma Sói',
    wakeFrequency: 'Mỗi đêm',
    winCondition: 'Số Sói bằng số Dân',
    description: 'Ban ngày trà trộn vào dân làng. Khi đêm xuống, thức giấc cùng bầy đàn và thống nhất chọn 1 nạn nhân để cắn hạ.',
    roomRuleNote: 'Nếu bầy Sói không thống nhất được mục tiêu trước khi hết giờ, đêm đó bầy Sói bị mất lượt cắn.',
    auraColor: 'var(--blood, #8e1e24)',
  },
  {
    id: 'alpha_wolf',
    name: 'Sói Đầu Đàn',
    symbol: '🩸',
    side: 'wolf',
    sideLabel: 'Phe Ma Sói',
    seerResult: 'Ma Sói',
    wakeFrequency: 'Mỗi đêm',
    winCondition: 'Số Sói bằng số Dân',
    description: 'Thủ lĩnh bầy Sói, nắm quyền quyết định tối hậu khi đàn Sói bất đồng ý kiến về con mồi trong đêm.',
    roomRuleNote: 'Tiếng hú của Sói Đầu Đàn có trọng lượng quyết định khi xảy ra hòa phiếu cắn giữa bầy Sói.',
    auraColor: 'var(--blood, #8e1e24)',
  },
  {
    id: 'traitor',
    name: 'Kẻ Phản Bội',
    symbol: '🗡️',
    side: 'wolf',
    sideLabel: 'Phe Ma Sói',
    seerResult: 'Dân Làng',
    wakeFrequency: 'Đêm 1',
    winCondition: 'Số Sói bằng số Dân',
    description: 'Nội gián phe Sói. Thức dậy đêm đầu tiên để biết mặt đàn Sói (nhưng Sói không biết bạn). Nhiệm vụ là định hướng dư luận ban ngày giúp Sói thắng.',
    roomRuleNote: 'Tiên tri soi Kẻ Phản Bội chỉ ra Dân Làng. Kẻ Phản Bội không tham gia cắn người và vẫn có thể bị Sói cắn nhầm.',
    auraColor: '#843d43',
  },
  {
    id: 'cursed',
    name: 'Bán Sói',
    symbol: '🐾',
    side: 'third',
    sideLabel: 'Phe Thứ 3 / Lai',
    seerResult: 'Dân (trước cắn) · Sói (sau cắn)',
    wakeFrequency: 'Sau khi bị cắn',
    winCondition: 'Theo phe Dân (trước cắn) · Theo phe Sói (sau cắn)',
    description: 'Ban đầu mang thân phận Dân Làng. Nếu bị Ma Sói cắn trong đêm, Bán Sói không chết mà thức tỉnh dòng máu sói từ đêm kế tiếp.',
    roomRuleNote: 'Trước khi bị cắn, Tiên tri soi ra Dân Làng. Sau khi thức tỉnh, Tiên tri soi ra Ma Sói và Bán Sói thức dậy cắn người cùng đàn Sói.',
    auraColor: '#8a6d4b',
  },
  {
    id: 'cupid',
    name: 'Thần Tình Yêu',
    symbol: '🏹',
    side: 'third',
    sideLabel: 'Phe Thứ 3 / Ghép đôi',
    seerResult: 'Dân Làng',
    wakeFrequency: 'Đêm 1',
    winCondition: 'Phe Dân thắng (trừ khi tự ghép mình thành cặp Dân-Sói)',
    description: 'Đêm đầu tiên thức dậy chỉ định 2 người chơi thành Cặp Đôi định mệnh. Nếu 1 trong 2 người chết, người kia sẽ chết theo ngay lập tức.',
    roomRuleNote: 'Nếu Cặp Đôi gồm 1 Dân + 1 Sói, họ tách thành phe Thứ 3 riêng biệt: mục tiêu là tiêu diệt tất cả những người còn lại để giành chiến thắng.',
    auraColor: '#965a6e',
  },
];
