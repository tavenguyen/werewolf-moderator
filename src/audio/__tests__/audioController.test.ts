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
});

describe('Screen Wake Lock Utility', () => {
  it('không gây lỗi khi môi trường không hỗ trợ wake lock (graceful degradation)', async () => {
    const res = await requestWakeLock();
    expect(typeof res).toBe('boolean');

    await releaseWakeLock();
  });
});
