import { describe, expect, it } from 'bun:test';
import { audioController, NARRATION_PROMPTS } from '../audioController';
import { requestWakeLock, releaseWakeLock } from '../../utils/wakeLock';

describe('AudioController & Fallbacks', () => {
  it('định nghĩa đầy đủ các câu lệnh phụ đề lời dẫn cho các lượt gọi vai', () => {
    expect(NARRATION_PROMPTS.night_start).toBeDefined();
    expect(NARRATION_PROMPTS.wolf_pack).toBeDefined();
    expect(NARRATION_PROMPTS.seer).toBeDefined();
    expect(NARRATION_PROMPTS.witch).toBeDefined();
    expect(NARRATION_PROMPTS.bodyguard).toBeDefined();
    expect(NARRATION_PROMPTS.minion).toBeDefined();
    expect(NARRATION_PROMPTS.night_end).toBeDefined();
    expect(NARRATION_PROMPTS.day_discuss).toBeDefined();

    expect(NARRATION_PROMPTS.night_wild_child).toBeDefined();
    expect(NARRATION_PROMPTS.night_wild_child.subtitle).toBe(
      'Đứa con hoang hãy thức dậy và chọn một người làm thần tượng.'
    );
    expect(NARRATION_PROMPTS.night_hoodlum).toBeDefined();
    expect(NARRATION_PROMPTS.night_hoodlum.subtitle).toBe(
      'Du côn hãy thức dậy và chọn hai kẻ thù cần trừ khử.'
    );
    expect(NARRATION_PROMPTS.night_mason).toBeDefined();
    expect(NARRATION_PROMPTS.night_mason.subtitle).toBe(
      'Hội Tam Điểm hãy cùng mở mắt nhận diện anh em.'
    );
    expect(NARRATION_PROMPTS.night_dire_wolf).toBeDefined();
    expect(NARRATION_PROMPTS.night_dire_wolf.subtitle).toBe(
      'Sói tuyết hãy thức dậy và chọn một người làm bạn đồng hành.'
    );

    expect(NARRATION_PROMPTS.night_wolf_accursed).toBeDefined();
    expect(NARRATION_PROMPTS.night_wolf_accursed.subtitle).toBe(
      'Sói nguyền hãy thức dậy. Bạn có muốn truyền nọc độc biến nạn nhân thành Ma Sói không?'
    );
    expect(NARRATION_PROMPTS.night_wolf_accursed.durationMs).toBe(6000);
    expect(NARRATION_PROMPTS.wolf_accursed).toBeDefined();
    expect(NARRATION_PROMPTS.wolf_accursed.subtitle).toBe(
      'Sói nguyền hãy thức dậy. Bạn có muốn truyền nọc độc biến nạn nhân thành Ma Sói không?'
    );
    expect(NARRATION_PROMPTS.wolf_accursed.durationMs).toBe(6000);

    expect(NARRATION_PROMPTS.night_big_bad_wolf).toBeDefined();
    expect(NARRATION_PROMPTS.night_big_bad_wolf.subtitle).toBe(
      'Sói đại ca hãy thức dậy và chọn thêm một nạn nhân để cắn xé.'
    );
    expect(NARRATION_PROMPTS.night_big_bad_wolf.durationMs).toBe(6000);
    expect(NARRATION_PROMPTS.big_bad_wolf).toBeDefined();
    expect(NARRATION_PROMPTS.big_bad_wolf.subtitle).toBe(
      'Sói đại ca hãy thức dậy và chọn thêm một nạn nhân để cắn xé.'
    );
    expect(NARRATION_PROMPTS.big_bad_wolf.durationMs).toBe(6000);

    // Phase 4: 6 vai Dân Làng Điều tra & Can thiệp
    expect(NARRATION_PROMPTS.night_aura_seer).toBeDefined();
    expect(NARRATION_PROMPTS.night_aura_seer.subtitle).toBe(
      'Tiên tri hào quang hãy thức dậy và quan sát vầng hào quang.'
    );
    expect(NARRATION_PROMPTS.night_aura_seer.durationMs).toBe(6000);
    expect(NARRATION_PROMPTS.aura_seer).toBeDefined();
    expect(NARRATION_PROMPTS.aura_seer.subtitle).toBe(
      'Tiên tri hào quang hãy thức dậy và quan sát vầng hào quang.'
    );
    expect(NARRATION_PROMPTS.aura_seer.durationMs).toBe(6000);

    expect(NARRATION_PROMPTS.night_pi).toBeDefined();
    expect(NARRATION_PROMPTS.night_pi.subtitle).toBe(
      'Thám tử hãy thức dậy và điều tra nghi phạm.'
    );
    expect(NARRATION_PROMPTS.night_pi.durationMs).toBe(6000);
    expect(NARRATION_PROMPTS.pi).toBeDefined();
    expect(NARRATION_PROMPTS.pi.subtitle).toBe(
      'Thám tử hãy thức dậy và điều tra nghi phạm.'
    );
    expect(NARRATION_PROMPTS.pi.durationMs).toBe(6000);

    expect(NARRATION_PROMPTS.night_fox).toBeDefined();
    expect(NARRATION_PROMPTS.night_fox.subtitle).toBe(
      'Con cáo hãy thức dậy và đánh hơi tìm bầy Sói.'
    );
    expect(NARRATION_PROMPTS.night_fox.durationMs).toBe(6000);
    expect(NARRATION_PROMPTS.fox).toBeDefined();
    expect(NARRATION_PROMPTS.fox.subtitle).toBe(
      'Con cáo hãy thức dậy và đánh hơi tìm bầy Sói.'
    );
    expect(NARRATION_PROMPTS.fox.durationMs).toBe(6000);

    expect(NARRATION_PROMPTS.night_spellcaster).toBeDefined();
    expect(NARRATION_PROMPTS.night_spellcaster.subtitle).toBe(
      'Người phù phép hãy thức dậy và chọn một người câm lặng hôm nay.'
    );
    expect(NARRATION_PROMPTS.night_spellcaster.durationMs).toBe(6000);
    expect(NARRATION_PROMPTS.spellcaster).toBeDefined();
    expect(NARRATION_PROMPTS.spellcaster.subtitle).toBe(
      'Người phù phép hãy thức dậy và chọn một người câm lặng hôm nay.'
    );
    expect(NARRATION_PROMPTS.spellcaster.durationMs).toBe(6000);

    expect(NARRATION_PROMPTS.night_troublemaker).toBeDefined();
    expect(NARRATION_PROMPTS.night_troublemaker.subtitle).toBe(
      'Kẻ phá rối hãy thức dậy. Bạn có muốn kích hoạt gây hỗn loạn không?'
    );
    expect(NARRATION_PROMPTS.night_troublemaker.durationMs).toBe(6000);
    expect(NARRATION_PROMPTS.troublemaker).toBeDefined();
    expect(NARRATION_PROMPTS.troublemaker.subtitle).toBe(
      'Kẻ phá rối hãy thức dậy. Bạn có muốn kích hoạt gây hỗn loạn không?'
    );
    expect(NARRATION_PROMPTS.troublemaker.durationMs).toBe(6000);

    // Phase 5: 4 vai Phe Thứ Ba & Biến đổi Động
    expect(NARRATION_PROMPTS.night_doppelganger).toBeDefined();
    expect(NARRATION_PROMPTS.night_doppelganger.subtitle).toBe(
      'Nhân bản hãy thức dậy và chọn một người làm bản sao.'
    );
    expect(NARRATION_PROMPTS.night_doppelganger.durationMs).toBe(6000);
    expect(NARRATION_PROMPTS.doppelganger).toBeDefined();
    expect(NARRATION_PROMPTS.doppelganger.subtitle).toBe(
      'Nhân bản hãy thức dậy và chọn một người làm bản sao.'
    );
    expect(NARRATION_PROMPTS.doppelganger.durationMs).toBe(6000);

    expect(NARRATION_PROMPTS.night_pied_piper).toBeDefined();
    expect(NARRATION_PROMPTS.night_pied_piper.subtitle).toBe(
      'Người thổi sáo hãy thức dậy và cất lên khúc nhạc mê hoặc.'
    );
    expect(NARRATION_PROMPTS.night_pied_piper.durationMs).toBe(6000);
    expect(NARRATION_PROMPTS.pied_piper).toBeDefined();
    expect(NARRATION_PROMPTS.pied_piper.subtitle).toBe(
      'Người thổi sáo hãy thức dậy và cất lên khúc nhạc mê hoặc.'
    );
    expect(NARRATION_PROMPTS.pied_piper.durationMs).toBe(6000);

    expect(NARRATION_PROMPTS.night_cult_leader).toBeDefined();
    expect(NARRATION_PROMPTS.night_cult_leader.subtitle).toBe(
      'Trưởng giáo phái hãy thức dậy và tìm kiếm tín đồ mới.'
    );
    expect(NARRATION_PROMPTS.night_cult_leader.durationMs).toBe(6000);
    expect(NARRATION_PROMPTS.cult_leader).toBeDefined();
    expect(NARRATION_PROMPTS.cult_leader.subtitle).toBe(
      'Trưởng giáo phái hãy thức dậy và tìm kiếm tín đồ mới.'
    );
    expect(NARRATION_PROMPTS.cult_leader.durationMs).toBe(6000);

    expect(NARRATION_PROMPTS.night_drunk).toBeDefined();
    expect(NARRATION_PROMPTS.night_drunk.subtitle).toBe(
      'Kẻ say rượu, cơn say vẫn còn nồng, hãy tiếp tục ngủ say.'
    );
    expect(NARRATION_PROMPTS.night_drunk.durationMs).toBe(5000);
    expect(NARRATION_PROMPTS.drunk).toBeDefined();
    expect(NARRATION_PROMPTS.drunk.subtitle).toBe(
      'Kẻ say rượu, cơn say vẫn còn nồng, hãy tiếp tục ngủ say.'
    );
    expect(NARRATION_PROMPTS.drunk.durationMs).toBe(5000);

    // Apprentice Seer dùng chung lời thoại của Seer
    expect(NARRATION_PROMPTS.apprentice_seer).toBeDefined();
    expect(NARRATION_PROMPTS.apprentice_seer.audioKey).toBe('seer');
    expect(NARRATION_PROMPTS.apprentice_seer.subtitle).toBe(
      'Tiên tri, hãy thức dậy và chọn một người để soi phe.'
    );

    expect(NARRATION_PROMPTS.wolf_pack.subtitle).toContain('Ma Sói');
    expect(NARRATION_PROMPTS.seer.subtitle).toContain('Tiên tri');
    expect(NARRATION_PROMPTS.minion.subtitle).toContain('Kẻ phản bội');
  });

  it('lắng nghe và cập nhật phụ đề qua listener subscription', () => {
    let captured = '';
    const unsub = audioController.subscribeSubtitle((sub) => {
      captured = sub;
    });

    audioController.playTurnNarration('seer');
    expect(captured).toBe(NARRATION_PROMPTS.seer.subtitle);

    unsub();
  });

  it('bật và tắt mute âm thanh chính xác', () => {
    const initial = audioController.getIsMuted();
    const toggled = audioController.toggleMute();
    expect(toggled).toBe(!initial);
    const back = audioController.toggleMute();
    expect(back).toBe(initial);
  });

  it('chạy chuyển lượt mượt mà khi thiếu file MP3 (fallback an toàn không crash)', () => {
    let finished = false;
    audioController.playTurnNarration('unknown_turn_key', () => {
      finished = true;
    });
    expect(finished).toBe(true);
  });

  it('phát transition chime an toàn không crash khi thiếu Web Audio', () => {
    expect(() => audioController.playTransitionChime()).not.toThrow();
  });

  it('theo dõi và phát thông báo trạng thái AudioStatus (blocked, unlocked, interrupted)', () => {
    let currentStatus = audioController.getAudioStatus();
    const unsub = audioController.subscribeAudioStatus((status) => {
      currentStatus = status;
    });

    audioController.setAudioStatus('blocked');
    expect(currentStatus).toBe('blocked');

    audioController.setAudioStatus('unlocked');
    expect(currentStatus).toBe('unlocked');

    unsub();
  });

  it('chống phát đúp câu lệnh khi cùng một turnKey được gọi nhiều lần và cho phép force replay', () => {
    let callCount = 0;
    audioController.playTurnNarration('cupid', () => {
      callCount += 1;
    });
    expect(callCount).toBe(1);

    // Lần gọi thứ 2 với cùng turnKey mà không force -> không đọc đúp
    audioController.playTurnNarration('cupid', () => {
      callCount += 1;
    });
    expect(callCount).toBe(2);

    // Lần gọi thứ 3 với force = true -> chấp nhận replay
    audioController.playTurnNarration('cupid', () => {
      callCount += 1;
    }, true);
    expect(callCount).toBe(3);
  });

  it('dọn sạch toàn bộ âm thanh và reset cờ khi gọi stopAll()', () => {
    audioController.playNightBGM();
    audioController.duckBGM(true);
    audioController.stopAll();

    expect(audioController.getCurrentSubtitle()).toBe('');
  });
});

describe('Screen Wake Lock Utility', () => {
  it('không gây lỗi khi môi trường không hỗ trợ wake lock (graceful degradation)', async () => {
    const res = await requestWakeLock();
    expect(typeof res).toBe('boolean');

    await releaseWakeLock();
  });
});
