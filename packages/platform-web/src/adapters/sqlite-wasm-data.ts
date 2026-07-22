import type { DataPort } from '@sky-app/service-contracts';
import { getCeremonyWithConfig, saveCeremonyWithConfig, defaultCeremony } from '@sky-app/ceremony-db/browser';
import type { AppConfig, Ceremony } from '@sky-app/slide-shared';
import { getSharedWasmExecutor, persistSharedWasmExecutor } from '../wasm-executor.js';

const ROOM_ID = 'default';

// defaultCeremony GOM VỀ @sky-app/ceremony-db (seed.ts, 2026-07-16) — import ở trên.
// defaultConfig giữ riêng (web fallback dùng cùng giá trị data-service: port 8766, mode manual).
function defaultConfig(): AppConfig {
  return {
    ws_port: 8765,
    http_port: 8766,
    mode: 'manual',
    delay_seconds: 3,
    auto_open_browser: false,
    kiosk_mode: false,
    auto_load_first: false,
    slide_display_seconds: 8,
    idle_timeout_enabled: false,
    idle_timeout_seconds: 60,
  };
}

/**
 * DataPort chạy hoàn toàn trong trình duyệt (sql.js + IndexedDB) — dùng khi `data-service`
 * không khả dụng (VD deploy serverless như Vercel, chưa có server riêng). Dữ liệu chỉ tồn tại
 * trên đúng trình duyệt/máy đó, KHÔNG đồng bộ với máy khác qua mạng — mục đích là "làm việc
 * offline trên web", dùng Import/Export (khi có, Giai đoạn 5) làm cầu nối mang dữ liệu sang
 * Electron. Xem docs/roadmap/plans/layout-designer/18-luu-tru-sqlite-supabase.md §1a.
 *
 * Giai đoạn "bỏ Student" (2026-07-22): không còn RawStudent/mapRawStudent/sample data — records
 * mặc định rỗng, nguồn dữ liệu thật là Event/DataSource (qua kernel:dataSource:* trên Electron;
 * web hiện chưa có UI tương đương, records ở đây chỉ phục vụ ceremony/config offline tối thiểu).
 */
export interface SqliteWasmDataPortOptions {
  /** URL public của sql-wasm.wasm — bắt buộc truyền đúng trong bundle Vite (xem
   * SqlJsExecutor's loadSqlJsModule comment). shell-web truyền qua `import wasmUrl from
   * 'sql.js/dist/sql-wasm.wasm?url'`. */
  wasmUrl?: string;
}

export function createSqliteWasmDataPort(opts: SqliteWasmDataPortOptions = {}): DataPort {
  const { wasmUrl } = opts;

  async function ensureCeremony(executor: Awaited<ReturnType<typeof getSharedWasmExecutor>>): Promise<{ ceremony: Ceremony; config: AppConfig }> {
    const loaded = getCeremonyWithConfig(executor, ROOM_ID);
    if (loaded) return loaded;
    const ceremony = defaultCeremony();
    const config = defaultConfig();
    saveCeremonyWithConfig(executor, { roomId: ROOM_ID, roomName: '', ceremony, config });
    await persistSharedWasmExecutor(executor);
    return { ceremony, config };
  }

  return {
    async getMeta() {
      const executor = await getSharedWasmExecutor(wasmUrl);
      const { ceremony, config } = await ensureCeremony(executor);
      return {
        ceremony,
        config,
        records: [],
        hasData: false,
        apiEnvironment: 'prod',
      };
    },

    async sync() {
      throw new Error('SqliteWasmAdapter.sync() chưa hỗ trợ — import dữ liệu là Electron-only.');
    },

    async exportData() {
      return [];
    },

    onSyncProgress(handler) {
      handler({ processed: 1, total: 1 });
      return () => {};
    },
  };
}
