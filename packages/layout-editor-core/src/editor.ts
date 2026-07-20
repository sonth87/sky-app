// createEditor — điểm khởi tạo DUY NHẤT gom mọi registry (23-editor-core-architecture.md §2.6:
// "Registry tổng — điểm Sonth nhấn đăng ký, quản lý registry đầy đủ"). UI React (sub-bước 2.3)
// gọi createEditor() 1 lần, dùng store.getState()/subscribe hoặc hook Zustand để render.

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { LayoutContent } from '@sky-app/slide-shared';
import { HistoryStack, type EditorCommand, type HistorySnapshot } from './history.js';
import { createInitialState, type EditorState, type ToolId, type Viewport } from './state.js';
import { ItemTypeRegistry, registerDefaultItemTypes } from './item-type.js';
import { ToolRegistry } from './tool.js';
import type { EditorTool } from './tool.js';

export interface EditorStoreState extends EditorState {
  dispatch(cmd: EditorCommand): void;
  undo(): void;
  redo(): void;
  setTool(tool: ToolId): void;
  setSelection(ids: string[]): void;
  setActiveVariant(variantId: string): void;
  setViewport(viewport: Viewport): void;
  /** Vào/thoát chế độ "sửa mẫu" LoopItem (Bước 10) — undefined để thoát. Luôn CLEAR selection
   * (cả lúc vào lẫn ra) — item chọn từ ngữ cảnh cũ (variant.items hoặc itemTemplate khác) không
   * còn hợp lệ ở ngữ cảnh mới, giữ lại sẽ khiến PropertyPanel hiện nhầm/tìm không thấy gì. */
  setEditingLoop(loopId: string | undefined): void;
}

export interface CreateEditorOptions {
  doc: LayoutContent;
  activeVariantId?: string;
  /** Đăng ký thêm tool (VD UI React implement pointer-event thật ở 2.3). Mặc định rỗng. */
  tools?: EditorTool[];
  /** Ghi đè/mở rộng item-type registry mặc định (5 loại chuẩn). */
  extraItemTypes?: Parameters<ItemTypeRegistry['register']>[0][];
}

export interface Editor {
  store: StoreApi<EditorStoreState>;
  history: HistoryStack;
  tools: ToolRegistry;
  itemTypes: ItemTypeRegistry;
  historySnapshot(): HistorySnapshot;
}

/** Registry tổng (file 23 §2.6) — 1 nơi khởi tạo commands/tools/itemTypes/snapConfig cho editor. */
export function createEditor(options: CreateEditorOptions): Editor {
  const history = new HistoryStack();
  const tools = new ToolRegistry();
  const itemTypes = new ItemTypeRegistry();

  registerDefaultItemTypes(itemTypes);
  for (const tool of options.tools ?? []) tools.register(tool);
  for (const def of options.extraItemTypes ?? []) itemTypes.register(def);

  const store = createStore<EditorStoreState>((set) => ({
    ...createInitialState(options.doc, options.activeVariantId),

    dispatch(cmd) {
      set((state) => history.execute(cmd, state));
    },
    undo() {
      set((state) => history.undo(state));
    },
    redo() {
      set((state) => history.redo(state));
    },
    setTool(tool) {
      set({ tool });
    },
    setSelection(ids) {
      set({ selection: ids });
    },
    setActiveVariant(variantId) {
      set({ activeVariantId: variantId, selection: [] });
    },
    setViewport(viewport) {
      set({ viewport });
    },
    setEditingLoop(loopId) {
      set({ editingLoopId: loopId, selection: [] });
    },
  }));

  return {
    store,
    history,
    tools,
    itemTypes,
    historySnapshot: () => history.snapshot(),
  };
}
