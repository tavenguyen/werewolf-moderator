import { ROLES, type RoleDefinition } from './roles';

export type RoleSide = 'village' | 'wolf' | 'third';

export type WakeFrequency =
  | 'Ngủ suốt đêm'
  | 'Mỗi đêm'
  | 'Đêm 1'
  | 'Khi chết'
  | 'Cách 1 đêm'
  | 'Đầu Đêm 3'
  | 'Khi Tiên tri chết'
  | 'Khi Sói chết'
  | 'Bị động đầu ngày'
  | 'Dùng 1 lần trong ván';

export type GameRole = {
  id: string;
  name: string;
  nameEn: string;
  symbol: string;
  side: RoleSide;
  sideLabel: string;
  pack: 'BASIC' | 'DEDUCTION' | 'CHAOS';
  packLabel: string;
  balanceWeight: number;
  seerResult: string;
  wakeFrequency: WakeFrequency;
  winCondition: string;
  description: string;
  roomRuleNote: string;
  edgeCases: string[];
  auraColor: string;
};

const ROLE_VISUALS: Record<string, { symbol: string; auraColor: string }> = {
  // BASIC
  villager: { symbol: '🛡️', auraColor: 'var(--forest, #2b583e)' },
  werewolf: { symbol: '🐺', auraColor: 'var(--blood, #8e1e24)' },
  seer: { symbol: '🔮', auraColor: 'var(--twilight, #4d476f)' },
  bodyguard: { symbol: '⚔️', auraColor: 'var(--forest, #2b583e)' },
  witch: { symbol: '🧪', auraColor: 'var(--twilight, #4d476f)' },
  hunter: { symbol: '🎯', auraColor: 'var(--lantern, #c98638)' },
  cupid: { symbol: '🏹', auraColor: '#965a6e' },
  tough_guy: { symbol: '🪵', auraColor: 'var(--forest, #2b583e)' },
  prince: { symbol: '👑', auraColor: '#c29b38' },

  // DEDUCTION
  wolf_cub: { symbol: '🐾', auraColor: 'var(--blood, #8e1e24)' },
  dream_wolf: { symbol: '🌙', auraColor: '#7a2d39' },
  lycan: { symbol: '🐺', auraColor: '#426352' },
  minion: { symbol: '🗡️', auraColor: '#7c383e' },
  sorcerer: { symbol: '🪄', auraColor: '#5a3d6d' },
  cursed: { symbol: '🩸', auraColor: '#8a6d4b' },
  tanner: { symbol: '💀', auraColor: '#685c53' },
  pi: { symbol: '🔍', auraColor: '#3d566e' },
  fox: { symbol: '🦊', auraColor: '#a8622c' },
  bear_tamer: { symbol: '🐻', auraColor: '#5c4838' },
  aura_seer: { symbol: '✨', auraColor: '#4f4f7a' },
  apprentice_seer: { symbol: '📜', auraColor: '#444e6b' },
  mason: { symbol: '🤝', auraColor: '#3a5948' },
  rusty_knight: { symbol: '🗡️', auraColor: '#595243' },
  lone_wolf: { symbol: '🐺', auraColor: '#6d1e22' },

  // CHAOS
  white_wolf: { symbol: '❄️', auraColor: '#b0bcc7' },
  elder: { symbol: '👴', auraColor: '#536248' },
  village_idiot: { symbol: '🃏', auraColor: '#5f6b4e' },
  wild_child: { symbol: '🧒', auraColor: '#855938' },
  angel: { symbol: '🪽', auraColor: '#9aaec4' },
  pied_piper: { symbol: '🪈', auraColor: '#7a527c' },
  spellcaster: { symbol: '🤐', auraColor: '#4d4f66' },
  troublemaker: { symbol: '⚡', auraColor: '#967434' },
  wolf_accursed: { symbol: '🩸', auraColor: '#82161b' },
  big_bad_wolf: { symbol: '👹', auraColor: '#9e1a20' },
  dire_wolf: { symbol: '🐺', auraColor: '#572b38' },
  doppelganger: { symbol: '🎭', auraColor: '#755877' },
  cult_leader: { symbol: '🕯️', auraColor: '#634b73' },
  hoodlum: { symbol: '🪓', auraColor: '#61524e' },
  drunk: { symbol: '🍺', auraColor: '#6b5c3d' },
};

interface RoleTextData {
  desc: string;
  ruleNote: string;
  winCond: string;
  edgeCases: string[];
}

const HUMANIZED_ROLE_DATA: Record<string, RoleTextData> = {
  villager: {
    desc: 'Bạn không có kỹ năng ban đêm. Nhiệm vụ của bạn là lắng nghe mọi người tranh luận vào ban ngày, tìm ra điểm đáng ngờ và bỏ phiếu treo cổ Ma sói.',
    ruleNote: 'Ban đêm hãy úp điện thoại xuống bàn. Khi bị loại, bạn không được nói hay ra hiệu cho những người còn sống.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Ban đêm màn hình luôn tối đen và không có nút bấm nào. Bạn chỉ mở mắt khi trời sáng.',
      'Nếu được ghép đôi với Ma sói hoặc Phe thứ ba, bạn sẽ đổi phe theo người yêu nhưng ban đêm vẫn không thức dậy.',
      'Khi đã chết, bạn xem ván đấu với tư cách khán giả và không được tiết lộ vai trò của người khác.',
    ],
  },
  werewolf: {
    desc: 'Ban ngày bạn đóng giả làm dân làng. Vào ban đêm, bạn thức dậy cùng đồng đội để chọn một người cắn chết.',
    ruleNote: 'Nếu bầy Sói không thống nhất được ai và bị hòa phiếu, hệ thống sẽ chọn ngẫu nhiên một trong những người đó.',
    winCond: 'Số Sói bằng hoặc nhiều hơn số Dân',
    edgeCases: [
      'Nếu phòng bật luật cho phép bỏ cắn, bầy Sói có thể chọn không cắn ai để tạo đêm bình yên giả, đánh lừa Phù thủy và Bảo vệ.',
      'Nếu bật luật cho phép tự cắn, Sói có thể cắn đồng đội hoặc tự cắn mình. Nếu con Sói cuối cùng tự cắn mà không ai cứu, phe Dân thắng ngay sáng hôm sau.',
      'Bầy Sói không biết ai là Kẻ phản bội (Minion), nên hoàn toàn có thể cắn nhầm người phe mình.',
      'Nếu có một Sói bị mất mạng hoặc mất kết nối, những con Sói còn lại vẫn bỏ phiếu bình thường.',
    ],
  },
  seer: {
    desc: 'Mỗi đêm bạn được chọn soi một người để biết họ là Dân hay Sói. Hãy tìm cách chia sẻ thông tin cho làng mà không để Sói phát hiện ra bạn.',
    ruleNote: 'Bạn không thể tự soi chính mình. Soi Kẻ phản bội sẽ ra Dân, nhưng soi Người lai sói lại ra Sói.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Kết quả soi dựa theo vai trò của mục tiêu: Người lai sói (Lycan) soi ra Sói, Kẻ phản bội (Minion) soi ra Dân, Sói trắng soi ra Sói.',
      'Đêm bạn bị Sói cắn, bạn vẫn được soi bình thường vì vết cắn chỉ tính khi trời sáng. Kết quả soi đêm đó vẫn hiện trước khi bạn chết.',
      'Khi bạn đã chết, hệ thống vẫn gọi tên bạn giả vờ qua loa để bầy Sói không biết bạn còn sống hay đã mất.',
      'Nếu Già làng bị dân làng giết oan, bạn sẽ mất phép. Khi bấm soi sẽ không nhận được kết quả gì, nhưng hệ thống vẫn gọi tên bạn để giữ bí mật.',
    ],
  },
  bodyguard: {
    desc: 'Mỗi đêm bạn chọn bảo vệ một người (có thể tự chọn mình). Nếu đêm đó người này bị Sói cắn thì sẽ không chết.',
    ruleNote: 'Bạn không được bảo vệ cùng một người trong hai đêm liên tiếp. Hệ thống sẽ tự làm mờ tên người bạn vừa chọn đêm trước.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Bạn chỉ đỡ được đòn cắn của bầy Sói thường. Khiên không chặn được bình độc của Phù thủy hay đòn ám sát của Sói trắng.',
      'Nếu bạn đỡ trúng Kẻ bị nguyền (Cursed) lúc người đó bị Sói cắn, vết cắn bị chặn nên Kẻ bị nguyền không bị biến thành Sói.',
      'Vào đêm Sói con chết (Sói được cắn hai người), nếu bạn đỡ trúng một người thì người đó sống, người kia vẫn bị cắn bình thường.',
      'Nếu bạn bảo vệ trúng Già làng khi bị cắn, Già làng sẽ không bị mất điểm giáp nào.',
    ],
  },
  witch: {
    desc: 'Bạn có hai bình thuốc dùng một lần trong cả ván: một bình Cứu người bị Sói cắn và một bình Độc để giết một người bất kỳ.',
    ruleNote: 'Bạn có thể dùng cả hai bình trong một đêm, hoặc không dùng bình nào. Bình độc xuyên qua mọi lớp khiên giáp.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Nếu bật luật cứu diện rộng, một bình cứu sẽ cứu sống tất cả những ai bị bầy Sói cắn trong đêm đó.',
      'Bình độc luôn mạnh hơn bình cứu: nếu bạn vừa bấm cứu vừa ném độc vào cùng một người, người đó vẫn chết do trúng độc.',
      'Bình độc giết chết Già làng ngay lập tức mà không cần 2 mạng, đồng thời làm toàn bộ phe Dân mất sạch phép.',
      'Nếu tắt chức năng thấy nạn nhân và bật luật mất bình khi cứu hụt, bấm cứu lúc không ai bị cắn thì bạn vẫn mất bình.',
      'Nếu phòng cấm Phù thủy tự cứu, khi bị Sói cắn bạn không thể tự cứu mình; nếu cứu diện rộng, bạn cứu được người khác còn bản thân vẫn chết.',
    ],
  },
  hunter: {
    desc: 'Khi bị chết (do Sói cắn, bị treo cổ hoặc trúng độc), bạn được quyền bắn chết thêm một người nữa cùng chết theo.',
    ruleNote: 'Bạn không thức dậy ban đêm. Quyền bắn súng sẽ hiện trên màn hình vào buổi sáng sau khi quản trò công bố người chết.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Màn hình sẽ đếm ngược 15 giây vào buổi sáng để bạn chọn người bắn. Nếu hết giờ không chọn ai, coi như bạn bắn trượt.',
      'Nếu bạn chết theo người yêu Cupid, bạn vẫn có 15 giây để bắn một người khác.',
      'Nếu bạn bắn trúng Thằng ngốc, Thằng ngốc sẽ chết thật (Thằng ngốc chỉ thoát chết khi bị cả làng bỏ phiếu treo cổ).',
      'Nếu bạn bắn chết Già làng, Già làng chết ngay và phe Dân bị phạt mất hết kỹ năng.',
      'Nếu bạn bị con Sói cuối cùng cắn chết và bạn bắn chết luôn con Sói đó khiến không còn ai sống sót, ván đấu sẽ có kết quả Hòa.',
    ],
  },
  cupid: {
    desc: 'Vào Đêm đầu tiên, bạn chọn ghép đôi hai người bất kỳ. Nếu một trong hai người chết, người kia sẽ chết theo ngay lập tức.',
    ruleNote: 'Bạn có thể tự ghép mình với người khác, nhưng phải chọn hai người khác nhau.',
    winCond: 'Phe Dân thắng (nếu ghép 2 Dân) hoặc Cặp đôi sống sót cuối cùng (nếu ghép khác phe)',
    edgeCases: [
      'Nếu bạn ghép một người phe Dân với một người phe Sói, hai người này thành Phe thứ ba, chỉ thắng khi là hai người cuối cùng còn sống.',
      'Khi một người chết vì bất kỳ lý do gì, người kia chết theo ngay; nếu người chết theo là Thợ săn, Thợ săn vẫn được bắn.',
      'Ngay sau lượt của bạn ở Đêm đầu tiên, màn hình của hai người yêu nhau sẽ sáng lên để biết mặt nhau.',
    ],
  },
  tough_guy: {
    desc: 'Nếu bị Sói cắn vào ban đêm, bạn chưa chết ngay mà vẫn sống qua ngày hôm sau để tranh luận. Đến cuối đêm kế tiếp thì bạn mới chết.',
    ruleNote: 'Phù thủy chỉ cứu được bạn ngay trong đêm bạn bị cắn. Sang đêm hôm sau khi vết thương phát tác thì không cứu được nữa.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Nếu đêm nay bị Sói cắn, sáng mai bạn vẫn sống và làng có đêm bình yên. Nhưng bạn sẽ tự động chết vào cuối đêm hôm sau.',
      'Nếu trong ngày hôm sau bạn bị cả làng bỏ phiếu treo cổ, bạn sẽ chết ngay lập tức do án treo cổ chứ không đợi đến đêm.',
      'Nếu bạn bị Phù thủy ném độc, bạn chết ngay vào sáng hôm sau chứ không được hoãn lại như vết cắn.',
    ],
  },
  prince: {
    desc: 'Lần đầu tiên bị cả làng vote treo cổ, bạn sẽ tự động lật bài để thoát chết. Khác với Thằng ngốc, bạn vẫn được giữ nguyên quyền bỏ phiếu.',
    ruleNote: 'Bạn chỉ thoát chết một lần duy nhất trước án treo cổ. Ban đêm bị Sói cắn hoặc trúng độc bạn vẫn chết bình thường.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Thằng ngốc sau khi lật bài thì mất quyền vote, còn Hoàng tử lật bài thoát chết vẫn được bỏ phiếu bình thường.',
      'Bạn chỉ được tha chết một lần: nếu những ngày sau dân làng vẫn tiếp tục vote treo cổ bạn, bạn sẽ chết thật.',
      'Sau khi bạn lật bài thoát chết, ngày hôm đó kết thúc ngay và chuyển sang ban đêm mà không ai bị treo cổ.',
    ],
  },
  wolf_cub: {
    desc: 'Bạn đi cắn cùng bầy Sói mỗi đêm. Nếu bạn bị chết vì bất kỳ lý do gì, đêm hôm sau bầy Sói sẽ được cắn hai người.',
    ruleNote: 'Đêm Sói cắn hai người là lúc bầy Sói rất mạnh, nhưng Phù thủy có thể cứu cả hai nếu dùng bình cứu diện rộng.',
    winCond: 'Số Sói bằng hoặc nhiều hơn số Dân',
    edgeCases: [
      'Quyền cắn hai người kích hoạt vào đêm sau dù bạn chết do bị treo cổ, trúng độc, bị bắn hay bị đồng đội cắn nhầm.',
      'Nếu bạn là con Sói cuối cùng và bị treo cổ ban ngày, phe Dân thắng ngay chứ bầy Sói không còn ai để cắn hai người.',
      'Vào đêm cắn hai người, bầy Sói phải chọn hai người khác nhau; nếu chọn trùng một người thì chỉ tính một vết cắn.',
    ],
  },
  dream_wolf: {
    desc: 'Bạn thuộc phe Sói nhưng ban đầu không thức dậy đi cắn và không biết mặt đồng đội. Khi có ít nhất một con Sói khác chết, bạn mới thức dậy đi cắn cùng bầy từ đêm sau.',
    ruleNote: 'Khi còn ngủ, Tiên tri soi vào bạn vẫn thấy Ma sói. Các con Sói khác vẫn biết bạn là ai qua danh sách đồng đội.',
    winCond: 'Số Sói bằng hoặc nhiều hơn số Dân',
    edgeCases: [
      'Khi bạn còn ngủ, ban đêm màn hình luôn tối đen như dân thường.',
      'Ngay khi có một con Sói trong đàn bị giết, từ đêm tiếp theo bạn sẽ tự động mở màn hình đi cắn cùng bầy.',
      'Nếu ván chơi chỉ có một Sói thường và bạn, khi con Sói kia chết thì phe Dân chưa thắng, vì bạn sẽ thức tỉnh thành Sói đi cắn một mình.',
      'Việc Kẻ bị nguyền hoặc Đứa con hoang biến thành Sói không làm bạn thức tỉnh; chỉ khi có Sói chết bạn mới tỉnh.',
    ],
  },
  lycan: {
    desc: 'Bạn thuộc phe Dân làng, nhưng Tiên tri soi vào bạn sẽ thấy kết quả là Ma sói do bạn mang dòng máu sói.',
    ruleNote: 'Đây là vai trò làm khó Tiên tri. Dù soi ra Sói, bạn vẫn là Dân làng thật sự.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Bạn thắng cùng phe Dân khi đàn Sói bị tiêu diệt hết.',
      'Bầy Sói không biết bạn là ai và vẫn cắn bạn như một người dân bình thường.',
      'Pháp sư sói (Sorcerer) soi vào bạn sẽ thấy bạn không phải Tiên tri.',
    ],
  },
  minion: {
    desc: 'Bạn thuộc phe Sói. Đêm đầu tiên bạn được biết mặt các con Sói để ban ngày tìm cách giúp Sói thắng, nhưng Tiên tri soi vào bạn lại ra Dân làng.',
    ruleNote: 'Bầy Sói không biết bạn là ai, vì vậy họ hoàn toàn có thể cắn nhầm bạn vào ban đêm.',
    winCond: 'Phe Ma sói giành chiến thắng chung cuộc',
    edgeCases: [
      'Bạn chỉ thức dậy ở Đêm đầu tiên để xem danh sách Sói; các đêm sau bạn ngủ suốt đêm và không tham gia cắn.',
      'Bạn không thể cắn người và không tính là Sói sống: nếu toàn bộ Sói thật chết hết, phe Dân thắng ngay dù bạn còn sống.',
      'Nếu phe Sói thắng chung cuộc, bạn vẫn được tính là thắng cùng họ dù bạn còn sống hay đã chết trước đó.',
    ],
  },
  sorcerer: {
    desc: 'Bạn thuộc phe Sói. Mỗi đêm bạn thức dậy riêng để soi xem một người có phải là Tiên tri thật hay không.',
    ruleNote: 'Bạn thức dậy riêng và không tham gia cắn người cùng bầy Sói.',
    winCond: 'Phe Ma sói giành chiến thắng chung cuộc',
    edgeCases: [
      'Màn hình chỉ trả lời đúng hai trường hợp: đúng là Tiên tri hoặc không phải Tiên tri. Soi vào ai khác cũng báo là không phải.',
      'Nếu Tiên tri thật của làng đã chết, bạn soi vào ai cũng sẽ ra kết quả là không phải.',
      'Nếu tất cả Sói cắn người chết hết, ván đấu kết thúc với chiến thắng cho phe Dân vì bạn không thể tự cắn người.',
    ],
  },
  cursed: {
    desc: 'Ban đầu bạn là Dân làng. Nếu bị Sói cắn vào ban đêm, bạn không chết mà sẽ biến thành Ma sói từ đêm hôm sau.',
    ruleNote: 'Trước khi bị cắn bạn thuộc phe Dân; sau khi bị cắn biến đổi, bạn chính thức theo phe Sói và đi cắn người mỗi đêm.',
    winCond: 'Phe Dân thắng (trước khi bị cắn) hoặc Phe Sói thắng (sau khi hóa Sói)',
    edgeCases: [
      'Nếu đêm bạn bị cắn mà được Bảo vệ đỡ hoặc Phù thủy cứu, vết cắn bị chặn nên bạn không bị hóa Sói.',
      'Đêm bạn bị cắn, Tiên tri soi vào bạn vẫn thấy Dân; từ đêm sau khi bạn đã hóa Sói thì soi mới ra Sói.',
      'Nếu bạn bị Phù thủy ném độc hoặc Thợ săn bắn, bạn chết luôn chứ không biến thành Sói.',
    ],
  },
  tanner: {
    desc: 'Bạn thuộc Phe thứ ba, chỉ thắng duy nhất khi bị cả làng bỏ phiếu treo cổ vào ban ngày.',
    ruleNote: 'Nhiệm vụ của bạn là nói chuyện sao cho mọi người nghi ngờ và vote treo cổ bạn.',
    winCond: 'Bị cả làng bỏ phiếu treo cổ vào ban ngày',
    edgeCases: [
      'Ngay khi bạn bị bỏ phiếu treo cổ, ván đấu dừng lại ngay và chỉ một mình bạn thắng cuộc. Cả Dân và Sói đều thua.',
      'Nếu bạn chết do Sói cắn, trúng độc Phù thủy, Thợ săn bắn hoặc chết theo người yêu Cupid, bạn thua cuộc và ván chơi vẫn tiếp tục.',
      'Nếu bạn nằm trong cặp đôi Cupid và bị treo cổ, bạn vẫn thắng cuộc ngay lập tức.',
    ],
  },
  pi: {
    desc: 'Bạn có một lần trong cả ván để chọn một người. Hệ thống sẽ báo xem trong ba người (người đó và hai người còn sống ngồi cạnh) có con Sói nào không.',
    ruleNote: 'Dùng xong một lần kỹ năng sẽ khóa lại. Hãy chọn lúc có nhiều người đáng ngờ ngồi cạnh nhau để soi.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Hai người ngồi cạnh được tính trên những người còn sống quanh bàn, tự động bỏ qua ghế của người đã chết.',
      'Nếu bàn chơi chỉ còn đúng ba người sống, kỹ năng này sẽ kiểm tra tất cả những người còn lại.',
      'Hệ thống chỉ báo có Sói hay không chứ không nói rõ ai là Sói. Sói trắng và Người lai sói cũng bị tính là Sói.',
      'Dùng xong một lần, nút bấm sẽ khóa. Những đêm sau hệ thống vẫn gọi tên bạn giả vờ để phe Sói không biết bạn hết phép.',
    ],
  },
  fox: {
    desc: 'Mỗi đêm bạn chọn một nhóm ba người còn sống ngồi cạnh nhau để soi. Nếu có ít nhất một Sói, bạn được soi tiếp đêm sau; nếu cả ba đều là Dân, bạn mất khả năng soi đến hết ván.',
    ruleNote: 'Nếu chưa chắc chắn, bạn có thể chọn bỏ qua không soi đêm đó để giữ an toàn cho kỹ năng.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Hai người hai bên chỉ tính trên những ai còn sống quanh bàn, tự động bỏ qua người đã chết.',
      'Khi soi trúng ba người toàn Dân, bạn mất phép từ đêm sau và thành dân thường. Hệ thống vẫn gọi tên bạn giả vờ để phe Sói không biết.',
      'Bạn có thể tự chọn chính mình làm người ở giữa để kiểm tra hai người ngồi cạnh mình.',
    ],
  },
  bear_tamer: {
    desc: 'Vào đầu mỗi buổi sáng, nếu có ít nhất một con Sói còn sống ngồi ngay cạnh bạn (bên trái hoặc bên phải), loa sẽ phát tiếng gấu gầm.',
    ruleNote: 'Bạn không thức dậy ban đêm. Hãy để ý xem ai ngồi cạnh mình để tìm manh mối khi gấu gầm.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Tiếng gầm chỉ phát ra sau khi đã giải quyết xong người chết ban đêm. Nếu người cạnh bạn vừa chết đêm qua, sáng nay gấu sẽ kiểm tra người sống tiếp theo ở cạnh bạn.',
      'Nếu bạn bị Sói cắn chết trong đêm, gấu sẽ im lặng vào sáng hôm sau.',
      'Nếu bạn bị Sói nguyền biến thành Sói, gấu ngửi thấy mùi Sói trên người bạn nên sáng nào nó cũng gầm.',
    ],
  },
  aura_seer: {
    desc: 'Mỗi đêm bạn soi một người để biết họ là Người thường (Dân thường hoặc Sói thường) hay có vai trò đặc biệt.',
    ruleNote: 'Dân thường và Sói thường đều báo là Người thường. Tất cả các vai còn lại đều báo là Đặc biệt.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Hệ thống chỉ báo Người thường cho Dân thường và Sói thường. Tất cả các vai khác (Bảo vệ, Thợ săn, Tiên tri, Sói con, Sói trắng...) đều là Đặc biệt.',
      'Nếu soi vào Kẻ say rượu ở hai đêm đầu, bạn chỉ thấy Người thường; từ Đêm 3 khi họ nhận vai đặc biệt, soi mới ra Đặc biệt.',
      'Khi bạn đã chết, ban đêm hệ thống vẫn gọi tên bạn giả vờ để giữ kín thông tin.',
    ],
  },
  apprentice_seer: {
    desc: 'Ban đầu bạn ngủ như Dân thường. Khi Tiên tri thật chết, từ đêm kế tiếp bạn sẽ nhận quyền soi thay cho Tiên tri.',
    ruleNote: 'Khi Tiên tri thật còn sống, bạn là dân thường. Hãy để ý xem ai là Tiên tri để sẵn sàng tiếp nhận vai trò.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Chừng nào Tiên tri thật còn sống, bạn ngủ suốt đêm và không có nút soi.',
      'Ngay từ đêm kế tiếp sau khi Tiên tri thật chết, bạn sẽ thức dậy ở đúng lượt của Tiên tri để soi tiếp.',
      'Khi Tiên tri thật soi bạn, họ thấy bạn là Dân; Tiên tri hào quang soi bạn thấy bạn là người Đặc biệt.',
    ],
  },
  mason: {
    desc: 'Thường có 2-3 người. Đêm đầu tiên các bạn thức dậy để biết mặt nhau, chắc chắn những người này đều là Dân làng.',
    ruleNote: 'Các bạn chỉ thức dậy cùng nhau ở Đêm đầu tiên; từ Đêm 2 trở đi ngủ suốt đêm như dân thường.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Các bạn chỉ thức dậy cùng nhau ở Đêm 1; từ Đêm 2 trở đi ngủ như dân thường.',
      'Nếu sau này có một người trong hội bị Sói nguyền biến thành Sói, những người còn lại sẽ không được hệ thống thông báo.',
    ],
  },
  rusty_knight: {
    desc: 'Nếu bạn bị Sói cắn chết vào ban đêm, con Sói còn sống ngồi gần bạn nhất về phía bên trái sẽ bị nhiễm bệnh và chết vào cuối đêm hôm sau.',
    ruleNote: 'Kỹ năng này chỉ hoạt động khi bạn chết do bị Sói cắn.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Chỉ phát tác khi bạn chết vì Sói cắn. Nếu bạn chết do bị treo cổ, trúng độc hoặc Thợ săn bắn, thanh kiếm không làm ai nhiễm bệnh.',
      'Nếu đêm bạn bị cắn mà được Phù thủy cứu sống, con Sói đó cũng không bị nhiễm bệnh.',
      'Hệ thống đếm theo vòng tròn chiều kim đồng hồ bắt đầu từ vị trí của bạn, bỏ qua người chết để tìm con Sói sống gần nhất.',
    ],
  },
  lone_wolf: {
    desc: 'Bạn đi cắn cùng bầy Sói mỗi đêm, nhưng bạn chỉ thắng nếu phe Sói thắng và chỉ còn lại duy nhất một mình bạn sống sót.',
    ruleNote: 'Bạn vừa phải giúp Sói cắn dân, vừa phải để dân làng treo cổ bớt các đồng đội Sói khác.',
    winCond: 'Phe Sói thắng và Lone Wolf là con Sói duy nhất còn sống',
    edgeCases: [
      'Nếu phe Sói thắng mà vẫn còn những con Sói khác cùng sống với bạn, bạn không đạt được mục tiêu cá nhân.',
      'Tiên tri soi bạn ra Ma sói; Tiên tri hào quang soi bạn ra Người thường như Sói thường.',
    ],
  },
  white_wolf: {
    desc: 'Bạn đi cắn cùng bầy Sói mỗi đêm. Cứ cách một đêm (như Đêm 2, Đêm 4), bạn lại được thức dậy riêng để giết một con Sói khác. Bạn thắng khi là người sống sót duy nhất.',
    ruleNote: 'Hãy phối hợp cắn dân ở đêm lẻ và bí mật giết Sói khác ở đêm chẵn.',
    winCond: 'Trở thành người chơi duy nhất còn sống sót trên bàn',
    edgeCases: [
      'Ở lượt dậy riêng vào các đêm chẵn, bạn chỉ được chọn mục tiêu là người thuộc phe Sói hoặc bấm bỏ qua.',
      'Nạn nhân bị bạn giết riêng không thể được cứu bởi bình cứu của Phù thủy và Bảo vệ cũng không đỡ được.',
      'Nếu cuối ván chỉ còn lại bạn và một người Dân, bạn thắng vì đêm sau bạn sẽ cắn chết người đó.',
    ],
  },
  elder: {
    desc: 'Bạn phải bị Sói cắn 2 lần mới chết. Nhưng nếu bạn bị dân làng treo cổ, trúng độc hoặc bị Thợ săn bắn, toàn bộ phe Dân sẽ mất hết kỹ năng.',
    ruleNote: 'Hãy nói rõ vai trò của mình khi bị nghi ngờ để dân làng không giết nhầm bạn.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Lần đầu bị Sói cắn, bạn chỉ mất một mạng giáp và sáng hôm sau làng vẫn bình yên. Bị cắn lần thứ hai bạn mới chết.',
      'Nếu bạn bị dân làng treo cổ, trúng độc hoặc Thợ săn bắn, bạn chết ngay lập tức. Toàn bộ Tiên tri, Bảo vệ, Phù thủy phe Dân sẽ mất hết phép.',
      'Khi phe Dân bị mất phép do Già làng chết oan, ban đêm hệ thống vẫn gọi tên các vai đó giả vờ để phe Sói không biết.',
    ],
  },
  village_idiot: {
    desc: 'Nếu bị cả làng bỏ phiếu treo cổ, bạn sẽ tự động lật bài để thoát chết. Từ lúc đó bạn không còn quyền bỏ phiếu nữa.',
    ruleNote: 'Sau khi lật bài, dân làng không thể treo cổ bạn thêm lần nào nữa.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Bạn chỉ thoát chết khi bị cả làng vote treo cổ ban ngày. Nếu bị Sói cắn, trúng độc hoặc Thợ săn bắn, bạn vẫn chết bình thường.',
      'Sau khi đã lật bài thoát chết một lần, dân làng không thể đưa bạn lên giàn treo cổ nữa.',
      'Dù không còn được bỏ phiếu, bạn vẫn được tính là một người dân còn sống khi đếm số lượng để xét thắng thua.',
    ],
  },
  wild_child: {
    desc: 'Đêm đầu tiên bạn chọn một người làm hình mẫu. Khi người đó còn sống thì bạn là Dân, nhưng nếu người đó chết thì bạn sẽ biến thành Ma sói.',
    ruleNote: 'Hãy bảo vệ hình mẫu của mình nếu bạn muốn ở lại phe Dân.',
    winCond: 'Phe Dân thắng (nếu hình mẫu còn sống) hoặc Phe Sói thắng (sau khi hóa Sói)',
    edgeCases: [
      'Bạn không được chọn chính mình làm hình mẫu.',
      'Bất kể hình mẫu chết vì lý do gì (bị cắn, bị treo cổ hay trúng độc), ngay khi họ chết bạn sẽ chuyển sang phe Sói và từ đêm sau đi cắn cùng đàn.',
      'Nếu bạn chết trước hình mẫu, bạn chết như một người dân bình thường.',
    ],
  },
  angel: {
    desc: 'Bạn thắng ngay nếu bị Sói cắn ở Đêm 1 hoặc bị treo cổ ở Ngày 1. Nếu sống qua Ngày 1, bạn trở thành Dân thường.',
    ruleNote: 'Hãy nói chuyện sao cho mọi người nghi ngờ và vote treo cổ bạn ở Ngày 1.',
    winCond: 'Bị loại ở Đêm 1 hoặc bị treo cổ ở Ngày 1',
    edgeCases: [
      'Bạn chỉ thắng nhanh ở chu kỳ đầu (Đêm 1 hoặc Ngày 1). Sau giờ vote Ngày 1 mà bạn vẫn sống, bạn thành Dân làng thường đến hết ván.',
      'Từ Đêm 2 trở đi, nếu bạn chết thì cũng tính như một người dân chết chứ không được thắng trận.',
    ],
  },
  pied_piper: {
    desc: 'Mỗi đêm bạn chọn thôi miên 2 người còn sống. Bạn thắng ngay khi tất cả những người còn sống (trừ bạn) đều đã bị thôi miên.',
    ruleNote: 'Dấu ấn thôi miên giữ nguyên qua từng đêm và không bị mất đi.',
    winCond: 'Toàn bộ người chơi còn sống (trừ Thổi sáo) đều đã bị thôi miên',
    edgeCases: [
      'Người bị thôi miên nhận thông báo kín trên máy nhưng không bị mất chức năng của mình.',
      'Điều kiện thắng kiểm tra sau mỗi cái chết: nếu bầy Sói cắn chết những người chưa bị thôi miên, sáng hôm sau bạn thắng ngay.',
      'Nếu bạn chết trước khi thôi miên hết cả làng, bạn thua cuộc và bùa thôi miên trên người khác không còn tác dụng.',
    ],
  },
  spellcaster: {
    desc: 'Mỗi đêm bạn chọn một người bị cấm nói vào ngày hôm sau. Người bị cấm nói không được lên tiếng nhưng vẫn được bỏ phiếu.',
    ruleNote: 'Hãy cấm nói người đang nói nhiều nhất hoặc người bạn nghi ngờ là Sói đang dẫn dắt dân làng.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Sáng hôm sau loa sẽ đọc tên người bị cấm nói để cả làng cùng biết. Người này chỉ được ra hiệu bằng tay, không được nói.',
      'Người bị cấm nói vẫn được bấm nút bỏ phiếu treo cổ bình thường.',
      'Dù bạn bị Sói cắn chết trong đêm, người bạn vừa chọn đêm đó vẫn bị cấm nói vào ngày hôm sau.',
    ],
  },
  troublemaker: {
    desc: 'Bạn có một lần trong cả ván bấm kích hoạt vào ban đêm. Ngày hôm sau cả làng sẽ phải bỏ phiếu treo cổ hai lần liên tiếp.',
    ruleNote: 'Hãy dùng quyền năng này khi làng đang nghi ngờ nhiều người và cần xử lý nhanh.',
    winCond: 'Tiêu diệt hết Ma sói',
    edgeCases: [
      'Sáng hôm sau sẽ có hai lượt vote riêng biệt: cả làng thảo luận và treo cổ người thứ nhất xong rồi mới bước vào lượt vote người thứ hai.',
      'Nếu ở lượt vote đầu tiên làng treo cổ trúng Kẻ chán đời (Tanner), trò chơi dừng lại ngay và Tanner thắng, lượt vote thứ hai bị hủy.',
      'Nếu ở lượt đầu người bị vote là Hoàng tử hoặc Thằng ngốc và họ lật bài thoát chết, cả làng vẫn tiếp tục bước vào lượt vote thứ hai.',
    ],
  },
  wolf_accursed: {
    desc: 'Đi cắn cùng bầy Sói mỗi đêm. Bạn có một lần trong cả ván để biến người vừa bị cắn thành Ma sói thay vì giết chết họ.',
    ruleNote: 'Hãy nguyền những người có vai trò quan trọng của phe Dân để biến họ thành đồng đội.',
    winCond: 'Số Sói bằng hoặc nhiều hơn số Dân',
    edgeCases: [
      'Sau khi bầy Sói chọn xong người cắn, màn hình của bạn sẽ hiện nút hỏi có muốn nguyền rủa người đó không.',
      'Nếu người đó đã được Bảo vệ che chắn từ trước, phép nguyền bị chặn, bạn mất lượt nguyền và người đó không hóa Sói.',
      'Người bị nguyền thành công sẽ không chết; sáng ra làng có một đêm bình yên. Từ đêm sau, người đó mất hết kỹ năng cũ và đi cắn cùng bầy Sói.',
    ],
  },
  big_bad_wolf: {
    desc: 'Đi cắn cùng bầy Sói mỗi đêm. Khi chưa có con Sói nào trong đàn chết, bạn được thức dậy thêm một lượt riêng để cắn thêm một người nữa.',
    ruleNote: 'Hãy cố gắng bảo vệ đồng đội sống sót để bạn tiếp tục được cắn hai người mỗi đêm.',
    winCond: 'Số Sói bằng hoặc nhiều hơn số Dân',
    edgeCases: [
      'Ngay khi có một con Sói trong đàn bị chết (do treo cổ, bị bắn hay trúng độc), bạn mất vĩnh viễn lượt cắn riêng này.',
      'Ở lượt cắn riêng, bạn không được chọn trùng với người mà bầy Sói vừa cắn trước đó.',
      'Nếu Phù thủy dùng bình cứu diện rộng, Phù thủy có thể cứu sống cả hai người trong đêm đó.',
    ],
  },
  dire_wolf: {
    desc: 'Đêm đầu tiên bạn chọn một người làm bạn đồng hành. Nếu người đó chết thì bạn sẽ chết theo ngay lập tức.',
    ruleNote: 'Liên kết này là một chiều: bạn chết thì người đó không sao, nhưng họ chết thì bạn chết theo.',
    winCond: 'Số Sói bằng hoặc nhiều hơn số Dân',
    edgeCases: [
      'Bạn đồng hành chết thì bạn chết theo, nhưng nếu bạn chết thì bạn đồng hành không bị ảnh hưởng.',
      'Người được chọn hoàn toàn không biết mình là bạn đồng hành của bạn.',
      'Ban đêm bạn đi cắn cùng bầy Sói và phải tìm cách để đàn không cắn nhầm bạn đồng hành của mình.',
    ],
  },
  doppelganger: {
    desc: 'Đêm đầu tiên bạn chọn một người làm bản sao. Khi người đó còn sống thì bạn là Dân thường; khi người đó chết, bạn sẽ nhận vai trò và kỹ năng của họ.',
    ruleNote: 'Hãy để ý xem người bạn chọn đang chơi vai gì để sẵn sàng nhận vai khi họ chết.',
    winCond: 'Thắng theo phe của người mà bạn sao chép sau khi họ chết',
    edgeCases: [
      'Chừng nào người bạn chọn còn sống, bạn chỉ là dân thường.',
      'Ngay khi người đó chết, bạn sẽ nhận vai của họ từ thời điểm tiếp theo. Nếu họ là Sói, bạn hóa Sói đi cắn đêm; nếu họ là Phù thủy, bạn nhận lại số bình thuốc họ chưa dùng.',
      'Nếu bạn chết trước người bạn sao chép, bạn chết như một người dân bình thường.',
    ],
  },
  cult_leader: {
    desc: 'Mỗi đêm bạn chọn kéo một người vào giáo phái. Bạn thắng ngay khi tất cả những người còn sống đều đã vào giáo phái.',
    ruleNote: 'Hãy kết nạp những người có khả năng sống sót lâu nhất qua từng đêm.',
    winCond: 'Toàn bộ người chơi còn sống đều đã gia nhập Giáo phái',
    edgeCases: [
      'Người vào giáo phái vẫn giữ nguyên vai trò và kỹ năng ban đêm của họ, chỉ có thêm dấu ấn giáo phái trên máy.',
      'Hệ thống kiểm tra chiến thắng sau mỗi cái chết: nếu Sói cắn chết những người ngoài giáo phái khiến chỉ còn lại tín đồ, bạn thắng ngay sáng hôm đó.',
      'Nếu bạn chết, giáo phái giải tán và bạn thua; các thành viên quay lại thi đấu vì phe ban đầu của họ.',
    ],
  },
  hoodlum: {
    desc: 'Đêm đầu tiên bạn bí mật chọn hai người. Khi ván đấu kết thúc, nếu cả hai người này đều đã chết và bạn vẫn còn sống thì bạn thắng.',
    ruleNote: 'Bạn không thể tự giết người ban đêm; hãy dùng lời nói ban ngày để hướng dân làng treo cổ hai kẻ thù của mình.',
    winCond: 'Cả 2 mục tiêu đã chết và Hoodlum vẫn còn sống khi ván đấu kết thúc',
    edgeCases: [
      'Bạn không có vũ khí ban đêm; bạn phải tìm cách thuyết phục ban ngày để làng treo cổ hoặc để Sói cắn hai người bạn chọn.',
      'Khi ván đấu kết thúc (dù phe Dân hay Sói thắng), nếu cả hai người bạn chọn đều đã chết và bạn còn sống, bạn sẽ thắng.',
      'Nếu một trong hai người đó còn sống, hoặc bạn chết trước khi ván kết thúc, bạn thua cuộc.',
    ],
  },
  drunk: {
    desc: 'Ban đầu bạn tưởng mình là Dân làng. Đến đầu Đêm 3 bạn mới tỉnh rượu và mở khóa vai trò thật sự của mình.',
    ruleNote: 'Hai đêm đầu bạn cứ chơi như dân thường. Hãy chuẩn bị tinh thần nhận vai thật ở Đêm 3.',
    winCond: 'Theo vai trò thật sau khi tỉnh rượu ở Đêm 3',
    edgeCases: [
      'Khi có Kẻ say rượu, lúc chia bài hệ thống sẽ để thừa ra một lá bài úp ngầm làm vai thật cho bạn.',
      'Ở hai đêm và hai ngày đầu tiên, bạn là Dân làng; Tiên tri soi vào bạn cũng thấy Dân làng.',
      'Đầu Đêm 3, màn hình của bạn sẽ hiện vai trò thật. Nếu là Sói, bạn thức dậy đi cắn cùng đàn; nếu là Tiên tri, bạn bắt đầu được soi.',
      'Nếu bạn chết trước Đêm 3, bạn chết như một người dân thường và không bao giờ biết vai thật của mình.',
    ],
  },
};

function getFriendlyWakeFrequency(freq: RoleDefinition['wakeFrequency'], id: string): WakeFrequency {
  if (id === 'bear_tamer') return 'Bị động đầu ngày';
  if (id === 'apprentice_seer') return 'Khi Tiên tri chết';
  if (id === 'dream_wolf') return 'Khi Sói chết';
  if (id === 'drunk') return 'Đầu Đêm 3';
  if (id === 'white_wolf') return 'Cách 1 đêm';
  if (id === 'pi' || id === 'troublemaker') return 'Dùng 1 lần trong ván';

  switch (freq) {
    case 'NEVER':
      return 'Ngủ suốt đêm';
    case 'FIRST_NIGHT_ONLY':
      return 'Đêm 1';
    case 'EVERY_NIGHT':
      return 'Mỗi đêm';
    case 'EVERY_OTHER_NIGHT':
      return 'Cách 1 đêm';
    case 'ON_DEATH':
      return 'Khi chết';
    case 'CONDITIONAL':
      return 'Dùng 1 lần trong ván';
    default:
      return 'Mỗi đêm';
  }
}

function getFriendlySeerResult(result: RoleDefinition['seerResult'], id: string): string {
  if (id === 'lycan') return 'Ma Sói (máu sói)';
  if (id === 'minion') return 'Dân Làng (ẩn mình)';
  if (id === 'cursed') return 'Dân (trước cắn) · Sói (sau cắn)';
  if (id === 'wild_child') return 'Dân (trước hóa) · Sói (sau hóa)';
  if (id === 'drunk') return 'Dân (Đêm 1-2) · Theo vai thật (Đêm 3+)';
  if (id === 'aura_seer') return 'Dân Làng';
  return result === 'WEREWOLF' ? 'Ma Sói' : 'Dân Làng';
}

function getSideLabel(faction: RoleDefinition['faction'], id: string): string {
  if (id === 'cursed' || id === 'wild_child') return 'Phe Dân · Đổi thành Sói';
  if (id === 'minion' || id === 'sorcerer') return 'Phe Ma Sói (trợ thủ)';
  if (id === 'white_wolf') return 'Phe Thứ 3 (Sói trắng)';
  if (id === 'cupid') return 'Phe Dân · Ghép Cặp đôi';

  switch (faction) {
    case 'VILLAGER':
      return 'Phe Dân Làng';
    case 'WEREWOLF':
      return 'Phe Ma Sói';
    case 'THIRD_PARTY':
      return 'Phe Thứ 3';
    default:
      return 'Phe Dân Làng';
  }
}

function getSide(faction: RoleDefinition['faction']): RoleSide {
  switch (faction) {
    case 'VILLAGER':
      return 'village';
    case 'WEREWOLF':
      return 'wolf';
    case 'THIRD_PARTY':
      return 'third';
    default:
      return 'village';
  }
}

function getPackLabel(pack: RoleDefinition['pack']): string {
  switch (pack) {
    case 'BASIC':
      return 'Gói Cơ Bản';
    case 'DEDUCTION':
      return 'Gói Suy Luận';
    case 'CHAOS':
      return 'Gói Hỗn Loạn';
    default:
      return 'Gói Cơ Bản';
  }
}

export const gameRoles: GameRole[] = ROLES.map((role) => {
  const visual = ROLE_VISUALS[role.id] ?? { symbol: '✨', auraColor: 'var(--twilight, #4d476f)' };
  const humanized = HUMANIZED_ROLE_DATA[role.id] ?? {
    desc: role.shortDesc,
    ruleNote: 'Tuân thủ hiệu lệnh quản trò.',
    winCond: role.faction === 'WEREWOLF' ? 'Phe Sói thắng' : 'Phe Dân thắng',
    edgeCases: role.edgeCases,
  };

  return {
    id: role.id,
    name: role.nameVi,
    nameEn: role.nameEn,
    symbol: visual.symbol,
    side: getSide(role.faction),
    sideLabel: getSideLabel(role.faction, role.id),
    pack: role.pack,
    packLabel: getPackLabel(role.pack),
    balanceWeight: role.balanceWeight,
    seerResult: getFriendlySeerResult(role.seerResult, role.id),
    wakeFrequency: getFriendlyWakeFrequency(role.wakeFrequency, role.id),
    winCondition: humanized.winCond,
    description: humanized.desc,
    roomRuleNote: humanized.ruleNote,
    edgeCases: humanized.edgeCases,
    auraColor: visual.auraColor,
  };
});

export const GAME_ROLES_BY_ID: Record<string, GameRole> = Object.fromEntries(
  gameRoles.map((role) => [role.id, role])
);
