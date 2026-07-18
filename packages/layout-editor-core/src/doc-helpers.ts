// Helper thuần thao tác LayoutContent bất biến (immutable) — dùng bởi commands.ts.
// KHÔNG sửa doc gốc — luôn trả bản sao mới (cần thiết cho undo/invert giữ đúng state cũ).

import type { LayoutContent, LayoutItem, LayoutVariant } from '@sky-app/slide-shared';

export function findVariant(doc: LayoutContent, variantId: string): LayoutVariant | undefined {
  return doc.variants.find((v) => v.aspect.id === variantId);
}

/** Thêm 1 variant mới vào cuối `variants[]` — không thêm nếu đã có variant cùng aspect.id
 * (mỗi tỷ lệ chỉ 1 variant trong 1 layout, theo 12-thu-vien-layout.md). */
export function addVariant(doc: LayoutContent, variant: LayoutVariant): LayoutContent {
  if (findVariant(doc, variant.aspect.id)) return doc;
  return { ...doc, variants: [...doc.variants, variant] };
}

/** Xoá 1 variant theo aspect.id — không xoá nếu chỉ còn đúng 1 variant (LayoutContent.variants
 * PHẢI có ít nhất 1, xem slide-shared/layout/types.ts). */
export function removeVariant(doc: LayoutContent, variantId: string): LayoutContent {
  if (doc.variants.length <= 1) return doc;
  return { ...doc, variants: doc.variants.filter((v) => v.aspect.id !== variantId) };
}

export function findItem(doc: LayoutContent, variantId: string, itemId: string): LayoutItem | undefined {
  return findVariant(doc, variantId)?.items.find((i) => i.id === itemId);
}

/** Thay `items[]` của 1 variant (theo aspect.id), giữ nguyên mọi variant khác. */
export function replaceVariantItems(doc: LayoutContent, variantId: string, items: LayoutItem[]): LayoutContent {
  return {
    ...doc,
    variants: doc.variants.map((v) => (v.aspect.id === variantId ? { ...v, items } : v)),
  };
}

/** Thay TOÀN BỘ 1 variant (không chỉ items[]) — dùng khi đổi aspect/refW/refH TẠI CHỖ (giữ đúng
 * vị trí trong mảng `variants[]`, KHÔNG xoá-thêm-lại như addVariant/removeVariant) — xem
 * changeVariantAspectCommand (commands.ts, Giai đoạn 2.6 review "Đổi tỷ lệ"). */
export function replaceVariant(doc: LayoutContent, oldVariantId: string, newVariant: LayoutVariant): LayoutContent {
  return {
    ...doc,
    variants: doc.variants.map((v) => (v.aspect.id === oldVariantId ? newVariant : v)),
  };
}

export function addItem(doc: LayoutContent, variantId: string, item: LayoutItem): LayoutContent {
  const variant = findVariant(doc, variantId);
  if (!variant) return doc;
  return replaceVariantItems(doc, variantId, [...variant.items, item]);
}

export function removeItem(doc: LayoutContent, variantId: string, itemId: string): LayoutContent {
  const variant = findVariant(doc, variantId);
  if (!variant) return doc;
  return replaceVariantItems(
    doc,
    variantId,
    variant.items.filter((i) => i.id !== itemId),
  );
}

/** Patch 1 item theo id — merge nông (Object.assign-style) với `patch`. */
export function patchItem(doc: LayoutContent, variantId: string, itemId: string, patch: Partial<LayoutItem>): LayoutContent {
  const variant = findVariant(doc, variantId);
  if (!variant) return doc;
  return replaceVariantItems(
    doc,
    variantId,
    variant.items.map((i) => (i.id === itemId ? ({ ...i, ...patch } as LayoutItem) : i)),
  );
}
