import type { AppModule } from '@sky-app/kernel';
import { LayoutDesignerAppModule } from './LayoutDesignerAppModule.js';
import { LayoutDesignerIcon } from './components/Icon/LayoutDesignerIcon.js';

export { LayoutDesignerApp } from './components/LayoutDesignerApp.js';
export type { LayoutDesignerAppProps } from './components/LayoutDesignerApp.js';
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
  icon: LayoutDesignerIcon,
  iconColor: ['#a855f7', '#6366f1'],
  category: 'ceremony',
  window: {
    defaultSize: { width: 1360, height: 860 },
    minSize: { width: 1024, height: 640 },
  },
  requiredCapabilities: [],
  requiredServices: [],
  render: LayoutDesignerAppModule,
};
export { Canvas } from './components/Canvas/Canvas.js';
export type { CanvasProps } from './components/Canvas/Canvas.js';
export { PropertyPanel } from './components/PropertyPanel/PropertyPanel.js';
export type { PropertyPanelProps } from './components/PropertyPanel/PropertyPanel.js';
export { Rail } from './components/Rail.js';
export type { RailGroup, RailProps } from './components/Rail.js';
export { Flyout } from './components/Flyout/Flyout.js';
export { collectUsedTokenKeys } from './components/Flyout/helpers.js';
export type { FlyoutProps } from './components/Flyout/Flyout.js';
export { VariableTextarea } from './components/VariableTextarea.js';
export type { VariableTextareaProps } from './components/VariableTextarea.js';
export { VersioningPanel } from './components/VersioningPanel.js';
export type { VersioningPanelProps } from './components/VersioningPanel.js';
export { useCreateEditor, useEditorState } from './hooks/useEditor.js';
export { useResolvedAssetUrl } from './hooks/useResolvedAssetUrl.js';
export { GradientEditor } from './components/GradientEditor/GradientEditor.js';
export type { GradientEditorProps } from './components/GradientEditor/GradientEditor.js';
export type { GradientType, GradientStop } from './components/GradientEditor/helpers.js';
export { cn } from './lib/cn.js';
