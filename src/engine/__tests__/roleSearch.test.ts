import { describe, expect, it } from 'bun:test';
import {
  getAcronym,
  removeVietnameseTones,
  searchRoles,
} from '../roleSearch';
import { ROLES } from '../roles';

describe('roleSearch - Normalization Utilities', () => {
  it('loại bỏ chuẩn xác các dấu tiếng Việt', () => {
    expect(removeVietnameseTones('Sói chiêm bao')).toBe('soi chiem bao');
    expect(removeVietnameseTones('Phù thủy')).toBe('phu thuy');
    expect(removeVietnameseTones('Kẻ chán đời')).toBe('ke chan doi');
    expect(removeVietnameseTones('Thợ săn')).toBe('tho san');
    expect(removeVietnameseTones('Bảo vệ')).toBe('bao ve');
  });

  it('tạo mã viết tắt acronym chính xác từ các chữ cái đầu', () => {
    expect(getAcronym('Phù thủy')).toBe('pt');
    expect(getAcronym('Tiên tri')).toBe('tt');
    expect(getAcronym('Bảo vệ')).toBe('bv');
    expect(getAcronym('Sói con')).toBe('sc');
    expect(getAcronym('Thợ săn')).toBe('ts');
    expect(getAcronym('Sói chiêm bao')).toBe('scb');
    expect(getAcronym('Kẻ chán đời')).toBe('kcd');
  });
});

describe('roleSearch - 4-Tier Pragmatic Search Engine', () => {
  it('Tầng 1: Khớp chính xác tên tiếng Việt, tiếng Anh và Acronym (1000đ)', () => {
    // Exact Vietnamese
    const r1 = searchRoles(ROLES, 'Phù thủy');
    expect(r1[0].role.id).toBe('witch');

    // Exact English (Bảo toàn tiếng Anh, không bị phá bởi telex)
    const r2 = searchRoles(ROLES, 'witch');
    expect(r2[0].role.id).toBe('witch');
    expect(r2[0].reason?.type).toBe('english');

    const r3 = searchRoles(ROLES, 'seer');
    expect(r3[0].role.id).toBe('seer');

    const r4 = searchRoles(ROLES, 'hunter');
    expect(r4[0].role.id).toBe('hunter');

    // Exact Acronyms
    const rPt = searchRoles(ROLES, 'pt');
    expect(rPt[0].role.id).toBe('witch');
    expect(rPt[0].reason?.type).toBe('acronym');

    const rTt = searchRoles(ROLES, 'tt');
    expect(rTt[0].role.id).toBe('seer');

    const rBv = searchRoles(ROLES, 'bv');
    expect(rBv[0].role.id).toBe('bodyguard');

    const rSc = searchRoles(ROLES, 'sc');
    expect(rSc[0].role.id).toBe('wolf_cub');

    const rTs = searchRoles(ROLES, 'ts');
    expect(rTs[0].role.id).toBe('hunter');

    const rKcd = searchRoles(ROLES, 'kcd');
    expect(rKcd[0].role.id).toBe('tanner');
  });

  it('Tầng 2: Khớp đầu từ - Ma sói cơ bản LUÔN đứng số 1 khi tìm "sói"', () => {
    const results = searchRoles(ROLES, 'sói');
    expect(results.length).toBeGreaterThanOrEqual(2);

    // "Ma sói" phải đứng đầu tiên (trước "Sói con", "Sói chiêm bao", "Sói trắng")
    expect(results[0].role.id).toBe('werewolf');
    expect(results[1].role.id).toBe('wolf_cub');
  });

  it('Tầng 3: Khớp viết liền không dấu hoặc substring', () => {
    const r1 = searchRoles(ROLES, 'masoi');
    expect(r1[0].role.id).toBe('werewolf');

    const r2 = searchRoles(ROLES, 'phuthuy');
    expect(r2[0].role.id).toBe('witch');

    const r3 = searchRoles(ROLES, 'tientri');
    expect(r3[0].role.id).toBe('seer');
  });

  it('Tầng 4: Khớp từ khóa kỹ năng / hành động (Semantic Aliases)', () => {
    // "bắn" / "súng" -> Thợ săn kèm Match Reason
    const r1 = searchRoles(ROLES, 'bắn');
    expect(r1[0].role.id).toBe('hunter');
    expect(r1[0].reason?.type).toBe('alias');
    expect(r1[0].reason?.value).toBe('bắn');

    const r2 = searchRoles(ROLES, 'súng');
    expect(r2[0].role.id).toBe('hunter');

    // "cứu" / "thuốc" / "độc" -> Phù thủy
    const r3 = searchRoles(ROLES, 'thuốc');
    expect(r3[0].role.id).toBe('witch');

    const r4 = searchRoles(ROLES, 'cứu');
    expect(r4[0].role.id).toBe('witch');

    // "2 mạng" -> Già làng
    const r5 = searchRoles(ROLES, '2 mạng');
    expect(r5[0].role.id).toBe('elder');

    // "tự tử" -> Kẻ chán đời
    const r6 = searchRoles(ROLES, 'tự tử');
    expect(r6[0].role.id).toBe('tanner');

    // "ghép đôi" -> Thần tình yêu
    const r7 = searchRoles(ROLES, 'ghép đôi');
    expect(r7[0].role.id).toBe('cupid');
  });

  it('Không phá hỏng các từ tiếng Anh có chứa ký tự w, s, r, t', () => {
    expect(searchRoles(ROLES, 'wolf')[0].role.id).toBe('werewolf');
    expect(searchRoles(ROLES, 'white wolf')[0].role.id).toBe('white_wolf');
    expect(searchRoles(ROLES, 'tanner')[0].role.id).toBe('tanner');
  });

  it('Lọc chính xác theo Faction và onlyImplemented', () => {
    const supportedOnly = searchRoles(ROLES, '', { onlyImplemented: true });
    expect(supportedOnly.every((r) => r.role.implementedInEngine)).toBe(true);

    const werewolves = searchRoles(ROLES, '', { faction: 'WEREWOLF' });
    expect(werewolves.every((r) => r.role.faction === 'WEREWOLF')).toBe(true);
  });
});
