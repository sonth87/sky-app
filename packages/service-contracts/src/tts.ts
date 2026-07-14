/**
 * TtsPort — sinh audio giọng nói. Electron: client → local Python service (IPC).
 * Web: HTTP → backend TTS service. Xem docs/architecture/web-vs-electron.md.
 */
export interface Voice {
  id: string;
  name: string;
  language?: string;
  gender?: string;
}

export interface SpeakOptions {
  voiceId?: string;
  speed?: number;
  temperature?: number;
}

export interface SynthesizeResult {
  buffer: ArrayBuffer;
  sampleRate: number;
}

export interface TtsPort {
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  listVoices(): Promise<Voice[]>;
  /** Sinh audio, trả buffer thô thay vì tự phát — dùng cho app cần giữ/lưu/tải audio (vd tts-studio). */
  synthesizeBuffer(text: string, opts?: SpeakOptions): Promise<SynthesizeResult>;
  /** URL để nghe thử 1 giọng trước khi chọn (vd audio tag src). */
  getPreviewUrl(voiceId: string): Promise<string>;
}
