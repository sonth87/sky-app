/**
 * AppModule — contract mỗi app con phải implement.
 * Xem docs/reference/contract-reference.md §AppModule, §PlatformContext.
 */
import type { ComponentType } from 'react';
import type { Capability, CapabilitySet } from './capability.js';
import type { EntitlementSet } from './entitlement.js';
import type { EventBus } from './event-bus.js';
import type { ServiceRegistry } from './service-registry.js';

/**
 * Menu bar khai báo bởi app — device-layout tự vẽ khác nhau theo platform-mode
 * (macOS: top menu bar toàn cục; Windows/iPad: menu bar riêng dưới title bar
 * mỗi cửa sổ; iPhone/Android: hamburger + bottom-sheet). Cấu trúc trùng
 * device-layout's MenuBarMenu/MenuBarItem theo chủ đích (structural typing,
 * không import ngược từ device-layout — kernel giữ độc lập, giống cách
 * hasMenuBar/hasStatusBar bên dưới không phụ thuộc type device-layout).
 */
export interface AppMenuBarItem {
  key: string;
  label: string;
  /** Dispatch qua CustomEvent 'app:menu:action' — xử lý trong AppModule.render qua device-layout's useMenuAction(appId, handler). */
  action?: string;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
  children?: AppMenuBarItem[];
}

export interface AppMenuBarMenu {
  label: string;
  items: AppMenuBarItem[];
}

export interface AppWindowConfig {
  defaultSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  hasMenuBar?: boolean;
  hasStatusBar?: boolean;
  /** Trên theme iOS/Android của device-layout, luôn mở fullscreen */
  mobileFullscreen?: boolean;
  /** Khai menu app-aware — xem docs guide tích hợp menu của device-layout. */
  menuBarMenus?: AppMenuBarMenu[];
  /**
   * Item tuỳ chỉnh cho phần GIỮA menu tên app (cột đậm đầu tiên, kiểu macOS
   * app menu — VD "Ceremony"). Menu đó vốn CỐ ĐỊNH: "About {app}" (trên
   * cùng) rồi "Quit {app}" (dưới cùng) không đổi được — phần giữa mặc định
   * là placeholder macOS bị disable (Services/Hide/Hide Others/Show All),
   * không có ý nghĩa gì với hầu hết app. Khai field này THAY THẾ HOÀN TOÀN
   * khối placeholder đó bằng danh sách item của app (device-layout
   * `AppNameDropdown.tsx`, package `@sonth87/device-layout` ≥0.2.6.
   * Dispatch qua CustomEvent 'app:menu:action' giống `menuBarMenus`.
   */
  appNameMenuExtraItems?: AppMenuBarItem[];
}

export interface PlatformContext {
  env: 'electron' | 'web';
  capabilities: CapabilitySet;
  services: ServiceRegistry;
  events: EventBus;
  entitlements: EntitlementSet;
  /** Resolve đường dẫn asset theo môi trường (Electron resources vs Web public/CDN) */
  assetUrl(path: string): string;
}

export interface AppContentProps {
  appId: string;
  windowId: string;
  platform: PlatformContext;
  /**
   * True khi app này đang là app active/focus trong shell (R2: chỉ 1 app
   * active tại 1 thời điểm — xem docs/architecture/overview.md). Dùng để
   * gate global side-effect mà app không nên chạy khi không active — ví dụ
   * global keyboard listener (card reader) hay native OS menu handler.
   */
  isActive: boolean;
}

export interface AppModule {
  id: string;
  name: string;
  /** "lucide:IconName" hoặc "/path/to/icon.svg" */
  icon: string;
  category?: string;
  window?: AppWindowConfig;

  /** Capability môi trường cần có để app hoạt động đầy đủ */
  requiredCapabilities: Capability[];
  /** Service (qua ServiceRegistry) phải sẵn sàng trước khi mở app */
  requiredServices: string[];
  /** Feature key để EntitlementGate kiểm; bỏ qua = miễn phí, luôn mở được */
  entitlement?: string;

  render: ComponentType<AppContentProps>;
  activate?(ctx: PlatformContext): Promise<void>;
  deactivate?(): Promise<void>;
}
