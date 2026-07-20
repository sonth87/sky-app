// Inline rich-text editor overlay cho TextItem — Bước 12 kế hoạch resize/rotate. Mở khi double-
// click TextItem trên canvas (Canvas.tsx dispatch qua onEnterTextEdit). Định vị theo item.box
// (KHÔNG xoay theo rotation — chấp nhận được, tương tự giới hạn resize/snap đã ghi nhận ở Bước
// 3/4: overlay không xoay theo trục cục bộ đã xoay, đơn giản hoá có chủ đích).
//
// VIẾT LẠI 2026-07-19 sau khi phát hiện qua trải nghiệm thật: overlay cũ hard-code background
// trắng + fontSize không scale theo zoom + không có toolbar định dạng + đóng không ổn định. Khảo
// sát my-builder's InlineTextEditor/TextEditToolbar (packages/builder-editor) và áp dụng lại đúng
// hướng của họ — không copy code (2 project khác kiến trúc: my-builder dùng contentEditable trên
// DOM riêng + computed style từ chính DOM gốc; ở đây item KHÔNG render qua DOM thật độc lập được
// (React re-render toàn bộ Canvas), nên style overlay lấy từ computeTextStyle(item, fScale) DÙNG
// CHUNG với ItemContent's cách tính (Canvas.tsx) thay vì getComputedStyle() — cùng hiệu quả, khớp
// 100% với style lúc hiển thị bình thường, không lệch màu/size/font):
//   1. Style overlay = computeTextStyle(item, fScale) — CHÍNH XÁC style item lúc không sửa, không
//      hard-code color/background/fontSize riêng như bản cũ.
//   2. Zoom xử lý bằng CSS `transform: scale(zoomScale)` (transformOrigin góc trên-trái, khớp
//      cách originX/Y neo tại (0,0)) — KHÔNG nhân zoomScale vào fontSize/kích thước thủ công.
//      screenBox (Canvas.tsx) vì vậy chỉ chứa kích thước/vị trí CHƯA zoom, transform lo phần còn
//      lại — tránh nhân zoom 2 lần (bug "text quá to" của bản cũ).
//   3. Nền trong suốt (không phải trắng cứng) — chỉ viền + 1 lớp overlay mờ rất nhẹ để phân biệt
//      đang ở chế độ sửa, giữ đúng màu nền thật của variant/item phía sau.
//   4. Toolbar định dạng nổi (TextEditToolbar.tsx) — Bold/Italic/Strike qua Tiptap chain commands.
//   5. Đóng bằng `pointerdown` CAPTURE-PHASE trên window (thay vì `mousedown` bubble-phase) + guard
//      bằng data-attribute (`data-text-edit-toolbar`, mention-popup) — tránh double-handling khi
//      click bên trong toolbar/popup bị hiểu nhầm là "click ra ngoài".

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { Extension } from '@tiptap/core';
import type { RichTextContent, TextItem, TiptapJSONDoc } from '@sky-app/slide-shared';
import { computeTextStyle } from './Canvas.js';
import { TextEditToolbar } from './TextEditToolbar.js';

export interface TiptapTextEditorProps {
  item: TextItem;
  /** Vị trí + kích thước MÀN HÌNH CHƯA nhân zoomScale (originX/Y + layoutScaleX/Y thuần) — phần
   * zoom được overlay tự áp bằng CSS transform, xem comment đầu file điểm 2. */
  screenBox: { left: number; top: number; width: number; height: number };
  /** Layout-scale KHÔNG gồm zoom (min(layoutScaleX, layoutScaleY), giống fScale dùng bởi
   * ItemContent) — dùng để tính computeTextStyle khớp style item lúc hiển thị bình thường. */
  fScale: number;
  /** Hệ số zoom thủ công hiện tại (totalScale = fitScale × viewport.zoom) — áp qua CSS transform,
   * KHÔNG nhân vào fontSize/kích thước. */
  zoomScale: number;
  /** Gợi ý token khi gõ @ — TÁI DÙNG collectUsedTokenKeys đã có trong Flyout.tsx (không viết lại
   * autocomplete logic riêng lần 2, xem DoD Bước 12). */
  tokenSuggestions: string[];
  onTokenInserted?: (key: string) => void;
  /** Gọi mỗi lần nội dung đổi — {json, html} lấy từ editor.getJSON()/getHTML() (browser thật, có
   * DOM, KHÔNG cần @tiptap/html/generateHTML — xem RichTextContent's comment ở slide-shared/
   * types.ts). `html` sinh SẴN ở đây để renderer.tsx/Canvas.tsx dùng thẳng, không phải tính lại
   * lúc render. */
  onSave: (content: RichTextContent) => void;
  onClose: () => void;
}

/** Extension MỞ RỘNG StarterKit chỉ để đăng ký mention-suggestion @var — KHÔNG tạo node type
 * riêng cho mention (không cần thiết ở phạm vi này, token vẫn là TEXT THƯỜNG trong tài liệu,
 * chỉ khác là được chèn qua autocomplete thay vì gõ tay) — giữ đúng nguyên tắc content vẫn
 * duyệt được bằng walkTextNodes (tokens.ts) như text node bình thường. */
function createTokenSuggestionExtension(getSuggestions: () => string[], onInserted?: (key: string) => void) {
  return Extension.create({
    name: 'tokenSuggestion',
    addProseMirrorPlugins() {
      const options: Omit<SuggestionOptions, 'editor'> = {
        char: '@',
        items: ({ query }) => getSuggestions().filter((k) => k.toLowerCase().startsWith(query.toLowerCase())).slice(0, 8),
        render: () => {
          let popup: HTMLDivElement | null = null;
          return {
            onStart: (props) => {
              popup = document.createElement('div');
              popup.setAttribute('data-text-edit-toolbar', '');
              popup.style.cssText =
                'position:absolute;background:#fff;border:1px solid #e6e6ee;border-radius:8px;box-shadow:0 10px 26px rgba(20,20,40,.25);padding:4px;z-index:10000;font-size:12px;min-width:120px;';
              document.body.appendChild(popup);
              renderItems(popup, props.items as string[], props.command);
              positionPopup(popup, props.clientRect?.());
            },
            onUpdate: (props) => {
              if (!popup) return;
              renderItems(popup, props.items as string[], props.command);
              positionPopup(popup, props.clientRect?.());
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                popup?.remove();
                popup = null;
                return true;
              }
              return false;
            },
            onExit: () => {
              popup?.remove();
              popup = null;
            },
          };

          function renderItems(el: HTMLDivElement, items: string[], command: (props: { id: string }) => void) {
            el.innerHTML = '';
            if (items.length === 0) {
              el.style.display = 'none';
              return;
            }
            el.style.display = 'block';
            for (const key of items) {
              const row = document.createElement('div');
              row.textContent = `@${key}`;
              row.style.cssText = 'padding:5px 8px;border-radius:5px;cursor:pointer;color:#c07a1e;font-weight:600;';
              row.onmouseenter = () => (row.style.background = 'color-mix(in srgb, var(--accent-color, #4b57e6) 10%, transparent)');
              row.onmouseleave = () => (row.style.background = 'transparent');
              row.onmousedown = (e) => {
                e.preventDefault();
                command({ id: key });
                onInserted?.(key);
              };
              el.appendChild(row);
            }
          }

          function positionPopup(el: HTMLDivElement, rect: DOMRect | null | undefined) {
            if (!rect) return;
            el.style.left = `${rect.left}px`;
            el.style.top = `${rect.bottom + 4}px`;
          }
        },
        command: ({ editor, range, props }) => {
          const key = (props as { id: string }).id;
          editor.chain().focus().insertContentAt(range, `@${key} `).run();
        },
      };
      return [Suggestion({ editor: this.editor, ...options })];
    },
  });
}

export function TiptapTextEditor({ item, screenBox, fScale, zoomScale, tokenSuggestions, onTokenInserted, onSave, onClose }: TiptapTextEditorProps) {
  const suggestionsRef = useRef(tokenSuggestions);
  suggestionsRef.current = tokenSuggestions;
  const containerRef = useRef<HTMLDivElement>(null);
  const committedRef = useRef(false);
  const [tokenExt] = useState(() => createTokenSuggestionExtension(() => suggestionsRef.current, onTokenInserted));

  // content string (layout cũ/chưa qua rich-text editor) → Tiptap tự parse plain text thành 1
  // đoạn văn lúc khởi tạo. RichTextContent (đã qua editor trước đó) → dùng .json nguyên trạng.
  const initialContent = typeof item.content === 'string' ? item.content : item.content.json;

  const editor = useEditor({
    extensions: [StarterKit, tokenExt],
    content: initialContent,
    autofocus: 'end',
    onUpdate: ({ editor: ed }) => {
      onSave({ json: ed.getJSON() as TiptapJSONDoc, html: ed.getHTML() });
    },
  });

  useEffect(() => {
    function commit() {
      if (committedRef.current) return;
      committedRef.current = true;
      onClose();
    }
    function onPointerDownCapture(e: PointerEvent) {
      const target = e.target as HTMLElement;
      // Bỏ qua click bên trong overlay chính nó, toolbar định dạng, hoặc mention-popup (cả 2 tự
      // đánh dấu data-text-edit-toolbar) — chỉ những click THẬT SỰ ra ngoài mới đóng editor.
      if (containerRef.current?.contains(target)) return;
      if (target.closest('[data-text-edit-toolbar]')) return;
      commit();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') commit();
    }
    // Đợi 1 tick — double-click MỞ editor cũng là 1 click, nếu gắn listener ngay lập tức sự kiện
    // click ĐANG diễn ra sẽ bị bắt luôn thành "click ra ngoài", đóng editor ngay khi vừa mở.
    // CAPTURE-PHASE (tham số thứ 3 = true, khác bản cũ dùng bubble-phase mousedown thường) —
    // pattern my-builder: bắt sự kiện TRƯỚC KHI nó bubble lên tới bất kỳ stopPropagation() nào
    // trên đường đi (VD CanvasItemView's onPointerDown tự stopPropagation), đảm bảo đóng được
    // editor dù click vào 1 item khác trên canvas.
    const t = setTimeout(() => {
      window.addEventListener('pointerdown', onPointerDownCapture, true);
      window.addEventListener('keydown', onKeyDown);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', onPointerDownCapture, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  useEffect(() => () => editor?.destroy(), [editor]);

  if (!editor) return null;

  const textStyle = computeTextStyle(item, fScale);
  // Overlay tự scale từ góc trên-trái (transformOrigin: 'top left') — kích thước THẬT trên màn
  // hình sau scale là screenBox.width/height × zoomScale, neo tại CÙNG điểm screenBox.left/top
  // (transformOrigin không dịch điểm gốc). TextEditToolbar render NGOÀI lớp transform này (toolbar
  // giữ kích thước cố định bất kể zoom, cùng lý do ItemToolbar.tsx không render trong artEl) nên
  // cần toạ độ ĐÃ zoom để bám đúng vị trí, khác overlay chính dùng screenBox thô.
  const zoomedAnchorBox = {
    left: screenBox.left,
    top: screenBox.top,
    width: screenBox.width * zoomScale,
    height: screenBox.height * zoomScale,
  };

  return (
    <>
      <div
        ref={containerRef}
        data-testid="tiptap-text-editor"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          left: screenBox.left,
          top: screenBox.top,
          width: screenBox.width,
          height: screenBox.height,
          transform: `scale(${zoomScale})`,
          transformOrigin: 'top left',
          background: 'color-mix(in srgb, var(--accent-color, #4b57e6) 6%, transparent)',
          border: '2px solid var(--accent-color, #4b57e6)',
          borderRadius: 4,
          overflow: 'auto',
          zIndex: 1002,
          padding: 4,
          boxSizing: 'border-box',
          cursor: 'text',
          ...textStyle,
        }}
      >
        <EditorContent editor={editor} />
      </div>
      <TextEditToolbar editor={editor} anchorBox={zoomedAnchorBox} />
    </>
  );
}
