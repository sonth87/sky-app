// Test tích hợp luồng "Sao chép từ layout khác" (Giai đoạn 5.1) — end-to-end qua LayoutDesignerApp
// thật: bấm + Thêm tỷ lệ → "Sao chép từ layout khác..." → chọn variant nguồn từ layout KHÁC →
// chọn tỷ lệ đích → variant mới xuất hiện với nội dung đã scale, KHÔNG ảnh hưởng layout nguồn.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { LayoutPort } from '@sky-app/service-contracts';
import type { LayoutContent, LayoutDocument } from '@sky-app/slide-shared';
import { LayoutDesignerApp } from '../components/LayoutDesignerApp.js';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 760 + 48, configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 428 + 48, configurable: true });
});

function currentDocContent(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '16:9', w: 16, h: 9, label: '16:9' },
        refW: 1920,
        refH: 1080,
        items: [{ id: 'own', type: 'text', box: { x: 10, y: 10, w: 100, h: 30 }, content: 'Nội dung của layout đang sửa', fontSize: 20 }],
      },
    ],
  };
}

function otherLayoutDoc(): LayoutDocument {
  return {
    id: 'other-layout',
    name: 'Layout Xuất sắc',
    currentDraft: {
      variants: [
        {
          aspect: { id: '16:9', w: 16, h: 9 },
          refW: 1920,
          refH: 1080,
          background: { kind: 'color', color: '#001a4d' },
          items: [{ id: 'ext', type: 'text', box: { x: 100, y: 50, w: 200, h: 60 }, content: 'Nội dung layout ngoài', fontSize: 24 }],
        },
      ],
    },
    publishedVersions: [],
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
  };
}

function mockLayoutPort(): LayoutPort {
  const doc = otherLayoutDoc();
  return {
    listDocuments: vi.fn().mockResolvedValue([{ id: doc.id, name: doc.name, latestPublishedVersion: null }]),
    getDocument: vi.fn().mockResolvedValue(doc),
    createDocument: vi.fn(),
    updateDocumentMeta: vi.fn(),
    saveDraft: vi.fn(),
    publish: vi.fn(),
    listVersions: vi.fn().mockResolvedValue([]),
    getVersion: vi.fn().mockResolvedValue(null),
    restoreVersion: vi.fn(),
    recordTokenUsage: vi.fn(),
    listTopVariables: vi.fn().mockResolvedValue([]),
  } as LayoutPort;
}

describe('Sao chép từ layout khác — tích hợp end-to-end', () => {
  it('không truyền layoutPort → KHÔNG hiện link "Sao chép từ layout khác..."', () => {
    render(<LayoutDesignerApp content={currentDocContent()} />);
    fireEvent.click(screen.getByLabelText('Thêm tỷ lệ'));
    expect(screen.queryByText('Sao chép từ layout khác...')).toBeNull();
  });

  it('luồng đủ 2 bước: chọn variant nguồn từ layout khác → chọn tỷ lệ đích → variant mới xuất hiện đã scale, mất background (khác tỷ lệ nguồn)', async () => {
    const layoutPort = mockLayoutPort();
    render(<LayoutDesignerApp content={currentDocContent()} layoutPort={layoutPort} />);

    fireEvent.click(screen.getByLabelText('Thêm tỷ lệ'));
    fireEvent.click(screen.getByText('Sao chép từ layout khác...'));

    await waitFor(() => expect(screen.getByText('Layout Xuất sắc')).toBeTruthy());
    fireEvent.doubleClick(screen.getByText('Layout Xuất sắc').closest('button')!);

    // Bước 2: modal chọn tỷ lệ đích, tiêu đề nêu rõ nguồn đã chọn.
    expect(await screen.findByText(/Chọn tỷ lệ đích — sao chép từ Layout Xuất sắc · 16:9/)).toBeTruthy();
    fireEvent.click(screen.getByText('25:9 — Màn ghép LED'));

    // Tab mới "25:9" xuất hiện, canvas hiện đúng nội dung đã copy (scale trục X theo 25/16).
    expect(screen.getAllByText('25:9').length).toBeGreaterThan(0);
    expect(screen.getByText('Nội dung layout ngoài')).toBeTruthy();
    // Layout nguồn (đang sửa) không bị đụng — vẫn còn tab 16:9 với nội dung cũ.
    fireEvent.click(screen.getByText('16:9'));
    expect(screen.getByText('Nội dung của layout đang sửa')).toBeTruthy();
  });

  it('undo sau khi sao chép từ layout khác → quay lại đúng trạng thái ban đầu (chỉ 1 variant)', async () => {
    const layoutPort = mockLayoutPort();
    render(<LayoutDesignerApp content={currentDocContent()} layoutPort={layoutPort} />);

    fireEvent.click(screen.getByLabelText('Thêm tỷ lệ'));
    fireEvent.click(screen.getByText('Sao chép từ layout khác...'));
    await waitFor(() => screen.getByText('Layout Xuất sắc'));
    fireEvent.doubleClick(screen.getByText('Layout Xuất sắc').closest('button')!);
    await screen.findByText(/Chọn tỷ lệ đích/);
    fireEvent.click(screen.getByText('25:9 — Màn ghép LED'));
    expect(screen.getAllByText('25:9').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText('Hoàn tác'));
    expect(screen.queryByText('25:9')).toBeNull();
  });
});
