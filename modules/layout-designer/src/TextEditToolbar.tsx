// Toolbar định dạng nổi cho TiptapTextEditor — viết lại 2026-07-19 theo pattern my-builder's
// TextEditToolbar (khảo sát cùng ngày): bám theo vị trí overlay (screenBox truyền từ Canvas.tsx,
// đặt phía trên, lật xuống dưới khi không đủ chỗ — cùng công thức ItemToolbar.tsx), gọi lệnh định
// dạng qua Tiptap chain commands thật (KHÔNG execCommand thô). Tự đánh dấu data-text-edit-toolbar
// để TiptapTextEditor's click-outside listener bỏ qua click bên trong toolbar.

import type { Editor } from '@tiptap/react';
import { Bold, Italic, Strikethrough } from 'lucide-react';

const TOOLBAR_HEIGHT = 34;
const TOOLBAR_GAP = 8;

export interface TextEditToolbarProps {
  editor: Editor;
  /** Vị trí màn hình của overlay đang sửa (screenBox đã tính sẵn ở Canvas.tsx) — toolbar tự đặt
   * phía trên, lật xuống dưới nếu không đủ chỗ (item sát mép trên/ngoài Frame). */
  anchorBox: { left: number; top: number; width: number; height: number };
}

export function TextEditToolbar({ editor, anchorBox }: TextEditToolbarProps) {
  const centerX = anchorBox.left + anchorBox.width / 2;
  const wantedTop = anchorBox.top - TOOLBAR_HEIGHT - TOOLBAR_GAP;
  const top = wantedTop < 0 ? anchorBox.top + anchorBox.height + TOOLBAR_GAP : wantedTop;

  const btnStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    border: 'none',
    background: active ? 'color-mix(in srgb, var(--accent-color, #4b57e6) 14%, transparent)' : 'transparent',
    color: active ? 'var(--accent-color, #4b57e6)' : '#5c5d6e',
    cursor: 'pointer',
    borderRadius: 6,
  });

  return (
    <div
      data-testid="text-edit-toolbar"
      data-text-edit-toolbar
      style={{
        position: 'absolute',
        left: centerX,
        top,
        transform: 'translateX(-50%)',
        height: TOOLBAR_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '0 6px',
        background: '#fff',
        border: '1px solid #e6e6ee',
        borderRadius: 9,
        boxShadow: '0 6px 20px -8px rgba(20,10,50,.35)',
        zIndex: 1003,
        pointerEvents: 'auto',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-label="In đậm"
        title="In đậm (Ctrl+B)"
        style={btnStyle(editor.isActive('bold'))}
      >
        <Bold size={14} />
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-label="In nghiêng"
        title="In nghiêng (Ctrl+I)"
        style={btnStyle(editor.isActive('italic'))}
      >
        <Italic size={14} />
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        aria-label="Gạch ngang"
        title="Gạch ngang"
        style={btnStyle(editor.isActive('strike'))}
      >
        <Strikethrough size={14} />
      </button>
    </div>
  );
}
