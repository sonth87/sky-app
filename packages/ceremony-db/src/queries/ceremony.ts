import type { SqlExecutor } from '../sql-executor.js';
import type { AppConfig, Ceremony } from '@sky-app/slide-shared';
import { getAppConfig, upsertAppConfig } from './config.js';

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

/**
 * Đọc ceremony theo room_id, hoặc dòng đầu tiên nếu không truyền roomId — DB local chỉ có 1
 * ceremony nên "dòng duy nhất" là ngữ nghĩa đúng cho phía đọc (Electron seed bundle với room_id
 * nghiệp vụ như 'H1', KHÔNG phải hằng 'default' — đọc theo hằng cứng sẽ trượt dòng đã lưu).
 */
function getCeremonyRow(executor: SqlExecutor, roomId?: string): CeremonyRow | null {
  const rows = roomId
    ? executor.query<CeremonyRow>('SELECT * FROM ceremony WHERE room_id = ? LIMIT 1', [roomId])
    : executor.query<CeremonyRow>('SELECT * FROM ceremony LIMIT 1');
  return rows[0] ?? null;
}

/**
 * Đọc riêng `ceremony`+`app_config` — TÁCH KHỎI `students`/`custom_variables` (giai đoạn "bỏ
 * Student", 2026-07-22). Trước đây gộp chung qua `getCeremonyBundle`/`CeremonyBundle`, nhưng
 * đó là khái niệm gắn với luồng Import ZIP legacy (bundle ceremony+config+students) đang bị loại
 * bỏ — ceremony/config là cấu hình TĨNH của buổi lễ, không còn lý do gộp cùng danh sách người
 * tham dự (giờ sống ở data_source_record, đọc riêng qua getDataSourceRecords).
 */
export function getCeremonyWithConfig(executor: SqlExecutor, roomId?: string): { ceremony: Ceremony; config: AppConfig } | null {
  const row = getCeremonyRow(executor, roomId);
  if (!row) return null;
  const config = getAppConfig(executor, row.id);
  if (!config) return null;
  return { ceremony: rowToCeremony(row), config };
}

export function getCeremonyRowRaw(executor: SqlExecutor, roomId?: string): { id: number; roomId: string; roomName: string } | null {
  const row = getCeremonyRow(executor, roomId);
  if (!row) return null;
  return { id: row.id, roomId: row.room_id, roomName: row.room_name };
}

interface SaveCeremonyInput {
  roomId: string;
  roomName: string;
  ceremony: Ceremony;
  config: AppConfig;
  syncedAt?: string;
  bundleVersion?: string;
}

/** Ghi `ceremony`+`app_config` trong 1 transaction — KHÔNG còn ghi students/custom_variables
 * (xem getCeremonyWithConfig). Trả `ceremonyId` (số) để caller dùng cho các bảng khác nếu cần. */
export function saveCeremonyWithConfig(executor: SqlExecutor, input: SaveCeremonyInput): number {
  return executor.transaction(() => {
    const existing = getCeremonyRow(executor, input.roomId);
    const c = input.ceremony;
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
          input.roomName, c.name, c.graduation_year, c.date, c.venue, c.university_name,
          c.ministry_name, c.title_line1, c.title_line2, c.logo, c.backdrops_config,
          c.idle_image ?? null, idleVariantsJson, input.syncedAt ?? null,
          input.bundleVersion ?? null, ceremonyId,
        ],
      );
    } else {
      executor.run(
        `INSERT INTO ceremony (
          room_id, room_name, name, graduation_year, date, venue, university_name,
          ministry_name, title_line1, title_line2, logo, backdrops_config, idle_image,
          idle_image_variants, synced_at, bundle_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.roomId, input.roomName, c.name, c.graduation_year, c.date, c.venue,
          c.university_name, c.ministry_name, c.title_line1, c.title_line2, c.logo,
          c.backdrops_config, c.idle_image ?? null, idleVariantsJson, input.syncedAt ?? null,
          input.bundleVersion ?? null,
        ],
      );
      // better-sqlite3 run() không trả lastInsertRowid qua interface SqlExecutor tối giản —
      // đọc lại theo room_id để lấy id vừa tạo (đơn giản hơn mở rộng interface cho 1 trường hợp).
      const created = getCeremonyRow(executor, input.roomId);
      if (!created) throw new Error(`saveCeremonyWithConfig: không đọc lại được ceremony vừa tạo (room_id=${input.roomId})`);
      ceremonyId = created.id;
    }

    upsertAppConfig(executor, ceremonyId, input.config);
    return ceremonyId;
  });
}
