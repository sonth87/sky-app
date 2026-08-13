// Test rotateItemCommand — Bước 4 kế hoạch resize/rotate (2026-07-18). Cùng pattern
// makeBoxCommand/StepsHolder đã dùng cho move/resize (xem history.test.ts nhóm coalesce).

import { describe, expect, it } from 'vitest';
import { HistoryStack } from './history.js';
import { addItemCommand, rotateItemCommand } from './commands.js';
import { createInitialState } from './state.js';
import type { LayoutContent } from '@sky-app/slide-shared';

function emptyDoc(): LayoutContent {
  return {
    variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items: [] }],
  };
}

function shapeItem(id: string) {
  return { id, type: 'shape' as const, box: { x: 0, y: 0, w: 100, h: 100 }, shape: 'rect' as const, fill: '#fff' };
}

describe('rotateItemCommand — xoay đơn lẻ', () => {
  it('apply → box.rotation đổi đúng giá trị mới', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addItemCommand('16:9', shapeItem('a')), state);

    state = history.execute(rotateItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 100, h: 100, rotation: 45 }), state);
    expect(state.doc.variants[0]!.items[0]!.box.rotation).toBe(45);
  });

  it('undo → box.rotation quay lại giá trị cũ (undefined)', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addItemCommand('16:9', shapeItem('a')), state);
    state = history.execute(rotateItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 100, h: 100, rotation: 90 }), state);

    state = history.undo(state);
    expect(state.doc.variants[0]!.items[0]!.box.rotation).toBeUndefined();
  });

  it('redo sau undo → xoay lại đúng giá trị đã redo', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addItemCommand('16:9', shapeItem('a')), state);
    state = history.execute(rotateItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 100, h: 100, rotation: 180 }), state);
    state = history.undo(state);
    state = history.redo(state);

    expect(state.doc.variants[0]!.items[0]!.box.rotation).toBe(180);
  });
});

describe('rotateItemCommand — coalesce (gộp xoay liên tiếp thành 1 undo)', () => {
  it('nhiều lần rotate LIÊN TIẾP cùng item (mô phỏng kéo handle xoay nhiều frame) gộp thành 1 entry', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addItemCommand('16:9', shapeItem('a')), state);
    expect(history.snapshot().pastLength).toBe(1);

    state = history.execute(rotateItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 100, h: 100, rotation: 10 }), state);
    state = history.execute(rotateItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 100, rotation: 10 }, { x: 0, y: 0, w: 100, h: 100, rotation: 20 }), state);
    state = history.execute(rotateItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 100, rotation: 20 }, { x: 0, y: 0, w: 100, h: 100, rotation: 30 }), state);

    // add-item (1) + rotate gộp (1) = 2 entry, KHÔNG phải 4.
    expect(history.snapshot().pastLength).toBe(2);
    expect(state.doc.variants[0]!.items[0]!.box.rotation).toBe(30);
  });

  it('undo 1 lần sau chuỗi rotate gộp → lùi thẳng về rotation TRƯỚC KHI bắt đầu kéo (không phải bước áp chót)', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addItemCommand('16:9', shapeItem('a')), state);

    state = history.execute(rotateItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 100, h: 100, rotation: 10 }), state);
    state = history.execute(rotateItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 100, rotation: 10 }, { x: 0, y: 0, w: 100, h: 100, rotation: 20 }), state);

    state = history.undo(state);
    expect(state.doc.variants[0]!.items[0]!.box.rotation).toBeUndefined();
  });

  it('rotate 2 item khác nhau KHÔNG gộp (coalesce chỉ áp dụng cùng itemId)', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addItemCommand('16:9', shapeItem('a')), state);
    state = history.execute(addItemCommand('16:9', shapeItem('b')), state);
    expect(history.snapshot().pastLength).toBe(2);

    state = history.execute(rotateItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 100, h: 100, rotation: 5 }), state);
    state = history.execute(rotateItemCommand('16:9', 'b', { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 100, h: 100, rotation: 5 }), state);

    expect(history.snapshot().pastLength).toBe(4);
  });

  it('rotate rồi move KHÔNG gộp (coalesce chỉ áp dụng cùng type)', () => {
    const history = new HistoryStack();
    let state = createInitialState(emptyDoc());
    state = history.execute(addItemCommand('16:9', shapeItem('a')), state);

    state = history.execute(rotateItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 100, h: 100, rotation: 5 }), state);
    expect(history.snapshot().pastLength).toBe(2);
  });
});
