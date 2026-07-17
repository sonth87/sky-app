import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync } from 'node:fs';
import type { AppConfig, Ceremony, Student, CeremonyBundle as SlideSharedBundle } from '@sky-app/slide-shared';
import {
  BetterSqlite3Executor,
  runMigrations,
  getCeremonyBundle as dbGetCeremonyBundle,
  saveCeremonyBundle as dbSaveCeremonyBundle,
  mapRawStudent,
  defaultCeremony,
  type RawStudent,
} from '@sky-app/ceremony-db/node';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_PATH = join(DATA_DIR, 'ceremony.db');
const SAMPLE_STUDENTS_PATH = join(__dirname, '..', '..', 'shell-electron', 'sample-bundle', 'data', 'students.json');

const ROOM_ID = 'default';

/**
 * Shape RIÊNG của data-service — khác slide-shared's CeremonyBundle (không có
 * room_id/session_state/_bundle_version, data-service không quản lý multi-room hay session
 * vận hành). @sky-app/ceremony-db dùng slide-shared's CeremonyBundle (đầy đủ field) — store.ts
 * này là tầng adapter map qua lại giữa 2 shape, KHÔNG đổi API `readBundle`/`writeBundle` mà
 * routes/data.ts đang gọi.
 */
export interface CeremonyBundle {
  ceremony: Ceremony;
  config: AppConfig;
  students: Student[];
  syncedAt: string | null;
}

// RawStudent, mapStatus, mapRawStudent, defaultCeremony GOM VỀ @sky-app/ceremony-db (seed.ts,
// 2026-07-16) — import ở trên. Chỉ defaultConfig giữ RIÊNG vì data-service dùng giá trị mặc
// định KHÁC Electron (port 8766, mode manual, kiosk off...).
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

function seedFromSample(): CeremonyBundle {
  const raw = JSON.parse(readFileSync(SAMPLE_STUDENTS_PATH, 'utf-8')) as RawStudent[];
  return {
    ceremony: defaultCeremony(),
    config: defaultConfig(),
    students: raw.map(mapRawStudent),
    syncedAt: null,
  };
}

let executor: BetterSqlite3Executor | null = null;

function getExecutor(): BetterSqlite3Executor {
  if (!executor) {
    mkdirSync(DATA_DIR, { recursive: true });
    executor = new BetterSqlite3Executor(DB_PATH);
    runMigrations(executor);
  }
  return executor;
}

function toSlideSharedBundle(bundle: CeremonyBundle): SlideSharedBundle {
  return {
    room_id: ROOM_ID,
    room_name: '',
    ceremony: bundle.ceremony,
    config: bundle.config,
    students: bundle.students,
    session_state: {
      current_on_stage_msv: null,
      pending_msv: null,
      mode: bundle.config.mode,
      last_scan_msv: null,
      last_scan_ts: null,
      broadcast_count: 0,
      sync_queue: [],
    },
    _synced_at: bundle.syncedAt ?? undefined,
  };
}

function fromSlideSharedBundle(bundle: SlideSharedBundle): CeremonyBundle {
  return {
    ceremony: bundle.ceremony,
    config: bundle.config,
    students: bundle.students,
    syncedAt: bundle._synced_at ?? null,
  };
}

export function readBundle(): CeremonyBundle {
  const loaded = dbGetCeremonyBundle(getExecutor(), ROOM_ID);
  if (!loaded) return seedFromSample();
  return fromSlideSharedBundle(loaded);
}

export function writeBundle(bundle: CeremonyBundle): void {
  dbSaveCeremonyBundle(getExecutor(), toSlideSharedBundle(bundle));
}

export function syncFromSample(): CeremonyBundle {
  const bundle = seedFromSample();
  bundle.syncedAt = new Date().toISOString();
  writeBundle(bundle);
  return bundle;
}

export function resetAll(): CeremonyBundle {
  const bundle = seedFromSample();
  bundle.students = [];
  bundle.syncedAt = null;
  writeBundle(bundle);
  return bundle;
}

export function resetStudentOperationalFields(): CeremonyBundle {
  const bundle = readBundle();
  bundle.students = bundle.students.map((s) => ({
    ...s,
    status: 'registered' as const,
    ts_checkin: null,
    ts_called: null,
    ts_on_stage: null,
    ts_returned: null,
    src_on_stage: null,
    staff_presenter: null,
  }));
  writeBundle(bundle);
  return bundle;
}
