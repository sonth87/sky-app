// Test chế độ "sửa mẫu" LoopItem qua double-click — Bước 10 kế hoạch resize/rotate (2026-07-18).

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 760 + 48, configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 428 + 48, configurable: true });
});

function contentWithLoop(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '760:428', w: 760, h: 428 },
        refW: 760,
        refH: 428,
        items: [
          { id: 'title', type: 'text', box: { x: 50, y: 50, w: 300, h: 60 }, content: 'Danh sách', fontSize: 24 },
          {
            id: 'group1',
            type: 'loop',
            box: { x: 50, y: 150, w: 400, h: 200 },
            itemTemplate: [{ id: 'child1', type: 'text', box: { x: 10, y: 10, w: 100, h: 30 }, content: '@ten', fontSize: 14 }],
            itemBox: { w: 180, h: 220 },
          },
        ],
      },
    ],
  };
}

/** LoopItem tại box.x=50,y=150,w=400,h=200 trên artEl 760x428 (0,0) — mock rect item để
 * double-click/onEnterLoopEdit hoạt động độc lập với artEl thật. */
function findLoopItemEl(container: HTMLElement): HTMLElement {
  const el = [...container.querySelectorAll('[style*="cursor: move"]')].find((e) => e.textContent === 'Khung lặp (nhóm)');
  return el as HTMLElement;
}

function mockArtRect(container: HTMLElement) {
  const artEl = container.querySelector('[data-testid="canvas-frame"]') as HTMLElement;
  artEl.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 760, bottom: 428, width: 760, height: 428, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
  return artEl;
}

describe('Canvas — vào/thoát chế độ sửa mẫu LoopItem', () => {
  it('double-click vào LoopItem → hiện breadcrumb "Đang sửa mẫu"', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithLoop()} />);
    mockArtRect(container);
    const loopEl = findLoopItemEl(container);

    fireEvent.doubleClick(loopEl);

    expect(screen.getByTestId('loop-edit-breadcrumb')).toBeTruthy();
    expect(screen.getByText(/Đang sửa mẫu của/)).toBeTruthy();
  });

  it('vào edit-mode → render item BÊN TRONG itemTemplate (child1), KHÔNG còn render title (top-level)', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithLoop()} />);
    mockArtRect(container);
    const loopEl = findLoopItemEl(container);

    fireEvent.doubleClick(loopEl);

    expect(screen.getByText('@ten')).toBeTruthy();
    expect(screen.queryByText('Danh sách')).toBeNull();
  });

  it('bấm nút "Xong" → thoát edit-mode, quay lại render variant.items bình thường', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithLoop()} />);
    mockArtRect(container);
    const loopEl = findLoopItemEl(container);
    fireEvent.doubleClick(loopEl);
    expect(screen.getByText('@ten')).toBeTruthy();

    fireEvent.click(screen.getByText('Xong'));

    expect(screen.queryByTestId('loop-edit-breadcrumb')).toBeNull();
    expect(screen.getByText('Danh sách')).toBeTruthy();
    expect(screen.queryByText('@ten')).toBeNull();
  });

  it('nhấn Esc → thoát edit-mode', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithLoop()} />);
    mockArtRect(container);
    const loopEl = findLoopItemEl(container);
    fireEvent.doubleClick(loopEl);
    expect(screen.getByTestId('loop-edit-breadcrumb')).toBeTruthy();

    const canvasContainer = container.querySelector('[tabindex="0"]') as HTMLElement;
    fireEvent.keyDown(canvasContainer, { key: 'Escape' });

    expect(screen.queryByTestId('loop-edit-breadcrumb')).toBeNull();
  });

  it('double-click vào item KHÁC loop (text/shape) → KHÔNG vào edit-mode', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithLoop()} />);
    mockArtRect(container);
    const titleEl = [...container.querySelectorAll('[style*="cursor: move"]')].find((e) => e.textContent === 'Danh sách') as HTMLElement;

    fireEvent.doubleClick(titleEl);

    expect(screen.queryByTestId('loop-edit-breadcrumb')).toBeNull();
  });
});

describe('Canvas — thao tác item trong itemTemplate khi đang edit-mode', () => {
  it('chọn item con → PropertyPanel hiện đúng thuộc tính', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithLoop()} />);
    mockArtRect(container);
    fireEvent.doubleClick(findLoopItemEl(container));

    const childEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    fireEvent.pointerDown(childEl);
    fireEvent.pointerUp(childEl);

    expect(screen.getByText('Văn bản')).toBeTruthy();
  });

  it('sửa content item con qua PropertyPanel → cập nhật đúng vào itemTemplate (không đụng variant.items)', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithLoop()} />);
    mockArtRect(container);
    fireEvent.doubleClick(findLoopItemEl(container));

    const childEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    fireEvent.pointerDown(childEl);
    fireEvent.pointerUp(childEl);

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '@ho_ten_day_du' } });

    // screen.getByText khớp NHẦM cả <textarea> (cùng value) — scope vào canvas item cụ thể (item
    // đã chọn, cursor: move), giống cạm bẫy đã ghi nhận ở Bước 5 (PropertyPanel.fields.test.tsx).
    const canvasItemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    expect(canvasItemEl.textContent).toBe('@ho_ten_day_du');
  });

  it('undo sau khi sửa item con → khôi phục đúng nội dung cũ', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithLoop()} />);
    mockArtRect(container);
    fireEvent.doubleClick(findLoopItemEl(container));

    const childEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    fireEvent.pointerDown(childEl);
    fireEvent.pointerUp(childEl);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '@moi' } });
    expect((container.querySelector('[style*="cursor: move"]') as HTMLElement).textContent).toBe('@moi');

    fireEvent.click(screen.getByLabelText('Hoàn tác'));

    expect((container.querySelector('[style*="cursor: move"]') as HTMLElement).textContent).toBe('@ten');
  });

  it('xoá item con qua PropertyPanel → item biến mất khỏi itemTemplate', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithLoop()} />);
    mockArtRect(container);
    fireEvent.doubleClick(findLoopItemEl(container));

    const childEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    fireEvent.pointerDown(childEl);
    fireEvent.pointerUp(childEl);

    fireEvent.click(screen.getByText('🗑'));

    expect(screen.queryByText('@ten')).toBeNull();
  });
});

describe('Canvas — treeview Layers panel liên kết với edit-mode', () => {
  it('node lồng trong Layers panel KHÔNG có cách chọn trực tiếp (đợi vào edit-mode qua double-click) — vẫn đúng theo Bước 6', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithLoop()} />);
    fireEvent.click(screen.getAllByText('Lớp')[screen.getAllByText('Lớp').length - 1]!);

    const heading = screen.getAllByText('Lớp');
    const listEl = heading[heading.length - 1]!.nextElementSibling as HTMLElement;
    fireEvent.click(within(listEl).getByLabelText('Mở rộng Khung lặp'));

    expect(within(listEl).getByText('@ten')).toBeTruthy();
    void container;
  });
});

describe('Canvas — chặn nested loop (chỉ hỗ trợ edit-mode 1 cấp)', () => {
  it('LoopItem lồng trong LoopItem khác — double-click khi ĐANG edit-mode không có tác dụng gì (onEnterLoopEdit=undefined)', () => {
    const content: LayoutContent = {
      variants: [
        {
          aspect: { id: '760:428', w: 760, h: 428 },
          refW: 760,
          refH: 428,
          items: [
            {
              id: 'outer',
              type: 'loop',
              box: { x: 50, y: 50, w: 400, h: 300 },
              itemTemplate: [
                {
                  id: 'inner',
                  type: 'loop',
                  box: { x: 10, y: 10, w: 100, h: 100 },
                  itemTemplate: [{ id: 'deepChild', type: 'text', box: { x: 0, y: 0, w: 50, h: 20 }, content: 'Sâu', fontSize: 12 }],
                  itemBox: { w: 50, h: 50 },
                },
              ],
              itemBox: { w: 180, h: 220 },
            },
          ],
        },
      ],
    };
    const { container } = render(<LayoutDesignerApp content={content} />);
    mockArtRect(container);

    fireEvent.doubleClick(findLoopItemEl(container));
    expect(screen.getByTestId('loop-edit-breadcrumb')).toBeTruthy();

    // Đang edit-mode (outer) — item bên trong LÀ 'inner' (cũng type loop), double-click vào nó
    // KHÔNG được vào edit-mode LỒNG THÊM 1 lớp nữa (onEnterLoopEdit=undefined khi isEditingLoop).
    const innerEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    fireEvent.doubleClick(innerEl);

    // Vẫn breadcrumb của outer, KHÔNG đổi sang inner — xác nhận chặn nested.
    expect(screen.getByText(/Đang sửa mẫu của Khung lặp/)).toBeTruthy();
  });
});
