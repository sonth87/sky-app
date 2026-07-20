import { beforeEach, describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';

// Canvas.tsx tính fitScale từ containerRef.clientWidth/clientHeight NGAY LÚC MOUNT (useEffect
// chạy fit() 1 lần trước khi ResizeObserver.observe() — jsdom's ResizeObserverStub không tự
// trigger lại). Mock prototype TRƯỚC khi render để giá trị đã đúng ngay từ lần đo đầu tiên.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 760 + 48, configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 428 + 48, configurable: true });
});

// refW/refH = DESIGN_W/DESIGN_H (760x428) để fitScale=1 khớp trực tiếp px màn hình với px
// canvas chuẩn — tránh phải suy luận qua nhiều lớp scale trong test.
function twoItemsContent(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '760:428', w: 760, h: 428 },
        refW: 760,
        refH: 428,
        background: { kind: 'color', color: '#201748' },
        items: [
          { id: 'anchor', type: 'shape', box: { x: 200, y: 200, w: 100, h: 100 }, shape: 'rect', fill: '#fff' },
          { id: 'moving', type: 'shape', box: { x: 500, y: 200, w: 50, h: 50 }, shape: 'rect', fill: '#000' },
        ],
      },
    ],
  };
}

/** Mock rect để artEl chiếm đúng 760x428 tại (0,0) trên "màn hình" — khớp fitScale=1 đã đảm
 * bảo bởi beforeEach ở trên (mock clientWidth/Height trước khi mount). */
function mockArtRect(container: HTMLElement) {
  const artEl = container.querySelector('[data-testid="canvas-frame"]') as HTMLElement;
  artEl.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 760, bottom: 428, width: 760, height: 428, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
  return artEl;
}

describe('Canvas — snap khi kéo item', () => {
  it('kéo item MOVING lại gần cạnh phải của ANCHOR (trong threshold 8px) → hít đúng vào cạnh, vẽ guide', () => {
    const { container } = render(<LayoutDesignerApp content={twoItemsContent()} />);
    mockArtRect(container);

    const items = container.querySelectorAll('[style*="cursor: move"]');
    const movingEl = items[1] as HTMLElement;

    // anchor.right = 200+100 = 300. moving đang x=500,w=50 → left=500. Kéo left về gần 300+3=303
    // (trong threshold 8) để test snap về đúng 300.
    fireEvent.pointerDown(movingEl, { clientX: 500, clientY: 200 });
    fireEvent.pointerMove(movingEl, { clientX: 303, clientY: 200 });

    // Guide dọc (axis x) phải xuất hiện tại đúng vị trí anchor.right = 300 — data-testid riêng
    // (GuideLine, Canvas.tsx) để KHÔNG match nhầm Divider trong FloatingToolbar hay đường nối
    // của handle xoay (Bước 4, cũng "width: 1px" nhưng khác mục đích hoàn toàn).
    const verticalGuide = container.querySelector('[data-testid="snap-guide"]') as HTMLElement | null;
    expect(verticalGuide).toBeTruthy();
    expect(verticalGuide!.style.left).toBe('300px');

    // Item moving đã snap: left mới phải = 300 (không phải 303 thô).
    const movingLeft = parseFloat(movingEl.style.left);
    expect(movingLeft).toBeCloseTo(300, 1);

    fireEvent.pointerUp(movingEl, { clientX: 303, clientY: 200 });

    // Sau khi thả chuột, guide phải biến mất.
    expect(container.querySelector('[data-testid="snap-guide"]')).toBeNull();
  });

  it('kéo ra xa (ngoài threshold) → không snap, không vẽ guide', () => {
    const { container } = render(<LayoutDesignerApp content={twoItemsContent()} />);
    mockArtRect(container);
    const items = container.querySelectorAll('[style*="cursor: move"]');
    const movingEl = items[1] as HTMLElement;

    fireEvent.pointerDown(movingEl, { clientX: 500, clientY: 200 });
    fireEvent.pointerMove(movingEl, { clientX: 450, clientY: 350 });

    expect(container.querySelector('[data-testid="snap-guide"]')).toBeNull();
  });

  it('không throw khi kéo item không có item khác nào để snap (canvas 1 item)', () => {
    const singleItem: LayoutContent = {
      variants: [
        {
          aspect: { id: '760:428', w: 760, h: 428 },
          refW: 760,
          refH: 428,
          items: [{ id: 'a', type: 'shape', box: { x: 10, y: 10, w: 50, h: 50 }, shape: 'rect', fill: '#fff' }],
        },
      ],
    };
    const { container } = render(<LayoutDesignerApp content={singleItem} />);
    mockArtRect(container);
    const el = container.querySelector('[style*="cursor: move"]') as HTMLElement;

    expect(() => {
      fireEvent.pointerDown(el, { clientX: 50, clientY: 50 });
      fireEvent.pointerMove(el, { clientX: 60, clientY: 60 });
      fireEvent.pointerUp(el, { clientX: 60, clientY: 60 });
    }).not.toThrow();
  });
});
