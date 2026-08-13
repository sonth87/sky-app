// Test patchVariantBackgroundCommand — đổi nền (background) của Frame/Canvas khi không có item
// nào đang chọn (PropertyPanel.tsx's FrameBackgroundControls, review 2026-07-18).

import { describe, expect, it } from 'vitest';
import { HistoryStack } from './history.js';
import { patchVariantBackgroundCommand } from './commands.js';
import { createInitialState } from './state.js';
import type { LayoutContent } from '@sky-app/slide-shared';

function docWith16by9(): LayoutContent {
  return { variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items: [] }] };
}

describe('patchVariantBackgroundCommand', () => {
  it('đổi background từ undefined sang color', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWith16by9());
    state = history.execute(patchVariantBackgroundCommand('16:9', undefined, { kind: 'color', color: '#ff0000' }), state);

    expect(state.doc.variants[0]!.background).toEqual({ kind: 'color', color: '#ff0000' });
  });

  it('đổi background từ color sang gradient', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWith16by9());
    state = history.execute(patchVariantBackgroundCommand('16:9', undefined, { kind: 'color', color: '#ff0000' }), state);
    state = history.execute(patchVariantBackgroundCommand('16:9', { kind: 'color', color: '#ff0000' }, { kind: 'gradient', gradient: 'linear-gradient(#000,#fff)' }), state);

    expect(state.doc.variants[0]!.background).toEqual({ kind: 'gradient', gradient: 'linear-gradient(#000,#fff)' });
  });

  it('undo khôi phục đúng background cũ', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWith16by9());
    state = history.execute(patchVariantBackgroundCommand('16:9', undefined, { kind: 'color', color: '#ff0000' }), state);
    state = history.undo(state);

    expect(state.doc.variants[0]!.background).toBeUndefined();
  });

  it('variantId không tồn tại → no-op an toàn', () => {
    const history = new HistoryStack();
    let state = createInitialState(docWith16by9());
    const before = state;
    state = history.execute(patchVariantBackgroundCommand('không-tồn-tại', undefined, { kind: 'color', color: '#ff0000' }), state);
    expect(state.doc).toEqual(before.doc);
  });
});
