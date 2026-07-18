// State store — nguồn chân lý editor (23-editor-core-architecture.md §2.1). `doc` KHÔNG bao
// giờ bị sửa trực tiếp ngoài EditorCommand.apply/invert (history.ts) — mọi tool chỉ sinh command.

import type { LayoutContent } from '@sky-app/slide-shared';

// Id của tool đang active trong toolbar — KHÁC với interface `EditorTool` (tool.ts, định nghĩa
// đầy đủ 1 công cụ: onPointerDown/Move/Up + cursor). Đặt tên riêng để không trùng ambiguous export.
export type ToolId = 'select' | 'text' | 'image' | 'shape' | 'loop' | 'ribbon' | 'hand';

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface EditorState {
  doc: LayoutContent;
  activeVariantId: string;
  /** id các item đang chọn (đa chọn) — luôn tương đối activeVariantId hiện tại. */
  selection: string[];
  viewport: Viewport;
  tool: ToolId;
}

export const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };

export function createInitialState(doc: LayoutContent, activeVariantId?: string): EditorState {
  const firstVariantId = doc.variants[0]?.aspect.id;
  return {
    doc,
    activeVariantId: activeVariantId ?? firstVariantId ?? '',
    selection: [],
    viewport: { ...DEFAULT_VIEWPORT },
    tool: 'select',
  };
}
