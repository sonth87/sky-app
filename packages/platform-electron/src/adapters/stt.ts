import type { SttHistoryEntry as SttHistoryEntryPort, SttPort } from '@sky-app/service-contracts';
import type { SlideApi, SttHistoryEntry } from '@sky-app/slide-shared';

declare global {
  interface Window {
    slide: SlideApi;
  }
}

function toSttHistoryEntry(e: SttHistoryEntry): SttHistoryEntryPort {
  return {
    id: e.id,
    source: e.source,
    text: e.text,
    language: e.language,
    durationSec: e.duration_sec,
    engineId: e.engine_id,
    sourceFilename: e.source_filename,
    error: e.error,
    createdAt: e.created_at,
  };
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
    async transcribeVoiceSample(voiceId, sampleId, opts) {
      const res = await window.slide.sttTranscribeVoiceSample?.(voiceId, sampleId, opts);
      return res ?? { ok: false, error: 'Bridge không hỗ trợ sttTranscribeVoiceSample' };
    },
    async pickAudioFile() {
      return window.slide.pickAudioFile();
    },
    async listHistory(opts) {
      const entries = await window.slide.sttListHistory?.(opts);
      return (entries ?? []).map(toSttHistoryEntry);
    },
    async deleteHistoryEntry(id) {
      const res = await window.slide.sttDeleteHistoryEntry?.(id);
      return res ?? { ok: false, error: 'Bridge không hỗ trợ sttDeleteHistoryEntry' };
    },
    async clearHistory() {
      const res = await window.slide.sttClearHistory?.();
      return res ?? { ok: false, error: 'Bridge không hỗ trợ sttClearHistory' };
    },
  };
}
