import { describe, expect, it } from 'vitest';
import { HistoryStack } from './history.js';
import { addItemCommand, addVariantCommand, moveItemCommand, removeItemCommand, removeVariantCommand } from './commands.js';
import { createInitialState } from './state.js';
import type { LayoutContent, LayoutVariant } from '@sky-app/slide-shared';

function emptyDoc(): LayoutContent {
  return {
    variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items: [] }],
  };
}

function textItem(id: string, x: number, y: number) {
  return { id, type: 'text' as const, box: { x, y, w: 100, h: 40 }, content: 'A', fontSize: 20 };
}

function variant219(): LayoutVariant {
  return { aspect: { id: '21:9', w: 21, h: 9 }, refW: 2520, refH: 1080, items: [] };
}

describe('HistoryStack — undo/redo cơ bản', () => {
  it('execute rồi undo → state quay về TRƯỚC command', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addItemCommand('16:9', textItem('a', 0, 0)), state);

    expect(state.doc.variants[0]!.items).toHaveLength(1);

    state = history.undo(state);
    expect(state.doc.variants[0]!.items).toHaveLength(0);
  });

  it('undo rồi redo → state quay lại đúng SAU command', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addItemCommand('16:9', textItem('a', 0, 0)), state);
    state = history.undo(state);
    state = history.redo(state);

    expect(state.doc.variants[0]!.items).toHaveLength(1);
    expect(state.doc.variants[0]!.items[0]!.id).toBe('a');
  });

  it('undo khi past rỗng → không lỗi, state không đổi', () => {
    const history = new HistoryStack();
    const state = createInitialState(emptyDoc());
    const after = history.undo(state);
    expect(after).toBe(state);
  });

  it('redo khi future rỗng → không lỗi, state không đổi', () => {
    const history = new HistoryStack();
    const state = createInitialState(emptyDoc());
    const after = history.redo(state);
    expect(after).toBe(state);
  });

  it('execute command MỚI sau khi undo → xoá sạch nhánh future cũ (không redo lại được)', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addItemCommand('16:9', textItem('a', 0, 0)), state);
    state = history.undo(state);
    expect(history.snapshot().canRedo).toBe(true);

    state = history.execute(addItemCommand('16:9', textItem('b', 0, 0)), state);
    expect(history.snapshot().canRedo).toBe(false);
    expect(state.doc.variants[0]!.items.map((i) => i.id)).toEqual(['b']);
  });

  it('remove-item: invert khôi phục đúng item đã xoá (không mất data)', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addItemCommand('16:9', textItem('a', 5, 5)), state);
    state = history.execute(removeItemCommand('16:9', 'a'), state);
    expect(state.doc.variants[0]!.items).toHaveLength(0);

    state = history.undo(state);
    expect(state.doc.variants[0]!.items).toHaveLength(1);
    expect(state.doc.variants[0]!.items[0]).toMatchObject({ id: 'a', box: { x: 5, y: 5 } });
  });
});

describe('HistoryStack — coalesce (gộp move liên tiếp thành 1 undo)', () => {
  it('nhiều move LIÊN TIẾP cùng item gộp thành 1 entry trong past', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addItemCommand('16:9', textItem('a', 0, 0)), state);
    expect(history.snapshot().pastLength).toBe(1);

    // Mô phỏng kéo chuột 3 frame liên tiếp: mỗi frame move thêm 1 chút.
    state = history.execute(moveItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 40 }, { x: 10, y: 0, w: 100, h: 40 }), state);
    state = history.execute(moveItemCommand('16:9', 'a', { x: 10, y: 0, w: 100, h: 40 }, { x: 20, y: 0, w: 100, h: 40 }), state);
    state = history.execute(moveItemCommand('16:9', 'a', { x: 20, y: 0, w: 100, h: 40 }, { x: 30, y: 0, w: 100, h: 40 }), state);

    // add-item (1) + move gộp (1) = 2 entry, KHÔNG phải 4.
    expect(history.snapshot().pastLength).toBe(2);
    expect(state.doc.variants[0]!.items[0]!.box.x).toBe(30);
  });

  it('undo 1 lần sau chuỗi move gộp → lùi thẳng về vị trí TRƯỚC KHI bắt đầu kéo (không phải bước áp chót)', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addItemCommand('16:9', textItem('a', 0, 0)), state);
    state = history.execute(moveItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 40 }, { x: 10, y: 0, w: 100, h: 40 }), state);
    state = history.execute(moveItemCommand('16:9', 'a', { x: 10, y: 0, w: 100, h: 40 }, { x: 20, y: 0, w: 100, h: 40 }), state);

    state = history.undo(state);
    expect(state.doc.variants[0]!.items[0]!.box.x).toBe(0); // về TRƯỚC toàn bộ chuỗi kéo, không phải x=10
  });

  it('move item KHÁC nhau KHÔNG gộp — mỗi item 1 entry riêng', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addItemCommand('16:9', textItem('a', 0, 0)), state);
    state = history.execute(addItemCommand('16:9', textItem('b', 0, 0)), state);
    const afterAdds = history.snapshot().pastLength;

    state = history.execute(moveItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 40 }, { x: 5, y: 0, w: 100, h: 40 }), state);
    state = history.execute(moveItemCommand('16:9', 'b', { x: 0, y: 0, w: 100, h: 40 }, { x: 5, y: 0, w: 100, h: 40 }), state);

    expect(history.snapshot().pastLength).toBe(afterAdds + 2); // KHÔNG gộp vì khác item
  });

  it('move rồi thao tác KHÁC LOẠI (remove) → không gộp nhầm', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addItemCommand('16:9', textItem('a', 0, 0)), state);
    state = history.execute(moveItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 40 }, { x: 5, y: 0, w: 100, h: 40 }), state);
    const beforeRemove = history.snapshot().pastLength;

    state = history.execute(removeItemCommand('16:9', 'a'), state);
    expect(history.snapshot().pastLength).toBe(beforeRemove + 1);
  });
});

describe('HistoryStack — list/panel History', () => {
  it('list() trả đúng thứ tự command đã chạy', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addItemCommand('16:9', textItem('a', 0, 0)), state);
    state = history.execute(addItemCommand('16:9', textItem('b', 0, 0)), state);
    void state;

    expect(history.list().map((c) => c.type)).toEqual(['add-item', 'add-item']);
  });

  it('clear() reset cả past và future', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addItemCommand('16:9', textItem('a', 0, 0)), state);
    history.undo(state);
    history.clear();
    const snap = history.snapshot();
    expect(snap.canUndo).toBe(false);
    expect(snap.canRedo).toBe(false);
  });
});

describe('addVariantCommand / removeVariantCommand — thêm/xoá tỷ lệ (12-thu-vien-layout.md)', () => {
  it('addVariantCommand thêm variant mới + tự chuyển activeVariantId sang variant vừa thêm', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addVariantCommand(variant219(), state.activeVariantId), state);

    expect(state.doc.variants).toHaveLength(2);
    expect(state.doc.variants[1]!.aspect.id).toBe('21:9');
    expect(state.activeVariantId).toBe('21:9');
  });

  it('undo addVariantCommand → xoá variant vừa thêm, activeVariantId quay lại variant cũ', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    const originalActive = state.activeVariantId;
    state = history.execute(addVariantCommand(variant219(), originalActive), state);

    state = history.undo(state);
    expect(state.doc.variants).toHaveLength(1);
    expect(state.activeVariantId).toBe(originalActive);
  });

  it('removeVariantCommand xoá variant theo id, chuyển activeVariantId sang variant chỉ định', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addVariantCommand(variant219(), state.activeVariantId), state);

    state = history.execute(removeVariantCommand('21:9', '16:9'), state);
    expect(state.doc.variants).toHaveLength(1);
    expect(state.doc.variants[0]!.aspect.id).toBe('16:9');
    expect(state.activeVariantId).toBe('16:9');
  });

  it('undo removeVariantCommand → khôi phục ĐÚNG VỊ TRÍ variant đã xoá trong mảng', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addVariantCommand(variant219(), state.activeVariantId), state);
    state = history.execute(removeVariantCommand('21:9', '16:9'), state);

    state = history.undo(state);
    expect(state.doc.variants).toHaveLength(2);
    expect(state.doc.variants.map((v) => v.aspect.id)).toEqual(['16:9', '21:9']);
    expect(state.activeVariantId).toBe('21:9');
  });

  it('removeVariantCommand KHÔNG xoá được nếu chỉ còn 1 variant (doc-helpers.removeVariant no-op)', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());

    state = history.execute(removeVariantCommand('16:9', '16:9'), state);
    // doc-helpers.removeVariant trả nguyên doc khi variants.length<=1 — vẫn còn đúng 1 variant.
    expect(state.doc.variants).toHaveLength(1);
  });
});
