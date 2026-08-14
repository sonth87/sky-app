import type { SttPort } from '@sky-app/service-contracts';

/**
 * Web SttPort — POST multipart thẳng tới tts-service's /stt/transcribe (cùng service
 * phục vụ TTS, xem docs/dev/history/2026-08-14-stt-nen-tang-giai-doan-1.md). Không khai
 * `pickAudioFile` — Web dùng `<input type="file">` native của trình duyệt, không có hộp
 * thoại OS để delegate (mirror cách TtsPort's Web adapter cũng bỏ method này).
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

      const res = await fetch(`${baseUrl}/stt/transcribe`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        return { ok: false, error: (await res.text()) || `Phiên âm thất bại: ${res.status}` };
      }
      return await res.json();
    },
  };
}
