import type { TtsPort } from '@sky-app/service-contracts';

/**
 * Web TtsPort — calls a backend TTS HTTP API. There is no backend yet
 * (GĐ4+); this establishes the shape so `platform.services.get('tts')`
 * behaves identically to the Electron adapter from the app's point of view.
 */
export function createWebTtsPort(baseUrl = '/api/tts'): TtsPort {
  return {
    async speak(text, opts) {
      const res = await fetch(`${baseUrl}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, ...opts }),
      });
      if (!res.ok) throw new Error(`TTS speak failed: ${res.status}`);
    },
    async listVoices() {
      const res = await fetch(`${baseUrl}/voices`);
      if (!res.ok) throw new Error(`TTS listVoices failed: ${res.status}`);
      return res.json();
    },
  };
}
