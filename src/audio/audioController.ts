import { Howl, Howler } from 'howler';

export type AudioStatus = 'unlocked' | 'blocked' | 'interrupted';

export interface NarrationPrompt {
  audioKey: string;
  subtitle: string;
  durationMs?: number;
}

export const NARRATION_PROMPTS: Record<string, NarrationPrompt> = {
  night_start: {
    audioKey: 'night_start',
    subtitle: 'Đêm đã buông xuống, cả làng nhắm mắt đi ngủ.',
    durationMs: 4000,
  },
  cupid: {
    audioKey: 'cupid',
    subtitle: 'Cupid thức dậy, chọn hai người để ghép đôi.',
    durationMs: 6000,
  },
  lovers: {
    audioKey: 'lovers',
    subtitle: 'Hai người yêu nhau mở mắt nhận diện nhau.',
    durationMs: 5000,
  },
  bodyguard: {
    audioKey: 'bodyguard',
    subtitle: 'Bảo vệ thức dậy, chọn một người để bảo vệ đêm nay.',
    durationMs: 6000,
  },
  wolf_pack: {
    audioKey: 'wolf_pack',
    subtitle: 'Bầy Ma Sói thức dậy, nhận diện đồng đội và thống nhất cắn một người.',
    durationMs: 8000,
  },
  white_wolf: {
    audioKey: 'white_wolf',
    subtitle: 'Sói Trắng thức dậy, chọn một con Sói để cắn nếu muốn.',
    durationMs: 6000,
  },
  night_wild_child: {
    audioKey: 'night_wild_child',
    subtitle: 'Đứa con hoang thức dậy, chọn người làm thần tượng.',
    durationMs: 6000,
  },
  wild_child: {
    audioKey: 'night_wild_child',
    subtitle: 'Đứa con hoang thức dậy, chọn người làm thần tượng.',
    durationMs: 6000,
  },
  night_hoodlum: {
    audioKey: 'night_hoodlum',
    subtitle: 'Du côn thức dậy, chọn hai kẻ thù cần loại bỏ.',
    durationMs: 6000,
  },
  hoodlum: {
    audioKey: 'night_hoodlum',
    subtitle: 'Du côn thức dậy, chọn hai kẻ thù cần loại bỏ.',
    durationMs: 6000,
  },
  night_mason: {
    audioKey: 'night_mason',
    subtitle: 'Hội Tam Điểm mở mắt nhận diện nhau.',
    durationMs: 5000,
  },
  mason: {
    audioKey: 'night_mason',
    subtitle: 'Hội Tam Điểm mở mắt nhận diện nhau.',
    durationMs: 5000,
  },
  night_dire_wolf: {
    audioKey: 'night_dire_wolf',
    subtitle: 'Sói tuyết thức dậy, chọn một người làm bạn đồng hành.',
    durationMs: 6000,
  },
  dire_wolf: {
    audioKey: 'night_dire_wolf',
    subtitle: 'Sói tuyết thức dậy, chọn một người làm bạn đồng hành.',
    durationMs: 6000,
  },
  night_wolf_accursed: {
    audioKey: 'night_wolf_accursed',
    subtitle: 'Sói nguyền thức dậy. Bạn có muốn truyền nọc độc biến nạn nhân thành Ma Sói không?',
    durationMs: 6000,
  },
  wolf_accursed: {
    audioKey: 'night_wolf_accursed',
    subtitle: 'Sói nguyền thức dậy. Bạn có muốn truyền nọc độc biến nạn nhân thành Ma Sói không?',
    durationMs: 6000,
  },
  night_big_bad_wolf: {
    audioKey: 'night_big_bad_wolf',
    subtitle: 'Sói đại ca thức dậy, chọn thêm một người để cắn.',
    durationMs: 6000,
  },
  big_bad_wolf: {
    audioKey: 'night_big_bad_wolf',
    subtitle: 'Sói đại ca thức dậy, chọn thêm một người để cắn.',
    durationMs: 6000,
  },
  night_aura_seer: {
    audioKey: 'night_aura_seer',
    subtitle: 'Tiên tri hào quang thức dậy, chọn một người để soi hào quang.',
    durationMs: 6000,
  },
  aura_seer: {
    audioKey: 'night_aura_seer',
    subtitle: 'Tiên tri hào quang thức dậy, chọn một người để soi hào quang.',
    durationMs: 6000,
  },
  night_pi: {
    audioKey: 'night_pi',
    subtitle: 'Thám tử thức dậy, chọn một người để điều tra.',
    durationMs: 6000,
  },
  pi: {
    audioKey: 'night_pi',
    subtitle: 'Thám tử thức dậy, chọn một người để điều tra.',
    durationMs: 6000,
  },
  night_fox: {
    audioKey: 'night_fox',
    subtitle: 'Con Cáo thức dậy, chọn một người để đánh hơi tìm Sói.',
    durationMs: 6000,
  },
  fox: {
    audioKey: 'night_fox',
    subtitle: 'Con Cáo thức dậy, chọn một người để đánh hơi tìm Sói.',
    durationMs: 6000,
  },
  night_spellcaster: {
    audioKey: 'night_spellcaster',
    subtitle: 'Người phù phép thức dậy, chọn một người bị cấm nói hôm nay.',
    durationMs: 6000,
  },
  spellcaster: {
    audioKey: 'night_spellcaster',
    subtitle: 'Người phù phép thức dậy, chọn một người bị cấm nói hôm nay.',
    durationMs: 6000,
  },
  night_troublemaker: {
    audioKey: 'night_troublemaker',
    subtitle: 'Kẻ phá rối thức dậy. Bạn có muốn gây hỗn loạn cho cả làng không?',
    durationMs: 6000,
  },
  troublemaker: {
    audioKey: 'night_troublemaker',
    subtitle: 'Kẻ phá rối thức dậy. Bạn có muốn gây hỗn loạn cho cả làng không?',
    durationMs: 6000,
  },
  night_doppelganger: {
    audioKey: 'night_doppelganger',
    subtitle: 'Nhân bản thức dậy, chọn một người để sao chép vai trò.',
    durationMs: 6000,
  },
  doppelganger: {
    audioKey: 'night_doppelganger',
    subtitle: 'Nhân bản thức dậy, chọn một người để sao chép vai trò.',
    durationMs: 6000,
  },
  night_pied_piper: {
    audioKey: 'night_pied_piper',
    subtitle: 'Người thổi sáo thức dậy, chọn hai người để thôi miên.',
    durationMs: 6000,
  },
  pied_piper: {
    audioKey: 'night_pied_piper',
    subtitle: 'Người thổi sáo thức dậy, chọn hai người để thôi miên.',
    durationMs: 6000,
  },
  night_cult_leader: {
    audioKey: 'night_cult_leader',
    subtitle: 'Trưởng giáo phái thức dậy, chọn người kết nạp vào giáo phái.',
    durationMs: 6000,
  },
  cult_leader: {
    audioKey: 'night_cult_leader',
    subtitle: 'Trưởng giáo phái thức dậy, chọn người kết nạp vào giáo phái.',
    durationMs: 6000,
  },
  night_drunk: {
    audioKey: 'night_drunk',
    subtitle: 'Kẻ say rượu vẫn chưa tỉnh, tiếp tục ngủ say.',
    durationMs: 5000,
  },
  drunk: {
    audioKey: 'night_drunk',
    subtitle: 'Kẻ say rượu vẫn chưa tỉnh, tiếp tục ngủ say.',
    durationMs: 5000,
  },
  night_apprentice_seer: {
    audioKey: 'seer',
    subtitle: 'Tiên tri thức dậy, chọn một người để soi phe.',
    durationMs: 6000,
  },
  apprentice_seer: {
    audioKey: 'seer',
    subtitle: 'Tiên tri thức dậy, chọn một người để soi phe.',
    durationMs: 6000,
  },
  minion: {
    audioKey: 'minion',
    subtitle: 'Kẻ phản bội thức dậy, nhận diện bầy Ma Sói.',
    durationMs: 5000,
  },
  seer: {
    audioKey: 'seer',
    subtitle: 'Tiên tri thức dậy, chọn một người để soi phe.',
    durationMs: 6000,
  },
  sorcerer: {
    audioKey: 'sorcerer',
    subtitle: 'Pháp sư thức dậy, chọn một người để tìm Tiên tri.',
    durationMs: 6000,
  },
  witch: {
    audioKey: 'witch',
    subtitle: 'Phù thủy thức dậy. Bạn có muốn dùng bình cứu hay bình độc đêm nay không?',
    durationMs: 7000,
  },
  night_end: {
    audioKey: 'night_end',
    subtitle: 'Trời sáng rồi, cả làng thức dậy!',
    durationMs: 5000,
  },
  day_discuss: {
    audioKey: 'day_discuss',
    subtitle: 'Cả làng bắt đầu thảo luận. Hòm phiếu sẽ mở sau khi hết thời gian thảo luận.',
    durationMs: 5000,
  },
  hunter_shot: {
    audioKey: 'hunter_shot',
    subtitle: 'Thợ săn đã ngã xuống! Mời Thợ săn nổ phát súng cuối cùng.',
    durationMs: 6000,
  },
  mayor_election: {
    audioKey: 'mayor_election',
    subtitle: 'Cả làng tiến hành bỏ phiếu bầu Trưởng làng!',
    durationMs: 5000,
  },
  mayor_succession: {
    audioKey: 'mayor_succession',
    subtitle: 'Trưởng làng khi ngã xuống, hãy trao lại huy hiệu cho người kế nhiệm.',
    durationMs: 6000,
  },
  day_bear_growl: {
    audioKey: 'day_bear_growl',
    subtitle: 'Tiếng gấu gầm vang vọng khắp làng! Có Ma Sói ngồi cạnh Người thuần gấu!',
    durationMs: 5000,
  },
  day_prince_reveal: {
    audioKey: 'day_prince_reveal',
    subtitle: 'Người bị kết án là Hoàng tử! Hoàng tử lật bài thoát chết, hôm nay không ai bị treo cổ!',
    durationMs: 6000,
  },
  angel_win: {
    audioKey: 'angel_win',
    subtitle: 'Thiên sứ đã bị dân làng bỏ phiếu treo cổ ngay trong Ngày 1 và giành chiến thắng!',
    durationMs: 7000,
  },
};

export class AudioController {
  private bgmHowl: Howl | null = null;
  private currentVoiceHowl: Howl | null = null;
  private audioStatus: AudioStatus = 'unlocked';
  private isMuted: boolean = false;
  private bgmVolume: number = 0.2;
  private voiceVolume: number = 0.9;
  private isDucked: boolean = false;
  private currentSubtitle: string = '';
  private lastPlayedTurnKey: string | null = null;
  private voiceSafetyTimer: ReturnType<typeof setTimeout> | null = null;
  private subtitleListeners: Set<(sub: string) => void> = new Set();
  private statusListeners: Set<(status: AudioStatus) => void> = new Set();

  constructor() {
    this.setupAutoplayUnlock();
  }

  /**
   * Theo dõi và thông báo trạng thái âm thanh tới UI (Host).
   */
  public getAudioStatus(): AudioStatus {
    return this.audioStatus;
  }

  public subscribeAudioStatus(listener: (status: AudioStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.audioStatus);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public setAudioStatus(status: AudioStatus): void {
    if (this.audioStatus === status) return;
    this.audioStatus = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch {
        // ignore listener errors
      }
    }
  }

  /**
   * Tự động mở khóa Web Audio context ngay lần đầu tiên user chạm / click vào màn hình.
   */
  public setupAutoplayUnlock(): void {
    if (typeof window === 'undefined') return;

    // Kiểm tra trạng thái khởi tạo của AudioContext nếu Howler đã sinh
    if (Howler.ctx) {
      this.attachContextListener();
      if (Howler.ctx.state === 'suspended') {
        this.setAudioStatus('blocked');
      }
    }

    const unlockHandler = () => {
      void this.unlockAudio();
      window.removeEventListener('click', unlockHandler);
      window.removeEventListener('touchstart', unlockHandler);
      window.removeEventListener('keydown', unlockHandler);
    };

    window.addEventListener('click', unlockHandler, { once: true });
    window.addEventListener('touchstart', unlockHandler, { once: true });
    window.addEventListener('keydown', unlockHandler, { once: true });
  }

  /**
   * Lắng nghe trạng thái AudioContext (hỗ trợ phát hiện gián đoạn trên iOS Safari / Android).
   */
  private attachContextListener(): void {
    if (typeof window === 'undefined') return;
    const ctx = Howler.ctx;
    if (ctx && !ctx.onstatechange) {
      ctx.onstatechange = () => {
        if (ctx.state === 'running') {
          this.setAudioStatus('unlocked');
        } else if (ctx.state === 'suspended') {
          this.setAudioStatus('blocked');
        } else if ((ctx.state as string) === 'interrupted') {
          this.setAudioStatus('interrupted');
        }
      };
    }
  }

  /**
   * Mở khóa AudioContext chủ động khi Host bấm nút phục hồi trên giao diện.
   */
  public async unlockAudio(): Promise<boolean> {
    if (typeof window === 'undefined') return true;

    try {
      if (Howler.ctx) {
        if (Howler.ctx.state === 'suspended' || (Howler.ctx.state as string) === 'interrupted') {
          await Howler.ctx.resume();
        }
        this.attachContextListener();
        if (Howler.ctx.state === 'running') {
          this.setAudioStatus('unlocked');
          return true;
        }
      }
      this.setAudioStatus('unlocked');
      return true;
    } catch {
      this.setAudioStatus('blocked');
      return false;
    }
  }

  public subscribeSubtitle(listener: (sub: string) => void): () => void {
    this.subtitleListeners.add(listener);
    listener(this.currentSubtitle);
    return () => {
      this.subtitleListeners.delete(listener);
    };
  }

  public getCurrentSubtitle(): string {
    return this.currentSubtitle;
  }

  private setSubtitle(sub: string): void {
    this.currentSubtitle = sub;
    for (const listener of this.subtitleListeners) {
      try {
        listener(sub);
      } catch {
        // ignore listener errors
      }
    }
  }

  public clearSubtitle(): void {
    this.setSubtitle('');
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    Howler.mute(this.isMuted);
    if (this.isMuted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Phát tiếng chuông transition chime chuyển lượt bằng Web Audio oscillator (không cần file mp3).
   */
  public playTransitionChime(): void {
    if (this.isMuted || typeof window === 'undefined') return;

    try {
      const isReused = Boolean(Howler.ctx);
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Howler.ctx && !AudioCtx) return;

      const ctx = Howler.ctx || new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.25); // A5

      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.5);

      if (!isReused) {
        setTimeout(() => {
          void ctx.close();
        }, 600);
      }
    } catch {
      // ignore web audio errors
    }
  }

  /**
   * Đọc câu lệnh bằng Web Speech API TTS tiếng Việt (fallback khi thiếu mp3).
   * Đi kèm Safety Fallback Timer để tránh treo nếu browser nuốt onend/onerror.
   */
  public speakTTS(text: string, onEnd?: () => void, durationMs?: number): void {
    if (this.isMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onEnd?.();
      return;
    }

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      onEnd?.();
    };

    // Safety fallback: Mobile browser WebKit hay nuốt mất sự kiện onend.
    // Đảm bảo luôn hoàn tất trong khoảng durationMs hoặc tối đa 6s.
    const maxWaitMs = Math.max(3000, (durationMs ?? 6000));
    timer = setTimeout(finish, maxWaitMs);

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 0.95;
      utterance.volume = this.voiceVolume;

      utterance.onend = finish;
      utterance.onerror = finish;

      window.speechSynthesis.speak(utterance);
    } catch {
      finish();
    }
  }

  /**
   * Bắt đầu phát BGM ban đêm với âm lượng 20%, lặp lại.
   */
  public playNightBGM(): void {
    if (this.isMuted) return;
    if (typeof window === 'undefined' || typeof window.Audio === 'undefined') return;

    if (this.bgmHowl) {
      if (!this.bgmHowl.playing()) {
        try {
          this.bgmHowl.play();
        } catch {
          this.setAudioStatus('blocked');
        }
      }
      return;
    }

    try {
      this.bgmHowl = new Howl({
        src: ['/audio/bgm_night.mp3'],
        loop: true,
        volume: this.isDucked ? 0.05 : this.bgmVolume,
        html5: true,
        onloaderror: () => {
          this.bgmHowl = null;
        },
        onplayerror: () => {
          this.setAudioStatus('blocked');
        },
      });

      this.bgmHowl.play();
    } catch {
      this.bgmHowl = null;
      this.setAudioStatus('blocked');
    }
  }

  public stopNightBGM(): void {
    if (this.bgmHowl) {
      try {
        this.bgmHowl.stop();
        this.bgmHowl.unload();
      } catch {
        // ignore
      }
      this.bgmHowl = null;
    }
    this.isDucked = false;
  }

  /**
   * Giảm âm lượng BGM (audio ducking) khi có voice đọc và khôi phục an toàn.
   */
  public duckBGM(duck: boolean): void {
    if (!this.bgmHowl) return;
    if (this.isDucked === duck) return;
    this.isDucked = duck;
    const targetVol = duck ? 0.05 : this.bgmVolume;
    try {
      this.bgmHowl.fade(this.bgmHowl.volume(), targetVol, 300);
    } catch {
      // ignore fade error
    }
  }

  public resetLastPlayedTurn(): void {
    this.lastPlayedTurnKey = null;
  }

  /**
   * Điều phối phát câu lệnh âm thanh theo turnKey:
   * 1. Cập nhật phụ đề câu lệnh hiển thị trên màn hình.
   * 2. Chống phát đúp sau khi Host reconnect hoặc socket gửi snapshot lặp.
   * 3. Phát transition chime báo hiệu đổi lượt.
   * 4. Thử tải file MP3 `/audio/<audioKey>.mp3` qua Howler.
   * 5. Nếu file MP3 load lỗi (404/thiếu file) -> Fallback sang Web Speech API (TTS).
   * 6. Luôn có Safety Fallback Timer để bảo đảm duckBGM(false) và onComplete được gọi.
   */
  public playTurnNarration(turnKey: string, onComplete?: () => void, force = false): void {
    void this.unlockAudio();

    const prompt = NARRATION_PROMPTS[turnKey];
    if (!prompt) {
      onComplete?.();
      return;
    }

    // 1. Phụ đề trực quan
    this.setSubtitle(prompt.subtitle);

    // 2. Chống đọc đúp nếu cùng 1 lượt và không phải thao tác bấm ép 'Phát lại' (force)
    if (!force && this.lastPlayedTurnKey === turnKey) {
      onComplete?.();
      return;
    }
    this.lastPlayedTurnKey = turnKey;

    // 3. Chime báo hiệu
    this.playTransitionChime();

    // Dừng voice trước đó và timer nếu có
    if (this.voiceSafetyTimer) {
      clearTimeout(this.voiceSafetyTimer);
      this.voiceSafetyTimer = null;
    }

    if (this.currentVoiceHowl) {
      try {
        this.currentVoiceHowl.stop();
        this.currentVoiceHowl.unload();
      } catch {
        // ignore
      }
      this.currentVoiceHowl = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }

    if (this.isMuted) {
      this.duckBGM(false);
      onComplete?.();
      return;
    }

    // Nếu môi trường không có HTMLAudioElement (như bun test / node), dừng ở đây và hoàn tất
    if (typeof window === 'undefined' || typeof window.Audio === 'undefined') {
      this.duckBGM(false);
      onComplete?.();
      return;
    }

    // Hạ BGM khi đọc voice
    this.duckBGM(true);

    let finished = false;
    const finishVoice = () => {
      if (finished) return;
      finished = true;
      if (this.voiceSafetyTimer) {
        clearTimeout(this.voiceSafetyTimer);
        this.voiceSafetyTimer = null;
      }
      this.duckBGM(false);
      onComplete?.();
    };

    // Safety timer: Đảm bảo 100% kết thúc lượt và trả BGM volume bình thường
    const maxSafetyMs = Math.max(4000, (prompt.durationMs ?? 6000) + 2000);
    this.voiceSafetyTimer = setTimeout(finishVoice, maxSafetyMs);

    try {
      // 4. Thử tải MP3
      const sound = new Howl({
        src: [`/audio/${prompt.audioKey}.mp3`],
        volume: this.voiceVolume,
        onloaderror: () => {
          this.speakTTS(prompt.subtitle, finishVoice, prompt.durationMs);
        },
        onplayerror: () => {
          this.setAudioStatus('blocked');
          this.speakTTS(prompt.subtitle, finishVoice, prompt.durationMs);
        },
        onend: () => {
          finishVoice();
        },
      });

      this.currentVoiceHowl = sound;
      sound.play();
    } catch {
      this.speakTTS(prompt.subtitle, finishVoice, prompt.durationMs);
    }
  }

  /**
   * Dọn sạch toàn bộ âm thanh và giải phóng tài nguyên (dùng khi Rời phòng hoặc Rematch).
   */
  public stopAll(): void {
    if (this.voiceSafetyTimer) {
      clearTimeout(this.voiceSafetyTimer);
      this.voiceSafetyTimer = null;
    }
    if (this.currentVoiceHowl) {
      try {
        this.currentVoiceHowl.stop();
        this.currentVoiceHowl.unload();
      } catch {
        // ignore
      }
      this.currentVoiceHowl = null;
    }
    this.duckBGM(false);
    this.stopNightBGM();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    this.clearSubtitle();
    this.resetLastPlayedTurn();
  }
}

export const audioController = new AudioController();
