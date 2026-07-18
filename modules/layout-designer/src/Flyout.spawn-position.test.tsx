import { beforeEach, describe, expect, it } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';

// refW/refH = DESIGN_W/DESIGN_H (760x428) để fitScale=1 khớp trực tiếp px màn hình với px
// canvas chuẩn — đúng setup như Canvas.test.tsx, tránh nhầm lẫn do nhiều lớp scale.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 760 + 48, configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 428 + 48, configurable: true });
});

function emptyContent(): LayoutContent {
  return {
    variants: [{ aspect: { id: '760:428', w: 760, h: 428 }, refW: 760, refH: 428, items: [] }],
  };
}

function mockArtRect(container: HTMLElement) {
  const artEl = container.querySelector('[data-testid="canvas-frame"]') as HTMLElement;
  artEl.getBoundingClientRect = () => ({ left: 0, top: 0, right: 760, bottom: 428, width: 760, height: 428, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
  return artEl;
}

describe('Spawn item từ palette — vị trí item PHẢI căn giữa đúng tại điểm thả chuột', () => {
  it('thả Shape (default 200x200) tại (380,214) → box căn giữa đúng tâm đó, không lệch', () => {
    const { container } = render(<LayoutDesignerApp content={emptyContent()} />);
    mockArtRect(container);

    const tile = screen.getByText('Shape').closest('div')!;
    fireEvent.mouseDown(tile, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(window, { clientX: 380, clientY: 214 });

    const itemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    expect(itemEl).toBeTruthy();

    const left = parseFloat(itemEl.style.left);
    const top = parseFloat(itemEl.style.top);
    const width = parseFloat(itemEl.style.width);
    const height = parseFloat(itemEl.style.height);

    // Tâm của item PHẢI trùng đúng điểm thả (380, 214) — sai số cho phép < 1px (làm tròn).
    expect(left + width / 2).toBeCloseTo(380, 0);
    expect(top + height / 2).toBeCloseTo(214, 0);
  });

  it('thả Text tại góc trên-trái canvas (0,0) → tâm item đúng tại điểm thả, CHO PHÉP toạ độ ÂM (kéo tự do ra ngoài Frame, đổi 2026-07-18)', () => {
    const { container } = render(<LayoutDesignerApp content={emptyContent()} />);
    mockArtRect(container);

    const tile = screen.getByText('Chữ').closest('div')!;
    fireEvent.mouseDown(tile, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(window, { clientX: 0, clientY: 0 });

    const itemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    expect(itemEl).toBeTruthy();
    const left = parseFloat(itemEl.style.left);
    const top = parseFloat(itemEl.style.top);
    // KHÔNG còn clamp về 0 (bỏ Math.max, xem Flyout.tsx's createSpawnedItem) — Canvas cho kéo tự
    // do ra ngoài Frame. Text default box = w:400,h:80 (item-type.ts's DEFAULT_TEXT_BOX), tâm ở
    // (0,0) → left=-200, top=-40 (toạ độ ÂM hợp lệ, không còn clamp về 0).
    expect(left).toBeCloseTo(-200, 0);
    expect(top).toBeCloseTo(-40, 0);
  });
});
