import { createElement } from 'react';
import type { AppModule, PlatformContext } from '@sky-app/kernel';
import { createEntitlementGate } from '@sky-app/kernel';
import type { AppConfig, AppContentProps as DeviceAppContentProps } from '@sonth87/device-layout';
import { useStore } from '@sonth87/device-layout';
// Side-effect type-only imports — device-layout's useStore type
// (Mutate<StoreApi<RootStore>, [['zustand/immer', ...], ['zustand/persist', ...]]>)
// needs zustand's ambient StoreMutators module augmentation for these two
// middlewares to resolve. TypeScript's declaration emitter elides that
// augmentation from device-layout's own .d.ts (not referenced by any
// emitted signature there), so this package must trigger it itself by
// importing the modules that declare it — otherwise `useStore(selector)`
// fails with "Type 'never' has no call signatures".
import type {} from 'zustand/middleware/immer';
import type {} from 'zustand/middleware/persist';

/**
 * Bridges the kernel's AppModule contract to device-layout's AppConfig.
 *
 * device-layout's <Component appId windowId> only knows about the two IDs —
 * it has no notion of PlatformContext or focus state. This wraps each
 * AppModule's `render` so the resulting component receives `platform` +
 * `isActive` (derived from device-layout's own activeAppId store), while
 * satisfying device-layout's AppContentProps shape.
 */
export function toDeviceAppConfig(app: AppModule, platform: PlatformContext): AppConfig {
  function Bridged({ appId, windowId }: DeviceAppContentProps) {
    const isActive = useStore((s) => s.activeAppId === appId);
    const AppRender = app.render;
    return createElement(AppRender, { appId, windowId, platform, isActive });
  }
  Bridged.displayName = `DeviceShellBridge(${app.id})`;

  // Tầng 1 gate (docs/guides/licensing-entitlement.md) — app thiếu entitlement
  // bị ẨN KHỎI DOCK (device-layout's IconGrid lọc bỏ hẳn AppConfig.disabled,
  // không hiện mờ như AppIcon.tsx's opacity-40 gợi ý — hành vi thật đã verify,
  // guide có thể chưa cập nhật đúng). App không khai app.entitlement luôn mở
  // được (createEntitlementGate.canOpen trả true khi entitlement undefined).
  const gate = createEntitlementGate(platform.entitlements);

  return {
    id: app.id,
    name: app.name,
    icon: app.icon,
    category: app.category,
    disabled: !gate.canOpen(app),
    defaultSize: app.window?.defaultSize,
    minSize: app.window?.minSize,
    hasMenuBar: app.window?.hasMenuBar,
    hasStatusBar: app.window?.hasStatusBar,
    mobileFullscreen: app.window?.mobileFullscreen,
    menuBarMenus: app.window?.menuBarMenus,
    render: Bridged,
  };
}

export function toDeviceAppConfigs(apps: AppModule[], platform: PlatformContext): AppConfig[] {
  return apps.map((app) => toDeviceAppConfig(app, platform));
}
