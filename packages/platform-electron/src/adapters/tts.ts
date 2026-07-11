import type { TtsPort } from '@sky-app/service-contracts';
import '../bridge-types.js';

/**
 * Electron TtsPort — calls through the preload bridge (window.sky.invoke),
 * which the main process routes to a local TTS service (GĐ4+). For now the
 * IPC channels exist and round-trip through the mock handler registered in
 * apps/shell-electron/electron/ipc.ts.
 */
export function createElectronTtsPort(): TtsPort {
  return {
    async speak(text, opts) {
      await window.sky.invoke('kernel:tts:speak', text, opts);
    },
    async listVoices() {
      return (await window.sky.invoke('kernel:tts:listVoices')) as Awaited<ReturnType<TtsPort['listVoices']>>;
    },
  };
}
