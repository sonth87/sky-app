import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { LayoutPort } from '@sky-app/service-contracts';
import type { LayoutContent, LayoutDocument } from '@sky-app/slide-shared';
import { LayoutLibraryScreen } from '../components/LayoutLibraryScreen.js';

const CONTENT_A: LayoutContent = {
  variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items: [] }],
};
const CONTENT_B: LayoutContent = {
  variants: [{ aspect: { id: '21:9', w: 21, h: 9 }, refW: 2520, refH: 1080, items: [] }],
};

function doc(id: string, name: string, content: LayoutContent, overrides: Partial<LayoutDocument> = {}): LayoutDocument {
  return {
    id,
    name,
    currentDraft: content,
    publishedVersions: [],
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

function mockLayoutPort(overrides: Partial<LayoutPort> = {}): LayoutPort {
  const docs: Record<string, LayoutDocument> = {
    'layout-a': doc('layout-a', 'Layout A', CONTENT_A),
    'layout-b': doc('layout-b', 'Layout B', CONTENT_B),
  };
  return {
    listDocuments: vi.fn().mockImplementation(() =>
      Promise.resolve(
        Object.values(docs).map((d) => ({
          id: d.id,
          name: d.name,
          description: d.description,
          color: d.color,
          category: d.category,
          tags: d.tags,
          latestPublishedVersion: null,
        })),
      ),
    ),
    getDocument: vi.fn().mockImplementation((id: string) => Promise.resolve(docs[id] ?? null)),
    createDocument: vi.fn().mockResolvedValue(undefined),
    updateDocumentMeta: vi.fn().mockResolvedValue(undefined),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue({ version: 1, content: CONTENT_A, publishedAt: '2026-07-30T00:00:00.000Z' }),
    listVersions: vi.fn().mockResolvedValue([]),
    getVersion: vi.fn().mockResolvedValue(null),
    restoreVersion: vi.fn().mockResolvedValue(undefined),
    recordTokenUsage: vi.fn().mockResolvedValue(undefined),
    listTopVariables: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as LayoutPort;
}

describe('LayoutLibraryScreen', () => {
  it('hiện danh sách layout từ listDocuments + getDocument (theo draft)', async () => {
    render(<LayoutLibraryScreen layoutPort={mockLayoutPort()} onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText('Layout A')).toBeTruthy());
    expect(screen.getByText('Layout B')).toBeTruthy();
    expect(screen.getByText('16:9')).toBeTruthy();
    expect(screen.getByText('21:9')).toBeTruthy();
  });

  it('không có layout nào → hiện empty state', async () => {
    render(<LayoutLibraryScreen layoutPort={mockLayoutPort({ listDocuments: vi.fn().mockResolvedValue([]) })} onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Chưa có layout nào/)).toBeTruthy());
  });

  it('gõ tìm kiếm khớp 1 phần tên (không phân biệt hoa/thường) → lọc đúng', async () => {
    render(<LayoutLibraryScreen layoutPort={mockLayoutPort()} onOpen={() => {}} />);
    await waitFor(() => screen.getByText('Layout A'));
    fireEvent.change(screen.getByPlaceholderText('Tìm theo tên, phân loại, thẻ...'), { target: { value: 'layout b' } });

    expect(screen.queryByText('Layout A')).toBeNull();
    expect(screen.getByText('Layout B')).toBeTruthy();
  });

  it('gõ tìm kiếm khớp category hoặc tag → lọc đúng dù không khớp tên', async () => {
    const layoutPort = mockLayoutPort({
      getDocument: vi.fn().mockImplementation((id: string) =>
        Promise.resolve(
          id === 'layout-a'
            ? { ...doc('layout-a', 'Layout A', CONTENT_A), category: 'Trao bằng', tags: ['2026'] }
            : doc('layout-b', 'Layout B', CONTENT_B),
        ),
      ),
      listDocuments: vi.fn().mockResolvedValue([
        { id: 'layout-a', name: 'Layout A', category: 'Trao bằng', tags: ['2026'], latestPublishedVersion: null },
        { id: 'layout-b', name: 'Layout B', latestPublishedVersion: null },
      ]),
    });
    render(<LayoutLibraryScreen layoutPort={layoutPort} onOpen={() => {}} />);
    await waitFor(() => screen.getByText('Layout A'));

    fireEvent.change(screen.getByPlaceholderText('Tìm theo tên, phân loại, thẻ...'), { target: { value: '2026' } });
    expect(screen.getByText('Layout A')).toBeTruthy();
    expect(screen.queryByText('Layout B')).toBeNull();
  });

  it('double-click 1 card layout → gọi onOpen đúng id', async () => {
    const onOpen = vi.fn();
    render(<LayoutLibraryScreen layoutPort={mockLayoutPort()} onOpen={onOpen} />);
    await waitFor(() => screen.getByText('Layout A'));
    fireEvent.doubleClick(screen.getByText('Layout A'));

    expect(onOpen).toHaveBeenCalledWith('layout-a');
  });

  it('"+ Tạo layout mới" → nhập tên → createDocument với content trống + gọi onOpen id mới', async () => {
    const onOpen = vi.fn();
    const layoutPort = mockLayoutPort();
    render(<LayoutLibraryScreen layoutPort={layoutPort} onOpen={onOpen} />);
    await waitFor(() => screen.getByText('Layout A'));

    fireEvent.click(screen.getByText('Tạo layout mới'));
    fireEvent.change(screen.getByPlaceholderText('Tên layout'), { target: { value: 'Layout mới của tôi' } });
    fireEvent.click(screen.getByText('Tạo'));

    await waitFor(() => expect(layoutPort.createDocument).toHaveBeenCalled());
    const [newId, name, content] = (layoutPort.createDocument as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(name).toBe('Layout mới của tôi');
    expect(content.variants).toHaveLength(1);
    expect(onOpen).toHaveBeenCalledWith(newId);
  });

  it('nút "Sao chép cả layout" trên card → modal tên mặc định "{name} (bản sao)" → createDocument với content đã clone, KHÔNG gọi onOpen', async () => {
    const onOpen = vi.fn();
    const layoutPort = mockLayoutPort();
    render(<LayoutLibraryScreen layoutPort={layoutPort} onOpen={onOpen} />);
    await waitFor(() => screen.getByText('Layout A'));

    const cardA = screen.getByText('Layout A').closest('.group') as HTMLElement;
    fireEvent.click(within(cardA).getByTitle('Sao chép cả layout'));
    expect(screen.getByDisplayValue('Layout A (bản sao)')).toBeTruthy();
    fireEvent.click(screen.getByText('Sao chép'));

    await waitFor(() => expect(layoutPort.createDocument).toHaveBeenCalled());
    const [, name, content] = (layoutPort.createDocument as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(name).toBe('Layout A (bản sao)');
    expect(content).toEqual(CONTENT_A);
    expect(content).not.toBe(CONTENT_A); // deep clone, không phải cùng tham chiếu
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('nút "Sao chép" trên card KHÔNG kích hoạt onOpen của card (stopPropagation)', async () => {
    const onOpen = vi.fn();
    render(<LayoutLibraryScreen layoutPort={mockLayoutPort()} onOpen={onOpen} />);
    await waitFor(() => screen.getByText('Layout A'));
    const cardA = screen.getByText('Layout A').closest('.group') as HTMLElement;
    fireEvent.click(within(cardA).getByTitle('Sao chép cả layout'));

    expect(onOpen).not.toHaveBeenCalled();
  });

  it('card hiện category cạnh tỷ lệ + chip tags nếu có', async () => {
    const layoutPort = mockLayoutPort({
      getDocument: vi.fn().mockImplementation((id: string) =>
        Promise.resolve({ ...doc('layout-a', 'Layout A', CONTENT_A), category: 'Trao bằng', tags: ['2026', 'xuất sắc'] }),
      ),
      listDocuments: vi
        .fn()
        .mockResolvedValue([{ id: 'layout-a', name: 'Layout A', category: 'Trao bằng', tags: ['2026', 'xuất sắc'], latestPublishedVersion: null }]),
    });
    render(<LayoutLibraryScreen layoutPort={layoutPort} onOpen={() => {}} />);

    await waitFor(() => expect(screen.getByText(/Trao bằng/)).toBeTruthy());
    expect(screen.getByText('2026')).toBeTruthy();
    expect(screen.getByText('xuất sắc')).toBeTruthy();
  });

  it('bấm icon "i" trên card → mở LayoutInfoModal với dữ liệu hiện tại, KHÔNG gọi onOpen', async () => {
    const onOpen = vi.fn();
    render(<LayoutLibraryScreen layoutPort={mockLayoutPort()} onOpen={onOpen} />);
    await waitFor(() => screen.getByText('Layout A'));

    const cardA = screen.getByText('Layout A').closest('.group') as HTMLElement;
    fireEvent.click(within(cardA).getByTitle('Thông tin layout'));

    expect(screen.getByText('Thông tin layout')).toBeTruthy();
    expect(screen.getByDisplayValue('Layout A')).toBeTruthy();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('sửa thông tin rồi Lưu → gọi updateDocumentMeta đúng id + patch, đóng modal, refresh danh sách', async () => {
    const layoutPort = mockLayoutPort();
    render(<LayoutLibraryScreen layoutPort={layoutPort} onOpen={() => {}} />);
    await waitFor(() => screen.getByText('Layout A'));

    const cardA = screen.getByText('Layout A').closest('.group') as HTMLElement;
    fireEvent.click(within(cardA).getByTitle('Thông tin layout'));
    fireEvent.change(screen.getByDisplayValue('Layout A'), { target: { value: 'Layout A đã sửa' } });
    fireEvent.change(screen.getByPlaceholderText('VD: Trao bằng, Khen thưởng...'), { target: { value: 'Trao bằng' } });
    fireEvent.click(screen.getByText('Lưu'));

    await waitFor(() => expect(layoutPort.updateDocumentMeta).toHaveBeenCalledWith('layout-a', { name: 'Layout A đã sửa', description: undefined, category: 'Trao bằng', tags: [] }));
    expect(screen.queryByText('Thông tin layout')).toBeNull();
    // Sau khi lưu, danh sách được tải lại (reloadKey đổi) — getDocument('layout-a') gọi lại lần 2.
    await waitFor(() => expect((layoutPort.getDocument as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'layout-a').length).toBe(2));
  });
});
