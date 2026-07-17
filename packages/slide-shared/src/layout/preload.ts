// Preload ảnh — theo docs/roadmap/plans/layout-designer/20-rasoat-2026-07-16.md §B3:
// "LayoutRenderer render ảnh nền/avatar theo record; thiếu preload ảnh record kế tiếp thì mỗi
// lần gọi tên có khoảnh khắc trắng." → preload ảnh record KẾ TIẾP + ảnh nền MỌI variant của
// layout đang active, trước khi cần hiển thị.

import type { LayoutContent, LayoutItem } from './types.js';
import type { CanonicalRecord, CanonicalSubject } from './canonical.js';
import { isCanonicalGroup } from './canonical.js';

/** Duyệt hết items (kể cả bên trong LoopItem.itemTemplate) thu thập varKey của ảnh. */
function collectImageVarKeys(items: LayoutItem[], out: Set<string>): void {
  for (const item of items) {
    if (item.type === 'image' && item.varKey) out.add(item.varKey);
    if (item.type === 'loop') collectImageVarKeys(item.itemTemplate, out);
  }
}

/** Đọc giá trị field trên 1 subject (lõi hoặc extra) — dùng riêng ở preload, không phụ thuộc React. */
function readField(subject: CanonicalSubject, key: string): string | undefined {
  if (key === 'image_relative_path') return subject.image_relative_path;
  const v = subject.extra[key];
  return v == null ? undefined : String(v);
}

/**
 * Danh sách relative path ảnh cần preload cho 1 layout + 1 record: ảnh nền của TẤT CẢ variant
 * (không chỉ variant đang hiển thị — đổi tỷ lệ màn giữa lễ hiếm nhưng không nên nháy trắng) +
 * avatar/ảnh của record đó (kể cả members nếu là group).
 */
export function collectLayoutImagePaths(content: LayoutContent, record: CanonicalRecord): string[] {
  const paths = new Set<string>();

  for (const variant of content.variants) {
    if (variant.background?.kind === 'image' && variant.background.src) {
      paths.add(variant.background.src);
    }

    const varKeys = new Set<string>();
    collectImageVarKeys(variant.items, varKeys);
    if (varKeys.size === 0) continue;

    const subjects: CanonicalSubject[] = isCanonicalGroup(record) ? (record.members ?? []) : [record];
    for (const subject of subjects) {
      for (const key of varKeys) {
        const p = readField(subject, key);
        if (p) paths.add(p);
      }
    }
  }

  return [...paths];
}

/**
 * Danh sách relative path ảnh cần preload cho record KẾ TIẾP trong hàng đợi (B3) — gọi trước
 * khi record đó lên sân khấu, để `resolveAsset` đã có sẵn trong cache trình duyệt/Electron.
 */
export function collectNextRecordImagePaths(content: LayoutContent, nextRecord: CanonicalRecord | null): string[] {
  if (!nextRecord) return [];
  return collectLayoutImagePaths(content, nextRecord);
}

/**
 * Thực thi preload thật — tạo `Image()` ẩn cho từng URL đã resolve, trả Promise khi tất cả đã
 * load (hoặc lỗi, KHÔNG throw — ảnh thiếu không được chặn preload các ảnh còn lại, fail-soft
 * giống nguyên tắc token §2 file 09).
 */
export function preloadImages(relativePaths: string[], resolveAsset: (relativePath: string) => string): Promise<void[]> {
  return Promise.all(
    relativePaths.map(
      (relPath) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve(); // fail-soft: ảnh lỗi không chặn các ảnh khác
          img.src = resolveAsset(relPath);
        }),
    ),
  );
}
