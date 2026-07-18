// Test changeVariantAspectCommand — đổi tỷ lệ CỦA CHÍNH 1 variant TẠI CHỖ (không tạo bản sao,
// giữ nguyên id/syncKey/liên kết sync đã có), khác hẳn "Copy ghi đè toàn bộ" (sync-commands.ts).

import { describe, expect, it } from 'vitest';
import { HistoryStack } from './history.js';
import { changeVariantAspectCommand } from './commands.js';
import { createInitialState } from './state.js';
import type { LayoutContent, LayoutItem } from '@sky-app/slide-shared';

function docWith16by9(items: LayoutItem[] = []): LayoutContent {
  return { variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items }] };
}

function boxItem(id: string, box: { x: number; y: number; w: number; h: number }, overrides: Partial<LayoutItem> = {}): LayoutItem {
  return { id, type: 'shape', box, shape: 'rect', fill: '#fff', ...overrides } as LayoutItem;
}

describe('changeVariantAspectCommand — đổi tỷ lệ tại chỗ', () => {
  it('đổi aspect + refW/refH ĐÚNG tỷ lệ mới (giữ refW cố định, refH tính lại)', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWith16by9());
    state = history.execute(changeVariantAspectCommand('16:9', { id: '4:3', w: 4, h: 3 }, true), state);

    const variant = state.doc.variants[0]!;
    expect(variant.aspect.id).toBe('4:3');
    expect(variant.refW).toBe(1920); // giữ nguyên
    expect(variant.refH).toBeCloseTo((1920 * 3) / 4, 5); // 1440, đúng tỷ lệ 4:3
  });

  it('scale toạ độ item ĐÚNG theo tỷ lệ mới (giữ vị trí tương đối, không méo)', () => {
    const history = new HistoryStack();
    const item = boxItem('a', { x: 100, y: 100, w: 200, h: 100 });
    let state = createInitialState(docWith16by9([item]));
    state = history.execute(changeVariantAspectCommand('16:9', { id: '4:3', w: 4, h: 3 }, true), state);

    const updated = state.doc.variants[0]!.items[0]!;
    // scaleX = newRefW/oldRefW = 1 (refW giữ nguyên); scaleY = newRefH/oldRefH = 1440/1080.
    const scaleY = 1440 / 1080;
    expect(updated.box.x).toBe(100); // scaleX=1, x không đổi
    expect(updated.box.w).toBe(200); // scaleX=1, w không đổi
    expect(updated.box.y).toBeCloseTo(100 * scaleY, 5);
    expect(updated.box.h).toBeCloseTo(100 * scaleY, 5);
  });

  it('GIỮ NGUYÊN id/syncKey/syncRef của item — không tạo bản sao', () => {
    const history = new HistoryStack();
    const item = boxItem('a', { x: 100, y: 100, w: 200, h: 100 }, { syncKey: 'kOriginal', syncRef: 'kParent' });
    let state = createInitialState(docWith16by9([item]));
    state = history.execute(changeVariantAspectCommand('16:9', { id: '4:3', w: 4, h: 3 }, true), state);

    const updated = state.doc.variants[0]!.items[0]!;
    expect(updated.id).toBe('a');
    expect(updated.syncKey).toBe('kOriginal');
    expect(updated.syncRef).toBe('kParent');
  });

  it('wasActive=true → activeVariantId đổi theo aspect.id mới', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWith16by9());
    expect(state.activeVariantId).toBe('16:9');

    state = history.execute(changeVariantAspectCommand('16:9', { id: '4:3', w: 4, h: 3 }, true), state);
    expect(state.activeVariantId).toBe('4:3');
  });

  it('wasActive=false → activeVariantId KHÔNG đổi (variant khác đang active)', () => {
    const history = new HistoryStack();
    const doc: LayoutContent = {
      variants: [
        { aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items: [] },
        { aspect: { id: '4:3', w: 4, h: 3 }, refW: 1920, refH: 1440, items: [] },
      ],
    };
    let state = createInitialState(doc, '4:3'); // đang active variant 4:3, đổi variant 16:9 (không active)
    state = history.execute(changeVariantAspectCommand('16:9', { id: '21:9', w: 21, h: 9 }, false), state);
    expect(state.activeVariantId).toBe('4:3'); // không đổi
  });

  it('undo khôi phục ĐÚNG NGUYÊN aspect/refW/refH/items/activeVariantId', () => {
    const history = new HistoryStack();
    const item = boxItem('a', { x: 100, y: 100, w: 200, h: 100 });
    let state = createInitialState(docWith16by9([item]));

    state = history.execute(changeVariantAspectCommand('16:9', { id: '4:3', w: 4, h: 3 }, true), state);
    state = history.undo(state);

    const variant = state.doc.variants[0]!;
    expect(variant.aspect.id).toBe('16:9');
    expect(variant.refW).toBe(1920);
    expect(variant.refH).toBe(1080);
    expect(variant.items[0]!.box).toEqual({ x: 100, y: 100, w: 200, h: 100 });
    expect(state.activeVariantId).toBe('16:9');
  });

  it('variantId không tồn tại → no-op an toàn', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWith16by9());
    const before = state;
    state = history.execute(changeVariantAspectCommand('không-tồn-tại', { id: '4:3', w: 4, h: 3 }, false), state);
    expect(state.doc).toEqual(before.doc);
  });
});
