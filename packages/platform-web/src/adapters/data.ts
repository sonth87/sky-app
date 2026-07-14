import type { DataPort } from '@sky-app/service-contracts';

/**
 * Web DataPort — gọi apps/data-service's REST backend (local-dev-only, xem
 * docs/guides/ports-and-adapters.md + apps/data-service/README nếu có).
 * onSyncProgress không có tương đương HTTP thật cho backend đơn giản này
 * (sync là 1 lần ghi JSON bulk, không có tiến độ async) — synthesize 1 event
 * 100% ngay sau khi sync() resolve, đây là simplification có chủ đích, khớp
 * phạm vi local-dev đã chốt, không phải thiếu sót.
 */
export function createWebDataPort(baseUrl = 'http://localhost:8094'): DataPort {
  return {
    async getMeta() {
      const res = await fetch(`${baseUrl}/api/data/meta`);
      if (!res.ok) throw new Error(`DataPort getMeta failed: ${res.status}`);
      return res.json();
    },

    async sync(opts) {
      const res = await fetch(`${baseUrl}/api/data/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts ?? {}),
      });
      if (!res.ok) throw new Error(`DataPort sync failed: ${res.status}`);
    },

    async exportData() {
      const res = await fetch(`${baseUrl}/api/data/export`);
      if (!res.ok) throw new Error(`DataPort exportData failed: ${res.status}`);
      return res.json();
    },

    onSyncProgress(handler) {
      handler({ processed: 1, total: 1 });
      return () => {};
    },
  };
}
