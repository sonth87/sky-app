import type { SpeakOptions, SynthesizeResult, TtsPort, Voice } from '@sky-app/service-contracts';

interface RawVoice {
  id: string;
  label: string;
  region?: string;
  gender?: string;
}

let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/**
 * /synthesize returns raw PCM Int16 bytes (application/octet-stream) with
 * sample rate in the X-Sample-Rate header — same wire format Ceremony's
 * window.slide.speak uses (see modules/ceremony/src/lib/audio.ts's playPcm,
 * which this mirrors). Not reusing that module directly: it's app code, and
 * platform-web must not depend on a specific module (wrong dependency
 * direction — adapters are lower in the stack than modules).
 */
async function playPcm(buffer: ArrayBuffer, sampleRate: number): Promise<void> {
  if (currentSource) {
    try { currentSource.stop(); } catch { /* already stopped */ }
    currentSource = null;
  }

  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') await ctx.resume();

  const sampleCount = Math.floor(buffer.byteLength / 2);
  if (sampleCount <= 0) throw new Error('Empty PCM buffer');
  const int16 = new Int16Array(buffer, 0, sampleCount);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) float32[i] = int16[i]! / 32768;

  const audioBuffer = ctx.createBuffer(1, sampleCount, sampleRate);
  audioBuffer.copyToChannel(float32, 0);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  currentSource = source;
  source.onended = () => { if (currentSource === source) currentSource = null; };
  source.start(0);
}

/** POST /synthesize + đọc raw PCM — dùng chung bởi speak() (tự phát) và synthesizeBuffer() (trả buffer). */
async function fetchSynthesize(
  baseUrl: string,
  text: string,
  opts?: SpeakOptions,
): Promise<SynthesizeResult> {
  const res = await fetch(`${baseUrl}/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      speaker_id: opts?.voiceId ?? 'NF',
      speed: opts?.speed ?? 1.0,
      temperature: opts?.temperature,
    }),
  });
  if (!res.ok) throw new Error(`TTS synthesize failed: ${res.status} ${await res.text()}`);

  const sampleRate = Number(res.headers.get('X-Sample-Rate') ?? '24000');
  const buffer = await res.arrayBuffer();
  return { buffer, sampleRate };
}

/**
 * Web TtsPort — calls apps/tts-service's FastAPI server directly from the
 * browser (CORS enabled server-side, see server/main.py). Same backend
 * Ceremony's Electron path spawns locally (python-server.ts); here the
 * caller supplies wherever it's actually reachable (baseUrl) since there's
 * no Electron main process to manage the subprocess for a web deploy.
 */
export function createWebTtsPort(baseUrl = 'http://localhost:8093'): TtsPort {
  return {
    async speak(text, opts) {
      const { buffer, sampleRate } = await fetchSynthesize(baseUrl, text, opts);
      await playPcm(buffer, sampleRate);
    },

    async listVoices() {
      const res = await fetch(`${baseUrl}/voices`);
      if (!res.ok) throw new Error(`TTS listVoices failed: ${res.status}`);
      const raw = (await res.json()) as RawVoice[];
      return raw.map((v): Voice => ({ id: v.id, name: v.label, language: v.region, gender: v.gender }));
    },

    async synthesizeBuffer(text, opts) {
      return fetchSynthesize(baseUrl, text, opts);
    },

    async getPreviewUrl(voiceId) {
      return `${baseUrl}/preview/${voiceId}`;
    },
  };
}
