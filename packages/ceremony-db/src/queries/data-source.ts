// DataSourceStore query — Giai đoạn 3 (đọc) + Giai đoạn 4a (ghi: create/importRecords) kế
// hoạch Event, theo docs/roadmap/plans/layout-designer/13-ceremony-mo-rong.md §"Trách nhiệm 4"
// + 22-import-modal.md.

import type { SqlExecutor } from '../sql-executor.js';
import type { CanonicalGroup, CanonicalSubject, DataSource, DataSourceSummary } from '@sky-app/slide-shared';

interface DataSourceRow {
  id: string;
  label: string;
  mode: string;
  natural_key_field: string;
  mapping_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

interface DataSourceRecordRow {
  id: string;
  data_source_id: string;
  subject_type: string;
  full_name: string;
  image_relative_path: string | null;
  status: string | null;
  display_order: number | null;
  members_json: string | null;
  extra_json: string;
  natural_key: string;
  identifier_code: string | null;
  identity_number: string | null;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  title: string | null;
  description: string | null;
}

/**
 * `data_source_record.id` là PRIMARY KEY TOÀN CỤC (migration 005, không composite với
 * data_source_id) — 2 DataSource khác nhau đều import từ file có cùng khoá tự nhiên (VD 2 khoá
 * "SV001" hoàn toàn độc lập nhau, mỗi cái ở 1 DataSource riêng) sẽ đụng UNIQUE constraint nếu
 * dùng thẳng giá trị khoá tự nhiên làm SQL id (bug thật phát hiện qua test, 2026-07-19). Prefix
 * nội bộ `${dataSourceId}::${naturalKeyValue}` đảm bảo unique toàn cục ở TẦNG LƯU TRỮ, nhưng
 * `CanonicalSubject.id` trả CHO ỨNG DỤNG vẫn là giá trị khoá tự nhiên GỐC (bóc tách lại ở
 * rowToRecord) — record chỉ có ý nghĩa trong ngữ cảnh 1 DataSource cụ thể tại 1 thời điểm, ứng
 * dụng không bao giờ cần so sánh id giữa 2 DataSource khác nhau, nên không cần rò rỉ prefix ra.
 */
function toStorageId(dataSourceId: string, naturalKeyValue: string): string {
  return `${dataSourceId}::${naturalKeyValue}`;
}

function fromStorageId(storageId: string): string {
  const sepIndex = storageId.indexOf('::');
  return sepIndex === -1 ? storageId : storageId.slice(sepIndex + 2);
}

function rowToRecord(row: DataSourceRecordRow): CanonicalSubject | CanonicalGroup {
  const extra = JSON.parse(row.extra_json) as Record<string, string | number>;
  const id = fromStorageId(row.id);
  const coreFields = {
    identifierCode: row.identifier_code ?? undefined,
    identityNumber: row.identity_number ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    dateOfBirth: row.date_of_birth ?? undefined,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
  };
  if (row.subject_type === 'group') {
    return {
      id,
      displayOrder: row.display_order ?? undefined,
      subjectType: 'group',
      full_name: row.full_name,
      image_relative_path: row.image_relative_path ?? undefined,
      status: row.status ?? undefined,
      ...coreFields,
      members: row.members_json ? (JSON.parse(row.members_json) as CanonicalSubject[]) : undefined,
      extra,
    };
  }
  return {
    id,
    displayOrder: row.display_order ?? undefined,
    full_name: row.full_name,
    image_relative_path: row.image_relative_path ?? undefined,
    status: row.status ?? undefined,
    subjectType: row.subject_type,
    ...coreFields,
    extra,
  };
}

export function getDataSource(executor: SqlExecutor, id: string): DataSource | null {
  const rows = executor.query<DataSourceRow>('SELECT * FROM data_source WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) return null;
  const recordRows = executor.query<DataSourceRecordRow>(
    'SELECT * FROM data_source_record WHERE data_source_id = ? ORDER BY display_order ASC',
    [id],
  );
  return {
    id: row.id,
    label: row.label,
    mode: row.mode as DataSource['mode'],
    naturalKeyField: row.natural_key_field,
    mappingProfileId: row.mapping_profile_id ?? undefined,
    records: recordRows.map(rowToRecord),
  };
}

export function listDataSources(executor: SqlExecutor): DataSourceSummary[] {
  const rows = executor.query<DataSourceRow & { record_count: number }>(
    `SELECT ds.*, (SELECT COUNT(*) FROM data_source_record WHERE data_source_id = ds.id) AS record_count
     FROM data_source ds ORDER BY ds.updated_at DESC`,
  );
  return rows.map((r) => ({ id: r.id, label: r.label, mode: r.mode as DataSource['mode'], recordCount: r.record_count }));
}

/**
 * `excludeConsumedForEvent` — lọc bỏ record đã "dùng" ở BẤT KỲ Event nào cùng trỏ DataSource
 * này (JOIN event_consumed_record, KHÔNG chỉ eventId truyền vào — đúng thiết kế "cộng dồn qua
 * nhiều Event dùng chung 1 DataSource mode='consumable'", 13-ceremony-mo-rong.md §"Câu hỏi mở").
 * Chỉ áp dụng khi DataSource.mode='consumable'; 'pooled' luôn trả toàn bộ record.
 */
export function getDataSourceRecords(
  executor: SqlExecutor,
  dataSourceId: string,
  opts?: { excludeConsumedForEvent?: string },
): Array<CanonicalSubject | CanonicalGroup> {
  const dsRows = executor.query<DataSourceRow>('SELECT mode FROM data_source WHERE id = ?', [dataSourceId]);
  const mode = dsRows[0]?.mode;

  if (opts?.excludeConsumedForEvent && mode === 'consumable') {
    const rows = executor.query<DataSourceRecordRow>(
      `SELECT r.* FROM data_source_record r
       WHERE r.data_source_id = ?
       AND r.id NOT IN (
         SELECT ecr.data_source_record_id FROM event_consumed_record ecr
         JOIN event e ON e.id = ecr.event_id
         WHERE e.data_source_id = ?
       )
       ORDER BY r.display_order ASC`,
      [dataSourceId, dataSourceId],
    );
    return rows.map(rowToRecord);
  }

  const rows = executor.query<DataSourceRecordRow>(
    'SELECT * FROM data_source_record WHERE data_source_id = ? ORDER BY display_order ASC',
    [dataSourceId],
  );
  return rows.map(rowToRecord);
}

/** Tạo 1 DataSource MỚI, RỖNG (chưa có record — importRecords ghi record ở bước riêng). */
export function insertDataSource(executor: SqlExecutor, doc: Omit<DataSource, 'records'>): void {
  const now = new Date().toISOString();
  executor.run(
    'INSERT INTO data_source (id, label, mode, natural_key_field, mapping_profile_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [doc.id, doc.label, doc.mode, doc.naturalKeyField, doc.mappingProfileId ?? null, now, now],
  );
}

/**
 * Ghi 1 batch record vào DataSource đã tồn tại (transaction — all-or-nothing). `record.id`
 * (giá trị khoá tự nhiên gốc, caller gán sẵn = record.extra[naturalKeyField] lúc applyMapping,
 * xem CreateEventWizard.tsx) được LƯU nguyên vào cột `natural_key`, nhưng SQL `id` (PK) dùng
 * `toStorageId(dataSourceId, record.id)` để tránh đụng UNIQUE constraint toàn cục khi 2
 * DataSource khác nhau tình cờ có cùng giá trị khoá tự nhiên (xem comment `toStorageId`).
 */
export function insertDataSourceRecords(
  executor: SqlExecutor,
  dataSourceId: string,
  records: Array<CanonicalSubject | CanonicalGroup>,
): { imported: number } {
  executor.transaction(() => {
    records.forEach((record, index) => {
      const isGroup = 'members' in record;
      executor.run(
        `INSERT INTO data_source_record (
           id, data_source_id, subject_type, full_name, image_relative_path, status, display_order,
           members_json, extra_json, natural_key,
           identifier_code, identity_number, phone, email, date_of_birth, title, description
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          toStorageId(dataSourceId, record.id),
          dataSourceId,
          record.subjectType,
          record.full_name,
          record.image_relative_path ?? null,
          record.status ?? null,
          record.displayOrder ?? index,
          isGroup && record.members ? JSON.stringify(record.members) : null,
          JSON.stringify(record.extra),
          record.id,
          record.identifierCode ?? null,
          record.identityNumber ?? null,
          record.phone ?? null,
          record.email ?? null,
          record.dateOfBirth ?? null,
          record.title ?? null,
          record.description ?? null,
        ],
      );
    });
  });
  return { imported: records.length };
}
