// Tool registry — mỗi công cụ (select/move/text/image/shape/loop/hand-pan...) xử lý sự kiện
// con trỏ THÔ và SINH RA command, không tự sửa state (23-editor-core-architecture.md §2.3).
// Canvas free-drag tự viết pointer-event (không dùng dnd-kit — xem §5 file 23: dnd-kit để dành
// cho bảng selector kéo-thả GĐ4b, không hợp cho canvas tự do).

import type { EditorCommand } from './history.js';
import type { EditorState } from './state.js';

export interface PointerPoint {
  /** Toạ độ canvas chuẩn (px refW/refH) — tool KHÔNG cần biết zoom/pan, đã quy đổi sẵn. */
  x: number;
  y: number;
}

export interface ToolContext {
  state: EditorState;
  dispatch(cmd: EditorCommand): void;
  /** Snap helper — tool tự quyết có gọi hay không (VD tool 'hand' không cần snap). */
  snapThreshold: number;
}

export interface EditorTool {
  id: EditorState['tool'];
  cursor?: string;
  onPointerDown?(point: PointerPoint, ctx: ToolContext): void;
  onPointerMove?(point: PointerPoint, ctx: ToolContext): void;
  onPointerUp?(point: PointerPoint, ctx: ToolContext): void;
}

/**
 * Registry đơn giản: Map id → EditorTool. Không dùng class phức tạp — đăng ký thêm tool mới =
 * gọi `registerTool`, không sửa lõi (23 §2.6 "registry đầy đủ").
 */
export class ToolRegistry {
  private tools = new Map<string, EditorTool>();

  register(tool: EditorTool): void {
    this.tools.set(tool.id, tool);
  }

  get(id: string): EditorTool | undefined {
    return this.tools.get(id);
  }

  list(): EditorTool[] {
    return [...this.tools.values()];
  }
}
