import type { SttEnginePort, SttEngines } from '@sky-app/service-contracts';

/**
 * Web SttEnginePort — gọi thẳng HTTP tới tts-service. Không cần cắt bớt nhóm cài đặt như
 * TtsEnginePort's Web adapter phải làm (xem docstring ở đó): `SttEnginePort` GĐ 1 vốn đã
 * không khai nhóm đó (cài đặt tái dùng UI TTS hiện có, chỉ chạy trên Electron).
 *
 * `switchEngine` ở đây có hiệu lực NGAY (POST /stt/engines/switch đổi tại chỗ trong
 * process, không cần khởi động lại service) — khác `TtsEnginePort`'s Web `switchEngine`
 * phải ghi vào config chờ restart, vì STT chỉ giữ 1 instance đơn giản, không có state
 * on-stage nào cần bảo vệ khỏi đổi engine giữa chừng.
 */
export function createWebSttEnginePort(baseUrl = 'http://localhost:8093'): SttEnginePort {
  return {
    async listEngines() {
      const res = await fetch(`${baseUrl}/stt/engines`);
      if (!res.ok) return null;
      return (await res.json()) as SttEngines;
    },

    async switchEngine(engineId) {
      const res = await fetch(`${baseUrl}/stt/engines/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine_id: engineId }),
      });
      if (!res.ok) return { ok: false, error: `Đổi engine STT thất bại: ${res.status}` };
      return { ok: true };
    },
  };
}
