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
  category: string | null;
  tags_json: string;
  latest_published_version: number | null;
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
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
    category: docRow.category ?? undefined,
    tags: JSON.parse(docRow.tags_json) as string[],
    currentDraft: JSON.parse(draftRow.content_json) as LayoutContent,
    publishedVersions: versionRows.map(rowToVersion),
    createdAt: docRow.created_at,
    updatedAt: docRow.updated_at,
    trashedAt: docRow.trashed_at ?? undefined,
  };
}

export function listLayoutDocuments(executor: SqlExecutor): Array<{ id: string; name: string; description?: string; color?: string; category?: string; tags?: string[]; latestPublishedVersion: number | null }> {
  const rows = executor.query<LayoutDocumentRow>('SELECT * FROM layout_document WHERE trashed_at IS NULL ORDER BY updated_at DESC');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    color: r.color ?? undefined,
    category: r.category ?? undefined,
    tags: JSON.parse(r.tags_json) as string[],
    latestPublishedVersion: r.latest_published_version,
  }));
}

/** Tạo layout mới — draft khởi tạo bằng `initialContent`, chưa có version nào đã publish.
 * category/tags luôn rỗng lúc tạo — set sau qua updateDocumentMeta (panel "Thông tin layout"). */
export function createLayoutDocument(executor: SqlExecutor, id: string, name: string, initialContent: LayoutContent, description?: string): void {
  const now = new Date().toISOString();
  executor.transaction(() => {
    executor.run(
      "INSERT INTO layout_document (id, name, description, color, category, tags_json, latest_published_version, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, '[]', NULL, ?, ?)",
      [id, name, description ?? null, now, now],
    );
    executor.run('INSERT INTO layout_draft (layout_document_id, content_json, updated_at) VALUES (?, ?, ?)', [
      id,
      JSON.stringify(initialContent),
      now,
    ]);
  });
}

/** Cập nhật metadata layout (name/description/color/category/tags — Giai đoạn 5.2, trước đó chỉ
 * có `color`). TRUE partial-patch: chỉ SET cột nào thực sự có mặt trong `patch` (khác hành vi cũ
 * "ghi đè toàn bộ" — nâng lên vì đây là lần đầu method này có call site production thật, ghi đè
 * nhầm field khác khi chỉ định sửa 1 field sẽ là bug thật). KHÔNG đổi `currentDraft`/
 * `publishedVersions`. */
export function updateLayoutDocumentMeta(
  executor: SqlExecutor,
  id: string,
  patch: { name?: string; description?: string; color?: string; category?: string; tags?: string[] },
): void {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    values.push(patch.name);
  }
  if (patch.description !== undefined) {
    sets.push('description = ?');
    values.push(patch.description);
  }
  if (patch.color !== undefined) {
    sets.push('color = ?');
    values.push(patch.color);
  }
  if (patch.category !== undefined) {
    sets.push('category = ?');
    values.push(patch.category);
  }
  if (patch.tags !== undefined) {
    sets.push('tags_json = ?');
    values.push(JSON.stringify(patch.tags));
  }
  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  executor.run(`UPDATE layout_document SET ${sets.join(', ')} WHERE id = ?`, values);
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

/** Xoá layout vào thùng rác (soft delete) — đặt trashed_at timestamp. Layout sẽ không hiện ở
 * listLayoutDocuments() nhưng dữ liệu vẫn lưu cho khôi phục sau nếu cần. */
export function moveToTrash(executor: SqlExecutor, layoutDocumentId: string): void {
  const now = new Date().toISOString();
  const changes = executor.run('UPDATE layout_document SET trashed_at = ? WHERE id = ?', [now, layoutDocumentId]).changes;
  if (changes === 0) {
    throw new Error(`moveToTrash: layout_document "${layoutDocumentId}" không tồn tại`);
  }
}
