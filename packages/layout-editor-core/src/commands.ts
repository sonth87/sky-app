// Command cụ thể — mỗi factory trả 1 EditorCommand (apply/invert/coalesceWith) theo
// 23-editor-core-architecture.md §2.2. Tool registry (sub-bước 2.2/2.3) gọi các factory này,
// KHÔNG tự sửa EditorState.doc trực tiếp.

import type { AspectRatio, Background, Box, LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import type { EditorCommand } from './history.js';
import { addItem, addVariant, findItem, findVariant, patchItem, removeItem, removeVariant, replaceVariant } from './doc-helpers.js';
import { computePatchSteps, generateSyncKey, type SyncPatchStep } from './sync.js';

/**
 * Truyền `loopItemId` để thêm item vào `itemTemplate` của 1 LoopItem (Bước 10 kế hoạch
 * resize/rotate, 2026-07-18 — chế độ sửa mẫu) thay vì `variant.items` top-level. Item trong
 * itemTemplate CŨNG được sinh `syncKey` như item top-level (nhất quán, dù hiện tại KHÔNG dùng
 * tới — item lồng không tham gia sync-giữa-variant, xem Bước 9) — tránh 2 loại item khác nhau
 * ngầm về schema, chỉ đơn giản là field không được đọc tới trong ngữ cảnh này.
 */
export function addItemCommand(variantId: string, item: LayoutItem, loopItemId?: string): EditorCommand {
  // Mọi item MỚI (dù tạo tay hay copy — xem sync-commands.ts) cần syncKey ổn định để về sau CÓ
  // THỂ làm nguồn cho 1 lượt copy khác — sinh ở ĐÂY (điểm duy nhất mọi item đi qua trước khi vào
  // doc), không rải rác ở tầng UI. Item TRUYỀN VÀO đã có sẵn syncKey (case copy, đã gán syncRef
  // trỏ về cha) thì GIỮ NGUYÊN — không ghi đè, vì item copy cần syncKey CỦA RIÊNG NÓ.
  const withSyncKey = item.syncKey ? item : { ...item, syncKey: generateSyncKey() };
  return {
    type: 'add-item',
    apply: (state) => ({ ...state, doc: addItem(state.doc, variantId, withSyncKey, loopItemId), selection: [withSyncKey.id] }),
    invert: (state) => ({ ...state, doc: removeItem(state.doc, variantId, withSyncKey.id, loopItemId), selection: [] }),
  };
}

/** Thêm 1 tỷ lệ (variant) mới vào layout — theo 12-thu-vien-layout.md "Tạo trống". Tự chuyển
 * activeVariantId sang variant mới (người dùng vừa thêm thì thường muốn sửa nó luôn). */
export function addVariantCommand(variant: LayoutVariant, previousActiveVariantId: string): EditorCommand {
  return {
    type: 'add-variant',
    apply: (state) => ({ ...state, doc: addVariant(state.doc, variant), activeVariantId: variant.aspect.id, selection: [] }),
    invert: (state) => ({ ...state, doc: removeVariant(state.doc, variant.aspect.id), activeVariantId: previousActiveVariantId, selection: [] }),
  };
}

/** Xoá 1 tỷ lệ (variant) khỏi layout — chặn xoá variant CUỐI CÙNG ở tầng doc-helpers (removeVariant
 * no-op nếu chỉ còn 1). `nextActiveVariantId` do caller quyết định (thường là variant đầu còn lại). */
export function removeVariantCommand(variantId: string, nextActiveVariantId: string): EditorCommand {
  let removedVariant: LayoutVariant | undefined;
  let removedIndex = -1;
  return {
    type: 'remove-variant',
    apply: (state) => {
      removedVariant = findVariant(state.doc, variantId);
      removedIndex = state.doc.variants.findIndex((v) => v.aspect.id === variantId);
      return { ...state, doc: removeVariant(state.doc, variantId), activeVariantId: nextActiveVariantId, selection: [] };
    },
    invert: (state) => {
      if (!removedVariant) return state;
      const variants = [...state.doc.variants];
      variants.splice(removedIndex, 0, removedVariant);
      return { ...state, doc: { ...state.doc, variants }, activeVariantId: variantId, selection: [] };
    },
  };
}

/**
 * Đổi tỷ lệ (aspect) CỦA CHÍNH 1 variant TẠI CHỖ — KHÁC hẳn "Copy ghi đè toàn bộ" (sync-
 * commands.ts): không tạo id/syncKey mới cho item nào, chỉ SCALE toạ độ theo tỷ lệ mới (giữ
 * nguyên mọi liên kết sync đã có — nếu variant này đang là cha/con của ai, liên kết đó KHÔNG bị
 * ảnh hưởng). Dùng khi user lỡ tạo sai tỷ lệ lúc đầu, muốn sửa lại mà không mất công đã thiết kế.
 * `aspect.id` đổi (vì đó là khoá tra cứu variant) — activeVariantId cũng phải đổi theo nếu variant
 * đang active chính là variant bị đổi (caller truyền `wasActive` để biết có cần đổi hay không).
 */
export function changeVariantAspectCommand(variantId: string, newAspect: AspectRatio, wasActive: boolean): EditorCommand {
  let prevVariant: LayoutVariant | undefined;
  let prevActiveVariantId = variantId;

  return {
    type: 'change-variant-aspect',
    apply: (state) => {
      const variant = findVariant(state.doc, variantId);
      if (!variant) return state;
      prevVariant = variant;
      prevActiveVariantId = state.activeVariantId;

      // Giữ refW CỐ ĐỊNH, tính lại refH theo ĐÚNG tỷ lệ mới (giống designSize() ở Canvas.tsx) —
      // rồi scale toạ độ item theo scaleX/scaleY thật giữa refW/refH CŨ và MỚI, để item giữ
      // đúng VỊ TRÍ TƯƠNG ĐỐI trên canvas (không bị méo/lệch) — KHÁC nhầm lẫn trước đó (nhân
      // scaleX/scaleY theo tỷ lệ aspect trực tiếp sẽ cho refW_new/refH_new SAI tỷ lệ newAspect).
      const newRefW = variant.refW;
      const newRefH = (variant.refW * newAspect.h) / newAspect.w;
      const scaleX = newRefW / variant.refW; // = 1 (refW giữ nguyên) — viết tường minh để rõ ý
      const scaleY = newRefH / variant.refH;

      const newVariant: LayoutVariant = {
        ...variant,
        aspect: newAspect,
        refW: newRefW,
        refH: newRefH,
        items: variant.items.map((item) => ({
          ...item,
          box: { ...item.box, x: item.box.x * scaleX, y: item.box.y * scaleY, w: item.box.w * scaleX, h: item.box.h * scaleY },
        })),
      };

      return {
        ...state,
        doc: replaceVariant(state.doc, variantId, newVariant),
        activeVariantId: wasActive ? newAspect.id : state.activeVariantId,
      };
    },
    invert: (state) => {
      if (!prevVariant) return state;
      return {
        ...state,
        doc: replaceVariant(state.doc, newAspect.id, prevVariant),
        activeVariantId: wasActive ? prevActiveVariantId : state.activeVariantId,
      };
    },
  };
}

/** Đổi nền (background) của 1 variant — dùng khi Property Panel hiện thuộc tính CANVAS/FRAME
 * (không có item nào đang chọn, xem PropertyPanel.tsx's FrameBackgroundControls). `background`
 * = `undefined` nghĩa là "không có nền tuỳ chỉnh" (Canvas.tsx tự hiện nền trắng mặc định +
 * lưới chấm hỗ trợ thiết kế — xem đổi 2026-07-18, TRƯỚC ĐÓ mặc định tím `#201748`). */
export function patchVariantBackgroundCommand(variantId: string, from: Background | undefined, to: Background | undefined): EditorCommand {
  return {
    type: 'patch-variant-background',
    apply: (state) => {
      const variant = findVariant(state.doc, variantId);
      if (!variant) return state;
      return { ...state, doc: replaceVariant(state.doc, variantId, { ...variant, background: to }) };
    },
    invert: (state) => {
      const variant = findVariant(state.doc, variantId);
      if (!variant) return state;
      return { ...state, doc: replaceVariant(state.doc, variantId, { ...variant, background: from }) };
    },
  };
}

/** Truyền `loopItemId` để xoá item trong `itemTemplate` của 1 LoopItem (Bước 10). */
export function removeItemCommand(variantId: string, itemId: string, loopItemId?: string): EditorCommand {
  // Cần snapshot item TRƯỚC khi xoá để invert (thêm lại) đúng nguyên trạng — chụp ở apply().
  let removedItem: LayoutItem | undefined;
  return {
    type: 'remove-item',
    apply: (state) => {
      removedItem = findItem(state.doc, variantId, itemId, loopItemId);
      return { ...state, doc: removeItem(state.doc, variantId, itemId, loopItemId), selection: [] };
    },
    invert: (state) => {
      if (!removedItem) return state;
      return { ...state, doc: addItem(state.doc, variantId, removedItem, loopItemId), selection: [itemId] };
    },
  };
}

/** Command "kéo/resize 1 box" — chung cho move và resize, phân biệt bằng `type`. */
interface BoxCommand extends EditorCommand {
  variantId: string;
  itemId: string;
  from: Box;
  to: Box;
  /** Holder nội bộ dùng bởi coalesceWith để CHIA SẺ steps cache — xem StepsHolder. */
  _stepsHolder: StepsHolder;
}

/**
 * steps PHẢI được snapshot lúc apply() chạy rồi TÁI SỬ DỤNG nguyên vẹn lúc invert() — không thể
 * tính lại trong invert() vì lúc đó state.doc đã ở trạng thái SAU patch, không còn cách nào suy
 * ngược ra giá trị TRƯỚC patch chỉ từ dữ liệu hiện tại (đã thử 2 cách tính-lại-trong-invert,
 * CẢ HAI ĐỀU SAI — bắt được qua test: (1) đảo chiều (to→from) khiến markOverridden hiểu nhầm
 * "khôi phục" là "sửa tay mới", THÊM override thay vì GỠ; (2) giữ chiều nhưng đọc lại field từ
 * doc hiện tại cho item CON — vì doc hiện tại đã là giá trị SAU lan truyền, "childFrom" tính ra
 * trùng với giá trị hiện tại → patch về chính nó → no-op, không khôi phục thật).
 *
 * Vấn đề duy nhất khi CACHE trực tiếp trong closure của `makeBoxCommand`: `coalesceWith` tạo
 * command MỚI (lời gọi `makeBoxCommand` mới → closure MỚI, cache rỗng) nhưng KHÔNG BAO GIỜ tự
 * `apply()` — `HistoryStack.execute()` chỉ gọi `apply()` trên command GỐC vừa truyền vào, dùng
 * kết quả đó làm `nextState`, rồi mới LƯU command coalesced (đã tạo lại) vào `past[]` để thay
 * thế — command coalesced chỉ thật sự `apply()` lần đầu nếu sau này redo() (sau khi đã undo).
 * Nếu bị undo() TRƯỚC KHI từng redo(), cache của nó vẫn rỗng.
 *
 * Fix: dùng 1 SharedSteps object (holder mutable) thay vì biến closure riêng — `coalesceWith`
 * TRUYỀN LẠI cùng 1 holder cho command mới thay vì tạo holder mới, và command mới's `apply()`
 * ghi đè holder đó — nên dù `coalesceWith` tạo bao nhiêu command trung gian, HOLDER CUỐI CÙNG
 * (được lưu trong past[]) sẽ luôn được `apply()` cập nhật đúng vào chính XÁC thời điểm command
 * đó thật sự chạy (lần dispatch gần nhất trong chuỗi coalesce, hoặc lần redo() sau này).
 */
interface StepsHolder {
  steps: SyncPatchStep[];
}

function makeBoxCommand(
  type: 'move-item' | 'resize-item' | 'rotate-item',
  variantId: string,
  itemId: string,
  from: Box,
  to: Box,
  holder: StepsHolder = { steps: [] },
  loopItemId?: string,
): BoxCommand {
  const cmd: BoxCommand = {
    type,
    variantId,
    itemId,
    from,
    to,
    _stepsHolder: holder,
    apply: (state) => {
      holder.steps = computePatchSteps(state.doc, variantId, itemId, { box: from }, { box: to }, loopItemId);
      let doc = state.doc;
      for (const s of holder.steps) doc = patchItem(doc, s.variantId, s.itemId, s.to, s.loopItemId);
      return { ...state, doc };
    },
    invert: (state) => {
      let doc = state.doc;
      for (const s of [...holder.steps].reverse()) doc = patchItem(doc, s.variantId, s.itemId, s.from, s.loopItemId);
      return { ...state, doc };
    },
    coalesceWith(prev) {
      if (prev.type !== type) return null;
      const prevBox = prev as BoxCommand;
      if (prevBox.itemId !== itemId || prevBox.variantId !== variantId) return null;
      // Gộp: giữ `from` GỐC của thao tác kéo/resize (prevBox), chỉ cập nhật `to` mới nhất —
      // undo 1 lần lùi về vị trí TRƯỚC KHI bắt đầu kéo, không phải bước áp chót. TRUYỀN LẠI
      // holder CỦA prevBox (command CŨ đang nằm trong past[], ĐÃ từng apply() thật) — không phải
      // holder của `cmd` (command MỚI vừa tạo, chưa từng apply()) — đây chính là chỗ sửa quyết
      // định: nếu dùng nhầm `holder` (closure của cmd hiện tại) thay vì `prevBox._stepsHolder`,
      // steps cache sẽ RỖNG vì cmd hiện tại chưa từng apply() (chỉ prevBox mới từng apply()).
      return makeBoxCommand(type, variantId, itemId, prevBox.from, to, prevBox._stepsHolder, loopItemId);
    },
  };
  return cmd;
}

/**
 * Kéo item (move) — coalescable: nhiều lần move liên tiếp CÙNG item trong 1 thao tác kéo chuột
 * gộp thành 1 undo (23 §2.2 "kéo item nhiều frame → 1 undo, không phải N undo"). Truyền
 * `loopItemId` khi item nằm trong `itemTemplate` của 1 LoopItem (Bước 9 — chế độ sửa mẫu).
 */
export function moveItemCommand(variantId: string, itemId: string, from: Box, to: Box, loopItemId?: string): EditorCommand {
  return makeBoxCommand('move-item', variantId, itemId, from, to, undefined, loopItemId);
}

export function resizeItemCommand(variantId: string, itemId: string, from: Box, to: Box, loopItemId?: string): EditorCommand {
  return makeBoxCommand('resize-item', variantId, itemId, from, to, undefined, loopItemId);
}

/**
 * Xoay item (rotation) — coalescable, cùng pattern move/resize: nhiều lần đổi rotation liên tiếp
 * TRONG 1 THAO TÁC KÉO chuột gộp thành 1 undo. `from`/`to` là toàn bộ Box (giống move/resize),
 * chỉ field `rotation` thực sự đổi — tái dùng `makeBoxCommand` nguyên vẹn, không cần logic riêng.
 */
export function rotateItemCommand(variantId: string, itemId: string, from: Box, to: Box, loopItemId?: string): EditorCommand {
  return makeBoxCommand('rotate-item', variantId, itemId, from, to, undefined, loopItemId);
}

/**
 * Sửa thuộc tính bất kỳ (content/color/fontSize...) — KHÔNG coalesce (mỗi lần sửa 1 undo riêng,
 * nên an toàn cache `steps` trực tiếp trong closure — không gặp vấn đề "command coalesced chưa
 * từng apply()" như `makeBoxCommand`, vì command này không bao giờ bị coalesceWith tạo lại).
 * apply() tính + lưu `steps` (item chính + mọi con bị lan truyền, qua `computePatchSteps` —
 * sync.ts); invert() dùng LẠI ĐÚNG steps đã lưu, patch theo `step.from` (đã chứa snapshot
 * ĐÚNG `syncOverrides` TRƯỚC patch) — KHÔNG tính lại từ state hiện tại (state lúc invert đã ở
 * trạng thái SAU apply, tính lại sẽ sai — xem giải thích đầy đủ ở `makeBoxCommand` phía trên).
 * Truyền `loopItemId` khi item nằm trong `itemTemplate` của 1 LoopItem (Bước 9).
 */
export function patchItemCommand<T extends LayoutItem>(variantId: string, itemId: string, from: Partial<T>, to: Partial<T>, loopItemId?: string): EditorCommand {
  let steps: SyncPatchStep[] = [];
  return {
    type: 'patch-item',
    apply: (state) => {
      steps = computePatchSteps(state.doc, variantId, itemId, from, to, loopItemId);
      let doc = state.doc;
      for (const s of steps) doc = patchItem(doc, s.variantId, s.itemId, s.to, s.loopItemId);
      return { ...state, doc };
    },
    invert: (state) => {
      let doc = state.doc;
      for (const s of [...steps].reverse()) doc = patchItem(doc, s.variantId, s.itemId, s.from, s.loopItemId);
      return { ...state, doc };
    },
  };
}

/** Bấm nút khoá trên toolbar/PropertyPanel khi đang chọn item có `syncRef` — item đó TÁCH HẲN
 * khỏi cha, không còn nhận auto-sync cho bất kỳ field nào. Đảo ngược được (mở khoá lại). Item
 * trong itemTemplate KHÔNG có syncRef (không tham gia sync) — `loopItemId` vẫn nhận cho đủ bộ
 * tham số nhất quán với các command khác, dù thực tế nút này sẽ không hiện trong edit-mode. */
export function toggleSyncLockCommand(variantId: string, itemId: string, locked: boolean, loopItemId?: string): EditorCommand {
  return {
    type: 'toggle-sync-lock',
    apply: (state) => ({ ...state, doc: patchItem(state.doc, variantId, itemId, { syncLocked: locked }, loopItemId) }),
    invert: (state) => ({ ...state, doc: patchItem(state.doc, variantId, itemId, { syncLocked: !locked }, loopItemId) }),
  };
}
