// Test z-index/locked/name (BaseItem field chung) — Bước 2 kế hoạch resize/rotate (2026-07-18).

import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';

function twoShapesContent(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '16:9', w: 16, h: 9 },
        refW: 1920,
        refH: 1080,
        items: [
          { id: 's1', type: 'shape', box: { x: 100, y: 100, w: 200, h: 200 }, shape: 'rect', fill: '#4b57e6' },
          { id: 's2', type: 'shape', box: { x: 150, y: 150, w: 200, h: 200 }, shape: 'rect', fill: '#e63d3d' },
        ],
      },
    ],
  };
}

// Selector item trên Canvas: phải có CẢ position:absolute LẪN cursor move/default — Canvas's
// containerRef (Frame/viewport) CŨNG có "cursor: default" (khi không đang pan/hand-tool), nên
// chỉ lọc theo cursor không đủ, dễ khớp nhầm sang chính container thay vì item.
function queryLockableItem(container: HTMLElement): HTMLElement {
  const candidates = container.querySelectorAll('[style*="position: absolute"]');
  const found = [...candidates].find((el) => {
    const cursor = (el as HTMLElement).style.cursor;
    return cursor === 'move' || cursor === 'default';
  });
  return found as HTMLElement;
}

describe('PropertyPanel — locked (khoá di chuyển, KHÁC syncLocked)', () => {
  it('item khoá → onPointerMove KHÔNG kéo được, nhưng vẫn chọn được và mở khoá lại được', () => {
    const { container } = render(<LayoutDesignerApp content={twoShapesContent()} />);
    // pointerDown (chưa khoá) khởi tạo dragRef nội bộ của CanvasItemView — PHẢI pointerUp ngay
    // để giải phóng dragRef trước khi khoá, nếu không dragRef cũ (set lúc chưa khoá) vẫn còn khi
    // pointerMove chạy sau đó, khiến item bị kéo dù item.locked đã true (bug giả — do test thiếu
    // pointerUp, không phải bug Canvas.tsx: onPointerDown early-return đúng theo item.locked).
    const selectTarget = queryLockableItem(container);
    fireEvent.pointerDown(selectTarget);
    fireEvent.pointerUp(selectTarget);

    // Bấm nút Pin trong PanelHeader để khoá.
    fireEvent.click(screen.getByLabelText('Khoá di chuyển'));
    expect(screen.getByLabelText('Mở khoá di chuyển')).toBeTruthy();

    // Item khoá → cursor đổi thành 'default' thay vì 'move' — query LẠI (không giữ ref cũ, item
    // đã re-render với style mới).
    const beforeLeft = queryLockableItem(container).style.left;

    // Kéo thử — box KHÔNG đổi (so trước/sau). onPointerDown vẫn setSelection (không đổi selection
    // vì cùng item), nhưng KHÔNG khởi tạo dragRef vì item.locked — onPointerMove no-op.
    const dragTarget = queryLockableItem(container);
    fireEvent.pointerDown(dragTarget, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(dragTarget, { clientX: 300, clientY: 300 });
    fireEvent.pointerUp(dragTarget);
    expect(queryLockableItem(container).style.left).toBe(beforeLeft);

    // Mở khoá lại được qua PropertyPanel — xác nhận không deadlock.
    fireEvent.click(screen.getByLabelText('Mở khoá di chuyển'));
    expect(screen.getByLabelText('Khoá di chuyển')).toBeTruthy();
  });
});

describe('PropertyPanel — name (đặt tên tuỳ chỉnh, hiện trong Layers)', () => {
  it('gõ tên → Layers panel hiện đúng tên tuỳ chỉnh thay vì nhãn tự sinh', () => {
    const { container } = render(<LayoutDesignerApp content={twoShapesContent()} />);
    // Rail mặc định active group 'comp' (Thành phần) — chuyển sang "Lớp" để LayersPanel render.
    fireEvent.click(screen.getByText('Lớp'));
    // Mặc định 2 item đều hiện nhãn "Shape" trong Layers panel (nhãn tự sinh, chưa đặt tên).
    expect(screen.getAllByText('Shape').length).toBe(2);

    fireEvent.pointerDown(queryLockableItem(container));

    const nameInput = screen.getByPlaceholderText('Đặt tên (tuỳ chọn)…');
    fireEvent.change(nameInput, { target: { value: 'Logo trường' } });

    expect(screen.getByText('Logo trường')).toBeTruthy();
    // Item còn lại vẫn giữ nhãn tự sinh — chỉ 1 item đổi tên.
    expect(screen.getAllByText('Shape').length).toBe(1);
  });
});

describe('PropertyPanel — z-index (Box.z, lên/xuống lớp)', () => {
  it('bấm "Lên 1 lớp" → box.z tăng, item hiển thị với zIndex mới', () => {
    const { container } = render(<LayoutDesignerApp content={twoShapesContent()} />);
    const items = container.querySelectorAll('[style*="cursor: move"]');
    fireEvent.pointerDown(items[0] as HTMLElement);

    fireEvent.click(screen.getByLabelText('Lên 1 lớp'));

    const itemEl = container.querySelectorAll('[style*="cursor: move"]')[0] as HTMLElement;
    expect(itemEl.style.zIndex).toBe('1');
  });

  it('bấm "Xuống 1 lớp" → box.z giảm (có thể âm)', () => {
    const { container } = render(<LayoutDesignerApp content={twoShapesContent()} />);
    const items = container.querySelectorAll('[style*="cursor: move"]');
    fireEvent.pointerDown(items[0] as HTMLElement);

    fireEvent.click(screen.getByLabelText('Xuống 1 lớp'));

    const itemEl = container.querySelectorAll('[style*="cursor: move"]')[0] as HTMLElement;
    expect(itemEl.style.zIndex).toBe('-1');
  });
});
