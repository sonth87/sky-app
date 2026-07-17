import type { DataPort } from '@sky-app/service-contracts';
import {
  SqlJsExecutor,
  loadDbBytes,
  saveDbBytes,
  runMigrations,
  getCeremonyBundle,
  saveCeremonyBundle,
  mapRawStudent,
  defaultCeremony,
  type RawStudent,
} from '@sky-app/ceremony-db/browser';
import type { CeremonyBundle, AppConfig } from '@sky-app/slide-shared';

const ROOM_ID = 'default';

// mapStatus/mapRawStudent/defaultCeremony/RawStudent GOM VỀ @sky-app/ceremony-db (seed.ts,
// 2026-07-16) — import ở trên. defaultConfig giữ riêng (web fallback dùng cùng giá trị
// data-service: port 8766, mode manual).
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

function emptyBundle(): CeremonyBundle {
  return {
    room_id: ROOM_ID,
    room_name: '',
    ceremony: defaultCeremony(),
    config: defaultConfig(),
    students: [],
    session_state: {
      current_on_stage_msv: null,
      pending_msv: null,
      mode: 'manual',
      last_scan_msv: null,
      last_scan_ts: null,
      broadcast_count: 0,
      sync_queue: [],
    },
  };
}

let executorPromise: Promise<SqlJsExecutor> | null = null;

async function getExecutor(wasmUrl?: string): Promise<SqlJsExecutor> {
  if (!executorPromise) {
    executorPromise = (async () => {
      const bytes = await loadDbBytes();
      const executor = await SqlJsExecutor.create(bytes, wasmUrl);
      runMigrations(executor);
      return executor;
    })();
  }
  return executorPromise;
}

async function persist(executor: SqlJsExecutor): Promise<void> {
  await saveDbBytes(executor.export());
}

/**
 * DataPort chạy hoàn toàn trong trình duyệt (sql.js + IndexedDB) — dùng khi `data-service`
 * không khả dụng (VD deploy serverless như Vercel, chưa có server riêng). Dữ liệu chỉ tồn tại
 * trên đúng trình duyệt/máy đó, KHÔNG đồng bộ với máy khác qua mạng — mục đích là "làm việc
 * offline trên web", dùng Import/Export (khi có, Giai đoạn 5) làm cầu nối mang dữ liệu sang
 * Electron. Xem docs/roadmap/plans/layout-designer/18-luu-tru-sqlite-supabase.md §1a.
 */
export interface SqliteWasmDataPortOptions {
  sampleStudentsUrl?: string;
  /** URL public của sql-wasm.wasm — bắt buộc truyền đúng trong bundle Vite (xem
   * SqlJsExecutor's loadSqlJsModule comment). shell-web truyền qua `import wasmUrl from
   * 'sql.js/dist/sql-wasm.wasm?url'`. */
  wasmUrl?: string;
}

export function createSqliteWasmDataPort(opts: SqliteWasmDataPortOptions = {}): DataPort {
  const { sampleStudentsUrl, wasmUrl } = opts;
  return {
    async getMeta() {
      const executor = await getExecutor(wasmUrl);
      const bundle = getCeremonyBundle(executor, ROOM_ID) ?? emptyBundle();
      return {
        ceremony: bundle.ceremony,
        config: bundle.config,
        students: bundle.students,
        syncedAt: bundle._synced_at ?? null,
        hasData: bundle.students.length > 0,
        apiEnvironment: 'prod',
      };
    },

    async sync(opts) {
      const executor = await getExecutor(wasmUrl);
      if (opts?.useSample) {
        if (!sampleStudentsUrl) {
          throw new Error('SqliteWasmAdapter.sync({useSample:true}) cần sampleStudentsUrl');
        }
        const res = await fetch(sampleStudentsUrl);
        if (!res.ok) throw new Error(`Không tải được sample students.json: ${res.status}`);
        const raw = (await res.json()) as RawStudent[];
        const bundle = emptyBundle();
        bundle.students = raw.map(mapRawStudent);
        bundle._synced_at = new Date().toISOString();
        saveCeremonyBundle(executor, bundle);
        await persist(executor);
        return;
      }
      throw new Error('SqliteWasmAdapter.sync() chỉ hỗ trợ useSample — import ZIP là Electron-only.');
    },

    async exportData() {
      const executor = await getExecutor(wasmUrl);
      const bundle = getCeremonyBundle(executor, ROOM_ID) ?? emptyBundle();
      return bundle.students;
    },

    onSyncProgress(handler) {
      handler({ processed: 1, total: 1 });
      return () => {};
    },
  };
}
