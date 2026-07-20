// Test Minimap — Bước 8 kế hoạch resize/rotate (2026-07-18).

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';
import { shouldShowMinimap } from './Minimap.js';

// Container NHỎ HƠN Frame (760x428) — buộc fitScale<1 nhưng viewport.zoom mặc định=1 khiến
// totalScale=fitScale<1, Frame vẫn nhỏ hơn container (fit vừa khít) → cần zoom THÊM để kích hoạt
// điều kiện minimap "vùng nhìn thấy không bao trọn Frame". Thay vào đó, set container NHỎ HƠN cả
// designW*fitScale tối thiểu — dùng cách đơn giản hơn: mock container nhỏ, rồi tự zoom lên qua UI.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 400, configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 300, configurable: true });
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

describe('shouldShowMinimap — hàm thuần', () => {
  it('Frame vừa khít trong container (originX/Y>=0, right/bottom<=container) → KHÔNG hiện', () => {
    // Frame 760x428 * scale 0.5 = 380x214, container 400x300, origin (10,43) → vừa khít.
    expect(shouldShowMinimap(760, 428, 10, 43, 0.5, { w: 400, h: 300 })).toBe(false);
  });

  it('Frame TRÀN bên phải/dưới container (zoom lớn) → hiện', () => {
    // Frame 760x428*1.5=1140x642 tại origin(0,0), container 400x300 → tràn cả 2 chiều.
    expect(shouldShowMinimap(760, 428, 0, 0, 1.5, { w: 400, h: 300 })).toBe(true);
  });

  it('originX/Y âm (pan lệch khỏi góc trên-trái container) → hiện dù không zoom', () => {
    expect(shouldShowMinimap(760, 428, -50, 0, 0.3, { w: 400, h: 300 })).toBe(true);
  });
});

describe('Minimap — hiện/ẩn theo trạng thái zoom/pan', () => {
  it('mặc định (fit vừa khít, chưa zoom/pan) → KHÔNG hiện minimap', () => {
    render(<LayoutDesignerApp content={oneShapeContent()} />);
    expect(screen.queryByTestId('minimap')).toBeNull();
  });

  it('zoom lên nhiều (Frame tràn khỏi khung nhìn) → hiện minimap', () => {
    const { container } = render(<LayoutDesignerApp content={oneShapeContent()} />);
    const zoomInBtn = screen.getByLabelText('Phóng to');
    for (let i = 0; i < 20; i++) fireEvent.click(zoomInBtn);
    void container;

    expect(screen.getByTestId('minimap')).toBeTruthy();
  });
});

describe('Minimap — click để pan', () => {
  it('click vào minimap → viewport pan tới vị trí tương ứng (item trên canvas dịch chuyển)', () => {
    const { container } = render(<LayoutDesignerApp content={oneShapeContent()} />);
    const zoomInBtn = screen.getByLabelText('Phóng to');
    for (let i = 0; i < 20; i++) fireEvent.click(zoomInBtn);

    const minimap = screen.getByTestId('minimap');
    minimap.getBoundingClientRect = () => ({ left: 0, top: 0, right: 160, bottom: 90, width: 160, height: 90, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    // Pan chỉ đổi vị trí CỦA artEl (Frame, "left" = originX) — KHÔNG đổi CSS left của item con
    // bên trong (item.style.left chỉ phụ thuộc layoutScaleX cố định, artEl cha tự dịch bằng
    // position:absolute + transform:scale() bao trọn toàn bộ nội dung con, xem Canvas.tsx).
    const frameEl = container.querySelector('[data-testid="canvas-frame"]') as HTMLElement;
    const frameLeftBefore = parseFloat(frameEl.style.left);

    // Click góc TRÊN-TRÁI minimap (x=5,y=5, gần góc 0,0 của Frame) — chắc chắn khác vị trí đang
    // xem sau khi zoom quanh con trỏ ở toạ độ ngẫu nhiên (Canvas.zoom mặc định neo giữa viewport).
    fireEvent.pointerDown(minimap, { clientX: 5, clientY: 5 });
    fireEvent.pointerUp(minimap, { clientX: 5, clientY: 5 });

    const frameLeftAfter = parseFloat(frameEl.style.left);
    expect(frameLeftAfter).not.toBeCloseTo(frameLeftBefore, 1);
  });
});
