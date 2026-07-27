// Keyboard shortcut cho canvas — CHỈ active khi phần tử canvas (hoặc con của nó) đang có focus
// (tabIndex + onKeyDown gắn trực tiếp, KHÔNG dùng window listener toàn cục) — tránh xung đột
// với input/textarea trong modal khác hoặc chính property panel đang gõ dở (VD gõ Backspace
// trong textarea content không được hiểu nhầm thành "xoá item").

import { useCallback, useRef } from 'react';
import type { LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import { addItemCommand, moveItemCommand, removeItemCommand } from '@sky-app/layout-editor-core';
import type { Editor } from '@sky-app/layout-editor-core';

const ARROW_STEP = 1;
const ARROW_STEP_FAST = 10; // giữ Shift

let pasteIdCounter = 0;
function nextPasteId(prefix: string): string {
  pasteIdCounter += 1;
  return `${prefix}_paste_${pasteIdCounter}`;
}

export function useCanvasKeyboardShortcuts(editor: Editor, variant: LayoutVariant, onTogglePanels?: () => void) {
  const clipboardRef = useRef<LayoutItem | null>(null);

  return useCallback(
    (e: React.KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey; // Ctrl (Windows/Linux) hoặc Cmd (macOS)
      const state = editor.store.getState();

      // Ctrl/Cmd+\ — toggle 2 panel trái/phải, hoạt động cả khi không có selection.
      if (isMod && e.key === '\\') {
        e.preventDefault();
        onTogglePanels?.();
        return;
      }

      // Ctrl/Cmd+Z (undo) / Ctrl/Cmd+Shift+Z hoặc Ctrl+Y (redo) — chuẩn công cụ thiết kế.
      if (isMod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (isMod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        state.redo();
        return;
      }

      const selectedId = state.selection[0];
      const selectedItem = selectedId ? variant.items.find((i) => i.id === selectedId) : undefined;

      // Delete/Backspace — xoá item đang chọn.
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItem) {
        e.preventDefault();
        state.dispatch(removeItemCommand(variant.aspect.id, selectedItem.id));
        return;
      }

      // Ctrl/Cmd+C — copy item đang chọn vào clipboard NỘI BỘ (không dùng Clipboard API thật,
      // vì chỉ cần dán lại trong CÙNG phiên editor, tránh xin quyền clipboard hệ thống).
      if (isMod && e.key.toLowerCase() === 'c' && selectedItem) {
        e.preventDefault();
        clipboardRef.current = selectedItem;
        return;
      }

      // Ctrl/Cmd+V — dán item đã copy, lệch 20px để không đè khít lên bản gốc (dễ nhận biết vừa dán).
      if (isMod && e.key.toLowerCase() === 'v' && clipboardRef.current) {
        e.preventDefault();
        const source = clipboardRef.current;
        const pasted: LayoutItem = { ...source, id: nextPasteId(source.type), box: { ...source.box, x: source.box.x + 20, y: source.box.y + 20 } };
        state.dispatch(addItemCommand(variant.aspect.id, pasted));
        return;
      }

      // Mũi tên — di chuyển item đang chọn (1px thường, 10px giữ Shift).
      if (selectedItem && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const step = e.shiftKey ? ARROW_STEP_FAST : ARROW_STEP;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const from = selectedItem.box;
        const to = { ...from, x: from.x + dx, y: from.y + dy };
        state.dispatch(moveItemCommand(variant.aspect.id, selectedItem.id, from, to));
        return;
      }
    },
    [editor, variant, onTogglePanels],
  );
}
