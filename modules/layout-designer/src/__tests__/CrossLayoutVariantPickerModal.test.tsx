import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { LayoutPort } from '@sky-app/service-contracts';
import type { LayoutDocument } from '@sky-app/slide-shared';
import { CrossLayoutVariantPickerModal } from '../components/CrossLayoutVariantPickerModal.js';

function doc(id: string, name: string): LayoutDocument {
  return {
    id,
    name,
    currentDraft: {
      variants: [
        { aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items: [] },
        { aspect: { id: '25:9', w: 25, h: 9 }, refW: 2500, refH: 900, items: [] },
      ],
    },
    publishedVersions: [],
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
  };
}

function mockLayoutPort(overrides: Partial<LayoutPort> = {}): LayoutPort {
  const docs: Record<string, LayoutDocument> = {
    'layout-a': doc('layout-a', 'Layout A'),
    'layout-b': doc('layout-b', 'Layout B'),
  };
  return {
    listDocuments: vi.fn().mockImplementation(() =>
      Promise.resolve(Object.values(docs).map((d) => ({ id: d.id, name: d.name, latestPublishedVersion: null }))),
    ),
    getDocument: vi.fn().mockImplementation((id: string) => Promise.resolve(docs[id] ?? null)),
    createDocument: vi.fn(),
    updateDocumentMeta: vi.fn(),
    saveDraft: vi.fn(),
    publish: vi.fn(),
    listVersions: vi.fn().mockResolvedValue([]),
    getVersion: vi.fn().mockResolvedValue(null),
    restoreVersion: vi.fn(),
    recordTokenUsage: vi.fn(),
    listTopVariables: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as LayoutPort;
}

describe('CrossLayoutVariantPickerModal', () => {
  it('liệt kê MỖI variant của MỖI layout như 1 lựa chọn riêng (2 layout x 2 variant = 4 card)', async () => {
    render(<CrossLayoutVariantPickerModal layoutPort={mockLayoutPort()} onClose={() => {}} onPick={() => {}} />);
    await waitFor(() => expect(screen.getAllByText('16:9').length).toBe(2));
    expect(screen.getAllByText('25:9').length).toBe(2);
    expect(screen.getAllByText('Layout A').length).toBe(2);
    expect(screen.getAllByText('Layout B').length).toBe(2);
  });

  it('tìm theo tên layout → lọc đúng', async () => {
    render(<CrossLayoutVariantPickerModal layoutPort={mockLayoutPort()} onClose={() => {}} onPick={() => {}} />);
    await waitFor(() => screen.getAllByText('Layout A'));
    fireEvent.change(screen.getByPlaceholderText('Tìm theo tên layout hoặc tỷ lệ...'), { target: { value: 'layout b' } });

    expect(screen.queryByText('Layout A')).toBeNull();
    expect(screen.getAllByText('Layout B').length).toBe(2);
  });

  it('tìm theo tỷ lệ → lọc đúng (khớp cả 2 layout cùng có variant đó)', async () => {
    render(<CrossLayoutVariantPickerModal layoutPort={mockLayoutPort()} onClose={() => {}} onPick={() => {}} />);
    await waitFor(() => screen.getAllByText('Layout A'));
    fireEvent.change(screen.getByPlaceholderText('Tìm theo tên layout hoặc tỷ lệ...'), { target: { value: '25:9' } });

    expect(screen.getAllByText('25:9').length).toBe(2);
    expect(screen.queryByText('16:9')).toBeNull();
  });

  it('click 1 card CHỈ tích chọn, chưa gọi onPick — bấm nút xác nhận mới gọi', async () => {
    const onPick = vi.fn();
    render(<CrossLayoutVariantPickerModal layoutPort={mockLayoutPort()} onClose={() => {}} onPick={onPick} />);
    await waitFor(() => screen.getAllByText('Layout A'));

    fireEvent.click(screen.getAllByText('Layout A')[0]!.closest('button')!);
    expect(onPick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Tiếp tục — chọn tỷ lệ đích'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ aspect: { id: '16:9', w: 16, h: 9 } }), 'Layout A · 16:9');
  });

  it('double-click 1 card → gọi onPick ngay, không cần nút xác nhận', async () => {
    const onPick = vi.fn();
    render(<CrossLayoutVariantPickerModal layoutPort={mockLayoutPort()} onClose={() => {}} onPick={onPick} />);
    await waitFor(() => screen.getAllByText('Layout B'));

    fireEvent.doubleClick(screen.getAllByText('Layout B')[1]!.closest('button')!);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ aspect: { id: '25:9', w: 25, h: 9 } }), 'Layout B · 25:9');
  });

  it('không có layout/variant nào → hiện empty state', async () => {
    render(
      <CrossLayoutVariantPickerModal
        layoutPort={mockLayoutPort({ listDocuments: vi.fn().mockResolvedValue([]) })}
        onClose={() => {}}
        onPick={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText(/Chưa có variant nào/)).toBeTruthy());
  });

  it('bấm Huỷ → gọi onClose', async () => {
    const onClose = vi.fn();
    render(<CrossLayoutVariantPickerModal layoutPort={mockLayoutPort()} onClose={onClose} onPick={() => {}} />);
    await waitFor(() => screen.getAllByText('Layout A'));
    fireEvent.click(screen.getByText('Huỷ'));
    expect(onClose).toHaveBeenCalled();
  });
});
