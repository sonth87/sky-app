import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VersioningPanel } from './VersioningPanel.js';
import type { LayoutVersion } from '@sky-app/slide-shared';

function makeVersion(version: number, note?: string): LayoutVersion {
  return { version, content: { variants: [] }, publishedAt: '2026-01-01T00:00:00.000Z', note };
}

describe('VersioningPanel — hiển thị', () => {
  it('chưa publish lần nào → nút hiện "Chưa publish"', () => {
    render(<VersioningPanel latestPublishedVersion={null} versions={[]} onPublish={() => {}} onRestore={() => {}} />);
    expect(screen.getByText('Chưa publish ▾')).toBeTruthy();
  });

  it('đã có version → nút hiện đúng version mới nhất', () => {
    render(<VersioningPanel latestPublishedVersion={3} versions={[makeVersion(1), makeVersion(2), makeVersion(3)]} onPublish={() => {}} onRestore={() => {}} />);
    expect(screen.getByText('v3 ▾')).toBeTruthy();
  });

  it('mở dropdown → hiện danh sách version mới nhất TRƯỚC (đảo ngược thứ tự)', async () => {
    const user = userEvent.setup();
    render(
      <VersioningPanel
        latestPublishedVersion={2}
        versions={[makeVersion(1, 'Bản đầu'), makeVersion(2, 'Sửa màu')]}
        onPublish={() => {}}
        onRestore={() => {}}
      />,
    );
    await user.click(screen.getByText('v2 ▾'));
    const rows = screen.getAllByText(/^v\d/);
    // rows[0] là nút toggle "v2 ▾", rows[1] mới là hàng đầu tiên trong list (v2 trước v1).
    expect(rows[1]!.textContent).toBe('v2');
    expect(rows[2]!.textContent).toBe('v1');
  });

  it('chưa publish lần nào → dropdown hiện "Chưa publish lần nào"', async () => {
    const user = userEvent.setup();
    render(<VersioningPanel latestPublishedVersion={null} versions={[]} onPublish={() => {}} onRestore={() => {}} />);
    await user.click(screen.getByText('Chưa publish ▾'));
    expect(screen.getByText('Chưa publish lần nào.')).toBeTruthy();
  });
});

describe('VersioningPanel — publish', () => {
  it('bấm Publish → gọi onPublish với note đã nhập, đóng dropdown', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    render(<VersioningPanel latestPublishedVersion={1} versions={[makeVersion(1)]} onPublish={onPublish} onRestore={() => {}} />);
    await user.click(screen.getByText('v1 ▾'));
    await user.type(screen.getByPlaceholderText('Ghi chú thay đổi (tuỳ chọn)'), 'Đổi màu nền');
    await user.click(screen.getByText('Publish → v2'));

    expect(onPublish).toHaveBeenCalledWith('Đổi màu nền');
    expect(screen.queryByPlaceholderText('Ghi chú thay đổi (tuỳ chọn)')).toBeNull();
  });

  it('bấm Publish KHÔNG nhập note → gọi onPublish(undefined)', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    render(<VersioningPanel latestPublishedVersion={null} versions={[]} onPublish={onPublish} onRestore={() => {}} />);
    await user.click(screen.getByText('Chưa publish ▾'));
    await user.click(screen.getByText('Publish → v1'));

    expect(onPublish).toHaveBeenCalledWith(undefined);
  });

  it('isPublishing=true → nút Publish disabled, đổi label', async () => {
    const user = userEvent.setup();
    render(<VersioningPanel latestPublishedVersion={1} versions={[makeVersion(1)]} onPublish={() => {}} onRestore={() => {}} isPublishing />);
    await user.click(screen.getByText('v1 ▾'));
    const btn = screen.getByText('Đang publish…') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe('VersioningPanel — khôi phục', () => {
  it('bấm Khôi phục ở 1 version → gọi onRestore với đúng số version', async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    render(
      <VersioningPanel
        latestPublishedVersion={2}
        versions={[makeVersion(1, 'Bản đầu'), makeVersion(2, 'Sửa màu')]}
        onPublish={() => {}}
        onRestore={onRestore}
      />,
    );
    await user.click(screen.getByText('v2 ▾'));
    const restoreButtons = screen.getAllByText('Khôi phục');
    await user.click(restoreButtons[1]!); // hàng v1 (đứng sau v2 trong danh sách đảo ngược)

    expect(onRestore).toHaveBeenCalledWith(1);
  });
});
