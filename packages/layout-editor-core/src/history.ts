// Command registry + undo/redo/history — trụ cột quan trọng nhất của editor-core theo
// docs/roadmap/plans/layout-designer/23-editor-core-architecture.md §2.2. Mọi thay đổi lên
// `doc` phải đi qua 1 EditorCommand, KHÔNG sửa state trực tiếp — undo/redo miễn phí, history
// là danh sách command đã chạy (hiện được panel History).

import type { EditorState } from './state.js';

export interface EditorCommand {
  /** "move-item" | "add-item" | "resize" | "edit-text" | "add-variant"... */
  type: string;
  apply(state: EditorState): EditorState;
  invert(state: EditorState): EditorState;
  /**
   * Gộp command liên tiếp CÙNG LOẠI thành 1 undo (VD kéo item 60 frame/giây → 1 undo, không
   * phải 60 lần Ctrl+Z). Trả command gộp nếu gộp được, `null` nếu không (đẩy thành entry mới).
   */
  coalesceWith?(prev: EditorCommand): EditorCommand | null;
}

export interface HistorySnapshot {
  pastLength: number;
  futureLength: number;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * `execute` = apply + push past + clear future (chuẩn undo/redo stack — làm 1 thao tác mới sau
 * khi đã undo thì bỏ hẳn nhánh "future" cũ, không giữ redo của 1 nhánh lịch sử đã rẽ nhánh).
 */
export class HistoryStack {
  private past: EditorCommand[] = [];
  private future: EditorCommand[] = [];

  execute(cmd: EditorCommand, state: EditorState): EditorState {
    const last = this.past[this.past.length - 1];
    // cmd (MỚI) gọi coalesceWith, nhận last (CŨ) làm tham số `prev` — khớp đúng docstring
    // EditorCommand.coalesceWith ở trên: "prev = command đứng trước nó trong past".
    const coalesced = last ? cmd.coalesceWith?.(last) : undefined;
    const nextState = cmd.apply(state);

    if (coalesced) {
      // Gộp vào entry cuối — KHÔNG tăng số lượng entry trong history (1 undo lùi hết cả chuỗi kéo).
      this.past[this.past.length - 1] = coalesced;
    } else {
      this.past.push(cmd);
    }
    this.future = [];
    return nextState;
  }

  undo(state: EditorState): EditorState {
    const cmd = this.past.pop();
    if (!cmd) return state;
    this.future.push(cmd);
    return cmd.invert(state);
  }

  redo(state: EditorState): EditorState {
    const cmd = this.future.pop();
    if (!cmd) return state;
    this.past.push(cmd);
    return cmd.apply(state);
  }

  /** Panel History (file 23 §2.2: "hiện được panel History, xem/nhảy tới 1 bước bất kỳ"). */
  list(): readonly EditorCommand[] {
    return this.past;
  }

  snapshot(): HistorySnapshot {
    return {
      pastLength: this.past.length,
      futureLength: this.future.length,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
    };
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
