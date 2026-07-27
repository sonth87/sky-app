import type { Editor } from '@tiptap/react';
import { Bold, Italic, Strikethrough } from 'lucide-react';
import { cn } from '../lib/cn.js';

const TOOLBAR_HEIGHT = 34;
const TOOLBAR_GAP = 8;

export interface TextEditToolbarProps {
  editor: Editor;
  anchorBox: { left: number; top: number; width: number; height: number };
}

export function TextEditToolbar({ editor, anchorBox }: TextEditToolbarProps) {
  const centerX = anchorBox.left + anchorBox.width / 2;
  const wantedTop = anchorBox.top - TOOLBAR_HEIGHT - TOOLBAR_GAP;
  const top = wantedTop < 0 ? anchorBox.top + anchorBox.height + TOOLBAR_GAP : wantedTop;

  const btnClass = (active: boolean) =>
    cn(
      'flex items-center justify-center w-6 h-6 border-none rounded-md cursor-pointer transition-colors duration-100',
      active ? 'bg-[#4b57e6]/14 text-[#4b57e6]' : 'bg-transparent text-[#5c5d6e] hover:bg-[#f4f5f9]'
    );

  return (
    <div
      data-testid="text-edit-toolbar"
      data-text-edit-toolbar
      className="absolute h-[34px] flex items-center gap-[2px] px-[6px] bg-white border border-[#e6e6ee] rounded-[9px] shadow-[0_6px_20px_-8px_rgba(20,10,50,0.35)] z-[1003] pointer-events-auto -translate-x-1/2"
      style={{
        left: centerX,
        top,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-label="In đậm"
        title="In đậm (Ctrl+B)"
        className={btnClass(editor.isActive('bold'))}
      >
        <Bold size={14} />
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-label="In nghiêng"
        title="In nghiêng (Ctrl+I)"
        className={btnClass(editor.isActive('italic'))}
      >
        <Italic size={14} />
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        aria-label="Gạch ngang"
        title="Gạch ngang"
        className={btnClass(editor.isActive('strike'))}
      >
        <Strikethrough size={14} />
      </button>
    </div>
  );
}
