import { languageFromSourceLang, type EffectTypeInfo, type SpeakOptions, type SynthesizeResult, type TtsPort, type Voice, type VoiceCatalogEntry } from '@sky-app/service-contracts';

interface RawVoice {
  id: string;
  label: string;
  region?: string;
  gender?: string;
  type?: string;
  accent?: string;
  category?: string[];
  tags?: string[];
  tagline?: string;
  description?: string;
  source_catalog_id?: string;
  /** vd "vi-VN"/"en-US" — xem languageFromSourceLang. */
  source_lang?: string;
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
      // 'NF' (giọng placeholder cũ) đã bị xoá khỏi voice-registry.json 2026-08-04 — Giang
      // (clone-d0f05071) là giọng mặc định mới khi voiceId trống.
      speaker_id: opts?.voiceId ?? 'clone-d0f05071',
      speed: opts?.speed ?? 1.0,
      temperature: opts?.temperature,
      engine_overrides: opts?.engine_overrides,
      // Chỉ gửi khi có — server phân biệt "không dùng hiệu ứng" (vắng mặt/rỗng) và bỏ qua
      // hẳn bước áp dụng, không phải dựng một pedalboard rỗng cho mỗi request.
      ...(opts?.effectsChain?.length ? { effects_chain: opts.effectsChain } : {}),
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
      return raw.map((v): Voice => ({
        id: v.id,
        name: v.label,
        language: languageFromSourceLang(v.source_lang),
        gender: v.gender,
        type: v.type,
        accent: v.accent,
        category: v.category,
        tags: v.tags,
        tagline: v.tagline,
        description: v.description,
        sourceCatalogId: v.source_catalog_id,
      }));
    },

    async synthesizeBuffer(text, opts) {
      return fetchSynthesize(baseUrl, text, opts);
    },

    async getPreviewUrl(voiceId) {
      return `${baseUrl}/preview/${voiceId}`;
    },

    async listVoiceCatalog(lang) {
      const url = lang ? `${baseUrl}/voices/catalog?lang=${encodeURIComponent(lang)}` : `${baseUrl}/voices/catalog`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`TTS listVoiceCatalog failed: ${res.status}`);
      return (await res.json()) as VoiceCatalogEntry[];
    },

    async getCatalogAudioUrl(lang, entryId) {
      return `${baseUrl}/voices/catalog/${encodeURIComponent(lang)}/${encodeURIComponent(entryId)}/audio`;
    },

    async cloneVoice(opts) {
      const formData = new FormData();
      for (const s of opts.samples) {
        if (!(s.filePath instanceof File)) {
          throw new Error('Web cloneVoice requires File objects');
        }
        formData.append('files', s.filePath);
        // Cùng số lượng và THỨ TỰ với 'files' — server gom theo tên field lặp lại, khớp vị
        // trí. Luôn gửi (kể cả rỗng) — server quyết định bắt buộc hay không theo engine.
        formData.append('ref_texts', s.refText ?? '');
      }
      formData.append('label', opts.label);
      formData.append('gender', opts.gender);
      formData.append('region', opts.region);
      if (opts.age) formData.append('age', opts.age);
      if (opts.language) formData.append('language', opts.language);
      if (opts.tagline) formData.append('tagline', opts.tagline);
      if (opts.description) formData.append('description', opts.description);
      if (opts.tags) {
        opts.tags.forEach(tag => formData.append('tags', tag));
      }

      const res = await fetch(`${baseUrl}/voices/clone`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        // Body của FastAPI mang thông báo đọc được (vd "cần bản chép lời của audio
        // mẫu"); statusText chỉ là "Bad Request", vô dụng với người dùng.
        return { ok: false, error: (await res.text()) || `TTS clone failed: ${res.statusText}` };
      }
      const voice = await res.json();
      return { ok: true, voice };
    },

    async addVoiceSample(voiceId, filePath, refText) {
      if (!(filePath instanceof File)) {
        throw new Error('Web addVoiceSample requires a File object');
      }
      const formData = new FormData();
      formData.append('file', filePath);
      formData.append('ref_text', refText ?? '');

      const res = await fetch(`${baseUrl}/voices/${encodeURIComponent(voiceId)}/samples`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        return { ok: false, error: (await res.text()) || `TTS add sample failed: ${res.statusText}` };
      }
      return { ok: true, sample: await res.json() };
    },

    async deleteVoiceSample(voiceId, sampleId) {
      const res = await fetch(
        `${baseUrl}/voices/${encodeURIComponent(voiceId)}/samples/${encodeURIComponent(sampleId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        return { ok: false, error: (await res.text()) || `TTS delete sample failed: ${res.statusText}` };
      }
      return { ok: true };
    },

    async listVoiceSamples(voiceId) {
      const res = await fetch(`${baseUrl}/voices/${encodeURIComponent(voiceId)}/samples`);
      if (!res.ok) return [];
      return res.json();
    },

    async listEffectTypes() {
      const res = await fetch(`${baseUrl}/effects`);
      if (!res.ok) return [];
      const data = (await res.json()) as { available?: boolean; effects?: EffectTypeInfo[] };
      return data.available ? (data.effects ?? []) : [];
    },

    async updateVoiceRefText(voiceId, refText) {
      const res = await fetch(`${baseUrl}/voices/${encodeURIComponent(voiceId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref_text: refText }),
      });
      if (!res.ok) {
        return { ok: false, error: (await res.text()) || `TTS update failed: ${res.statusText}` };
      }
      return { ok: true };
    },

    async deleteVoice(voiceId) {
      const res = await fetch(`${baseUrl}/voices/${encodeURIComponent(voiceId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        return { ok: false, error: `TTS delete failed: ${res.statusText}` };
      }
      return { ok: true };
    },
  };
}
