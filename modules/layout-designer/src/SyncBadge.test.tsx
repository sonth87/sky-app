import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SyncBadge } from './SyncBadge.js';
import type { LayoutItem } from '@sky-app/slide-shared';

function textItem(overrides: Partial<LayoutItem> = {}): LayoutItem {
  return { id: 'a', type: 'text', box: { x: 0, y: 0, w: 10, h: 10 }, content: 'A', fontSize: 12, ...overrides } as LayoutItem;
}

describe('SyncBadge', () => {
  it('item KHÔNG liên quan sync (không syncRef, không isParent) → render null', () => {
    const { container } = render(<SyncBadge item={textItem()} isParent={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('item CÓ syncRef, chưa khoá → icon linked', () => {
    const { container } = render(<SyncBadge item={textItem({ syncRef: 'k1' })} isParent={false} />);
    expect(container.querySelector('[aria-label="Đang đồng bộ với tỷ lệ khác"]')).toBeTruthy();
  });

  it('item CÓ syncRef, syncLocked=true → icon unlinked', () => {
    const { container } = render(<SyncBadge item={textItem({ syncRef: 'k1', syncLocked: true })} isParent={false} />);
    expect(container.querySelector('[aria-label="Đã tách khỏi đồng bộ (đã khoá)"]')).toBeTruthy();
  });

  it('item KHÔNG có syncRef nhưng isParent=true (đang là nguồn cho item khác) → icon linked', () => {
    const { container } = render(<SyncBadge item={textItem()} isParent={true} />);
    expect(container.querySelector('[aria-label="Đang đồng bộ với tỷ lệ khác"]')).toBeTruthy();
  });
});
