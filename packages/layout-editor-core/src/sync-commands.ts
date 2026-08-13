// Command cho 3 chế độ "Copy từ variant khác" (12-thu-vien-layout.md mở rộng 2026-07-18, xem
// Giai đoạn 2.6 trong plan gốc). Mỗi command là 1 EditorCommand ĐƠN (không phải N command riêng
// cho N item) — undo 1 lần lùi hết toàn bộ thao tác copy, dù copy bao nhiêu item.

import type { LayoutContent, LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import type { EditorCommand } from './history.js';
import { findVariant, replaceVariantItems } from './doc-helpers.js';
import { diffMissingItems, diffOverwriteExisting, ensureSyncKey } from './sync.js';

let copyIdCounter = 0;
function nextCopyId(): string {
  copyIdCounter += 1;
  return `copy_${Date.now().toString(36)}_${copyIdCounter}`;
}

function setVariantBackground(doc: LayoutContent, variantId: string, background: LayoutVariant['background']): LayoutContent {
  return { ...doc, variants: doc.variants.map((v) => (v.aspect.id === variantId ? { ...v, background } : v)) };
}

/** "Ghi đè toàn bộ" (chế độ a) chọn xử lý item ĐÍCH đã khớp key nhưng đang `syncLocked` —
 * 'overwrite-locked' = bỏ qua khoá, ghi đè luôn (đúng nghĩa "TOÀN BỘ"); 'skip-locked' = giữ
 * nguyên item đã khoá, không đụng tới (kể cả không xoá dù nguồn không còn khớp nó). UI chỉ cần
 * hỏi lựa chọn này (confirm lớp 2) KHI có ít nhất 1 item khớp đang khoá — xem CopyVariantPopover. */
export type OverwriteAllLockStrategy = 'overwrite-locked' | 'skip-locked';

/**
 * Chế độ (a) "Copy ghi đè toàn bộ" — thay TOÀN BỘ items của variant ĐÍCH bằng bản copy (scale
 * theo tỷ lệ đích) từ variant NGUỒN, GIỮ LIÊN KẾT CHÁU: với mỗi item nguồn X, nếu đích đã có item
 * Y khớp key (Y.syncRef === X.syncKey) thì GIỮ NGUYÊN id/syncKey của Y (chỉ cập nhật nội dung
 * theo X, reset syncOverrides=[]) — để nếu Y từng được copy tiếp sang variant thứ 3 (Y là cha của
 * Z), Z KHÔNG mất liên kết. Item Y không khớp X nào (và không bị giữ do khoá) → xoá. Item nguồn X
 * không khớp Y nào → tạo item đích hoàn toàn mới. Ghi đè CỨNG, bỏ qua syncOverrides của Y đã khớp
 * (đúng nghĩa "TOÀN BỘ") — TRỪ item đang `syncLocked` khi `lockStrategy==='skip-locked'`.
 */
export function copyVariantOverwriteAllCommand(sourceVariantId: string, targetVariantId: string, lockStrategy: OverwriteAllLockStrategy): EditorCommand {
  let prevItems: LayoutItem[] = [];
  let prevBackground: LayoutVariant['background'];
  let sourceUpdated: LayoutItem[] = []; // item nguồn cần patch lại nếu thiếu syncKey

  return {
    type: 'copy-variant-overwrite-all',
    apply: (state) => {
      const source = findVariant(state.doc, sourceVariantId);
      const target = findVariant(state.doc, targetVariantId);
      if (!source || !target) return state;

      prevItems = target.items;
      prevBackground = target.background;
      sourceUpdated = [];

      const scaleX = target.aspect.w / source.aspect.w;
      const targetBySourceRef = new Map<string, LayoutItem>();
      for (const t of target.items) {
        if (t.syncRef) targetBySourceRef.set(t.syncRef, t);
      }

      const nextItems: LayoutItem[] = [];
      for (const s of source.items) {
        const { key, item: ensuredSource } = ensureSyncKey(s);
        if (ensuredSource !== s) sourceUpdated.push(ensuredSource);

        const matchedTarget = targetBySourceRef.get(key);
        if (matchedTarget?.syncLocked && lockStrategy === 'skip-locked') {
          nextItems.push(matchedTarget); // giữ nguyên, không đụng
          continue;
        }

        const { id: _id, syncOverrides: _so, syncLocked: _sl, syncRef: _sr, ...content } = s;
        nextItems.push({
          ...content,
          id: matchedTarget ? matchedTarget.id : nextCopyId(),
          syncKey: matchedTarget ? matchedTarget.syncKey : undefined,
          box: { ...s.box, x: s.box.x * scaleX, w: s.box.w * scaleX },
          syncRef: key,
          syncOverrides: [],
          syncLocked: undefined,
        } as LayoutItem);
      }

      // Item đích locked mà nguồn không còn khớp (bị bỏ qua ở trên vì không nằm trong vòng lặp
      // theo nguồn) — giữ lại riêng nếu skip-locked và target còn item locked không khớp source nào.
      if (lockStrategy === 'skip-locked') {
        for (const t of target.items) {
          if (t.syncLocked && !source.items.some((s) => s.syncKey === t.syncRef)) {
            nextItems.push(t);
          }
        }
      }

      let doc = state.doc;
      if (sourceUpdated.length > 0) {
        doc = replaceVariantItems(doc, sourceVariantId, source.items.map((s) => sourceUpdated.find((u) => u.id === s.id) ?? s));
      }
      doc = replaceVariantItems(doc, targetVariantId, nextItems);
      // Copy TOÀN BỘ background (kể cả ảnh) từ nguồn (chốt 2026-07-18 — TRƯỚC ĐÓ xoá hẳn background
      // đích, lý do cũ "ảnh không copy được qua tỷ lệ khác" không còn đúng: ảnh dùng background-
      // size:cover nên tự cắt/giãn theo tỷ lệ mới, không lỗi hiển thị — nhất quán với định nghĩa
      // "copy = clone toàn bộ layout" mà user mong đợi).
      doc = setVariantBackground(doc, targetVariantId, source.background);

      return { ...state, doc };
    },
    invert: (state) => {
      let doc = replaceVariantItems(state.doc, targetVariantId, prevItems);
      doc = setVariantBackground(doc, targetVariantId, prevBackground);
      return { ...state, doc };
    },
  };
}

/**
 * Chế độ (b) "Chỉ copy cái CHƯA CÓ" — CHỈ THÊM item nguồn chưa khớp key nào ở đích (dùng
 * `diffMissingItems`), KHÔNG đụng item cũ. Background CŨNG theo nguyên tắc "chỉ thêm cái chưa
 * có" (chốt 2026-07-18) — CHỈ copy background nguồn sang đích nếu đích CHƯA có background nào
 * (`undefined`); nếu đích đã có background riêng, giữ nguyên (không ghi đè, khớp tinh thần "add-
 * missing" chỉ bổ sung phần thiếu, không thay phần đã có). Snapshot items+background CŨ để invert
 * khôi phục đúng nguyên vẹn.
 */
export function copyVariantAddMissingCommand(sourceVariantId: string, targetVariantId: string): EditorCommand {
  let prevTargetItems: LayoutItem[] = [];
  let prevSourceItems: LayoutItem[] = [];
  let prevBackground: LayoutVariant['background'];

  return {
    type: 'copy-variant-add-missing',
    apply: (state) => {
      const source = findVariant(state.doc, sourceVariantId);
      const target = findVariant(state.doc, targetVariantId);
      if (!source || !target) return state;

      prevTargetItems = target.items;
      prevSourceItems = source.items;
      prevBackground = target.background;
      const { missing, updatedSourceItems } = diffMissingItems(source, target, nextCopyId);

      let doc = state.doc;
      if (updatedSourceItems.length > 0) {
        // Item nguồn thiếu syncKey được ensureSyncKey() gán mới — PHẢI ghi lại vào doc, nếu
        // không auto-sync sẽ không bao giờ hoạt động (xem comment đầy đủ ở sync.ts's diffMissingItems).
        doc = replaceVariantItems(doc, sourceVariantId, source.items.map((s) => updatedSourceItems.find((u) => u.id === s.id) ?? s));
      }
      doc = replaceVariantItems(doc, targetVariantId, [...target.items, ...missing]);
      if (target.background === undefined && source.background !== undefined) {
        doc = setVariantBackground(doc, targetVariantId, source.background);
      }
      return { ...state, doc };
    },
    invert: (state) => {
      let doc = replaceVariantItems(state.doc, targetVariantId, prevTargetItems);
      doc = replaceVariantItems(doc, sourceVariantId, prevSourceItems);
      doc = setVariantBackground(doc, targetVariantId, prevBackground);
      return { ...state, doc };
    },
  };
}

/**
 * Chế độ (c) "Ghi đè nội dung cho cái đã có" — patch N item đích đã khớp key (dùng
 * `diffOverwriteExisting`, TÔN TRỌNG syncOverrides/syncLocked — KHÁC chế độ (a)) trong 1 command
 * duy nhất, dùng `patchItem`-style merge trực tiếp (KHÔNG gọi lồng patchItemCommand — mỗi
 * EditorCommand phải tự đứng độc lập trong HistoryStack.past). Background theo ĐÚNG tinh thần
 * "cập nhật cái ĐÃ CÓ" (chốt 2026-07-18) — chỉ ghi đè nếu đích ĐÃ có background từ trước (không
 * tự tạo mới nếu đích chưa từng set, đó là việc của add-missing).
 */
export function copyVariantOverwriteExistingCommand(sourceVariantId: string, targetVariantId: string): EditorCommand {
  let prevItems: LayoutItem[] = [];
  let prevBackground: LayoutVariant['background'];

  return {
    type: 'copy-variant-overwrite-existing',
    apply: (state) => {
      const source = findVariant(state.doc, sourceVariantId);
      const target = findVariant(state.doc, targetVariantId);
      if (!source || !target) return state;

      prevItems = target.items;
      prevBackground = target.background;
      const diffs = diffOverwriteExisting(source, target);
      const diffMap = new Map(diffs.map((d) => [d.itemId, d.patch]));
      const nextItems = target.items.map((item) => {
        const patch = diffMap.get(item.id);
        return patch ? ({ ...item, ...patch } as LayoutItem) : item;
      });

      let doc = replaceVariantItems(state.doc, targetVariantId, nextItems);
      if (target.background !== undefined) {
        doc = setVariantBackground(doc, targetVariantId, source.background);
      }
      return { ...state, doc };
    },
    invert: (state) => {
      let doc = replaceVariantItems(state.doc, targetVariantId, prevItems);
      doc = setVariantBackground(doc, targetVariantId, prevBackground);
      return { ...state, doc };
    },
  };
}

