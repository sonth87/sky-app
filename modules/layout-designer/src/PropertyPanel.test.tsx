import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';

function imageContent(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '16:9', w: 16, h: 9 },
        refW: 1920,
        refH: 1080,
        items: [{ id: 'avatar', type: 'image', box: { x: 0, y: 0, w: 200, h: 200 }, fit: 'cover' }],
      },
    ],
  };
}

describe('PropertyPanel — Đổi ảnh (AssetPort)', () => {
  it('không truyền pickAndSaveImage → KHÔNG hiện nút Đổi ảnh', async () => {
    const user = userEvent.setup();
    render(<LayoutDesignerApp content={imageContent()} />);
    await user.click(screen.getByText('ẢNH'));
    expect(screen.queryByText('Đổi ảnh')).toBeNull();
  });

  it('bấm Đổi ảnh → gọi pickAndSaveImage, gán relativePath vào item.src', async () => {
    const user = userEvent.setup();
    const pickAndSaveImage = vi.fn().mockResolvedValue({ relativePath: 'assets/layout/abc.png' });
    const resolveAssetUrl = vi.fn().mockResolvedValue('ceremony-asset://local/assets/layout/abc.png');

    const { container } = render(
      <LayoutDesignerApp content={imageContent()} pickAndSaveImage={pickAndSaveImage} resolveAssetUrl={resolveAssetUrl} />,
    );
    await user.click(screen.getByText('ẢNH'));
    await user.click(screen.getByText('Đổi ảnh'));

    expect(pickAndSaveImage).toHaveBeenCalled();
    await waitFor(() => expect(resolveAssetUrl).toHaveBeenCalledWith('assets/layout/abc.png'));

    // Preview thumbnail trong PropertyPanel phải xuất hiện với đúng URL đã resolve.
    await waitFor(() => {
      const img = container.querySelector('img[src="ceremony-asset://local/assets/layout/abc.png"]');
      expect(img).toBeTruthy();
    });
  });

  it('huỷ chọn ảnh (pickAndSaveImage trả null) → KHÔNG đổi item.src', async () => {
    const user = userEvent.setup();
    const pickAndSaveImage = vi.fn().mockResolvedValue(null);
    render(<LayoutDesignerApp content={imageContent()} pickAndSaveImage={pickAndSaveImage} />);
    await user.click(screen.getByText('ẢNH'));
    await user.click(screen.getByText('Đổi ảnh'));

    expect(pickAndSaveImage).toHaveBeenCalled();
    // Vẫn hiện placeholder "ẢNH" (không có src) — không bị crash, không đổi state sai.
    await waitFor(() => expect(screen.getAllByText('ẢNH').length).toBeGreaterThan(0));
  });

  it('ảnh trên Canvas cũng dùng resolveAssetUrl (không hiển thị relativePath thô làm URL)', async () => {
    const user = userEvent.setup();
    const contentWithSrc: LayoutContent = {
      variants: [
        {
          aspect: { id: '16:9', w: 16, h: 9 },
          refW: 1920,
          refH: 1080,
          items: [{ id: 'avatar', type: 'image', box: { x: 0, y: 0, w: 200, h: 200 }, src: 'blob:some-key', fit: 'cover' }],
        },
      ],
    };
    const resolveAssetUrl = vi.fn().mockResolvedValue('blob:http://localhost/resolved-object-url');
    const { container } = render(<LayoutDesignerApp content={contentWithSrc} resolveAssetUrl={resolveAssetUrl} />);

    await waitFor(() => expect(resolveAssetUrl).toHaveBeenCalledWith('blob:some-key'));
    await waitFor(() => {
      const canvasImageEl = [...container.querySelectorAll('[style*="background"]')].find((el) =>
        (el as HTMLElement).style.background.includes('resolved-object-url'),
      );
      expect(canvasImageEl).toBeTruthy();
    });
    void user;
  });
});
