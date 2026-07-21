// LayoutPickerModal — Giai đoạn 4b kế hoạch Event.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AssetPort, LayoutPort } from '@sky-app/service-contracts';
import type { LayoutContent } from '@sky-app/slide-shared';
import './i18n.js';
import { LayoutPickerModal } from './LayoutPickerModal.js';

const SAMPLE_CONTENT: LayoutContent = {
  variants: [
    {
      aspect: { id: '16:9', w: 16, h: 9 },
      refW: 1920,
      refH: 1080,
      background: { kind: 'color', color: '#001a4d' },
      items: [{ id: 'name', type: 'text', box: { x: 0, y: 0, w: 400, h: 100 }, content: 'Chúc mừng @full_name', fontSize: 32, color: '#fff', align: 'left' }],
    },
  ],
};

function mockLayoutPort(overrides: Partial<LayoutPort> = {}): LayoutPort {
  return {
    listDocuments: vi.fn().mockResolvedValue([
      { id: 'layout-a', name: 'Layout A', description: undefined, latestPublishedVersion: 2 },
      { id: 'layout-draft-only', name: 'Chưa publish', description: undefined, latestPublishedVersion: null },
    ]),
    getDocument: vi.fn().mockResolvedValue(null),
    createDocument: vi.fn().mockResolvedValue(undefined),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue({ version: 2, content: SAMPLE_CONTENT, publishedAt: '2026-07-19T00:00:00.000Z' }),
    listVersions: vi.fn().mockResolvedValue([]),
    getVersion: vi.fn().mockResolvedValue({ version: 2, content: SAMPLE_CONTENT, publishedAt: '2026-07-19T00:00:00.000Z' }),
    restoreVersion: vi.fn().mockResolvedValue(undefined),
    recordTokenUsage: vi.fn().mockResolvedValue(undefined),
    listTopVariables: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function mockAssetPort(overrides: Partial<AssetPort> = {}): AssetPort {
  return {
    pickAndSaveImage: vi.fn().mockResolvedValue(null),
    resolveAssetUrl: vi.fn().mockResolvedValue(''),
    listAssets: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as AssetPort;
}

describe('LayoutPickerModal', () => {
  it('hiện đúng layout đã publish, ẩn layout chưa publish version nào', async () => {
    const layoutPort = mockLayoutPort();
    render(<LayoutPickerModal open layoutPort={layoutPort} assetPort={mockAssetPort()} onClose={() => {}} onPick={() => {}} />);

    await waitFor(() => expect(screen.getByText('Layout A')).toBeTruthy());
    expect(screen.queryByText('Chưa publish')).toBeNull();
  });

  it('click 1 layout CHỈ tích chọn (viền+dấu tick), KHÔNG gọi onPick ngay', async () => {
    const layoutPort = mockLayoutPort();
    const onPick = vi.fn();
    render(<LayoutPickerModal open layoutPort={layoutPort} assetPort={mockAssetPort()} onClose={() => {}} onPick={onPick} />);

    await waitFor(() => screen.getByText('Layout A'));
    fireEvent.click(screen.getByText('Layout A').closest('button')!);

    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByText('Đã chọn: Layout A')).toBeTruthy();
  });

  it('click tích chọn rồi bấm "Chọn layout này" → gọi đúng onPick({layoutId, layoutVersion})', async () => {
    const layoutPort = mockLayoutPort();
    const onPick = vi.fn();
    render(<LayoutPickerModal open layoutPort={layoutPort} assetPort={mockAssetPort()} onClose={() => {}} onPick={onPick} />);

    await waitFor(() => screen.getByText('Layout A'));
    fireEvent.click(screen.getByText('Layout A').closest('button')!);
    await waitFor(() => expect(screen.getByText('Chọn layout này').closest('button')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Chọn layout này'));

    expect(onPick).toHaveBeenCalledWith({ layoutId: 'layout-a', layoutVersion: 2 });
  });

  it('nút "Chọn layout này" bị disable khi CHƯA tích chọn layout nào', async () => {
    const layoutPort = mockLayoutPort();
    render(<LayoutPickerModal open layoutPort={layoutPort} assetPort={mockAssetPort()} onClose={() => {}} onPick={() => {}} />);

    await waitFor(() => screen.getByText('Layout A'));
    expect(screen.getByText('Chọn layout này').closest('button')).toBeDisabled();
  });

  it('double-click 1 layout → chọn ngay lập tức, không cần bấm nút xác nhận', async () => {
    const layoutPort = mockLayoutPort();
    const onPick = vi.fn();
    render(<LayoutPickerModal open layoutPort={layoutPort} assetPort={mockAssetPort()} onClose={() => {}} onPick={onPick} />);

    await waitFor(() => screen.getByText('Layout A'));
    fireEvent.doubleClick(screen.getByText('Layout A').closest('button')!);

    expect(onPick).toHaveBeenCalledWith({ layoutId: 'layout-a', layoutVersion: 2 });
  });

  it('gõ tìm kiếm không khớp tên → lọc mất layout, hiện thông báo không tìm thấy', async () => {
    const layoutPort = mockLayoutPort();
    render(<LayoutPickerModal open layoutPort={layoutPort} assetPort={mockAssetPort()} onClose={() => {}} onPick={() => {}} />);

    await waitFor(() => screen.getByText('Layout A'));
    fireEvent.change(screen.getByPlaceholderText('Tìm theo tên layout...'), { target: { value: 'không tồn tại' } });

    await waitFor(() => expect(screen.getByText('Không tìm thấy layout phù hợp.')).toBeTruthy());
    expect(screen.queryByText('Layout A')).toBeNull();
  });

  it('gõ tìm kiếm khớp 1 phần tên (không phân biệt hoa/thường) → vẫn hiện layout đó', async () => {
    const layoutPort = mockLayoutPort();
    render(<LayoutPickerModal open layoutPort={layoutPort} assetPort={mockAssetPort()} onClose={() => {}} onPick={() => {}} />);

    await waitFor(() => screen.getByText('Layout A'));
    fireEvent.change(screen.getByPlaceholderText('Tìm theo tên layout...'), { target: { value: 'layout a' } });

    expect(screen.getByText('Layout A')).toBeTruthy();
  });

  it('chỉ 1 tỷ lệ khung hình xuất hiện trong dữ liệu → KHÔNG hiện dropdown lọc tỷ lệ (không có gì để lọc)', async () => {
    const layoutPort = mockLayoutPort();
    render(<LayoutPickerModal open layoutPort={layoutPort} assetPort={mockAssetPort()} onClose={() => {}} onPick={() => {}} />);

    await waitFor(() => screen.getByText('Layout A'));
    expect(screen.queryByLabelText('Lọc theo tỷ lệ khung hình')).toBeNull();
  });

  it('lọc theo tỷ lệ khung hình → chỉ hiện layout có variant khớp tỷ lệ đã chọn', async () => {
    const contentPortrait: LayoutContent = {
      variants: [{ aspect: { id: '9:16', w: 9, h: 16 }, refW: 1080, refH: 1920, background: { kind: 'color', color: '#000' }, items: [] }],
    };
    const layoutPort = mockLayoutPort({
      listDocuments: vi.fn().mockResolvedValue([
        { id: 'layout-a', name: 'Layout A', description: undefined, latestPublishedVersion: 2 },
        { id: 'layout-b', name: 'Layout B dọc', description: undefined, latestPublishedVersion: 1 },
      ]),
      getVersion: vi.fn().mockImplementation((id: string) =>
        Promise.resolve(
          id === 'layout-b'
            ? { version: 1, content: contentPortrait, publishedAt: '2026-07-19T00:00:00.000Z' }
            : { version: 2, content: SAMPLE_CONTENT, publishedAt: '2026-07-19T00:00:00.000Z' },
        ),
      ),
    });
    render(<LayoutPickerModal open layoutPort={layoutPort} assetPort={mockAssetPort()} onClose={() => {}} onPick={() => {}} />);

    await waitFor(() => screen.getByText('Layout A'));
    expect(screen.getByText('Layout B dọc')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Lọc theo tỷ lệ khung hình'), { target: { value: '9:16' } });

    expect(screen.queryByText('Layout A')).toBeNull();
    expect(screen.getByText('Layout B dọc')).toBeTruthy();
  });

  it('không có layout nào đã publish → hiện empty state', async () => {
    const layoutPort = mockLayoutPort({
      listDocuments: vi.fn().mockResolvedValue([{ id: 'x', name: 'X', description: undefined, latestPublishedVersion: null }]),
    });
    render(<LayoutPickerModal open layoutPort={layoutPort} assetPort={mockAssetPort()} onClose={() => {}} onPick={() => {}} />);

    await waitFor(() => expect(screen.getByText(/Chưa có layout nào/)).toBeTruthy());
  });
});
