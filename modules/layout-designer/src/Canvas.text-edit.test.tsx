// Test rich-text editor (Tiptap) qua double-click TextItem — Bước 12 kế hoạch resize/rotate
// (2026-07-18, bước CUỐI CÙNG).

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent, RichTextContent } from '@sky-app/slide-shared';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 760 + 48, configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 428 + 48, configurable: true });
  // ProseMirror (dùng bởi Tiptap) cần getClientRects/getBoundingClientRect trên Range — jsdom
  // không implement layout thật, polyfill tối thiểu để editor khởi tạo không throw.
  Range.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
});

function contentWithText(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '760:428', w: 760, h: 428 },
        refW: 760,
        refH: 428,
        items: [{ id: 't1', type: 'text', box: { x: 50, y: 50, w: 300, h: 60 }, content: 'Xin chào @full_name', fontSize: 24 }],
      },
    ],
  };
}

function contentWithTiptapText(): LayoutContent {
  const rich: RichTextContent = {
    json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Đã có định dạng', marks: [{ type: 'bold' }] }] }] },
    html: '<p><strong>Đã có định dạng</strong></p>',
  };
  return {
    variants: [
      {
        aspect: { id: '760:428', w: 760, h: 428 },
        refW: 760,
        refH: 428,
        items: [{ id: 't1', type: 'text', box: { x: 50, y: 50, w: 300, h: 60 }, content: rich, fontSize: 24 }],
      },
    ],
  };
}

function mockArtRect(container: HTMLElement) {
  const artEl = container.querySelector('[data-testid="canvas-frame"]') as HTMLElement;
  artEl.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 760, bottom: 428, width: 760, height: 428, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
  return artEl;
}

describe('Canvas — mở/đóng TiptapTextEditor qua double-click', () => {
  it('double-click TextItem → hiện overlay editor', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithText()} />);
    mockArtRect(container);
    const textEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;

    fireEvent.doubleClick(textEl);

    expect(screen.getByTestId('tiptap-text-editor')).toBeTruthy();
  });

  it('nhấn Esc → đóng overlay editor', async () => {
    const { container } = render(<LayoutDesignerApp content={contentWithText()} />);
    mockArtRect(container);
    const textEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    fireEvent.doubleClick(textEl);
    expect(screen.getByTestId('tiptap-text-editor')).toBeTruthy();

    // Listener gắn sau setTimeout(0) (tránh chính double-click bị hiểu nhầm "click ra ngoài") —
    // đợi tick đó trôi qua trước khi bắn Escape.
    await new Promise((r) => setTimeout(r, 10));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('tiptap-text-editor')).toBeNull();
  });

  it('double-click item KHÔNG PHẢI text (shape) → KHÔNG mở editor', () => {
    const content: LayoutContent = {
      variants: [
        {
          aspect: { id: '760:428', w: 760, h: 428 },
          refW: 760,
          refH: 428,
          items: [{ id: 's1', type: 'shape', box: { x: 50, y: 50, w: 100, h: 100 }, shape: 'rect', fill: '#000' }],
        },
      ],
    };
    const { container } = render(<LayoutDesignerApp content={content} />);
    mockArtRect(container);
    const shapeEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;

    fireEvent.doubleClick(shapeEl);

    expect(screen.queryByTestId('tiptap-text-editor')).toBeNull();
  });
});

describe('Canvas — mở editor với content đã có sẵn', () => {
  it('content string (layout cũ) → editor mở KHÔNG throw, PropertyPanel vẫn hiện đúng loại item', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithText()} />);
    mockArtRect(container);
    const textEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;

    expect(() => fireEvent.doubleClick(textEl)).not.toThrow();
    expect(screen.getByTestId('tiptap-text-editor')).toBeTruthy();
  });

  it('content RichTextContent (đã qua editor trước đó) → editor mở KHÔNG throw', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithTiptapText()} />);
    mockArtRect(container);
    const textEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;

    expect(() => fireEvent.doubleClick(textEl)).not.toThrow();
    expect(screen.getByTestId('tiptap-text-editor')).toBeTruthy();
  });
});

describe('PropertyPanel — TextItem đã có content RichTextContent', () => {
  it('hiện preview read-only thay vì VariableTextarea, gợi ý sửa trên canvas', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithTiptapText()} />);
    const textEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    fireEvent.pointerDown(textEl);
    fireEvent.pointerUp(textEl);

    expect(screen.getByText(/nhấp đúp vào ô văn bản trên canvas để sửa/i)).toBeTruthy();
    expect(container.querySelector('textarea')).toBeNull();
  });
});

describe('Canvas — overlay style khớp item thật (bug thật 2026-07-19: nền trắng cứng + fontSize không scale)', () => {
  it('overlay dùng ĐÚNG color/fontFamily của item, KHÔNG hard-code nền trắng', () => {
    const content = contentWithText();
    (content.variants[0]!.items[0] as { color?: string; fontFamily?: string }).color = '#ff0000';
    (content.variants[0]!.items[0] as { color?: string; fontFamily?: string }).fontFamily = 'Georgia';
    const { container } = render(<LayoutDesignerApp content={content} />);
    mockArtRect(container);
    const textEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;

    fireEvent.doubleClick(textEl);

    const overlay = screen.getByTestId('tiptap-text-editor');
    expect(overlay.style.color).toBe('rgb(255, 0, 0)');
    expect(overlay.style.fontFamily).toBe('Georgia');
    // Nền KHÔNG phải trắng cứng (#fff) — dùng color-mix trong suốt theo accent color.
    expect(overlay.style.background).not.toBe('rgb(255, 255, 255)');
  });

  it('item gốc trên canvas bị ẩn (visibility:hidden) trong lúc overlay đang mở, tránh 2 lớp text chồng nhau', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithText()} />);
    mockArtRect(container);
    const textEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;

    fireEvent.doubleClick(textEl);

    expect(textEl.style.visibility).toBe('hidden');
  });
});

describe('Canvas — TextEditToolbar (Bold/Italic/Strike nổi khi đang sửa)', () => {
  it('mở overlay → toolbar hiện với 3 nút định dạng', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithText()} />);
    mockArtRect(container);
    const textEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;

    fireEvent.doubleClick(textEl);

    const toolbar = screen.getByTestId('text-edit-toolbar');
    expect(toolbar).toBeTruthy();
    expect(screen.getByLabelText('In đậm')).toBeTruthy();
    expect(screen.getByLabelText('In nghiêng')).toBeTruthy();
    expect(screen.getByLabelText('Gạch ngang')).toBeTruthy();
  });

  it('bấm click bên trong toolbar KHÔNG đóng editor (data-text-edit-toolbar guard)', async () => {
    const { container } = render(<LayoutDesignerApp content={contentWithText()} />);
    mockArtRect(container);
    const textEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    fireEvent.doubleClick(textEl);
    await new Promise((r) => setTimeout(r, 10));

    fireEvent.pointerDown(screen.getByLabelText('In đậm'));

    expect(screen.queryByTestId('tiptap-text-editor')).toBeTruthy();
  });

  it('click ra NGOÀI overlay và toolbar → đóng editor (pointerdown capture-phase)', async () => {
    const { container } = render(<LayoutDesignerApp content={contentWithText()} />);
    mockArtRect(container);
    const textEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    fireEvent.doubleClick(textEl);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByTestId('tiptap-text-editor')).toBeTruthy();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByTestId('tiptap-text-editor')).toBeNull();
  });
});

describe('Canvas — Layers panel hiện đúng nhãn cho TextItem có content RichTextContent', () => {
  it('nhãn tự sinh = text thô nối từ mọi text node (KHÔNG phải [object Object])', () => {
    const { container } = render(<LayoutDesignerApp content={contentWithTiptapText()} />);
    const tabs = screen.getAllByText('Lớp');
    fireEvent.click(tabs[0]!);

    // "Đã có định dạng" khớp CẢ canvas render (qua <strong>, dangerouslySetInnerHTML) LẪN nhãn Layers panel
    // — scope vào panel Lớp cụ thể (tiêu đề "Lớp" cuối cùng + nextElementSibling), cùng pattern
    // đã dùng ở Flyout.layers-tree.test.tsx (Bước 6).
    const headings = screen.getAllByText('Lớp');
    const listEl = headings[headings.length - 1]!.nextElementSibling as HTMLElement;
    expect(listEl.textContent).toContain('Đã có định dạng');
    void container;
  });
});
