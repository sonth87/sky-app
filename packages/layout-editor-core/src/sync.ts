// Đồng bộ liên kết cha-con giữa item COPY (syncRef) và item GỐC — theo mở rộng
// 12-thu-vien-layout.md "Copy từ variant khác + auto-sync" (2026-07-18, xem Giai đoạn 2.6 trong
// plan gốc để hiểu đầy đủ bối cảnh/quyết định kiến trúc). Toàn bộ hàm THUẦN, immutable, giống
// convention doc-helpers.ts — commands.ts gọi các hàm này để tính patch lan truyền, tự bọc
// undo/redo (xem sync-commands.ts + commands.ts's patchItemCommand/makeBoxCommand mở rộng).

import type { LayoutContent, LayoutItem, LayoutVariant, SyncFieldGroup } from '@sky-app/slide-shared';

let syncKeyCounter = 0;

/** Sinh 1 syncKey mới — ngắn gọn kiểu short-hash, đủ khác nhau trong phạm vi 1 layout (không
 * cần cryptographically random, chỉ cần không trùng nhau giữa các item cùng phiên làm việc). */
export function generateSyncKey(): string {
  syncKeyCounter += 1;
  return `${Date.now().toString(36)}${syncKeyCounter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Field nào (tên field trong patch) thuộc nhóm nào — bảng tra cứu TƯỜNG MINH (không suy luận),
 * vì mỗi loại item có field khác nhau (VD ImageItem.src, TextItem.content đều thuộc nhóm
 * 'content' dù tên field khác nhau). Field không có trong bảng (không rõ ý nghĩa) → mặc định
 * 'style' (an toàn hơn — coi là chi tiết trình bày, không phải nội dung cốt lõi hay vị trí). */
const CONTENT_FIELDS = new Set(['content', 'src', 'varKey', 'itemTemplate', 'source']);
const BOX_FIELDS = new Set(['box']);

export function fieldGroupOf(field: string): SyncFieldGroup {
  if (BOX_FIELDS.has(field)) return 'box';
  if (CONTENT_FIELDS.has(field)) return 'content';
  return 'style';
}

/** Từ 1 `patch` (như patchItemCommand/makeBoxCommand nhận), suy ra tập hợp NHÓM field bị đụng —
 * dùng để (a) đánh dấu override ở item đang bị user sửa tay nếu nó có syncRef, (b) lọc field cần
 * lan truyền sang item con nếu item đang sửa là cha của ai đó. */
export function affectedGroups(patch: Partial<LayoutItem>): Set<SyncFieldGroup> {
  const groups = new Set<SyncFieldGroup>();
  for (const field of Object.keys(patch)) groups.add(fieldGroupOf(field));
  return groups;
}

/** Tìm mọi item (ở MỌI variant trong doc — liên kết sync không giới hạn trong 1 variant, vì copy
 * có thể copy sang variant KHÁC) có `syncRef === parentSyncKey`. */
export function findSyncChildren(doc: LayoutContent, parentSyncKey: string): { variantId: string; item: LayoutItem }[] {
  const result: { variantId: string; item: LayoutItem }[] = [];
  for (const variant of doc.variants) {
    for (const item of variant.items) {
      if (item.syncRef === parentSyncKey) result.push({ variantId: variant.aspect.id, item });
    }
  }
  return result;
}

/** Tính patch cần áp lên 1 item CON khi item CHA vừa bị patch bởi `parentPatch` — chỉ giữ lại
 * field thuộc nhóm CHƯA có trong child.syncOverrides VÀ child.syncLocked !== true. Trả `null`
 * nếu không còn field nào cần lan truyền (mọi nhóm liên quan đã bị override/khoá). */
export function computeSyncPropagation(child: LayoutItem, parentPatch: Partial<LayoutItem>): Partial<LayoutItem> | null {
  if (child.syncLocked) return null;
  const overrides = new Set(child.syncOverrides ?? []);
  const filtered: Record<string, unknown> = {};
  let hasField = false;
  for (const [field, value] of Object.entries(parentPatch)) {
    if (overrides.has(fieldGroupOf(field))) continue;
    filtered[field] = value;
    hasField = true;
  }
  return hasField ? (filtered as Partial<LayoutItem>) : null;
}

/** Khi user tự patch 1 item B có `syncRef` (bản sao) — merge thêm các nhóm bị đụng vào
 * `syncOverrides` hiện có của B (không trùng lặp). Trả LayoutItem MỚI (không mutate). Item KHÔNG
 * có `syncRef` (không phải bản sao của ai) → trả nguyên item, không có ý nghĩa "override". */
export function markOverridden(item: LayoutItem, patch: Partial<LayoutItem>): LayoutItem {
  if (!item.syncRef) return item;
  const newGroups = affectedGroups(patch);
  const existing = new Set(item.syncOverrides ?? []);
  for (const g of newGroups) existing.add(g);
  return { ...item, syncOverrides: [...existing] };
}

/** Lấy syncKey của item — sinh MỚI nếu item chưa có (item cũ tạo trước khi có tính năng sync).
 * Trả `{ key, item }` với `item` là bản THAY ĐỔI (chỉ khi cần sinh mới, ngược lại trả nguyên item
 * gốc) — caller (sync-commands.ts) tự quyết định có cần patch lại doc cho item nguồn hay không. */
export function ensureSyncKey(item: LayoutItem): { key: string; item: LayoutItem } {
  if (item.syncKey) return { key: item.syncKey, item };
  const key = generateSyncKey();
  return { key, item: { ...item, syncKey: key } };
}

/** cloneVariantItemsForOverwrite — theo 12-thu-vien-layout.md's cloneVariant, CHỈ phần items[]
 * (không đổi refW/refH/aspect — việc của caller). Scale toạ độ theo scaleX = targetAspect.w /
 * sourceVariant.aspect.w, giữ Y nguyên (đúng nguyên tắc gốc). Mỗi item nhận `id` MỚI (tránh trùng
 * id giữa 2 variant) và `syncRef` = syncKey của item nguồn (sinh nếu nguồn thiếu — CHÚ Ý: hàm
 * này KHÔNG tự patch lại item nguồn trong doc, chỉ trả object item nguồn đã gán syncKey nếu cần —
 * caller (sync-commands.ts) chịu trách nhiệm ghi lại nếu có thay đổi, để giữ properties thuần). */
export function cloneVariantItemsForOverwrite(
  sourceVariant: LayoutVariant,
  targetAspect: { w: number; h: number },
  nextId: () => string,
): { clonedItems: LayoutItem[]; updatedSourceItems: LayoutItem[] } {
  const scaleX = targetAspect.w / sourceVariant.aspect.w;
  const updatedSourceItems: LayoutItem[] = [];
  const clonedItems: LayoutItem[] = [];

  for (const source of sourceVariant.items) {
    const { key, item: ensuredSource } = ensureSyncKey(source);
    updatedSourceItems.push(ensuredSource);
    clonedItems.push({
      ...ensuredSource,
      id: nextId(),
      box: { ...ensuredSource.box, x: ensuredSource.box.x * scaleX, w: ensuredSource.box.w * scaleX },
      syncRef: key,
      syncOverrides: undefined,
      syncLocked: undefined,
    } as LayoutItem);
  }

  return { clonedItems, updatedSourceItems };
}

/** "Chỉ copy cái CHƯA CÓ" — so khớp CHỈ dựa vào syncKey/syncRef: 1 item nguồn X được coi là "đã
 * có ở đích" nếu tồn tại item đích Y mà Y.syncRef === X.syncKey. Trả `missing` (item MỚI, đã
 * scale toạ độ + set syncRef, id mới, cần THÊM vào đích) VÀ `updatedSourceItems` (item nguồn cần
 * PATCH LẠI vào doc nếu trước đó thiếu syncKey — QUAN TRỌNG: nếu bỏ qua bước ghi lại này, item
 * nguồn trong `doc` thật vẫn KHÔNG có `syncKey`, khiến `computePatchSteps` không bao giờ tìm thấy
 * con của nó qua `findSyncChildren` — auto-sync coi như KHÔNG BAO GIỜ hoạt động dù item copy đã
 * có `syncRef` đúng. Đây là bug thật đã phát hiện qua test UI, xem sync-commands.ts's
 * copyVariantAddMissingCommand — PHẢI ghi `updatedSourceItems` lại vào variant nguồn). */
export function diffMissingItems(sourceVariant: LayoutVariant, targetVariant: LayoutVariant, nextId: () => string): { missing: LayoutItem[]; updatedSourceItems: LayoutItem[] } {
  const scaleX = targetVariant.aspect.w / sourceVariant.aspect.w;
  const targetRefs = new Set(targetVariant.items.map((i) => i.syncRef).filter(Boolean));

  const missing: LayoutItem[] = [];
  const updatedSourceItems: LayoutItem[] = [];
  for (const source of sourceVariant.items) {
    if (source.syncKey && targetRefs.has(source.syncKey)) continue; // đã có bản copy ở đích
    const { key, item: ensuredSource } = ensureSyncKey(source);
    if (ensuredSource !== source) updatedSourceItems.push(ensuredSource);
    missing.push({
      ...ensuredSource,
      id: nextId(),
      box: { ...ensuredSource.box, x: ensuredSource.box.x * scaleX, w: ensuredSource.box.w * scaleX },
      syncKey: undefined,
      syncRef: key,
      syncOverrides: undefined,
      syncLocked: undefined,
    } as LayoutItem);
  }
  return { missing, updatedSourceItems };
}

/** "Ghi đè nội dung cho cái đã có" — trả `{itemId, patch}` cho MỌI item đích đã khớp key với
 * nguồn: patch = TOÀN BỘ field của nguồn (kể cả box) TRỪ nhóm đã nằm trong `syncOverrides`/
 * `syncLocked` của item đích (tôn trọng override — KHÁC chế độ "ghi đè toàn bộ"). Dùng lại
 * `computeSyncPropagation` cho từng cặp khớp — coi nguồn X như "cha" tạm thời của Y trong phép
 * tính, dù về mặt dữ liệu Y đã LÀ con thật của X (chỉ đang đồng bộ lại thủ công 1 lần). */
export function diffOverwriteExisting(sourceVariant: LayoutVariant, targetVariant: LayoutVariant): { itemId: string; patch: Partial<LayoutItem> }[] {
  const sourceByKey = new Map(sourceVariant.items.filter((i) => i.syncKey).map((i) => [i.syncKey as string, i]));
  const result: { itemId: string; patch: Partial<LayoutItem> }[] = [];

  for (const target of targetVariant.items) {
    if (!target.syncRef) continue;
    const source = sourceByKey.get(target.syncRef);
    if (!source) continue;
    const { id: _id, syncKey: _syncKey, syncRef: _syncRef, syncOverrides: _syncOverrides, syncLocked: _syncLocked, ...sourceContent } = source;
    const patch = computeSyncPropagation(target, sourceContent as Partial<LayoutItem>);
    if (patch) result.push({ itemId: target.id, patch });
  }
  return result;
}

/** Danh sách item nguồn đã khớp Y đích theo syncRef — dùng bởi copyVariantOverwriteAllCommand
 * (chế độ "ghi đè toàn bộ", cần biết CHÍNH XÁC ai khớp ai để quyết định giữ/tạo mới/xoá, khác
 * `diffMissingItems`/`diffOverwriteExisting` vốn chỉ cần 1 chiều). */
export function matchVariantItemsForOverwrite(
  sourceVariant: LayoutVariant,
  targetVariant: LayoutVariant,
): { matched: { source: LayoutItem; target: LayoutItem }[]; unmatchedSource: LayoutItem[]; unmatchedTarget: LayoutItem[] } {
  const targetBySourceRef = new Map<string, LayoutItem>();
  for (const t of targetVariant.items) {
    if (t.syncRef) targetBySourceRef.set(t.syncRef, t);
  }

  const matched: { source: LayoutItem; target: LayoutItem }[] = [];
  const unmatchedSource: LayoutItem[] = [];
  const matchedTargetIds = new Set<string>();

  for (const source of sourceVariant.items) {
    const target = source.syncKey ? targetBySourceRef.get(source.syncKey) : undefined;
    if (target) {
      matched.push({ source, target });
      matchedTargetIds.add(target.id);
    } else {
      unmatchedSource.push(source);
    }
  }

  const unmatchedTarget = targetVariant.items.filter((t) => !matchedTargetIds.has(t.id));
  return { matched, unmatchedSource, unmatchedTarget };
}

/** Tìm variant chứa item theo id — dùng bởi computePatchSteps để biết variantId của 1 item khi
 * chỉ có itemId (VD item con tìm được qua findSyncChildren đã tự trả variantId rồi, nhưng item
 * CHÍNH đang patch thì caller đã biết variantId — hàm này dự phòng khi cần). */
export function findVariantIdOfItem(doc: LayoutContent, itemId: string): string | undefined {
  for (const variant of doc.variants) {
    if (variant.items.some((i) => i.id === itemId)) return variant.aspect.id;
  }
  return undefined;
}

/** 1 bước patch cụ thể (item nào, ở variant nào, từ giá trị gì sang giá trị gì) — commands.ts's
 * patchItemCommand/makeBoxCommand dùng danh sách `steps[]` này để apply/invert TRONG CÙNG 1
 * EditorCommand (đảm bảo undo 1 lần lùi đúng toàn bộ thay đổi đa-item, xem Giai đoạn 2.6). */
export interface SyncPatchStep {
  variantId: string;
  itemId: string;
  from: Partial<LayoutItem>;
  to: Partial<LayoutItem>;
  /** Có giá trị khi step này patch item BÊN TRONG itemTemplate của 1 LoopItem (Bước 9 kế hoạch
   * resize/rotate, 2026-07-18) — item lồng KHÔNG tham gia sync-giữa-variant, nên step loại này
   * LUÔN đứng 1 mình (không kèm step lan truyền nào khác), xem computePatchSteps. */
  loopItemId?: string;
}

/** Hàm TRUNG TÂM — tính TOÀN BỘ steps cần áp khi user patch 1 item (`itemId` ở `variantId`) từ
 * `from` sang `to`:
 *   1. Step cho CHÍNH item đang sửa — nếu nó có `syncRef` (là bản sao), `to` được merge thêm
 *      `syncOverrides` MỚI (qua `markOverridden`), và `from` được merge thêm `syncOverrides` CŨ
 *      (giá trị TRƯỚC patch, đọc trực tiếp từ `item.syncOverrides` hiện có) — để invert() sau
 *      này chỉ cần "patch ngược lại đúng step.from đã lưu" là khôi phục ĐÚNG NGUYÊN `syncOverrides`
 *      gốc, KHÔNG cần gọi lại `markOverridden` (nếu gọi lại trong invert sẽ SAI — đảo `to→from`
 *      qua markOverridden sẽ hiểu nhầm "giá trị cũ" là 1 lần sửa tay mới, THÊM override thay vì
 *      GỠ override — bug thật đã phát hiện qua test, xem commands.sync.test.ts).
 *   2. Step LAN TRUYỀN — nếu item có `syncKey` (nó CÓ THỂ là cha của item khác), tìm mọi con
 *      trực tiếp qua `findSyncChildren`, với mỗi con tính `computeSyncPropagation` — bỏ qua nếu
 *      trả `null` (con đã override/khoá hết field liên quan).
 * Đọc `doc` NGAY TẠI THỜI ĐIỂM GỌI (không cache) — commands.ts gọi hàm này CẢ ở `apply()` LẪN
 * `invert()` — mỗi lần gọi tự tính đúng theo state HIỆN TẠI, KHÔNG đảo `to`/`from` cho nhau giữa
 * 2 lần gọi (invert() PHẢI gọi với ĐÚNG from/to gốc như lúc apply(), rồi tự đảo bằng cách patch
 * step.from thay vì step.to — xem commands.ts's patchItemCommand/makeBoxCommand). */
/**
 * Truyền `loopItemId` để tính step cho item BÊN TRONG itemTemplate của 1 LoopItem — item lồng
 * KHÔNG tham gia cơ chế đồng bộ sync-giữa-variant (mỗi LoopItem's template độc lập theo từng
 * variant, đúng thiết kế "mỗi variant có items[] riêng" vốn có, xem plan Bước 9) nên LUÔN trả
 * đúng 1 step duy nhất kèm `loopItemId`, KHÔNG tìm/lan truyền sang item nào khác.
 */
export function computePatchSteps(doc: LayoutContent, variantId: string, itemId: string, from: Partial<LayoutItem>, to: Partial<LayoutItem>, loopItemId?: string): SyncPatchStep[] {
  if (loopItemId) return [{ variantId, itemId, from, to, loopItemId }];

  const variant = doc.variants.find((v) => v.aspect.id === variantId);
  const item = variant?.items.find((i) => i.id === itemId);
  if (!item) return [{ variantId, itemId, from, to }];

  const mainTo = item.syncRef ? { ...to, syncOverrides: markOverridden(item, to).syncOverrides } : to;
  const mainFrom = item.syncRef ? { ...from, syncOverrides: item.syncOverrides ?? [] } : from;
  const steps: SyncPatchStep[] = [{ variantId, itemId, from: mainFrom, to: mainTo }];

  if (item.syncKey) {
    for (const { variantId: childVariantId, item: child } of findSyncChildren(doc, item.syncKey)) {
      const childPatch = computeSyncPropagation(child, to);
      if (!childPatch) continue;
      const childFrom: Partial<LayoutItem> = {};
      for (const field of Object.keys(childPatch)) {
        (childFrom as Record<string, unknown>)[field] = (child as unknown as Record<string, unknown>)[field];
      }
      steps.push({ variantId: childVariantId, itemId: child.id, from: childFrom, to: childPatch });
    }
  }

  return steps;
}

