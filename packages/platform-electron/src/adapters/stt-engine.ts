import type { SttEnginePort } from '@sky-app/service-contracts';
import type { SlideApi } from '@sky-app/slide-shared';

declare global {
  interface Window {
    slide: SlideApi;
  }
}

/**
 * Electron SttEnginePort — bọc window.slide (preload bridge, xem
 * apps/shell-electron/electron/slide/preload.ts). Ánh xạ 1-1, mặt cắt nhỏ hơn
 * TtsEnginePort có chủ đích: cài đặt/tải model tái dùng nguyên UI + port TTS hiện có
 * (xem service-contracts/src/stt-engine.ts's docstring).
 */
export function createElectronSttEnginePort(): SttEnginePort {
  return {
    async listEngines() {
      return (await window.slide.sttListEngines?.()) ?? null;
    },
    async switchEngine(engineId) {
      return (await window.slide.sttEngineSwitch?.(engineId)) ?? { ok: false, error: 'Bridge không hỗ trợ sttEngineSwitch' };
    },
  };
}
