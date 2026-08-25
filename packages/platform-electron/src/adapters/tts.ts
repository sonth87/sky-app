import { languageFromSourceLang, type TtsPort, type Voice, type HistoryEntry } from '@sky-app/service-contracts';
import type { SlideApi, TtsHistoryEntry } from '@sky-app/slide-shared';

function toHistoryEntry(e: TtsHistoryEntry): HistoryEntry {
  return {
    id: e.id,
    source: e.source,
    text: e.text,
    voiceId: e.voice_id,
    voiceLabel: e.voice_label,
    speed: e.speed,
    sampleRate: e.sample_rate,
    durationMs: e.duration_ms,
    engineId: e.engine_id,
    qualityScore: e.quality_score,
    qualityFlags: e.quality_flags,
    hasAudio: e.has_audio,
    error: e.error,
    createdAt: e.created_at,
  };
}

declare global {
  interface Window {
    slide: SlideApi;
  }
}

let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/**
 * window.slide.speak() trả PCM Int16 thô (buffer + sampleRate), không tự
 * phát — khác TtsPort.speak() (chơi audio, trả void). Mirror của
 * platform-web/src/adapters/tts.ts's playPcm (cùng wire format), không tái
 * dùng qua import: mỗi adapter độc lập theo môi trường.
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

/**
 * Electron TtsPort — bọc window.slide (preload bridge có sẵn, xem
 * apps/shell-electron/electron/slide/preload.ts), KHÔNG qua window.sky mock
 * channel nữa. studentCode (tham số thứ 4 của window.slide.speak, dùng cho
 * cache theo học sinh) không có tương đương trong TtsPort — path pregen-cache
 * (BackdropApp.tsx's pregenGetAudio) vẫn gọi window.slide trực tiếp qua
 * useSlide(), chỉ đường live-synthesis fallback đi qua port này.
 */
export function createElectronTtsPort(): TtsPort {
  return {
    async speak(text, opts) {
      const res = await window.slide.speak(text, opts?.voiceId, opts?.speed);
      if (!res.ok || !res.buffer) throw new Error(res.error ?? 'TTS speak failed');
      await playPcm(res.buffer, res.sampleRate ?? 24000);
    },
    async listVoices() {
      const voices = await window.slide.listVoices();
      return voices.map((v): Voice => ({
        id: v.id,
        name: v.label,
        language: languageFromSourceLang(v.source_lang),
        gender: v.gender,
        type: v.type,
        accent: v.accent,
        category: v.category,
        tags: v.tags,
        tagline: (v as any).tagline,
        description: (v as any).description,
        sourceCatalogId: v.source_catalog_id,
      }));
    },
    async synthesizeBuffer(text, opts) {
      // Kênh riêng tts-studio:synthesize (không cache/log/pregen) — khác window.slide.speak
      // dùng bởi Ceremony. Xem apps/shell-electron/electron/slide/tts-studio.ts.
      const res = await window.slide.synthesizeTts(
        text, opts?.voiceId, opts?.speed, opts?.engine_overrides, opts?.effectsChain,
      );
      if (!res.ok || !res.buffer) throw new Error(res.error ?? 'TTS synthesize failed');
      return { buffer: res.buffer, sampleRate: res.sampleRate ?? 48000, historyId: res.historyId };
    },
    async getPreviewUrl(voiceId) {
      return window.slide.getTtsPreviewUrl(voiceId);
    },
    async listVoiceCatalog(lang) {
      return window.slide.listVoiceCatalog(lang);
    },
    async getCatalogAudioUrl(lang, entryId) {
      return window.slide.getCatalogAudioUrl(lang, entryId);
    },
    async cloneVoice(opts) {
      const samples = opts.samples.map((s) => {
        if (typeof s.filePath !== 'string') {
          throw new Error('Electron cloneVoice requires string filePaths');
        }
        return { filePath: s.filePath, refText: s.refText };
      });
      return window.slide.cloneVoice({
        samples, label: opts.label, gender: opts.gender, region: opts.region,
      });
    },
    async addVoiceSample(voiceId, filePath, refText) {
      if (typeof filePath !== 'string') {
        throw new Error('Electron addVoiceSample requires a string filePath');
      }
      return window.slide.addVoiceSample(voiceId, filePath, refText);
    },
    async deleteVoiceSample(voiceId, sampleId) {
      return window.slide.deleteVoiceSample(voiceId, sampleId);
    },
    async listVoiceSamples(voiceId) {
      return window.slide.listVoiceSamples(voiceId);
    },
    async updateVoiceRefText(voiceId, refText) {
      // `hidden` để undefined = không đụng tới; chỉ sửa mỗi bản chép lời.
      return window.slide.updateVoice(voiceId, undefined, refText);
    },
    async deleteVoice(voiceId) {
      return window.slide.deleteVoice(voiceId);
    },
    async pickAudioFile() {
      return window.slide.pickAudioFile();
    },
    async listEffectTypes() {
      return window.slide.listEffectTypes();
    },
    async listHistory(opts) {
      const result = await window.slide.listTtsHistory(opts);
      if (!result.ok) throw new Error(result.error);
      return result.entries.map(toHistoryEntry);
    },
    async getHistoryAudioUrl(id) {
      return window.slide.getTtsHistoryAudioUrl(id);
    },
    async deleteHistoryEntry(id) {
      return window.slide.deleteTtsHistoryEntry(id);
    },
    async clearHistory() {
      return window.slide.clearTtsHistory();
    },
  };
}
