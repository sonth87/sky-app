/**
 * layout-bundle — Giai đoạn 5.4 (Export/Import Loại 1, docs/roadmap/plans/layout-designer/
 * 15-import-export.md). 2 hàm thuần orchestration: buildLayoutBundle (export) gom 1 hoặc nhiều
 * LayoutDocument thành 1 manifest + danh sách assets; applyLayoutBundle (import) khôi phục vào
 * LayoutStore của máy đích. KHÔNG đụng tới zip/dialog/filesystem — đó là việc của Electron main
 * process (apps/shell-electron/electron/ipc.ts), tách riêng để test được bằng in-memory SQLite.
 */

import type { SqlExecutor } from '../sql-executor.js';
import type { LayoutDocument, LayoutExportBundle } from '@sky-app/slide-shared';
import { getLayoutDocument, listLayoutDocuments, createLayoutDocument, updateLayoutDocumentMeta } from './layout.js';

/**
 * Gom bundle xuất 1 hoặc nhiều LayoutDocument — gồm layout metadata + content + danh sách
 * assets được tham chiếu. Trả rỗng nếu layoutIds không tồn tại hoặc rỗng.
 */
export function buildLayoutBundle(executor: SqlExecutor, layoutIds: string[]): LayoutExportBundle {
  const layouts: LayoutDocument[] = [];
  const assets = new Set<string>();

  for (const id of layoutIds) {
    const doc = getLayoutDocument(executor, id);
    if (!doc) continue;
    layouts.push(doc);

    // Thu thập tất cả assets từ currentDraft
    for (const variant of doc.currentDraft.variants) {
      if (variant.background?.src) assets.add(variant.background.src);
      for (const item of variant.items) {
        if (item.type === 'image') {
          if (item.src) assets.add(item.src);
          if (item.ring) assets.add(item.ring);
        }
      }
    }
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    layouts: layouts.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      color: l.color,
      category: l.category,
      tags: l.tags,
      content: l.currentDraft,
    })),
    assets: Array.from(assets),
  };
}

/**
 * Kết quả áp dụng bundle.
 */
export interface ApplyLayoutBundleResult {
  imported: number; // số layout được import
  renamed: number; // số layout bị rename do ID trùng
}

/**
 * Áp dụng LayoutExportBundle vào LayoutStore — import layout(s) + metadata, xử lý ID trùng
 * theo strategy ('rename' = tạo ID mới / 'keep' = bỏ qua cái trùng).
 */
export function applyLayoutBundle(
  executor: SqlExecutor,
  bundle: LayoutExportBundle,
  strategy: 'rename' | 'keep' = 'rename',
): ApplyLayoutBundleResult {
  const existing = listLayoutDocuments(executor);
  const existingIds = new Set(existing.map((l) => l.id));

  let imported = 0;
  let renamed = 0;

  executor.transaction(() => {
    for (const bundleLayout of bundle.layouts) {
      const isConflict = existingIds.has(bundleLayout.id);

      if (!isConflict) {
        createLayoutDocument(executor, bundleLayout.id, bundleLayout.name, bundleLayout.content, bundleLayout.description);
        if (bundleLayout.color || bundleLayout.category || bundleLayout.tags) {
          updateLayoutDocumentMeta(executor, bundleLayout.id, {
            color: bundleLayout.color,
            category: bundleLayout.category,
            tags: bundleLayout.tags,
          });
        }
        imported++;
      } else if (strategy === 'rename') {
        const newId = `layout_${crypto.randomUUID()}`;
        createLayoutDocument(executor, newId, bundleLayout.name, bundleLayout.content, bundleLayout.description);
        if (bundleLayout.color || bundleLayout.category || bundleLayout.tags) {
          updateLayoutDocumentMeta(executor, newId, {
            color: bundleLayout.color,
            category: bundleLayout.category,
            tags: bundleLayout.tags,
          });
        }
        imported++;
        renamed++;
      }
      // strategy === 'keep' → bỏ qua
    }
  });

  return { imported, renamed };
}
