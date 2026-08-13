/**
 * LayoutExportBundle business logic — build & apply bundles (GĐ5.4, docs/roadmap/plans/
 * layout-designer/15-import-export.md "Loại 1").
 *
 * buildLayoutBundle: LayoutDocument[] → LayoutExportBundle (collect tất cả assets từ layouts)
 * applyLayoutBundle: LayoutExportBundle + existing LayoutStore → merged state (xử lý ID trùng)
 */

import type { LayoutExportBundle } from './event.js';
import type { LayoutDocument, LayoutItem } from './types.js';

/** Duyệt LayoutContent để tìm tất cả asset được tham chiếu */
export function extractAssetsFromLayout(layout: LayoutDocument): string[] {
  const assets = new Set<string>();

  // Duyệt tất cả variants
  for (const variant of layout.currentDraft.variants) {
    // Thêm background image nếu có
    if (variant.background?.src) {
      assets.add(variant.background.src);
    }

    // Duyệt tất cả items tìm ảnh tĩnh + ring
    walkLayoutItems(variant.items, (item) => {
      if (item.type === 'image') {
        if (item.src) assets.add(item.src);
        if (item.ring) assets.add(item.ring);
      }
    });
  }

  return Array.from(assets);
}

/** Đệ quy duyệt layout items (kể cả LoopItem.itemTemplate) */
function walkLayoutItems(items: LayoutItem[], callback: (item: LayoutItem) => void): void {
  for (const item of items) {
    callback(item);
    if (item.type === 'loop') {
      walkLayoutItems(item.itemTemplate, callback);
    }
  }
}

/**
 * Xây dựng LayoutExportBundle từ danh sách LayoutDocument.
 * Gom lại tất cả asset được tham chiếu từ các layout.
 */
export function buildLayoutBundle(layouts: LayoutDocument[]): LayoutExportBundle {
  const allAssets = new Set<string>();

  for (const layout of layouts) {
    const layoutAssets = extractAssetsFromLayout(layout);
    layoutAssets.forEach((a) => allAssets.add(a));
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
    assets: Array.from(allAssets),
  };
}

/**
 * Kết quả áp dụng bundle vào store hiện tại.
 * `imported`: mảng layout đã import thành công
 * `collisions`: { layoutId, action: 'renamed' | 'kept' }[] — những cái ID trùng xử lý như thế nào
 */
export interface ApplyBundleResult {
  imported: LayoutDocument[];
  collisions: Array<{ layoutId: string; action: 'renamed' | 'kept' }>;
}

/**
 * Áp dụng LayoutExportBundle vào LayoutStore hiện tại.
 * - ID không trùng → thêm bình thường
 * - ID trùng → hỏi xử lý qua tham số `strategy`
 *   - 'rename': tạo ID mới (UUID), giữ name cũ
 *   - 'keep': không import cái trùng, giữ version cũ trong store
 *
 * `existingLayouts`: map { [id]: LayoutDocument } từ store hiện tại
 */
export function applyLayoutBundle(
  bundle: LayoutExportBundle,
  existingLayouts: Record<string, LayoutDocument>,
  strategy: 'rename' | 'keep' = 'rename',
): ApplyBundleResult {
  const imported: LayoutDocument[] = [];
  const collisions: ApplyBundleResult['collisions'] = [];

  for (const bundleLayout of bundle.layouts) {
    const isConflict = bundleLayout.id in existingLayouts;

    if (!isConflict) {
      // ID chưa tồn tại → import bình thường
      imported.push({
        id: bundleLayout.id,
        name: bundleLayout.name,
        description: bundleLayout.description,
        color: bundleLayout.color,
        category: bundleLayout.category,
        tags: bundleLayout.tags,
        currentDraft: bundleLayout.content,
        publishedVersions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else if (strategy === 'rename') {
      // ID trùng → tạo ID mới
      const newLayout: LayoutDocument = {
        id: generateUniqueLayoutId(),
        name: bundleLayout.name,
        description: bundleLayout.description,
        color: bundleLayout.color,
        category: bundleLayout.category,
        tags: bundleLayout.tags,
        currentDraft: bundleLayout.content,
        publishedVersions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      imported.push(newLayout);
      collisions.push({ layoutId: bundleLayout.id, action: 'renamed' });
    } else {
      // strategy === 'keep' → bỏ qua
      collisions.push({ layoutId: bundleLayout.id, action: 'kept' });
    }
  }

  return { imported, collisions };
}

/** Sinh ID mới ổn định (dùng UUID, match với cách Ceremony quản lý Event) */
function generateUniqueLayoutId(): string {
  return `layout_${crypto.randomUUID()}`;
}
