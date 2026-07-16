import type { SqlExecutor } from '../sql-executor.js';
import type { Ceremony, CeremonyBundle } from '@sky-app/slide-shared';
import { getAppConfig, upsertAppConfig } from './config.js';
import { getCustomVariables, replaceCustomVariables } from './custom-variable.js';
import { getStudents, replaceStudents } from './student.js';

interface CeremonyRow {
  id: number;
  room_id: string;
  room_name: string;
  name: string;
  graduation_year: string;
  date: string;
  venue: string;
  university_name: string;
  ministry_name: string;
  title_line1: string;
  title_line2: string;
  logo: string;
  backdrops_config: string;
  idle_image: string | null;
  idle_image_variants: string | null;
  synced_at: string | null;
  bundle_version: string | null;
}

function rowToCeremony(row: CeremonyRow): Ceremony {
  return {
    id: row.id,
    name: row.name,
    graduation_year: row.graduation_year,
    date: row.date,
    venue: row.venue,
    university_name: row.university_name,
    ministry_name: row.ministry_name,
    title_line1: row.title_line1,
    title_line2: row.title_line2,
    logo: row.logo,
    backdrops_config: row.backdrops_config,
    idle_image: row.idle_image ?? undefined,
    idle_image_variants: row.idle_image_variants ? JSON.parse(row.idle_image_variants) : undefined,
  };
}

/** Đọc ceremony đầu tiên theo room_id — Giai đoạn 0 chỉ có 1 ceremony/room, giống bundle.json cũ. */
function getCeremonyRow(executor: SqlExecutor, roomId: string): CeremonyRow | null {
  const rows = executor.query<CeremonyRow>('SELECT * FROM ceremony WHERE room_id = ? LIMIT 1', [roomId]);
  return rows[0] ?? null;
}

export function getCeremonyBundle(executor: SqlExecutor, roomId = 'default'): CeremonyBundle | null {
  const row = getCeremonyRow(executor, roomId);
  if (!row) return null;

  const config = getAppConfig(executor, row.id);
  if (!config) return null;

  return {
    room_id: row.room_id,
    room_name: row.room_name,
    ceremony: rowToCeremony(row),
    config: { ...config, custom_variables: getCustomVariables(executor, row.id) },
    students: getStudents(executor, row.id),
    // session_state không nằm trong phạm vi Giai đoạn 0 (vẫn quản lý bởi session-store.ts
    // riêng, file JSON atomic write) — trả placeholder rỗng, caller (CeremonyStore) tự lấy
    // session thật từ session-store, không dùng field này.
    session_state: {
      current_on_stage_msv: null,
      pending_msv: null,
      mode: config.mode,
      last_scan_msv: null,
      last_scan_ts: null,
      broadcast_count: 0,
      sync_queue: [],
    },
    _synced_at: row.synced_at ?? undefined,
    _bundle_version: row.bundle_version ?? undefined,
  };
}

/** Ghi toàn bộ bundle vào 5 bảng trong 1 transaction — thay writeFileSync toàn file cũ. */
export function saveCeremonyBundle(executor: SqlExecutor, bundle: CeremonyBundle): void {
  executor.transaction(() => {
    const existing = getCeremonyRow(executor, bundle.room_id);
    const c = bundle.ceremony;
    const idleVariantsJson = c.idle_image_variants ? JSON.stringify(c.idle_image_variants) : null;

    let ceremonyId: number;
    if (existing) {
      ceremonyId = existing.id;
      executor.run(
        `UPDATE ceremony SET room_name=?, name=?, graduation_year=?, date=?, venue=?,
         university_name=?, ministry_name=?, title_line1=?, title_line2=?, logo=?,
         backdrops_config=?, idle_image=?, idle_image_variants=?, synced_at=?, bundle_version=?
         WHERE id=?`,
        [
          bundle.room_name, c.name, c.graduation_year, c.date, c.venue, c.university_name,
          c.ministry_name, c.title_line1, c.title_line2, c.logo, c.backdrops_config,
          c.idle_image ?? null, idleVariantsJson, bundle._synced_at ?? null,
          bundle._bundle_version ?? null, ceremonyId,
        ],
      );
    } else {
      const result = executor.run(
        `INSERT INTO ceremony (
          room_id, room_name, name, graduation_year, date, venue, university_name,
          ministry_name, title_line1, title_line2, logo, backdrops_config, idle_image,
          idle_image_variants, synced_at, bundle_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          bundle.room_id, bundle.room_name, c.name, c.graduation_year, c.date, c.venue,
          c.university_name, c.ministry_name, c.title_line1, c.title_line2, c.logo,
          c.backdrops_config, c.idle_image ?? null, idleVariantsJson, bundle._synced_at ?? null,
          bundle._bundle_version ?? null,
        ],
      );
      // better-sqlite3 run() không trả lastInsertRowid qua interface SqlExecutor tối giản —
      // đọc lại theo room_id để lấy id vừa tạo (đơn giản hơn mở rộng interface cho 1 trường hợp).
      const created = getCeremonyRow(executor, bundle.room_id);
      if (!created) throw new Error(`saveCeremonyBundle: không đọc lại được ceremony vừa tạo (room_id=${bundle.room_id})`);
      ceremonyId = created.id;
      void result;
    }

    upsertAppConfig(executor, ceremonyId, bundle.config);
    replaceCustomVariables(executor, ceremonyId, bundle.config.custom_variables ?? []);
    replaceStudents(executor, ceremonyId, bundle.students);
  });
}
