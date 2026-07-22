// LayoutStore — query functions cho layout versioning (publish/draft/lịch sử), theo
// docs/roadmap/plans/layout-designer/21-layout-versioning.md §3, §7 "GĐ2 (editor): LayoutStore
// thêm saveDraft/publish/listVersions/getVersion/restoreVersion".

import type { SqlExecutor } from '../sql-executor.js';
import type { LayoutContent, LayoutDocument, LayoutVersion } from '@sky-app/slide-shared';

interface LayoutDocumentRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  latest_published_version: number | null;
  created_at: string;
  updated_at: string;
}

interface LayoutDraftRow {
  layout_document_id: string;
  content_json: string;
  updated_at: string;
}

interface LayoutVersionRow {
  layout_document_id: string;
  version: number;
  content_json: string;
  published_at: string;
  note: string | null;
}

function rowToVersion(row: LayoutVersionRow): LayoutVersion {
  return {
    version: row.version,
    content: JSON.parse(row.content_json) as LayoutContent,
    publishedAt: row.published_at,
    note: row.note ?? undefined,
  };
}

/** Đọc 1 LayoutDocument đầy đủ (metadata + draft + toàn bộ lịch sử version), hoặc null nếu chưa có. */
export function getLayoutDocument(executor: SqlExecutor, id: string): LayoutDocument | null {
  const docRows = executor.query<LayoutDocumentRow>('SELECT * FROM layout_document WHERE id = ?', [id]);
  const docRow = docRows[0];
  if (!docRow) return null;

  const draftRows = executor.query<LayoutDraftRow>('SELECT * FROM layout_draft WHERE layout_document_id = ?', [id]);
  const draftRow = draftRows[0];
  if (!draftRow) {
    throw new Error(`getLayoutDocument: layout_document "${id}" tồn tại nhưng thiếu layout_draft — dữ liệu không nhất quán`);
  }

  const versionRows = executor.query<LayoutVersionRow>(
    'SELECT * FROM layout_version WHERE layout_document_id = ? ORDER BY version ASC',
    [id],
  );

  return {
    id: docRow.id,
    name: docRow.name,
    description: docRow.description ?? undefined,
    color: docRow.color ?? undefined,
    currentDraft: JSON.parse(draftRow.content_json) as LayoutContent,
    publishedVersions: versionRows.map(rowToVersion),
    createdAt: docRow.created_at,
    updatedAt: docRow.updated_at,
  };
}

export function listLayoutDocuments(executor: SqlExecutor): Array<{ id: string; name: string; description?: string; color?: string; latestPublishedVersion: number | null }> {
  const rows = executor.query<LayoutDocumentRow>('SELECT * FROM layout_document ORDER BY updated_at DESC');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    color: r.color ?? undefined,
    latestPublishedVersion: r.latest_published_version,
  }));
}

/** Tạo layout mới — draft khởi tạo bằng `initialContent`, chưa có version nào đã publish. */
export function createLayoutDocument(executor: SqlExecutor, id: string, name: string, initialContent: LayoutContent, description?: string): void {
  const now = new Date().toISOString();
  executor.transaction(() => {
    executor.run(
      'INSERT INTO layout_document (id, name, description, color, latest_published_version, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?)',
      [id, name, description ?? null, now, now],
    );
    executor.run('INSERT INTO layout_draft (layout_document_id, content_json, updated_at) VALUES (?, ?, ?)', [
      id,
      JSON.stringify(initialContent),
      now,
    ]);
  });
}

/** Cập nhật metadata layout (hiện chỉ `color` — PHỤ LỤC "Event Hub", 2026-07-22). Mở rộng thêm
 * `name`/`description` sau nếu cần, KHÔNG đổi `currentDraft`/`publishedVersions`. */
export function updateLayoutDocumentMeta(executor: SqlExecutor, id: string, patch: { color?: string }): void {
  const now = new Date().toISOString();
  executor.run('UPDATE layout_document SET color = ?, updated_at = ? WHERE id = ?', [patch.color ?? null, now, id]);
}

/**
 * Save draft (KHÔNG publish) — theo file 21 §2 "Save ≠ Publish". Sửa nhiều lần vẫn là draft,
 * không tăng version, không ảnh hưởng Event nào đang dùng version đã publish.
 */
export function saveDraft(executor: SqlExecutor, layoutDocumentId: string, content: LayoutContent): void {
  const now = new Date().toISOString();
  executor.transaction(() => {
    const changes = executor.run('UPDATE layout_draft SET content_json = ?, updated_at = ? WHERE layout_document_id = ?', [
      JSON.stringify(content),
      now,
      layoutDocumentId,
    ]).changes;
    if (changes === 0) {
      throw new Error(`saveDraft: layout_document "${layoutDocumentId}" không tồn tại (chưa createLayoutDocument)`);
    }
    executor.run('UPDATE layout_document SET updated_at = ? WHERE id = ?', [now, layoutDocumentId]);
  });
}

/**
 * Publish = đóng băng draft hiện tại thành 1 version mới (vN+1), bất biến (file 21 §2).
 * Draft KHÔNG bị xoá sau publish — tiếp tục sửa từ đó cho lần publish kế tiếp.
 */
export function publish(executor: SqlExecutor, layoutDocumentId: string, note?: string): LayoutVersion {
  return executor.transaction(() => {
    const draftRows = executor.query<LayoutDraftRow>('SELECT * FROM layout_draft WHERE layout_document_id = ?', [layoutDocumentId]);
    const draftRow = draftRows[0];
    if (!draftRow) throw new Error(`publish: layout_document "${layoutDocumentId}" không có draft để publish`);

    const docRows = executor.query<LayoutDocumentRow>('SELECT * FROM layout_document WHERE id = ?', [layoutDocumentId]);
    const docRow = docRows[0];
    if (!docRow) throw new Error(`publish: layout_document "${layoutDocumentId}" không tồn tại`);

    const nextVersion = (docRow.latest_published_version ?? 0) + 1;
    const now = new Date().toISOString();

    executor.run(
      'INSERT INTO layout_version (layout_document_id, version, content_json, published_at, note) VALUES (?, ?, ?, ?, ?)',
      [layoutDocumentId, nextVersion, draftRow.content_json, now, note ?? null],
    );
    executor.run('UPDATE layout_document SET latest_published_version = ?, updated_at = ? WHERE id = ?', [nextVersion, now, layoutDocumentId]);

    return { version: nextVersion, content: JSON.parse(draftRow.content_json) as LayoutContent, publishedAt: now, note };
  });
}

export function listVersions(executor: SqlExecutor, layoutDocumentId: string): LayoutVersion[] {
  const rows = executor.query<LayoutVersionRow>(
    'SELECT * FROM layout_version WHERE layout_document_id = ? ORDER BY version ASC',
    [layoutDocumentId],
  );
  return rows.map(rowToVersion);
}

export function getVersion(executor: SqlExecutor, layoutDocumentId: string, version: number): LayoutVersion | null {
  const rows = executor.query<LayoutVersionRow>(
    'SELECT * FROM layout_version WHERE layout_document_id = ? AND version = ?',
    [layoutDocumentId, version],
  );
  const row = rows[0];
  return row ? rowToVersion(row) : null;
}

/**
 * Khôi phục 1 version cũ về draft (file 21 §4: "copy content của version đó thành draft mới —
 * KHÔNG xóa lịch sử; bản khôi phục publish ra sẽ là vN+1 mang nội dung của bản cũ").
 */
export function restoreVersion(executor: SqlExecutor, layoutDocumentId: string, version: number): void {
  const target = getVersion(executor, layoutDocumentId, version);
  if (!target) throw new Error(`restoreVersion: layout "${layoutDocumentId}" không có version ${version}`);
  saveDraft(executor, layoutDocumentId, target.content);
}
