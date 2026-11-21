import { Howl, Howler } from 'howler';

export interface NarrationPrompt {
  audioKey: string;
  subtitle: string;
  durationMs?: number;
}

export const NARRATION_PROMPTS: Record<string, NarrationPrompt> = {
  night_start: {
    audioKey: 'night_start',
    subtitle: 'Trời tối rồi, tất cả dân làng hãy nhắm mắt đi ngủ.',
    durationMs: 4000,
  },
  cupid: {
    audioKey: 'cupid',
    subtitle: 'Thần tình yêu Cupid, hãy thức dậy và bắn mũi tên ghép đôi hai người.',
    durationMs: 6000,
  },
  lovers: {
    audioKey: 'lovers',
    subtitle: 'Hai người yêu nhau, hãy mở mắt nhận diện nhau trong bí mật.',
    durationMs: 5000,
  },
  bodyguard: {
    audioKey: 'bodyguard',
    subtitle: 'Bảo vệ, hãy thức dậy và chọn một người để bảo vệ đêm nay.',
    durationMs: 6000,
  },
  wolf_pack: {
    audioKey: 'wolf_pack',
    subtitle: 'Bầy Ma Sói, hãy thức dậy, nhận diện đồng đội và thống nhất chọn nạn nhân.',
    durationMs: 8000,
  },
  white_wolf: {
    audioKey: 'white_wolf',
    subtitle: 'Sói Trắng, hãy thức dậy và chọn một người sói để cắn nếu muốn.',
    durationMs: 6000,
  },
  minion: {
    audioKey: 'minion',
    subtitle: 'Kẻ phản bội, hãy thức dậy và nhận diện bầy Ma Sói.',
    durationMs: 5000,
  },
  seer: {
    audioKey: 'seer',
    subtitle: 'Tiên tri, hãy thức dậy và chọn một người để soi phe.',
    durationMs: 6000,
  },
  sorcerer: {
    audioKey: 'sorcerer',
    subtitle: 'Pháp sư, hãy thức dậy và tìm kiếm Tiên tri đêm nay.',
    durationMs: 6000,
  },
  witch: {
    audioKey: 'witch',
    subtitle: 'Phù thủy, hãy thức dậy. Bạn có muốn dùng bình cứu hoặc bình độc đêm nay không?',
    durationMs: 7000,
  },
  night_end: {
    audioKey: 'night_end',
    subtitle: 'Trời đã sáng rồi, xin mời toàn thể dân làng thức dậy!',
    durationMs: 5000,
  },
  day_discuss: {
    audioKey: 'day_discuss',
    subtitle: 'Bắt đầu phiên thảo luận làng. Hòm phiếu sẽ mở sau khi kết thúc đàm đạo đầu.',
    durationMs: 5000,
  },
  hunter_shot: {
    audioKey: 'hunter_shot',
    subtitle: 'Thợ săn đã ngã xuống! Thợ săn hãy chọn mục tiêu cho phát súng sau cùng.',
    durationMs: 6000,
  },
  mayor_election: {
    audioKey: 'mayor_election',
    subtitle: 'Toàn làng tiến hành bỏ phiếu bầu ra Trưởng làng đầu tiên!',
    durationMs: 5000,
  },
  mayor_succession: {
    audioKey: 'mayor_succession',
    subtitle: 'Trưởng làng trước khi trút hơi thở cuối cùng, hãy trao lại huy hiệu cho người kế vị.',
    durationMs: 6000,
  },
};

export class AudioController {
  private bgmHowl: Howl | null = null;
  private currentVoiceHowl: Howl | null = null;
  private isUnlocked: boolean = false;
  private isMuted: boolean = false;
  private bgmVolume: number = 0.2;
  private voiceVolume: number = 0.9;
  private currentSubtitle: string = '';
  private subtitleListeners: Set<(sub: string) => void> = new Set();

  constructor() {
    this.setupAutoplayUnlock();
  }

  /**
   * Tự động mở khóa Web Audio context ngay lần đầu tiên user chạm / click vào màn hình.
   */
  public setupAutoplayUnlock(): void {
    if (typeof window === 'undefined') return;

    const unlockHandler = () => {
      this.unlockAudio();
      window.removeEventListener('click', unlockHandler);
      window.removeEventListener('touchstart', unlockHandler);
      window.removeEventListener('keydown', unlockHandler);
    };

    window.addEventListener('click', unlockHandler, { once: true });
    window.addEventListener('touchstart', unlockHandler, { once: true });
    window.addEventListener('keydown', unlockHandler, { once: true });
  }

  public unlockAudio(): void {
    if (this.isUnlocked) return;
    this.isUnlocked = true;

    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      void Howler.ctx.resume();
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
      window.speechSynthesis.cancel();
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
      // Ưu tiên tái sử dụng Howler.ctx nếu đã có sẵn để tránh tạo nhiều AudioContext
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
   */
  public speakTTS(text: string, onEnd?: () => void): void {
    if (this.isMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onEnd?.();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 0.95;
      utterance.volume = this.voiceVolume;

      utterance.onend = () => {
        onEnd?.();
      };
      utterance.onerror = () => {
        onEnd?.();
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      onEnd?.();
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
        this.bgmHowl.play();
      }
      return;
    }

    try {
      this.bgmHowl = new Howl({
        src: ['/audio/bgm_night.mp3'],
        loop: true,
        volume: this.bgmVolume,
        html5: true,
        onloaderror: () => {
          this.bgmHowl = null;
        },
      });

      this.bgmHowl.play();
    } catch {
      this.bgmHowl = null;
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
  }

  /**
   * Giảm âm lượng BGM (audio ducking) khi có voice đọc.
   */
  private duckBGM(duck: boolean): void {
    if (!this.bgmHowl) return;
    const targetVol = duck ? 0.05 : this.bgmVolume;
    this.bgmHowl.fade(this.bgmHowl.volume(), targetVol, 300);
  }

  /**
   * Điều phối phát câu lệnh âm thanh theo turnKey:
   * 1. Cập nhật phụ đề câu lệnh hiển thị trên màn hình.
   * 2. Phát transition chime báo hiệu đổi lượt.
   * 3. Thử tải file MP3 `/audio/<audioKey>.mp3` qua Howler.
   * 4. Nếu file MP3 load lỗi (404/thiếu file) -> Fallback sang Web Speech API (TTS).
   */
  public playTurnNarration(turnKey: string, onComplete?: () => void): void {
    this.unlockAudio();

    const prompt = NARRATION_PROMPTS[turnKey];
    if (!prompt) {
      onComplete?.();
      return;
    }

    // 1. Phụ đề trực quan
    this.setSubtitle(prompt.subtitle);

    // 2. Chime báo hiệu
    this.playTransitionChime();

    // Dừng voice trước đó nếu còn
    if (this.currentVoiceHowl) {
      try {
        this.currentVoiceHowl.stop();
        this.currentVoiceHowl.unload();
      } catch {
        // ignore headless test unload error
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
      onComplete?.();
      return;
    }

    // Nếu môi trường không có HTMLAudioElement (như bun test / node), dừng ở đây và hoàn tất
    if (typeof window === 'undefined' || typeof window.Audio === 'undefined') {
      onComplete?.();
      return;
    }

    // Hạ BGM khi đọc voice
    this.duckBGM(true);

    const finishVoice = () => {
      this.duckBGM(false);
      onComplete?.();
    };

    try {
      // 3. Thử tải MP3
      const sound = new Howl({
        src: [`/audio/${prompt.audioKey}.mp3`],
        volume: this.voiceVolume,
        onloaderror: () => {
          // 4. Fallback 1: Web Speech API TTS
          this.speakTTS(prompt.subtitle, finishVoice);
        },
        onplayerror: () => {
          this.speakTTS(prompt.subtitle, finishVoice);
        },
        onend: () => {
          finishVoice();
        },
      });

      this.currentVoiceHowl = sound;
      sound.play();
    } catch {
      this.speakTTS(prompt.subtitle, finishVoice);
    }
  }

  public stopAll(): void {
    if (this.currentVoiceHowl) {
      try {
        this.currentVoiceHowl.stop();
        this.currentVoiceHowl.unload();
      } catch {
        // ignore
      }
      this.currentVoiceHowl = null;
    }
    this.stopNightBGM();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    this.clearSubtitle();
  }
}

export const audioController = new AudioController();
