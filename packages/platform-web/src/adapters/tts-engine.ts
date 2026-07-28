import type { TtsEnginePort, TtsCapabilities, TtsConfig, TtsEngines } from '@sky-app/service-contracts';

/**
 * Web TtsEnginePort — chỉ nhóm ĐỌC và ĐỔI CẤU HÌNH, gọi thẳng HTTP tới tts-service.
 *
 * CỐ TÌNH bỏ nhóm cài đặt (preflight, install…, verify, delete, import, export,
 * installAccel, onInstallProgress): những thao tác đó tải model + runtime Python vào máy người
 * dùng, chỉ main process Electron làm được. Trang web không có quyền đó, và tts-service
 * ở đây là dịch vụ từ xa dùng chung — một client không được phép cài đặt hay khởi động
 * lại nó thay cho mọi client khác.
 *
 * UI phân biệt bằng capability `'tts-local'` (Electron có, Web không) chứ không dò từng
 * method, nên phần giao diện cài đặt tự ẩn trên Web.
 *
 * `restart()` cũng bỏ: đổi `device`/`engine` chỉ có hiệu lực sau khi service khởi động
 * lại, việc đó do người vận hành server làm — UI cần thông báo rõ điều này cho người
 * dùng Web thay vì im lặng như thể đã áp dụng xong.
 */
export function createWebTtsEnginePort(baseUrl = 'http://localhost:8093'): TtsEnginePort {
  return {
    async listEngines() {
      const res = await fetch(`${baseUrl}/engines`);
      if (!res.ok) return null;
      return (await res.json()) as TtsEngines;
    },

    async getCapabilities() {
      const res = await fetch(`${baseUrl}/capabilities`);
      if (!res.ok) return null;
      return (await res.json()) as TtsCapabilities;
    },

    async getConfig() {
      const res = await fetch(`${baseUrl}/config`);
      if (!res.ok) return null;
      return (await res.json()) as TtsConfig;
    },

    async setConfig(partial) {
      const res = await fetch(`${baseUrl}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      if (!res.ok) {
        return { ok: false, error: `Cập nhật cấu hình thất bại: ${res.status}` };
      }
      return { ok: true, config: (await res.json()) as TtsConfig };
    },

    async switchEngine(engineId) {
      // Không có endpoint đổi engine riêng — ghi vào config. Service phải khởi động
      // lại thì mới nạp engine mới, việc đó nằm ngoài tầm với của client web. UI nhận
      // biết qua việc `restart` không tồn tại trên port này để báo cho người dùng.
      const res = await fetch(`${baseUrl}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: engineId }),
      });
      if (!res.ok) return { ok: false, error: `Đổi engine thất bại: ${res.status}` };
      return { ok: true };
    },

    async getHealth() {
      // Nguồn sự thật chung cho mọi nền tảng — xem doc comment trên contract. Không có
      // getProcessStatus/onProcessStatus/getDebugInfo trên Web: không có tiến trình local
      // nào để theo dõi, chỉ biết được đúng những gì HTTP trả về.
      try {
        const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
        return { ok: res.ok };
      } catch {
        return { ok: false };
      }
    },
  };
}
