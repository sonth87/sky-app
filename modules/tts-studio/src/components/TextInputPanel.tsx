import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { useTtsStudioStore } from '../store';
import { useTextareaRef } from '../TextareaRefContext';
import { buildEmotionHighlightedHtml, getCaretCharOffset, setCaretCharOffset } from '../lib/highlightEditor';

export function TextInputPanel() {
  const text = useTtsStudioStore((s) => s.text);
  const setText = useTtsStudioStore((s) => s.setText);
  const editorRef = useTextareaRef();
  const [isFocused, setIsFocused] = useState(false);

  // Đồng bộ nội dung DOM khi `text` đổi từ NGOÀI component này (vd EmotionInsert chèn thẻ, hoặc
  // load lại từ store) — giữ nguyên vị trí con trỏ nếu đang focus, tránh gián đoạn khi đang gõ.
  // Cùng pattern TemplateEditor.tsx's effect đồng bộ value.
  //
  // Dùng `innerText` (KHÔNG phải `textContent`) — khi Enter, Chromium tự chèn <div>/<br> cho dòng
  // mới, nhưng textContent nối liền text của mọi node con mà KHÔNG thêm ký tự phân cách nào giữa
  // các block, khiến xuống dòng bị mất ngay khi đọc lại (bug thật: Enter "không có tác dụng gì",
  // 2026-07-24) — innerText tôn trọng ranh giới block-level, tự trả về đúng "\n". Vì mỗi lần
  // input đều re-render lại innerHTML từ `val` (chứa "\n" literal, hiển thị đúng nhờ
  // whitespace-pre-wrap bên dưới) thay vì giữ nguyên cấu trúc <div> lộn xộn mà trình duyệt tự tạo,
  // DOM luôn được "chuẩn hoá" về 1 text node duy nhất — offset của getCaretCharOffset/
  // setCaretCharOffset (tính trên text node, không phải block) luôn khớp chỉ số ký tự trong
  // `val`/`text`, không lệch. LƯU Ý: JSDOM (vitest) không implement innerText layout-aware như
  // trình duyệt thật — test hiện tại không gõ multi-line nên không bị ảnh hưởng, nhưng test mới
  // cần gõ Enter/nhiều dòng sẽ cần jsdom polyfill hoặc chạy trong môi trường khác.
  useEffect(() => {
    const el = editorRef?.current;
    if (!el) return;
    const currentText = el.innerText ?? '';
    if (currentText === text) return;
    const caret = isFocused ? getCaretCharOffset(el) : null;
    el.innerHTML = buildEmotionHighlightedHtml(text);
    if (caret !== null) setCaretCharOffset(el, Math.min(caret, text.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ re-sync khi `text` đổi từ ngoài
  }, [text, editorRef]);

  function handleInput(e: React.FormEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const val = el.innerText ?? '';
    const caret = getCaretCharOffset(el);
    setText(val);
    // Re-highlight ngay để tô màu cập nhật liền khi vừa gõ xong "]", không đợi effect ở render sau.
    el.innerHTML = buildEmotionHighlightedHtml(val);
    if (caret !== null) setCaretCharOffset(el, Math.min(caret, val.length));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, pasted);
  }

  const isEmpty = text.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <FileText size={14} /> Trình soạn thảo văn bản
        </div>
        <span className="text-2xs text-muted-foreground">{text.length} ký tự</span>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        role="textbox"
        aria-multiline="true"
        data-placeholder="Nhập nội dung cần chuyển thành giọng nói..."
        className={`min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words px-3 pb-3 text-sm text-foreground outline-none ${
          isEmpty ? 'before:content-[attr(data-placeholder)] before:text-muted-foreground before:pointer-events-none' : ''
        }`}
      />
    </div>
  );
}
