import type { AppModule } from '@sky-app/kernel';
import { LayoutDesignerAppModule } from './LayoutDesignerAppModule.js';

export { LayoutDesignerApp } from './LayoutDesignerApp.js';
export type { LayoutDesignerAppProps } from './LayoutDesignerApp.js';
export { LayoutDesignerAppModule } from './LayoutDesignerAppModule.js';

/**
 * AppModule đăng ký vào shell (Electron/Web) — xem apps/shell-electron/src/main.tsx,
 * apps/shell-web/src/main.tsx's mảng `apps`. Đọc/ghi qua LayoutPort thật (persist SQLite —
 * Electron/data-service/WASM, sub-bước 2.4 đã xong), hiện chỉ 1 layout demo cố định
 * (LayoutDesignerAppModule's DEMO_LAYOUT_ID) — chọn/tạo NHIỀU layout thuộc Layout Library
 * (hoãn Giai đoạn 5). Không có entitlement gate (khác ceremonyModule) vì đây vẫn là tính năng
 * đang xây dựng, chưa phát hành.
 */
export const layoutDesignerModule: AppModule = {
  id: 'layout-designer',
  name: 'Layout Designer',
  icon: 'lucide:LayoutTemplate',
  category: 'ceremony',
  window: {
    defaultSize: { width: 1360, height: 860 },
    minSize: { width: 1024, height: 640 },
  },
  requiredCapabilities: [],
  requiredServices: [],
  render: LayoutDesignerAppModule,
};
export { Canvas } from './Canvas.js';
export type { CanvasProps } from './Canvas.js';
export { PropertyPanel } from './PropertyPanel.js';
export type { PropertyPanelProps } from './PropertyPanel.js';
export { Rail } from './Rail.js';
export type { RailGroup, RailProps } from './Rail.js';
export { Flyout, collectUsedTokenKeys } from './Flyout.js';
export type { FlyoutProps } from './Flyout.js';
export { VariableTextarea } from './VariableTextarea.js';
export type { VariableTextareaProps } from './VariableTextarea.js';
export { VersioningPanel } from './VersioningPanel.js';
export type { VersioningPanelProps } from './VersioningPanel.js';
export { useCreateEditor, useEditorState } from './useEditor.js';
export { useResolvedAssetUrl } from './useResolvedAssetUrl.js';
export { GradientEditor } from './GradientEditor.js';
export type { GradientEditorProps, GradientType, GradientStop } from './GradientEditor.js';
