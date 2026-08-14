import type { SttPort } from '@sky-app/service-contracts';
import type { SlideApi } from '@sky-app/slide-shared';

declare global {
  interface Window {
    slide: SlideApi;
  }
}

/**
 * Electron SttPort — bọc window.slide (preload bridge, xem
 * apps/shell-electron/electron/slide/preload.ts). `pickAudioFile` delegate thẳng kênh
 * `tts:pick-audio-file` có sẵn (chọn file audio không có gì riêng STT — xem
 * service-contracts/src/stt.ts's docstring).
 */
export function createElectronSttPort(): SttPort {
  return {
    async transcribe(filePath, opts) {
      if (typeof filePath !== 'string') {
        throw new Error('Electron transcribe requires a string filePath');
      }
      const res = await window.slide.sttTranscribe?.(filePath, opts);
      return res ?? { ok: false, error: 'Bridge không hỗ trợ sttTranscribe' };
    },
    async pickAudioFile() {
      return window.slide.pickAudioFile();
    },
  };
}
