// Hook nối vanilla Zustand store (editor-core, KHÔNG React) vào React qua `useStore` —
// editor-core giữ nguyên thuần (23-editor-core-architecture.md §1: "logic editor không phụ
// thuộc React"), tầng này (modules/layout-designer) là nơi DUY NHẤT biết tới React.

import { useMemo } from 'react';
import { useStore } from 'zustand';
import { createEditor, type CreateEditorOptions, type Editor, type EditorStoreState } from '@sky-app/layout-editor-core';

export function useCreateEditor(options: CreateEditorOptions): Editor {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- editor chỉ tạo 1 LẦN cho mỗi phiên
  // sửa layout; đổi `doc` sau khi mount phải đi qua command (dispatch), không phải re-init.
  return useMemo(() => createEditor(options), []);
}

/** Selector hook tiện dụng — subscribe 1 phần EditorStoreState, tránh re-render toàn bộ canvas. */
export function useEditorState<T>(editor: Editor, selector: (state: EditorStoreState) => T): T {
  return useStore(editor.store, selector);
}
