// Test resize UI qua 8 handle (SelectionHandles) — Bước 3 kế hoạch resize/rotate (2026-07-18).

import { beforeEach, describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';

// Cùng convention Canvas.test.tsx: refW/refH = DESIGN_W/DESIGN_H (760x428) để fitScale=1.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 760 + 48, configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 428 + 48, configurable: true });
});

function oneShapeContent(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '760:428', w: 760, h: 428 },
        refW: 760,
        refH: 428,
        items: [{ id: 's1', type: 'shape', box: { x: 200, y: 150, w: 100, h: 80 }, shape: 'rect', fill: '#4b57e6' }],
      },
    ],
  };
}

function mockArtRect(container: HTMLElement) {
  const artEl = container.querySelector('[data-testid="canvas-frame"]') as HTMLElement;
  artEl.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 760, bottom: 428, width: 760, height: 428, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
  return artEl;
}

function selectItem(container: HTMLElement) {
  const el = container.querySelector('[style*="cursor: move"]') as HTMLElement;
  fireEvent.pointerDown(el);
  fireEvent.pointerUp(el);
  return container.querySelector('[style*="cursor: move"]') as HTMLElement;
}

describe('Canvas — resize qua handle (SelectionHandles)', () => {
  it('kéo handle "se" (góc dưới-phải) → tăng w/h, giữ nguyên x/y', () => {
    const { container } = render(<LayoutDesignerApp content={oneShapeContent()} />);
    mockArtRect(container);
    const itemEl = selectItem(container);

    const handle = container.querySelector('[aria-label="Đổi kích thước — se"]') as HTMLElement;
    expect(handle).toBeTruthy();

    fireEvent.pointerDown(handle, { clientX: 300, clientY: 230 });
    fireEvent.pointerMove(handle, { clientX: 340, clientY: 260 });
    fireEvent.pointerUp(handle, { clientX: 340, clientY: 260 });

    expect(parseFloat(itemEl.style.left)).toBeCloseTo(200, 0);
    expect(parseFloat(itemEl.style.top)).toBeCloseTo(150, 0);
    expect(parseFloat(itemEl.style.width)).toBeCloseTo(140, 0);
    expect(parseFloat(itemEl.style.height)).toBeCloseTo(110, 0);
  });

  it('kéo handle "nw" (góc trên-trái) → x/y dịch theo, w/h co lại tương ứng', () => {
    const { container } = render(<LayoutDesignerApp content={oneShapeContent()} />);
    mockArtRect(container);
    selectItem(container);

    const handle = container.querySelector('[aria-label="Đổi kích thước — nw"]') as HTMLElement;
    fireEvent.pointerDown(handle, { clientX: 200, clientY: 150 });
    fireEvent.pointerMove(handle, { clientX: 220, clientY: 170 });
    fireEvent.pointerUp(handle, { clientX: 220, clientY: 170 });

    const itemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    expect(parseFloat(itemEl.style.left)).toBeCloseTo(220, 0);
    expect(parseFloat(itemEl.style.top)).toBeCloseTo(170, 0);
    expect(parseFloat(itemEl.style.width)).toBeCloseTo(80, 0);
    expect(parseFloat(itemEl.style.height)).toBeCloseTo(60, 0);
  });

  it('kéo handle "e" (cạnh phải) → CHỈ đổi w, không đụng x/y/h', () => {
    const { container } = render(<LayoutDesignerApp content={oneShapeContent()} />);
    mockArtRect(container);
    selectItem(container);

    const handle = container.querySelector('[aria-label="Đổi kích thước — e"]') as HTMLElement;
    fireEvent.pointerDown(handle, { clientX: 300, clientY: 190 });
    fireEvent.pointerMove(handle, { clientX: 330, clientY: 190 });
    fireEvent.pointerUp(handle, { clientX: 330, clientY: 190 });

    const itemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    expect(parseFloat(itemEl.style.left)).toBeCloseTo(200, 0);
    expect(parseFloat(itemEl.style.top)).toBeCloseTo(150, 0);
    expect(parseFloat(itemEl.style.width)).toBeCloseTo(130, 0);
    expect(parseFloat(itemEl.style.height)).toBeCloseTo(80, 0);
  });

  it('kéo handle thu nhỏ QUÁ ngưỡng min-size (20px) → clamp lại 20, không cho w/h âm', () => {
    const { container } = render(<LayoutDesignerApp content={oneShapeContent()} />);
    mockArtRect(container);
    selectItem(container);

    const handle = container.querySelector('[aria-label="Đổi kích thước — se"]') as HTMLElement;
    fireEvent.pointerDown(handle, { clientX: 300, clientY: 230 });
    // Kéo lên trên-trái RẤT NHIỀU (vượt cả điểm x,y gốc) — w/h phải clamp về MIN_ITEM_SIZE=20.
    fireEvent.pointerMove(handle, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(handle, { clientX: 0, clientY: 0 });

    const itemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    expect(parseFloat(itemEl.style.width)).toBeCloseTo(20, 0);
    expect(parseFloat(itemEl.style.height)).toBeCloseTo(20, 0);
  });

  it('1 lần kéo (nhiều pointermove) = 1 undo (coalesce)', () => {
    const { container } = render(<LayoutDesignerApp content={oneShapeContent()} />);
    mockArtRect(container);
    selectItem(container);

    const handle = container.querySelector('[aria-label="Đổi kích thước — e"]') as HTMLElement;
    fireEvent.pointerDown(handle, { clientX: 300, clientY: 190 });
    fireEvent.pointerMove(handle, { clientX: 310, clientY: 190 });
    fireEvent.pointerMove(handle, { clientX: 320, clientY: 190 });
    fireEvent.pointerMove(handle, { clientX: 330, clientY: 190 });
    fireEvent.pointerUp(handle, { clientX: 330, clientY: 190 });

    let itemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    expect(parseFloat(itemEl.style.width)).toBeCloseTo(130, 0);

    const undoBtn = container.querySelector('[aria-label="Hoàn tác"]') as HTMLElement;
    fireEvent.click(undoBtn);

    itemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    expect(parseFloat(itemEl.style.width)).toBeCloseTo(100, 0);
  });

  it('item khoá (locked) → KHÔNG render handle tương tác (chỉ chấm tĩnh)', () => {
    const content = oneShapeContent();
    content.variants[0].items[0].locked = true;
    const { container } = render(<LayoutDesignerApp content={content} />);
    mockArtRect(container);
    // Item khoá có cursor 'default' thay vì 'move' (Bước 2) — không dùng helper selectItem().
    const el = container.querySelector('[style*="cursor: default"][style*="position: absolute"]') as HTMLElement;
    fireEvent.pointerDown(el);
    fireEvent.pointerUp(el);

    expect(container.querySelector('[aria-label="Đổi kích thước — se"]')).toBeNull();
  });
});
