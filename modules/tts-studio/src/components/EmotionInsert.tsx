import { Laugh, Wind, Mic2 } from 'lucide-react';
import { useTtsStudioStore } from '../store';
import { useTextareaRef } from '../TextareaRefContext';
import { buildEmotionHighlightedHtml, getCaretCharOffset, setCaretCharOffset } from '../lib/highlightEditor';
import { cn } from '../lib/cn';

interface EmotionTag {
  key: string;
  label: string;
  icon: typeof Laugh;
  tag: string;
}

const EMOTIONS: EmotionTag[] = [
  { key: 'cuoi', label: 'Cười', icon: Laugh, tag: '[cười]' },
  { key: 'thodai', label: 'Thở dài', icon: Wind, tag: '[thở dài]' },
  { key: 'hanggiong', label: 'Hắng giọng', icon: Mic2, tag: '[hắng giọng]' },
];

/** Chèn `tag` vào đúng vị trí con trỏ hiện tại trong ô soạn thảo (contentEditable, không phải
 * nối vào cuối) — cùng cơ chế offset ký tự với TextInputPanel/TemplateEditor.tsx's
 * insertVariable, vì contentEditable không có API setRangeText như <textarea>. Con trỏ không xác
 * định (chưa từng focus, hoặc đã blur đi click nút này) → fallback nối vào cuối text. */
export function EmotionInsert() {
  const setText = useTtsStudioStore((s) => s.setText);
  const editorRef = useTextareaRef();

  const handleInsert = (tag: string) => {
    const el = editorRef?.current;
    const text = useTtsStudioStore.getState().text;
    if (!el) {
      setText(text + tag);
      return;
    }
    const cursor = getCaretCharOffset(el) ?? text.length;
    const newVal = text.slice(0, cursor) + tag + text.slice(cursor);
    setText(newVal);
    el.innerHTML = buildEmotionHighlightedHtml(newVal);
    const newCursor = cursor + tag.length;
    requestAnimationFrame(() => {
      el.focus();
      setCaretCharOffset(el, newCursor);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-foreground">Chèn cảm xúc</label>
      <div className="flex flex-wrap gap-1.5">
        {EMOTIONS.map(({ key, label, icon: Icon, tag }) => (
          <button
            key={key}
            type="button"
            onClick={() => handleInsert(tag)}
            title={`Chèn ${tag} vào vị trí con trỏ`}
            className={cn(
              'flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1',
              'text-xs text-foreground transition-colors hover:border-primary/60 hover:bg-primary/10',
            )}
          >
            <Icon size={13} className="text-primary" />
            {label}
            <span className="font-mono text-2xs text-muted-foreground">{tag}</span>
          </button>
        ))}
      </div>
      <p className="text-2xs text-muted-foreground">
        Bấm để chèn thẻ vào vị trí con trỏ — ví dụ: &quot;Vui quá {EMOTIONS[0]!.tag}!&quot;
      </p>
    </div>
  );
}
