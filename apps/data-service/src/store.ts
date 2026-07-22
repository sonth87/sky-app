import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import type { AppConfig, Ceremony, CanonicalRecord } from '@sky-app/slide-shared';
import {
  BetterSqlite3Executor,
  runMigrations,
  getCeremonyWithConfig,
  saveCeremonyWithConfig,
  defaultCeremony,
} from '@sky-app/ceremony-db/node';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_PATH = join(DATA_DIR, 'ceremony.db');

const ROOM_ID = 'default';

/**
 * Shape RIÊNG của data-service — không có room_id/session_state (data-service không quản lý
 * multi-room hay session vận hành, chỉ dùng cho dev local, không có Event/DataSource như
 * Electron). Giai đoạn "bỏ Student" (2026-07-22): danh sách người tham dự giờ là
 * CanonicalRecord[] — data-service KHÔNG còn tự seed từ sample-bundle (RawStudent/mapRawStudent
 * đã xoá cùng luồng Import ZIP legacy), records mặc định rỗng, chỉ ghi được qua writeRecords()
 * nếu cần test thủ công.
 */
export interface CeremonyBundle {
  ceremony: Ceremony;
  config: AppConfig;
  records: CanonicalRecord[];
  syncedAt: string | null;
}

// defaultCeremony gom về @sky-app/ceremony-db (seed.ts). Chỉ defaultConfig giữ RIÊNG vì
// data-service dùng giá trị mặc định KHÁC Electron (port 8766, mode manual, kiosk off...).
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

let cachedRecords: CanonicalRecord[] = [];

let executor: BetterSqlite3Executor | null = null;

/** Dùng chung bởi routes/layout.ts — cùng 1 file DB, tránh mở 2 kết nối SQLite song song. */
export function getExecutor(): BetterSqlite3Executor {
  if (!executor) {
    mkdirSync(DATA_DIR, { recursive: true });
    executor = new BetterSqlite3Executor(DB_PATH);
    runMigrations(executor);
  }
  return executor;
}

export function readBundle(): CeremonyBundle {
  const loaded = getCeremonyWithConfig(getExecutor(), ROOM_ID);
  if (!loaded) {
    return { ceremony: defaultCeremony(), config: defaultConfig(), records: cachedRecords, syncedAt: null };
  }
  return { ceremony: loaded.ceremony, config: loaded.config, records: cachedRecords, syncedAt: null };
}

export function writeBundle(bundle: CeremonyBundle): void {
  saveCeremonyWithConfig(getExecutor(), {
    roomId: ROOM_ID,
    roomName: '',
    ceremony: bundle.ceremony,
    config: bundle.config,
  });
  cachedRecords = bundle.records;
}

export function resetAll(): CeremonyBundle {
  const bundle: CeremonyBundle = { ceremony: defaultCeremony(), config: defaultConfig(), records: [], syncedAt: null };
  writeBundle(bundle);
  return bundle;
}
