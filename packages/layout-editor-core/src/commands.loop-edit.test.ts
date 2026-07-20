// Test move/resize/rotate/patch/toggleSyncLock với loopItemId (item trong itemTemplate) —
// Bước 9 kế hoạch resize/rotate (2026-07-18).

import { describe, expect, it } from 'vitest';
import { HistoryStack } from './history.js';
import { addItemCommand, moveItemCommand, patchItemCommand, removeItemCommand, resizeItemCommand, rotateItemCommand, toggleSyncLockCommand } from './commands.js';
import { createInitialState } from './state.js';
import { findItem } from './doc-helpers.js';
import type { LayoutContent } from '@sky-app/slide-shared';

function docWithLoop(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '16:9', w: 16, h: 9 },
        refW: 1920,
        refH: 1080,
        items: [
          {
            id: 'loop1',
            type: 'loop',
            box: { x: 0, y: 100, w: 400, h: 300 },
            itemTemplate: [{ id: 'child1', type: 'shape', box: { x: 10, y: 10, w: 50, h: 50 }, shape: 'rect', fill: '#fff' }],
            itemBox: { w: 180, h: 220 },
          },
        ],
      },
    ],
  };
}

describe('moveItemCommand — với loopItemId', () => {
  it('apply → box của item trong itemTemplate đổi đúng, KHÔNG đụng box của LoopItem cha', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWithLoop());
    const loopBoxBefore = findItem(state.doc, '16:9', 'loop1')!.box;

    state = history.execute(moveItemCommand('16:9', 'child1', { x: 10, y: 10, w: 50, h: 50 }, { x: 30, y: 30, w: 50, h: 50 }, 'loop1'), state);

    const child = findItem(state.doc, '16:9', 'child1', 'loop1')!;
    expect(child.box.x).toBe(30);
    expect(child.box.y).toBe(30);
    expect(findItem(state.doc, '16:9', 'loop1')!.box).toEqual(loopBoxBefore);
  });

  it('undo → box quay lại giá trị cũ', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWithLoop());
    state = history.execute(moveItemCommand('16:9', 'child1', { x: 10, y: 10, w: 50, h: 50 }, { x: 30, y: 30, w: 50, h: 50 }, 'loop1'), state);

    state = history.undo(state);
    expect(findItem(state.doc, '16:9', 'child1', 'loop1')!.box.x).toBe(10);
  });

  it('coalesce nhiều lần move liên tiếp CÙNG item trong CÙNG loopItemId → 1 undo', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWithLoop());
    const pastBefore = history.snapshot().pastLength;

    state = history.execute(moveItemCommand('16:9', 'child1', { x: 10, y: 10, w: 50, h: 50 }, { x: 15, y: 10, w: 50, h: 50 }, 'loop1'), state);
    state = history.execute(moveItemCommand('16:9', 'child1', { x: 15, y: 10, w: 50, h: 50 }, { x: 20, y: 10, w: 50, h: 50 }, 'loop1'), state);

    expect(history.snapshot().pastLength).toBe(pastBefore + 1);
    expect(findItem(state.doc, '16:9', 'child1', 'loop1')!.box.x).toBe(20);
  });
});

describe('resizeItemCommand/rotateItemCommand — với loopItemId', () => {
  it('resizeItemCommand áp dụng đúng vào itemTemplate', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWithLoop());
    state = history.execute(resizeItemCommand('16:9', 'child1', { x: 10, y: 10, w: 50, h: 50 }, { x: 10, y: 10, w: 80, h: 80 }, 'loop1'), state);

    expect(findItem(state.doc, '16:9', 'child1', 'loop1')!.box.w).toBe(80);
  });

  it('rotateItemCommand áp dụng đúng vào itemTemplate', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWithLoop());
    state = history.execute(rotateItemCommand('16:9', 'child1', { x: 10, y: 10, w: 50, h: 50 }, { x: 10, y: 10, w: 50, h: 50, rotation: 45 }, 'loop1'), state);

    expect(findItem(state.doc, '16:9', 'child1', 'loop1')!.box.rotation).toBe(45);
  });
});

describe('patchItemCommand — với loopItemId, KHÔNG lan truyền sync (quyết định phạm vi Bước 9)', () => {
  it('patch field content trong itemTemplate → chỉ đổi ĐÚNG item đó', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWithLoop());
    state = history.execute(patchItemCommand('16:9', 'child1', { fill: '#fff' }, { fill: '#f00' }, 'loop1'), state);

    expect(findItem(state.doc, '16:9', 'child1', 'loop1')).toMatchObject({ fill: '#f00' });
  });

  it('undo patch trong itemTemplate → khôi phục đúng', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWithLoop());
    state = history.execute(patchItemCommand('16:9', 'child1', { fill: '#fff' }, { fill: '#f00' }, 'loop1'), state);
    state = history.undo(state);

    expect(findItem(state.doc, '16:9', 'child1', 'loop1')).toMatchObject({ fill: '#fff' });
  });

  it('item trong itemTemplate KHÔNG có syncKey dù patch qua addItemCommand-style — xác nhận đúng thiết kế "template độc lập, không sync"', () => {
    // addItemCommand tự sinh syncKey cho item MỚI thêm vào variant.items (top-level) — nhưng item
    // trong itemTemplate KHÔNG đi qua addItemCommand (được thêm trực tiếp vào mảng itemTemplate
    // qua patchItemCommand({itemTemplate: [...]}) khi thoát edit-mode, xem Bước 10) — xác nhận
    // command move/patch với loopItemId không TỰ Ý gán syncKey cho item lồng.
    const history = new HistoryStack();
    let state = createInitialState(docWithLoop());
    state = history.execute(moveItemCommand('16:9', 'child1', { x: 10, y: 10, w: 50, h: 50 }, { x: 20, y: 20, w: 50, h: 50 }, 'loop1'), state);

    expect(findItem(state.doc, '16:9', 'child1', 'loop1')!.syncKey).toBeUndefined();
  });
});

describe('toggleSyncLockCommand — với loopItemId', () => {
  it('patch syncLocked vào item trong itemTemplate không lỗi (dù item lồng thường không có syncRef)', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWithLoop());
    state = history.execute(toggleSyncLockCommand('16:9', 'child1', true, 'loop1'), state);

    expect(findItem(state.doc, '16:9', 'child1', 'loop1')).toMatchObject({ syncLocked: true });
  });
});

describe('addItemCommand/removeItemCommand — với loopItemId (Bước 10)', () => {
  it('addItemCommand thêm item MỚI vào itemTemplate, KHÔNG đụng variant.items top-level', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWithLoop());
    const newChild = { id: 'child2', type: 'text' as const, box: { x: 0, y: 60, w: 60, h: 20 }, content: 'Mới', fontSize: 12 };

    state = history.execute(addItemCommand('16:9', newChild, 'loop1'), state);

    expect(findItem(state.doc, '16:9', 'child2', 'loop1')?.content).toBe('Mới');
    expect(state.doc.variants[0]!.items.map((i) => i.id)).toEqual(['loop1']); // top-level không đổi
  });

  it('undo addItemCommand (loopItemId) → itemTemplate quay lại đúng số lượng cũ', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWithLoop());
    const before = state.doc.variants[0]!.items.find((i) => i.id === 'loop1');
    const beforeCount = before?.type === 'loop' ? before.itemTemplate.length : -1;

    state = history.execute(addItemCommand('16:9', { id: 'child2', type: 'text', box: { x: 0, y: 60, w: 60, h: 20 }, content: 'X', fontSize: 12 }, 'loop1'), state);
    state = history.undo(state);

    const after = state.doc.variants[0]!.items.find((i) => i.id === 'loop1');
    expect(after?.type === 'loop' ? after.itemTemplate.length : -1).toBe(beforeCount);
  });

  it('removeItemCommand xoá item trong itemTemplate, KHÔNG đụng item top-level cùng id', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWithLoop());
    state = history.execute(addItemCommand('16:9', { id: 'child1', type: 'shape', box: { x: 0, y: 0, w: 5, h: 5 }, shape: 'circle', fill: '#000' }), state); // top-level trùng id

    state = history.execute(removeItemCommand('16:9', 'child1', 'loop1'), state);

    expect(findItem(state.doc, '16:9', 'child1', 'loop1')).toBeUndefined();
    expect(findItem(state.doc, '16:9', 'child1')).toBeTruthy(); // top-level vẫn còn
  });

  it('undo removeItemCommand (loopItemId) → item khôi phục đúng nguyên trạng trong itemTemplate', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWithLoop());
    state = history.execute(removeItemCommand('16:9', 'child1', 'loop1'), state);
    expect(findItem(state.doc, '16:9', 'child1', 'loop1')).toBeUndefined();

    state = history.undo(state);
    expect(findItem(state.doc, '16:9', 'child1', 'loop1')).toMatchObject({ shape: 'rect', fill: '#fff' });
  });
});

describe('Tương tác chéo: patch top-level KHÔNG ảnh hưởng item trong itemTemplate và ngược lại', () => {
  it('addItemCommand top-level rồi patch item lồng CÙNG id (namespace không tách biệt) → không lẫn', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWithLoop());
    // Thêm item top-level TRÙNG id với child trong template.
    state = history.execute(addItemCommand('16:9', { id: 'child1', type: 'shape', box: { x: 999, y: 999, w: 5, h: 5 }, shape: 'circle', fill: '#000' }), state);

    state = history.execute(patchItemCommand('16:9', 'child1', { fill: '#fff' }, { fill: '#0f0' }, 'loop1'), state);

    // Item trong template đổi đúng.
    expect(findItem(state.doc, '16:9', 'child1', 'loop1')).toMatchObject({ fill: '#0f0' });
    // Item top-level (cùng id) KHÔNG bị đụng.
    expect(findItem(state.doc, '16:9', 'child1')).toMatchObject({ fill: '#000', shape: 'circle' });
  });
});
