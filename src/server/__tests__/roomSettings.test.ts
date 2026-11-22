import { describe, expect, it } from 'bun:test';
import { RoomService } from '../roomService';
import type { RoomSettings } from '../../engine/types';

describe('Realtime Backend - Room Settings Customization', () => {
  it('cập nhật partial settings cho tất cả 10 tùy chọn luật thành công', () => {
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
    expect(room?.settings.ghostMode).toBe(false);

    // Update settings: customize some options
    const patch: Partial<RoomSettings> = {
      allowWolfSkip: true,
      allowWolfFriendlyFire: true,
      allowWitchSelfHeal: false,
      witchKnowsVictim: false,
      witchHealMode: 'SINGLE',
      witchWasteHealOnEmpty: true,
      hasMayor: true,
      tieVoteMode: 'RUNOFF',
      revealOnDeath: true,
      ghostMode: true,
    };

    const updated = service.updateSettings(created.roomCode, created.hostToken, patch);

    expect(updated.allowWolfSkip).toBe(true);
    expect(updated.allowWolfFriendlyFire).toBe(true);
    expect(updated.allowWitchSelfHeal).toBe(false);
    expect(updated.witchKnowsVictim).toBe(false);
    expect(updated.witchHealMode).toBe('SINGLE');
    expect(updated.witchWasteHealOnEmpty).toBe(true);
    expect(updated.hasMayor).toBe(true);
    expect(updated.tieVoteMode).toBe('RUNOFF');
    expect(updated.revealOnDeath).toBe(true);
    expect(updated.ghostMode).toBe(true);
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

    // Host tùy chỉnh 3 luật
    service.updateSettings(created.roomCode, created.hostToken, {
      allowWolfSkip: true,
      hasMayor: true,
      witchHealMode: 'SINGLE',
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
    expect(room.settings.allowWolfSkip).toBe(true);
    expect(room.settings.hasMayor).toBe(true);
    expect(room.settings.witchHealMode).toBe('SINGLE');
    expect(room.settings.allowWitchSelfHeal).toBe(true); // default preserved
  });
});
