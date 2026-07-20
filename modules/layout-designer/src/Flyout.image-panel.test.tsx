// Test Media Library (panel "Ảnh") — Bước 11 kế hoạch resize/rotate (2026-07-18).

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';
import type { AssetMeta } from '@sky-app/service-contracts';

function twoItemsContent(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '16:9', w: 16, h: 9 },
        refW: 1920,
        refH: 1080,
        items: [
          { id: 'img1', type: 'image', box: { x: 50, y: 50, w: 100, h: 100 } },
          { id: 'shape1', type: 'shape', box: { x: 200, y: 50, w: 80, h: 80 }, shape: 'rect', fill: '#000' },
        ],
      },
    ],
  };
}

function sampleAssets(): AssetMeta[] {
  return [
    { relativePath: 'a.png', name: 'a.png', sizeBytes: 100, uploadedAt: '2026-07-18T10:00:00.000Z' },
    { relativePath: 'b.png', name: 'b.png', sizeBytes: 200, uploadedAt: '2026-07-18T09:00:00.000Z' },
  ];
}

function switchToImagePanel() {
  // "Ảnh" khớp CẢ tab Rail lẫn tiêu đề panel (nếu đã mở lần trước) — tab Rail luôn xuất hiện
  // TRƯỚC panel trong DOM order (Rail render trước Flyout), chọn phần tử ĐẦU chắc chắn là tab.
  fireEvent.click(screen.getAllByText('Ảnh')[0]!);
}

describe('ImagePanel — không có listAssets (hành vi cũ)', () => {
  it('hiện thông báo tĩnh chưa khả dụng khi không truyền listAssets', () => {
    render(<LayoutDesignerApp content={twoItemsContent()} />);
    switchToImagePanel();

    expect(screen.getByText(/Tải ảnh — nối tầng lưu trữ thật/)).toBeTruthy();
  });
});

describe('ImagePanel — có listAssets (Media Library)', () => {
  it('gọi listAssets lúc mount, hiện đúng số lượng thumbnail', async () => {
    const listAssets = vi.fn().mockResolvedValue(sampleAssets());
    render(<LayoutDesignerApp content={twoItemsContent()} listAssets={listAssets} />);
    switchToImagePanel();

    await waitFor(() => expect(listAssets).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const buttons = screen.getAllByTitle(/\.png$/);
      expect(buttons).toHaveLength(2);
    });
  });

  it('danh sách rỗng → hiện thông báo "Chưa có ảnh nào"', async () => {
    const listAssets = vi.fn().mockResolvedValue([]);
    render(<LayoutDesignerApp content={twoItemsContent()} listAssets={listAssets} />);
    switchToImagePanel();

    await waitFor(() => expect(screen.getByText(/Chưa có ảnh nào/)).toBeTruthy());
  });

  it('listAssets lỗi → hiện thông báo lỗi, không crash', async () => {
    const listAssets = vi.fn().mockRejectedValue(new Error('network'));
    render(<LayoutDesignerApp content={twoItemsContent()} listAssets={listAssets} />);
    switchToImagePanel();

    await waitFor(() => expect(screen.getByText(/Không tải được danh sách ảnh/)).toBeTruthy());
  });

  it('chọn ImageItem rồi click ảnh trong Media Library → gán src vào item đang chọn', async () => {
    const listAssets = vi.fn().mockResolvedValue(sampleAssets());
    const { container } = render(<LayoutDesignerApp content={twoItemsContent()} listAssets={listAssets} />);

    // Chọn img1 (item đầu — có type image).
    const items = container.querySelectorAll('[style*="cursor: move"]');
    fireEvent.pointerDown(items[0] as HTMLElement);
    fireEvent.pointerUp(items[0] as HTMLElement);

    switchToImagePanel();
    await waitFor(() => expect(screen.getAllByTitle(/\.png$/)).toHaveLength(2));

    fireEvent.click(screen.getByTitle('a.png'));

    // PropertyPanel vẫn hiện item image đang chọn — xác nhận KHÔNG spawn item mới (vẫn 2 item).
    await waitFor(() => {
      const itemsAfter = container.querySelectorAll('[style*="cursor: move"], [style*="cursor: default"][style*="position: absolute"]');
      expect(itemsAfter.length).toBe(2);
    });
  });

  it('KHÔNG chọn item nào (hoặc chọn item không phải ảnh) → click ảnh trong Media Library spawn ImageItem MỚI', async () => {
    const listAssets = vi.fn().mockResolvedValue(sampleAssets());
    const { container } = render(<LayoutDesignerApp content={twoItemsContent()} listAssets={listAssets} />);

    // Chọn shape1 (item KHÔNG phải ảnh).
    const items = container.querySelectorAll('[style*="cursor: move"]');
    fireEvent.pointerDown(items[1] as HTMLElement);
    fireEvent.pointerUp(items[1] as HTMLElement);

    switchToImagePanel();
    await waitFor(() => expect(screen.getAllByTitle(/\.png$/)).toHaveLength(2));

    const before = container.querySelectorAll('[style*="cursor: move"]').length;
    fireEvent.click(screen.getByTitle('b.png'));

    await waitFor(() => {
      const after = container.querySelectorAll('[style*="cursor: move"]').length;
      expect(after).toBe(before + 1);
    });
  });
});
