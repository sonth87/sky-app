import { createContext, useContext, type RefObject } from 'react';

/**
 * Ref tới ô soạn thảo của TextInputPanel — cho các component khác (vd EmotionInsert) chèn text
 * vào đúng vị trí con trỏ hiện tại. `text`/`setText` sống trong Zustand store (useTtsStudioStore)
 * nhưng vị trí con trỏ là state DOM cục bộ, không có trong store — cần ref DOM thật, không phải
 * giá trị serializable, nên tách Context riêng thay vì nhét vào store (giữ store chỉ chứa data,
 * không lẫn DOM ref — cùng lý do PortalContainerContext tách riêng khỏi store).
 *
 * Kiểu `HTMLDivElement` (không phải HTMLTextAreaElement) — ô soạn thảo dùng contentEditable div
 * để highlight thẻ cảm xúc [cười]/[thở dài]/[hắng giọng] (port kỹ thuật của Ceremony's
 * TemplateEditor.tsx cho @variable — <textarea> HTML thuần không tô màu được 1 phần text bên
 * trong, xem lib/highlightEditor.ts).
 */
const TextareaRefContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

export function useTextareaRef(): RefObject<HTMLDivElement | null> | null {
  return useContext(TextareaRefContext);
}

export { TextareaRefContext };
