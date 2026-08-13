/**
 * Highlight thẻ cảm xúc ([cười], [thở dài], [hắng giọng]) trong ô soạn thảo bằng contentEditable
 * div — port đúng kỹ thuật của Ceremony's TemplateEditor.tsx (modules/ceremony/src/control/
 * components/TemplateEditor.tsx) cho @variable, vì <textarea> HTML thuần không có cách nào tô
 * màu 1 phần text bên trong (chỉ hiển thị plain text) — bắt buộc phải dùng contentEditable +
 * innerHTML dựng từ text, kèm quản lý vị trí con trỏ thủ công (offset ký tự, không phải DOM
 * Range) vì gán lại innerHTML luôn phá mất Range/Selection cũ.
 */

const EMOTION_TAG_REGEX = /\[(cười|thở dài|hắng giọng)\]/g;

/** Escape HTML rồi bọc mọi thẻ cảm xúc khớp trong <span> tô màu — dùng làm innerHTML. */
export function buildEmotionHighlightedHtml(text: string): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = '';
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  EMOTION_TAG_REGEX.lastIndex = 0;
  while ((match = EMOTION_TAG_REGEX.exec(text)) !== null) {
    html += escape(text.slice(lastIdx, match.index));
    html += `<span class="text-primary font-medium">${escape(match[0])}</span>`;
    lastIdx = EMOTION_TAG_REGEX.lastIndex;
  }
  html += escape(text.slice(lastIdx));
  // contentEditable cần <br> để hiển thị dòng trống cuối cùng thay vì chuỗi rỗng.
  return html.length > 0 ? html : '<br>';
}

/** Vị trí con trỏ dạng "số ký tự tính từ đầu" (offset trên text thuần) — sống sót qua việc gán
 * lại innerHTML (làm mất mọi Range cũ), khác offset trên 1 DOM node cụ thể.
 *
 * PHẢI tôn trọng ranh giới block-level giống `innerText` (không dùng `Range.toString()` — nó nối
 * text mọi node con KHÔNG thêm ký tự phân cách nào giữa các block, giống `textContent`). Khi Enter,
 * Chromium tạm thời tạo nhiều <div> con (trước khi handleInput kịp re-render lại thành 1 text node
 * phẳng) — nếu offset không cộng thêm cho mỗi ranh giới block đã đi qua, nó lệch so với `val` (lấy
 * từ `el.innerText`, CÓ tính "\n" ở ranh giới) đúng bằng số dòng đã vượt qua, khiến con trỏ bị đặt
 * lùi lại sau khi re-render (bug thật: Enter xuống dòng đúng nhưng con trỏ nhảy về vị trí cũ,
 * 2026-07-24). Duyệt cây bằng TreeWalker để tự đếm, cộng 1 mỗi khi rời một block-level element
 * (DIV/P/BR) đã có nội dung trước nó — cùng cách trình duyệt tính `innerText`. */
export function getCaretCharOffset(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  let offset = 0;
  let found = false;
  let sawBlockContent = false;

  const visit = (node: Node): boolean => {
    if (node === range.startContainer) {
      offset += node.nodeType === Node.TEXT_NODE ? range.startOffset : 0;
      found = true;
      return true;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (len > 0) sawBlockContent = true;
      offset += len;
      return false;
    }
    if (node.nodeName === 'BR') {
      offset += 1;
      return false;
    }
    const isBlock = node.nodeName === 'DIV' || node.nodeName === 'P';
    if (isBlock && sawBlockContent) {
      offset += 1; // ranh giới sang block mới — tương đương 1 ký tự "\n" trong innerText
      sawBlockContent = false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (visit(child)) return true;
    }
    return false;
  };

  visit(root);
  return found ? offset : null;
}

export function setCaretCharOffset(root: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
    node = walker.nextNode();
  }
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}
