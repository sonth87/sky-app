// Test hành vi AUTO-SYNC của patchItemCommand/moveItemCommand/resizeItemCommand/addItemCommand/
// toggleSyncLockCommand — tách khỏi history.test.ts (vốn test HistoryStack chung) để tập trung
// vào đúng phạm vi Giai đoạn 2.6 (copy-variant + liên kết cha-con). Xem sync.test.ts cho test các
// hàm thuần (sync.ts), file này test TÍCH HỢP qua HistoryStack thật (đảm bảo undo/redo đúng).

import { describe, expect, it } from 'vitest';
import { HistoryStack } from './history.js';
import { addItemCommand, moveItemCommand, patchItemCommand, resizeItemCommand, toggleSyncLockCommand } from './commands.js';
import { createInitialState } from './state.js';
import type { LayoutContent, LayoutItem } from '@sky-app/slide-shared';

function docWith(variants: { aspectId: string; w: number; h: number; items: LayoutItem[] }[]): LayoutContent {
  return { variants: variants.map((v) => ({ aspect: { id: v.aspectId, w: v.w, h: v.h }, refW: v.w * 100, refH: v.h * 100, items: v.items })) };
}

function textItem(id: string, overrides: Partial<LayoutItem> = {}): LayoutItem {
  return { id, type: 'text', box: { x: 10, y: 10, w: 100, h: 40 }, content: 'A', fontSize: 20, ...overrides } as LayoutItem;
}

describe('addItemCommand — sinh syncKey', () => {
  it('item mới không có syncKey sẵn → tự sinh syncKey sau khi apply', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWith([{ aspectId: '16:9', w: 16, h: 9, items: [] }]));
    state = history.execute(addItemCommand('16:9', textItem('a')), state);

    expect(state.doc.variants[0]!.items[0]!.syncKey).toBeTruthy();
  });

  it('item TRUYỀN VÀO đã có syncKey sẵn (case copy) → GIỮ NGUYÊN, không sinh mới', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWith([{ aspectId: '16:9', w: 16, h: 9, items: [] }]));
    state = history.execute(addItemCommand('16:9', textItem('a', { syncKey: 'k-fixed', syncRef: 'k-parent' })), state);

    expect(state.doc.variants[0]!.items[0]!.syncKey).toBe('k-fixed');
    expect(state.doc.variants[0]!.items[0]!.syncRef).toBe('k-parent');
  });
});

describe('patchItemCommand — auto-sync lan truyền cha→con, undo 1 bước cho multi-item', () => {
  it('patch item CHA (khác variant với con) → con tự đổi theo TRONG CÙNG 1 dispatch, undo MỘT LẦN khôi phục ĐÚNG CẢ 2', () => {
    const history = new HistoryStack();
    const a = textItem('a', { syncKey: 'kA', content: 'Gốc' });
    const b = textItem('b', { syncKey: 'kB', syncRef: 'kA', content: 'Gốc' });
    let state = createInitialState(docWith([
      { aspectId: '16:9', w: 16, h: 9, items: [a] },
      { aspectId: '4:3', w: 4, h: 3, items: [b] },
    ]));

    state = history.execute(patchItemCommand('16:9', 'a', { content: 'Gốc' }, { content: 'Đã sửa' }), state);

    const itemA = state.doc.variants[0]!.items[0]!;
    const itemB = state.doc.variants[1]!.items[0]!;
    expect(itemA.content).toBe('Đã sửa');
    expect(itemB.content).toBe('Đã sửa'); // con tự lan truyền theo

    // Undo MỘT LẦN duy nhất → cả A và B về nguyên trạng — test quan trọng nhất của toàn bộ tính năng.
    state = history.undo(state);
    expect(state.doc.variants[0]!.items[0]!.content).toBe('Gốc');
    expect(state.doc.variants[1]!.items[0]!.content).toBe('Gốc');

    // Redo lại — cả 2 đổi lại đúng.
    state = history.redo(state);
    expect(state.doc.variants[0]!.items[0]!.content).toBe('Đã sửa');
    expect(state.doc.variants[1]!.items[0]!.content).toBe('Đã sửa');
  });

  it('patch item CON trực tiếp (không qua cha) → con tự thêm override, CHA KHÔNG đổi gì (1 chiều)', () => {
    const history = new HistoryStack();
    const a = textItem('a', { syncKey: 'kA', content: 'Gốc' });
    const b = textItem('b', { syncKey: 'kB', syncRef: 'kA', content: 'Gốc' });
    let state = createInitialState(docWith([{ aspectId: '16:9', w: 16, h: 9, items: [a, b] }]));

    state = history.execute(patchItemCommand('16:9', 'b', { content: 'Gốc' }, { content: 'Sửa tay ở con' }), state);

    const itemA = state.doc.variants[0]!.items.find((i) => i.id === 'a')!;
    const itemB = state.doc.variants[0]!.items.find((i) => i.id === 'b')!;
    expect(itemA.content).toBe('Gốc'); // cha KHÔNG đổi
    expect(itemB.content).toBe('Sửa tay ở con');
    expect(itemB.syncOverrides).toEqual(['content']);

    state = history.undo(state);
    const itemBAfterUndo = state.doc.variants[0]!.items.find((i) => i.id === 'b')!;
    expect(itemBAfterUndo.content).toBe('Gốc');
    expect(itemBAfterUndo.syncOverrides ?? []).toEqual([]);
  });

  it('con đã override nhóm content → patch content ở cha KHÔNG lan, nhưng patch style (fontSize) vẫn lan', () => {
    const history = new HistoryStack();
    const a = textItem('a', { syncKey: 'kA', content: 'Gốc', fontSize: 20 });
    const b = textItem('b', { syncKey: 'kB', syncRef: 'kA', content: 'Đã sửa tay', fontSize: 20, syncOverrides: ['content'] });
    let state = createInitialState(docWith([{ aspectId: '16:9', w: 16, h: 9, items: [a, b] }]));

    state = history.execute(patchItemCommand('16:9', 'a', { content: 'Gốc', fontSize: 20 }, { content: 'Cha đổi', fontSize: 30 }), state);

    const itemB = state.doc.variants[0]!.items.find((i) => i.id === 'b')!;
    expect(itemB.content).toBe('Đã sửa tay'); // content override, KHÔNG bị ghi đè
    expect((itemB as { fontSize: number }).fontSize).toBe(30); // style chưa override, vẫn lan
  });

  it('toggleSyncLockCommand khoá con → patch cha sau đó KHÔNG ảnh hưởng con nữa; undo mở khoá lại đúng', () => {
    const history = new HistoryStack();
    const a = textItem('a', { syncKey: 'kA', content: 'Gốc' });
    const b = textItem('b', { syncKey: 'kB', syncRef: 'kA', content: 'Gốc' });
    let state = createInitialState(docWith([{ aspectId: '16:9', w: 16, h: 9, items: [a, b] }]));

    state = history.execute(toggleSyncLockCommand('16:9', 'b', true), state);
    expect(state.doc.variants[0]!.items.find((i) => i.id === 'b')!.syncLocked).toBe(true);

    state = history.execute(patchItemCommand('16:9', 'a', { content: 'Gốc' }, { content: 'Cha đổi' }), state);
    const itemBLocked = state.doc.variants[0]!.items.find((i) => i.id === 'b')!;
    expect(itemBLocked.content).toBe('Gốc'); // đã khoá, không nhận sync

    // undo patch cha, rồi undo lock → B mở khoá lại
    state = history.undo(state); // undo patch a
    state = history.undo(state); // undo lock
    const itemBUnlocked = state.doc.variants[0]!.items.find((i) => i.id === 'b')!;
    expect(itemBUnlocked.syncLocked).toBe(false);
  });
});

describe('moveItemCommand/resizeItemCommand — lan truyền box + coalesce vẫn đúng', () => {
  it('move item CHA → box của CON lan truyền theo (con chưa override box)', () => {
    const history = new HistoryStack();
    const a = textItem('a', { syncKey: 'kA', box: { x: 0, y: 0, w: 100, h: 40 } });
    const b = textItem('b', { syncKey: 'kB', syncRef: 'kA', box: { x: 0, y: 0, w: 100, h: 40 } });
    let state = createInitialState(docWith([{ aspectId: '16:9', w: 16, h: 9, items: [a, b] }]));

    state = history.execute(moveItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 40 }, { x: 50, y: 0, w: 100, h: 40 }), state);

    const itemB = state.doc.variants[0]!.items.find((i) => i.id === 'b')!;
    expect(itemB.box.x).toBe(50);

    state = history.undo(state);
    const itemBAfterUndo = state.doc.variants[0]!.items.find((i) => i.id === 'b')!;
    expect(itemBAfterUndo.box.x).toBe(0);
  });

  it('move CON đã override box trước đó → move cha sau đó KHÔNG ảnh hưởng con', () => {
    const history = new HistoryStack();
    const a = textItem('a', { syncKey: 'kA', box: { x: 0, y: 0, w: 100, h: 40 } });
    const b = textItem('b', { syncKey: 'kB', syncRef: 'kA', box: { x: 0, y: 0, w: 100, h: 40 } });
    let state = createInitialState(docWith([{ aspectId: '16:9', w: 16, h: 9, items: [a, b] }]));

    // Con tự di chuyển trước — tự thêm override 'box'.
    state = history.execute(moveItemCommand('16:9', 'b', { x: 0, y: 0, w: 100, h: 40 }, { x: 99, y: 0, w: 100, h: 40 }), state);
    expect(state.doc.variants[0]!.items.find((i) => i.id === 'b')!.syncOverrides).toEqual(['box']);

    // Cha di chuyển sau đó — KHÔNG ảnh hưởng con đã override.
    state = history.execute(moveItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 40 }, { x: 50, y: 0, w: 100, h: 40 }), state);
    expect(state.doc.variants[0]!.items.find((i) => i.id === 'b')!.box.x).toBe(99);
  });

  it('coalesce nhiều lần move liên tiếp CÙNG item CHA vẫn lan truyền đúng tới con, undo 1 lần về lại vị trí GỐC của cả 2', () => {
    const history = new HistoryStack();
    const a = textItem('a', { syncKey: 'kA', box: { x: 0, y: 0, w: 100, h: 40 } });
    const b = textItem('b', { syncKey: 'kB', syncRef: 'kA', box: { x: 0, y: 0, w: 100, h: 40 } });
    let state = createInitialState(docWith([{ aspectId: '16:9', w: 16, h: 9, items: [a, b] }]));

    state = history.execute(moveItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 40 }, { x: 10, y: 0, w: 100, h: 40 }), state);
    state = history.execute(moveItemCommand('16:9', 'a', { x: 10, y: 0, w: 100, h: 40 }, { x: 20, y: 0, w: 100, h: 40 }), state);

    expect(history.snapshot().pastLength).toBe(1); // đã coalesce thành 1 entry
    expect(state.doc.variants[0]!.items.find((i) => i.id === 'b')!.box.x).toBe(20);

    state = history.undo(state);
    expect(state.doc.variants[0]!.items.find((i) => i.id === 'a')!.box.x).toBe(0);
    expect(state.doc.variants[0]!.items.find((i) => i.id === 'b')!.box.x).toBe(0); // con cũng về gốc
  });

  it('resizeItemCommand cũng lan truyền tương tự move (dùng chung makeBoxCommand)', () => {
    const history = new HistoryStack();
    const a = textItem('a', { syncKey: 'kA', box: { x: 0, y: 0, w: 100, h: 40 } });
    const b = textItem('b', { syncKey: 'kB', syncRef: 'kA', box: { x: 0, y: 0, w: 100, h: 40 } });
    let state = createInitialState(docWith([{ aspectId: '16:9', w: 16, h: 9, items: [a, b] }]));

    state = history.execute(resizeItemCommand('16:9', 'a', { x: 0, y: 0, w: 100, h: 40 }, { x: 0, y: 0, w: 200, h: 80 }), state);

    expect(state.doc.variants[0]!.items.find((i) => i.id === 'b')!.box.w).toBe(200);
  });
});
