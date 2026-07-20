// Test Treeview cho Layers panel — Bước 6 kế hoạch resize/rotate (2026-07-18). Đệ quy vào
// LoopItem.itemTemplate, click node lồng KHÔNG setSelection (đợi Bước 9 cầu nối dữ liệu).

import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';

function contentWithLoop(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '16:9', w: 16, h: 9 },
        refW: 1920,
        refH: 1080,
        items: [
          { id: 'title', type: 'text', box: { x: 50, y: 50, w: 300, h: 60 }, content: 'Danh sách', fontSize: 24 },
          {
            id: 'group1',
            type: 'loop',
            box: { x: 50, y: 150, w: 800, h: 400 },
            itemTemplate: [
              { id: 'child-name', type: 'text', box: { x: 0, y: 0, w: 100, h: 30 }, content: '@ten', fontSize: 14 },
              { id: 'child-photo', type: 'image', box: { x: 0, y: 30, w: 100, h: 100 } },
            ],
            itemBox: { w: 180, h: 220 },
          },
        ],
      },
    ],
  };
}

function switchToLayersPanel() {
  fireEvent.click(screen.getByText('Lớp'));
}

/** Vùng list layer — "Lớp" (tiêu đề panel) là landmark ổn định, panel body là phần tử anh em
 * NGAY SAU tiêu đề. Scope mọi query text vào đây để tránh khớp nhầm Canvas (item content trùng
 * chữ) hoặc Rail (label nhóm "Ảnh" trùng tên loại item ImageItem). */
function getLayersListEl(): HTMLElement {
  // "Lớp" khớp CẢ tab Rail lẫn tiêu đề panel Flyout — tiêu đề panel luôn là phần tử CUỐI (Flyout
  // render sau Rail trong DOM order).
  const headings = screen.getAllByText('Lớp');
  const heading = headings[headings.length - 1]!;
  return heading.nextElementSibling as HTMLElement;
}

describe('LayersPanel — treeview (LoopItem.itemTemplate)', () => {
  it('LoopItem có itemTemplate không rỗng → hiện nút mở rộng, mặc định THU GỌN (không hiện con)', () => {
    render(<LayoutDesignerApp content={contentWithLoop()} />);
    switchToLayersPanel();

    expect(screen.getByText('Khung lặp')).toBeTruthy();
    expect(screen.getByLabelText('Mở rộng Khung lặp')).toBeTruthy();
    expect(screen.queryByText('@ten')).toBeNull();
  });

  it('bấm nút mở rộng → hiện đúng 2 item con (text + image) của itemTemplate', () => {
    render(<LayoutDesignerApp content={contentWithLoop()} />);
    switchToLayersPanel();

    fireEvent.click(screen.getByLabelText('Mở rộng Khung lặp'));

    const list = within(getLayersListEl());
    expect(list.getByText('@ten')).toBeTruthy();
    expect(list.getByText('Ảnh')).toBeTruthy();
    expect(screen.getByLabelText('Thu gọn Khung lặp')).toBeTruthy();
  });

  it('bấm lại nút thu gọn → ẩn item con', () => {
    render(<LayoutDesignerApp content={contentWithLoop()} />);
    switchToLayersPanel();

    fireEvent.click(screen.getByLabelText('Mở rộng Khung lặp'));
    expect(within(getLayersListEl()).getByText('@ten')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Thu gọn Khung lặp'));
    expect(within(getLayersListEl()).queryByText('@ten')).toBeNull();
  });

  it('click node TOP-LEVEL (Khung lặp) → setSelection bình thường, PropertyPanel hiện đúng', () => {
    render(<LayoutDesignerApp content={contentWithLoop()} />);
    switchToLayersPanel();

    fireEvent.click(within(getLayersListEl()).getByText('Khung lặp'));

    // "Khung lặp" giờ hiện Ở CẢ 2 nơi: Layers panel (label item) VÀ PropertyPanel's PanelHeader
    // (typeName['loop']) — xác nhận selection đã đổi qua việc PropertyPanel xuất hiện thêm.
    expect(screen.getAllByText('Khung lặp').length).toBeGreaterThanOrEqual(2);
  });

  it('click node LỒNG (con của LoopItem) → KHÔNG lỗi, KHÔNG đổi selection (id không tồn tại trong variant.items)', () => {
    render(<LayoutDesignerApp content={contentWithLoop()} />);
    switchToLayersPanel();
    fireEvent.click(screen.getByLabelText('Mở rộng Khung lặp'));

    const list = within(getLayersListEl());
    // Chọn title trước để có 1 selection XÁC ĐỊNH, rồi click vào node lồng — selection phải
    // KHÔNG đổi (không setSelection với id 'child-name' không tồn tại trong variant.items).
    fireEvent.click(list.getByText('Danh sách'));
    expect(() => fireEvent.click(list.getByText('@ten'))).not.toThrow();

    // PropertyPanel vẫn hiện đúng item ĐANG chọn trước đó (title, "Văn bản"), không đổi/không vỡ.
    expect(screen.getByText('Văn bản')).toBeTruthy();
  });

  it('node lồng hiện tooltip hướng dẫn double-click canvas', () => {
    render(<LayoutDesignerApp content={contentWithLoop()} />);
    switchToLayersPanel();
    fireEvent.click(screen.getByLabelText('Mở rộng Khung lặp'));

    const childRow = within(getLayersListEl()).getByText('@ten').closest('[title]');
    expect(childRow?.getAttribute('title')).toBe('Nhấp đúp vào khung lặp trên canvas để sửa mẫu');
  });

  it('item KHÔNG phải LoopItem (VD TextItem) → KHÔNG hiện nút mở rộng', () => {
    render(<LayoutDesignerApp content={contentWithLoop()} />);
    switchToLayersPanel();

    expect(screen.queryByLabelText('Mở rộng Danh sách')).toBeNull();
  });
});
