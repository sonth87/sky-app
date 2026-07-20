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

  it('click 1 layout trả đúng {layoutId, layoutVersion} đã ghim', async () => {
    const layoutPort = mockLayoutPort();
    const onPick = vi.fn();
    render(<LayoutPickerModal open layoutPort={layoutPort} assetPort={mockAssetPort()} onClose={() => {}} onPick={onPick} />);

    await waitFor(() => screen.getByText('Layout A'));
    fireEvent.click(screen.getByText('Layout A').closest('button')!);

    expect(onPick).toHaveBeenCalledWith({ layoutId: 'layout-a', layoutVersion: 2 });
  });

  it('không có layout nào đã publish → hiện empty state', async () => {
    const layoutPort = mockLayoutPort({
      listDocuments: vi.fn().mockResolvedValue([{ id: 'x', name: 'X', description: undefined, latestPublishedVersion: null }]),
    });
    render(<LayoutPickerModal open layoutPort={layoutPort} assetPort={mockAssetPort()} onClose={() => {}} onPick={() => {}} />);

    await waitFor(() => expect(screen.getByText(/Chưa có layout nào/)).toBeTruthy());
  });
});
