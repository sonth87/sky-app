import type { SttHistoryEntry as SttHistoryEntryPort, SttPort } from '@sky-app/service-contracts';
import type { SttHistoryEntry } from '@sky-app/slide-shared';

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
 * Web SttPort — POST multipart thẳng tới tts-service's /stt/transcribe (cùng service
 * phục vụ TTS, xem docs/dev/history/2026-08-14-stt-nen-tang-giai-doan-1.md). Không khai
 * `pickAudioFile` — Web dùng `<input type="file">` native của trình duyệt, không có hộp
 * thoại OS để delegate (mirror cách TtsPort's Web adapter cũng bỏ method này).
 *
 * Lịch sử (GĐ 3): Web implement ĐẦY ĐỦ cả 3 method — KHÁC TtsPort's Web adapter (cố tình bỏ
 * lịch sử vì có audio-URL phức tạp không tương thích môi trường đa-client dùng chung server).
 * STT lịch sử chỉ text nên không có rào cản đó.
 */
export function createWebSttPort(baseUrl = 'http://localhost:8093'): SttPort {
  return {
    async transcribe(filePath, opts) {
      if (!(filePath instanceof File)) {
        throw new Error('Web transcribe requires a File object');
      }
      const formData = new FormData();
      formData.append('file', filePath);
      if (opts?.language) formData.append('language', opts.language);
      if (opts?.engineId) formData.append('engine_id', opts.engineId);
      if (opts?.source) formData.append('source', opts.source);

      const res = await fetch(`${baseUrl}/stt/transcribe`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        return { ok: false, error: (await res.text()) || `Phiên âm thất bại: ${res.status}` };
      }
      return await res.json();
    },

    async transcribeVoiceSample(voiceId, sampleId, opts) {
      const res = await fetch(
        `${baseUrl}/voices/${encodeURIComponent(voiceId)}/samples/${encodeURIComponent(sampleId)}/transcribe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: opts?.language, engine_id: opts?.engineId }),
        },
      );
      if (!res.ok) {
        return { ok: false, error: (await res.text()) || `Phiên âm thất bại: ${res.status}` };
      }
      return await res.json();
    },

    async listHistory(opts) {
      const params = new URLSearchParams();
      if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
      if (opts?.source) params.set('source', opts.source);
      const qs = params.toString();
      const res = await fetch(`${baseUrl}/stt/history${qs ? `?${qs}` : ''}`);
      if (!res.ok) return [];
      const entries = (await res.json()) as SttHistoryEntry[];
      return entries.map(toSttHistoryEntry);
    },

    async deleteHistoryEntry(id) {
      const res = await fetch(`${baseUrl}/stt/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        return { ok: false, error: (await res.text()) || `Xoá thất bại: ${res.status}` };
      }
      return await res.json();
    },

    async clearHistory() {
      const res = await fetch(`${baseUrl}/stt/history`, { method: 'DELETE' });
      if (!res.ok) {
        return { ok: false, error: (await res.text()) || `Xoá thất bại: ${res.status}` };
      }
      return await res.json();
    },
  };
}
