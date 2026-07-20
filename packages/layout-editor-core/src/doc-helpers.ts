// Helper thuần thao tác LayoutContent bất biến (immutable) — dùng bởi commands.ts.
// KHÔNG sửa doc gốc — luôn trả bản sao mới (cần thiết cho undo/invert giữ đúng state cũ).

import type { LayoutContent, LayoutItem, LayoutVariant } from '@sky-app/slide-shared';

export function findVariant(doc: LayoutContent, variantId: string): LayoutVariant | undefined {
  return doc.variants.find((v) => v.aspect.id === variantId);
}

/**
 * Danh sách item đang thao tác — `variant.items` (top-level, mặc định) HOẶC `itemTemplate` của
 * 1 LoopItem khi `editingLoopId` có giá trị (Bước 9 kế hoạch resize/rotate, 2026-07-18 — chế độ
 * "sửa mẫu" LoopItem, Bước 10). Dùng THAY CHO việc mỗi nơi (Canvas.tsx/PropertyPanel.tsx/
 * Flyout.tsx) tự viết lại logic rẽ nhánh này.
 */
export function resolveEditingItems(variant: LayoutVariant, editingLoopId: string | undefined): LayoutItem[] {
  if (!editingLoopId) return variant.items;
  const loopItem = variant.items.find((i) => i.id === editingLoopId);
  if (!loopItem || loopItem.type !== 'loop') return [];
  return loopItem.itemTemplate;
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

/**
 * Tìm item trong `variant.items` (top-level, mặc định) HOẶC trong `itemTemplate` của 1 LoopItem
 * cụ thể khi truyền `loopItemId` (Bước 9 kế hoạch resize/rotate, 2026-07-18 — cầu nối dữ liệu
 * cho chế độ "sửa mẫu" LoopItem). Item trong itemTemplate CHỈ 1 CẤP (không đệ quy vào loop lồng
 * trong loop — đúng quyết định phạm vi "chỉ hỗ trợ edit-mode 1 cấp" của Bước 10).
 */
export function findItem(doc: LayoutContent, variantId: string, itemId: string, loopItemId?: string): LayoutItem | undefined {
  const variant = findVariant(doc, variantId);
  if (!variant) return undefined;
  if (!loopItemId) return variant.items.find((i) => i.id === itemId);
  const loopItem = variant.items.find((i) => i.id === loopItemId);
  if (!loopItem || loopItem.type !== 'loop') return undefined;
  return loopItem.itemTemplate.find((i) => i.id === itemId);
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

/** Thay danh sách item tại "vị trí" xác định bởi `loopItemId` (Bước 9/10 kế hoạch resize/rotate,
 * 2026-07-18) — không có `loopItemId` thì thay `variant.items` (top-level, hành vi cũ); có thì
 * thay `itemTemplate` của đúng LoopItem đó (đóng gói lại thành 1 patch `itemTemplate` trên LoopItem
 * cha, tái dùng `replaceVariantItems` — không cần đường ghi riêng cho tầng lồng). Dùng chung bởi
 * `addItem`/`removeItem` để tránh trùng logic "tìm LoopItem, kiểm tra type" 2 lần. */
function replaceItemsAt(doc: LayoutContent, variantId: string, items: LayoutItem[], loopItemId?: string): LayoutContent {
  if (!loopItemId) return replaceVariantItems(doc, variantId, items);
  const variant = findVariant(doc, variantId);
  const loopItem = variant?.items.find((i) => i.id === loopItemId);
  if (!loopItem || loopItem.type !== 'loop') return doc;
  return replaceVariantItems(
    doc,
    variantId,
    variant!.items.map((i) => (i.id === loopItemId ? { ...i, itemTemplate: items } : i)),
  );
}

export function addItem(doc: LayoutContent, variantId: string, item: LayoutItem, loopItemId?: string): LayoutContent {
  const variant = findVariant(doc, variantId);
  if (!variant) return doc;
  const items = resolveEditingItems(variant, loopItemId);
  return replaceItemsAt(doc, variantId, [...items, item], loopItemId);
}

export function removeItem(doc: LayoutContent, variantId: string, itemId: string, loopItemId?: string): LayoutContent {
  const variant = findVariant(doc, variantId);
  if (!variant) return doc;
  const items = resolveEditingItems(variant, loopItemId);
  return replaceItemsAt(
    doc,
    variantId,
    items.filter((i) => i.id !== itemId),
    loopItemId,
  );
}

/**
 * Patch 1 item theo id — merge nông (Object.assign-style) với `patch`. Truyền `loopItemId` để
 * patch item BÊN TRONG `itemTemplate` của 1 LoopItem thay vì top-level `variant.items` (Bước 9
 * kế hoạch resize/rotate, 2026-07-18) — patch lan tới `itemTemplate[]` của đúng LoopItem đó
 * (đóng gói lại thành 1 patch `itemTemplate` mới trên chính LoopItem, tái dùng nguyên vẹn đường
 * đi `patchItem` top-level bên dưới, KHÔNG cần hàm ghi riêng cho tầng lồng).
 */
export function patchItem(doc: LayoutContent, variantId: string, itemId: string, patch: Partial<LayoutItem>, loopItemId?: string): LayoutContent {
  const variant = findVariant(doc, variantId);
  if (!variant) return doc;
  if (!loopItemId) {
    return replaceVariantItems(
      doc,
      variantId,
      variant.items.map((i) => (i.id === itemId ? ({ ...i, ...patch } as LayoutItem) : i)),
    );
  }
  const loopItem = variant.items.find((i) => i.id === loopItemId);
  if (!loopItem || loopItem.type !== 'loop') return doc;
  const nextTemplate = loopItem.itemTemplate.map((i) => (i.id === itemId ? ({ ...i, ...patch } as LayoutItem) : i));
  return replaceVariantItems(
    doc,
    variantId,
    variant.items.map((i) => (i.id === loopItemId ? { ...i, itemTemplate: nextTemplate } : i)),
  );
}
