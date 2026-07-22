// EventStore query — Giai đoạn 3 kế hoạch Event, theo docs/roadmap/plans/layout-designer/
// 10-quan-ly-dot-le-event.md + 13-ceremony-mo-rong.md. Pattern giống queries/layout.ts (interface
// Row snake_case + rowToX() map camelCase, hàm nhận executor đầu tiên).

import type { SqlExecutor } from '../sql-executor.js';
import type { CustomVariable, EventDocument, EventLayoutRef, EventSummary, FieldMapSource, LayoutSelector } from '@sky-app/slide-shared';

interface EventRow {
  id: string;
  name: string;
  status: string;
  scheduled_at: string | null;
  archived_at: string | null;
  data_source_id: string | null;
  cloned_from: string | null;
  custom_variables_json: string;
  created_at: string;
  updated_at: string;
}

interface EventLayoutRefRow {
  id: string;
  event_id: string;
  layout_document_id: string;
  layout_version: number;
  priority: number;
  selector_json: string | null;
  overrides_json: string | null;
  field_map_json: string;
  role: string;
}

function rowToEventLayoutRef(row: EventLayoutRefRow): EventLayoutRef {
  return {
    layoutId: row.layout_document_id,
    layoutVersion: row.layout_version,
    selector: row.selector_json ? (JSON.parse(row.selector_json) as LayoutSelector) : undefined,
    overrides: row.overrides_json ? (JSON.parse(row.overrides_json) as EventLayoutRef['overrides']) : undefined,
    fieldMap: JSON.parse(row.field_map_json) as Record<string, FieldMapSource>,
    role: row.role as 'award' | 'idle',
  };
}

function loadLayoutRefs(executor: SqlExecutor, eventId: string): EventLayoutRef[] {
  const rows = executor.query<EventLayoutRefRow>(
    'SELECT * FROM event_layout_ref WHERE event_id = ? ORDER BY priority DESC',
    [eventId],
  );
  return rows.map(rowToEventLayoutRef);
}

function rowToEvent(row: EventRow, layoutRefs: EventLayoutRef[]): EventDocument {
  return {
    id: row.id,
    name: row.name,
    status: row.status as EventDocument['status'],
    scheduledAt: row.scheduled_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    customVariables: JSON.parse(row.custom_variables_json) as CustomVariable[],
    layoutRefs,
    dataSourceId: row.data_source_id ?? undefined,
    clonedFrom: row.cloned_from ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getEvent(executor: SqlExecutor, id: string): EventDocument | null {
  const rows = executor.query<EventRow>('SELECT * FROM event WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) return null;
  return rowToEvent(row, loadLayoutRefs(executor, id));
}

export function listEvents(executor: SqlExecutor): EventSummary[] {
  const rows = executor.query<EventRow>('SELECT * FROM event ORDER BY updated_at DESC');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status as EventSummary['status'],
    scheduledAt: r.scheduled_at ?? undefined,
    updatedAt: r.updated_at,
  }));
}

/** Ghi lại toàn bộ layoutRefs của 1 Event — xoá hết rồi insert lại (đơn giản hơn diff, chấp
 * nhận được vì số lượng layoutRefs/Event nhỏ, GĐ3 chưa có UI sửa nhiều lần liên tục). */
function replaceLayoutRefs(executor: SqlExecutor, eventId: string, refs: EventLayoutRef[]): void {
  executor.run('DELETE FROM event_layout_ref WHERE event_id = ?', [eventId]);
  for (const ref of refs) {
    const role = ref.role ?? 'award';
    executor.run(
      'INSERT INTO event_layout_ref (id, event_id, layout_document_id, layout_version, priority, selector_json, overrides_json, field_map_json, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        // Prefix `role` — 1 Event có thể dùng CÙNG layoutId+layoutVersion cho cả layout trao
        // giải VÀ màn chờ, tránh đụng PRIMARY KEY nếu chỉ ghép eventId:layoutId:layoutVersion.
        `${eventId}:${role}:${ref.layoutId}:${ref.layoutVersion}`,
        eventId,
        ref.layoutId,
        ref.layoutVersion,
        ref.selector?.priority ?? 0,
        ref.selector ? JSON.stringify(ref.selector) : null,
        ref.overrides ? JSON.stringify(ref.overrides) : null,
        JSON.stringify(ref.fieldMap),
        role,
      ],
    );
  }
}

export function createEvent(executor: SqlExecutor, doc: Omit<EventDocument, 'createdAt' | 'updatedAt'>): void {
  const now = new Date().toISOString();
  executor.transaction(() => {
    executor.run(
      'INSERT INTO event (id, name, status, scheduled_at, archived_at, data_source_id, cloned_from, custom_variables_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        doc.id,
        doc.name,
        doc.status,
        doc.scheduledAt ?? null,
        doc.archivedAt ?? null,
        doc.dataSourceId ?? null,
        doc.clonedFrom ?? null,
        JSON.stringify(doc.customVariables),
        now,
        now,
      ],
    );
    replaceLayoutRefs(executor, doc.id, doc.layoutRefs);
  });
}

export function saveEvent(executor: SqlExecutor, doc: EventDocument): void {
  const now = new Date().toISOString();
  executor.transaction(() => {
    const changes = executor.run(
      'UPDATE event SET name = ?, status = ?, scheduled_at = ?, archived_at = ?, data_source_id = ?, custom_variables_json = ?, updated_at = ? WHERE id = ?',
      [
        doc.name,
        doc.status,
        doc.scheduledAt ?? null,
        doc.archivedAt ?? null,
        doc.dataSourceId ?? null,
        JSON.stringify(doc.customVariables),
        now,
        doc.id,
      ],
    ).changes;
    if (changes === 0) throw new Error(`saveEvent: event "${doc.id}" không tồn tại (chưa createEvent)`);
    replaceLayoutRefs(executor, doc.id, doc.layoutRefs);
  });
}

export function getCurrentActiveEvent(executor: SqlExecutor): EventDocument | null {
  const rows = executor.query<EventRow>("SELECT * FROM event WHERE status = 'active' LIMIT 1");
  const row = rows[0];
  if (!row) return null;
  return rowToEvent(row, loadLayoutRefs(executor, row.id));
}

/**
 * CHỈ 1 event có status='active' tại 1 thời điểm (10-quan-ly-dot-le-event.md §"Chuyển đổi
 * Event", A9 — setActive là cách DUY NHẤT đổi Event đang chạy). Event đang active TRƯỚC ĐÓ (nếu
 * có) chuyển về 'scheduled' — nó vẫn là 1 Event hợp lệ đã cấu hình đầy đủ, chỉ không còn active
 * (KHÔNG lùi về 'draft', vốn có nghĩa "chưa hoàn thiện").
 */
export function setActiveEvent(executor: SqlExecutor, id: string): void {
  const now = new Date().toISOString();
  executor.transaction(() => {
    const target = executor.query<EventRow>('SELECT id FROM event WHERE id = ?', [id]);
    if (!target[0]) throw new Error(`setActiveEvent: event "${id}" không tồn tại`);
    executor.run("UPDATE event SET status = 'scheduled', updated_at = ? WHERE status = 'active' AND id != ?", [now, id]);
    executor.run("UPDATE event SET status = 'active', updated_at = ? WHERE id = ?", [now, id]);
  });
}
