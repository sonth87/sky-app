// Test rotate UI (handle xoay quanh tâm, SelectionHandles) — Bước 4 kế hoạch resize/rotate
// (2026-07-18). Kéo handle bằng cách mock getBoundingClientRect của chính item (KHÁC
// Canvas.resize.test.tsx dùng mockArtRect ở tầng artEl — ở đây rotate handle đọc trực tiếp rect
// của item cha, xem onRotatePointerDown trong Canvas.tsx).

import { beforeEach, describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';

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

/** Item tâm tại (250, 190) trên artEl 760x428 tại (0,0) — mock rect item để onRotatePointerDown
 * đọc đúng tâm hình học (item.box: x=200,y=150,w=100,h=80 → cx=250,cy=190). */
function mockItemRect(itemEl: HTMLElement) {
  itemEl.getBoundingClientRect = () => ({ left: 200, top: 150, right: 300, bottom: 230, width: 100, height: 80, x: 200, y: 150, toJSON: () => {} }) as DOMRect;
}

describe('Canvas — rotate qua handle xoay', () => {
  it('kéo handle xoay từ 0° (thẳng lên) sang phải (90°) → box.rotation = 90', () => {
    const { container } = render(<LayoutDesignerApp content={oneShapeContent()} />);
    mockArtRect(container);
    const itemEl = selectItem(container);
    mockItemRect(itemEl);

    const handle = container.querySelector('[aria-label="Xoay"]') as HTMLElement;
    expect(handle).toBeTruthy();

    // Tâm (250,190). Bắt đầu kéo từ thẳng LÊN (250, 150) = 0°, kéo sang PHẢI (300, 190) = 90°.
    fireEvent.pointerDown(handle, { clientX: 250, clientY: 150 });
    fireEvent.pointerMove(handle, { clientX: 300, clientY: 190 });
    fireEvent.pointerUp(handle, { clientX: 300, clientY: 190 });

    const rotationLabel = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    expect(rotationLabel.style.transform).toBe('rotate(90deg)');
  });

  it('1 lần kéo (nhiều pointermove liên tiếp) = 1 undo (coalesce)', () => {
    const { container } = render(<LayoutDesignerApp content={oneShapeContent()} />);
    mockArtRect(container);
    const itemEl = selectItem(container);
    mockItemRect(itemEl);

    const handle = container.querySelector('[aria-label="Xoay"]') as HTMLElement;
    fireEvent.pointerDown(handle, { clientX: 250, clientY: 150 });
    fireEvent.pointerMove(handle, { clientX: 270, clientY: 155 });
    fireEvent.pointerMove(handle, { clientX: 290, clientY: 170 });
    fireEvent.pointerMove(handle, { clientX: 300, clientY: 190 });
    fireEvent.pointerUp(handle, { clientX: 300, clientY: 190 });

    let el = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    expect(el.style.transform).toBe('rotate(90deg)');

    const undoBtn = container.querySelector('[aria-label="Hoàn tác"]') as HTMLElement;
    fireEvent.click(undoBtn);

    el = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    expect(el.style.transform).toBeFalsy();
  });

  it('slider PropertyPanel và drag-handle cho cùng kết quả nhất quán (cùng đơn vị độ, cùng chiều)', () => {
    const { container } = render(<LayoutDesignerApp content={oneShapeContent()} />);
    mockArtRect(container);
    const itemEl = selectItem(container);
    mockItemRect(itemEl);

    // Xoay bằng slider trước — 90°.
    const rotationLabel = container.querySelector('[aria-label="Xoay"]')!.parentElement!;
    void rotationLabel;
    const sliderSection = [...container.querySelectorAll('div')].find((d) => d.textContent === 'Xoay')?.parentElement;
    const slider = sliderSection?.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '90' } });

    let el = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    expect(el.style.transform).toBe('rotate(90deg)');

    // Giờ kéo handle thêm — tâm KHÔNG đổi (mock rect vẫn cố định 200,150,100,80), kéo tiếp từ
    // hướng phải (90°, điểm 300,190) sang hướng dưới (180°, điểm 250,230).
    const handle = container.querySelector('[aria-label="Xoay"]') as HTMLElement;
    fireEvent.pointerDown(handle, { clientX: 300, clientY: 190 });
    fireEvent.pointerMove(handle, { clientX: 250, clientY: 230 });
    fireEvent.pointerUp(handle, { clientX: 250, clientY: 230 });

    el = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    expect(el.style.transform).toBe('rotate(180deg)');
  });

  it('item khoá (locked) → KHÔNG render handle xoay', () => {
    const content = oneShapeContent();
    content.variants[0].items[0].locked = true;
    const { container } = render(<LayoutDesignerApp content={content} />);
    mockArtRect(container);
    const el = container.querySelector('[style*="cursor: default"][style*="position: absolute"]') as HTMLElement;
    fireEvent.pointerDown(el);
    fireEvent.pointerUp(el);

    expect(container.querySelector('[aria-label="Xoay"]')).toBeNull();
  });
});
