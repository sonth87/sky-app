import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayoutDesignerAppModule } from './LayoutDesignerAppModule.js';
import type { AppContentProps, PlatformContext } from '@sky-app/kernel';
import type { LayoutPort } from '@sky-app/service-contracts';
import type { LayoutContent, LayoutDocument } from '@sky-app/slide-shared';

function makePlatform(layoutPort: LayoutPort | undefined): PlatformContext {
  return {
    env: 'web',
    capabilities: { has: () => true, list: () => [] },
    services: {
      get: <T,>(id: string) => (id === 'layout' ? (layoutPort as T) : undefined),
      register: () => {},
      unregister: () => {},
      has: (id: string) => id === 'layout' && layoutPort != null,
    },
    events: { emit: () => {}, on: () => () => {} },
    entitlements: { has: () => true, list: () => [] },
    assetUrl: (p: string) => p,
  } as unknown as PlatformContext;
}

function baseProps(platform: PlatformContext): AppContentProps {
  return { appId: 'layout-designer', windowId: 'w1', platform, isActive: true };
}

function makeContent(): LayoutContent {
  return { variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items: [] }] };
}

function makeDoc(content: LayoutContent, publishedVersions: LayoutDocument['publishedVersions'] = []): LayoutDocument {
  return {
    id: 'demo-layout',
    name: 'Layout demo',
    currentDraft: content,
    publishedVersions,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function mockLayoutPort(overrides: Partial<LayoutPort> = {}): LayoutPort {
  return {
    listDocuments: vi.fn().mockResolvedValue([]),
    getDocument: vi.fn().mockResolvedValue(null),
    createDocument: vi.fn().mockResolvedValue(undefined),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn(),
    listVersions: vi.fn().mockResolvedValue([]),
    getVersion: vi.fn().mockResolvedValue(null),
    restoreVersion: vi.fn().mockResolvedValue(undefined),
    recordTokenUsage: vi.fn().mockResolvedValue(undefined),
    listTopVariables: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('LayoutDesignerAppModule — không có LayoutPort đăng ký', () => {
  it('hiện thông báo, không crash', () => {
    const platform = makePlatform(undefined);
    render(<LayoutDesignerAppModule {...baseProps(platform)} />);
    expect(screen.getByText(/chưa đăng ký LayoutPort/)).toBeTruthy();
  });
});

describe('LayoutDesignerAppModule — LayoutPort lỗi (VD better-sqlite3 ABI mismatch)', () => {
  it('getDocument throw → hiện thông báo lỗi rõ ràng, KHÔNG kẹt mãi ở "Đang tải layout…"', async () => {
    const port = mockLayoutPort({
      getDocument: vi.fn().mockRejectedValue(new Error('NODE_MODULE_VERSION mismatch')),
    });
    const platform = makePlatform(port);
    render(<LayoutDesignerAppModule {...baseProps(platform)} />);

    expect(await screen.findByText('Không tải được layout')).toBeTruthy();
    expect(screen.getByText('NODE_MODULE_VERSION mismatch')).toBeTruthy();
    expect(screen.queryByText('Đang tải layout…')).toBeNull();
  });

  it('createDocument throw (layout mới, tạo lỗi) → cũng hiện lỗi rõ ràng', async () => {
    const port = mockLayoutPort({
      getDocument: vi.fn().mockResolvedValue(null),
      createDocument: vi.fn().mockRejectedValue(new Error('disk full')),
    });
    const platform = makePlatform(port);
    render(<LayoutDesignerAppModule {...baseProps(platform)} />);

    expect(await screen.findByText('Không tải được layout')).toBeTruthy();
    expect(screen.getByText('disk full')).toBeTruthy();
  });
});

describe('LayoutDesignerAppModule — load document đã tồn tại', () => {
  it('gọi getDocument, KHÔNG gọi createDocument nếu đã có sẵn', async () => {
    const content = makeContent();
    const port = mockLayoutPort({ getDocument: vi.fn().mockResolvedValue(makeDoc(content)) });
    const platform = makePlatform(port);
    render(<LayoutDesignerAppModule {...baseProps(platform)} />);

    await waitFor(() => expect(screen.getByText('Layout Designer')).toBeTruthy());
    expect(port.getDocument).toHaveBeenCalledWith('demo-layout');
    expect(port.createDocument).not.toHaveBeenCalled();
  });
});

describe('LayoutDesignerAppModule — layout chưa tồn tại', () => {
  it('tự tạo document mới với content trống', async () => {
    const port = mockLayoutPort({ getDocument: vi.fn().mockResolvedValue(null) });
    const platform = makePlatform(port);
    render(<LayoutDesignerAppModule {...baseProps(platform)} />);

    await waitFor(() => expect(port.createDocument).toHaveBeenCalled());
    expect(port.createDocument).toHaveBeenCalledWith('demo-layout', 'Layout demo', expect.objectContaining({ variants: expect.any(Array) }));
  });
});

describe('LayoutDesignerAppModule — debounce save draft', () => {
  it('sửa nội dung (thêm item qua editor) → sau debounce gọi saveDraft', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const content = makeContent();
    const port = mockLayoutPort({ getDocument: vi.fn().mockResolvedValue(makeDoc(content)) });
    const platform = makePlatform(port);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<LayoutDesignerAppModule {...baseProps(platform)} />);
    await vi.waitFor(() => expect(screen.getByText('Layout Designer')).toBeTruthy());

    // Spawn 1 item text từ palette để tạo thay đổi doc thật (xương sống 2.3 đã có sẵn).
    const tile = screen.getByText('Chữ').closest('div')!;
    act(() => {
      fireEvent.mouseDown(tile, { clientX: 10, clientY: 10 });
    });
    const artEl = document.querySelector('[data-testid="canvas-frame"]') as HTMLElement;
    artEl.getBoundingClientRect = () => ({ left: 0, top: 0, right: 760, bottom: 428, width: 760, height: 428, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
    act(() => {
      fireEvent.mouseUp(window, { clientX: 400, clientY: 200 });
    });

    expect(port.saveDraft).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(port.saveDraft).toHaveBeenCalledWith('demo-layout', expect.objectContaining({ variants: expect.any(Array) }));

    vi.useRealTimers();
    void user;
  });
});

describe('LayoutDesignerAppModule — publish', () => {
  it('bấm Publish trong VersioningPanel → gọi layoutPort.publish rồi tải lại listVersions', async () => {
    const user = userEvent.setup();
    const content = makeContent();
    const port = mockLayoutPort({
      getDocument: vi.fn().mockResolvedValue(makeDoc(content)),
      publish: vi.fn().mockResolvedValue({ version: 1, content, publishedAt: '2026-01-01T00:00:00.000Z' }),
      listVersions: vi.fn().mockResolvedValue([{ version: 1, content, publishedAt: '2026-01-01T00:00:00.000Z' }]),
    });
    const platform = makePlatform(port);
    render(<LayoutDesignerAppModule {...baseProps(platform)} />);

    await waitFor(() => expect(screen.getByText('Chưa publish ▾')).toBeTruthy());
    await user.click(screen.getByText('Chưa publish ▾'));
    await user.click(screen.getByText('Publish → v1'));

    expect(port.publish).toHaveBeenCalledWith('demo-layout', undefined);
    await waitFor(() => expect(port.listVersions).toHaveBeenCalledWith('demo-layout'));
    await waitFor(() => expect(screen.getByText('v1 ▾')).toBeTruthy());
  });
});

describe('LayoutDesignerAppModule — restore', () => {
  it('bấm Khôi phục → gọi restoreVersion rồi tải lại document (remount editor với content mới)', async () => {
    const user = userEvent.setup();
    const originalContent = makeContent();
    const restoredContent: LayoutContent = {
      variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items: [{ id: 'restored-item', type: 'text', box: { x: 0, y: 0, w: 100, h: 40 }, content: 'Bản cũ', fontSize: 20 }] }],
    };
    const publishedVersions = [{ version: 1, content: restoredContent, publishedAt: '2026-01-01T00:00:00.000Z', note: 'Bản đầu' }];
    let getDocumentCallCount = 0;
    const port = mockLayoutPort({
      getDocument: vi.fn().mockImplementation(() => {
        getDocumentCallCount += 1;
        const content = getDocumentCallCount === 1 ? originalContent : restoredContent;
        return Promise.resolve(makeDoc(content, publishedVersions));
      }),
      listVersions: vi.fn().mockResolvedValue(publishedVersions),
      restoreVersion: vi.fn().mockResolvedValue(undefined),
    });
    const platform = makePlatform(port);
    render(<LayoutDesignerAppModule {...baseProps(platform)} />);

    await waitFor(() => expect(screen.getByText('v1 ▾')).toBeTruthy());
    await user.click(screen.getByText('v1 ▾'));
    await user.click(screen.getByText('Khôi phục'));

    await waitFor(() => expect(port.restoreVersion).toHaveBeenCalledWith('demo-layout', 1));
    // Sau restore, editor remount với content MỚI (restoredContent có item "Bản cũ") —
    // findByText tự retry tới khi DOM cập nhật, đáng tin hơn tách waitFor thủ công.
    expect(await screen.findByText('Bản cũ', {}, { timeout: 3000 })).toBeTruthy();
    expect(getDocumentCallCount).toBeGreaterThanOrEqual(2);
  });
});

describe('LayoutDesignerAppModule — variable_registry (gợi ý toàn cục)', () => {
  it('mount → gọi listTopVariables, gợi ý toàn cục xuất hiện trong dropdown khi gõ @', async () => {
    const user = userEvent.setup();
    const content: LayoutContent = {
      variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items: [{ id: 'a', type: 'text', box: { x: 0, y: 0, w: 100, h: 40 }, content: 'Xin chào', fontSize: 20 }] }],
    };
    const port = mockLayoutPort({
      getDocument: vi.fn().mockResolvedValue(makeDoc(content)),
      listTopVariables: vi.fn().mockResolvedValue([{ key: 'chuc_vu', firstUsedAt: '2026-01-01', lastUsedAt: '2026-01-01', usageCount: 5 }]),
    });
    const platform = makePlatform(port);
    render(<LayoutDesignerAppModule {...baseProps(platform)} />);

    await waitFor(() => expect(port.listTopVariables).toHaveBeenCalled());
    await user.pointer({ keys: '[MouseLeft]', target: screen.getByText('Xin chào') });
    await user.click(screen.getByDisplayValue('Xin chào'));
    await user.type(screen.getByDisplayValue('Xin chào'), ' @');

    expect(await screen.findByTestId('variable-suggestion')).toBeTruthy();
    expect(screen.getByText('@chuc_vu')).toBeTruthy();
  });

  it('chọn token từ dropdown → gọi recordTokenUsage rồi tải lại listTopVariables', async () => {
    const user = userEvent.setup();
    const content: LayoutContent = {
      variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items: [{ id: 'a', type: 'text', box: { x: 0, y: 0, w: 100, h: 40 }, content: 'Xin chào', fontSize: 20 }] }],
    };
    const port = mockLayoutPort({
      getDocument: vi.fn().mockResolvedValue(makeDoc(content)),
      listTopVariables: vi.fn().mockResolvedValue([{ key: 'chuc_vu', firstUsedAt: '2026-01-01', lastUsedAt: '2026-01-01', usageCount: 5 }]),
      recordTokenUsage: vi.fn().mockResolvedValue(undefined),
    });
    const platform = makePlatform(port);
    render(<LayoutDesignerAppModule {...baseProps(platform)} />);

    await waitFor(() => expect(port.listTopVariables).toHaveBeenCalledTimes(1));
    await user.pointer({ keys: '[MouseLeft]', target: screen.getByText('Xin chào') });
    await user.type(screen.getByDisplayValue('Xin chào'), ' @');
    await user.click(await screen.findByTestId('variable-suggestion'));

    expect(port.recordTokenUsage).toHaveBeenCalledWith('chuc_vu');
    await waitFor(() => expect(port.listTopVariables).toHaveBeenCalledTimes(2));
  });
});
