/**
 * TtsPort — sinh audio giọng nói. Electron: client → local Python service (IPC).
 * Web: HTTP → backend TTS service. Xem docs/architecture/web-vs-electron.md.
 */
export interface Voice {
  id: string;
  name: string;
  language?: string;
}

export interface SpeakOptions {
  voiceId?: string;
  speed?: number;
  temperature?: number;
}

export interface TtsPort {
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  listVoices(): Promise<Voice[]>;
}
