import { createElement } from 'react';
import type { AppModule, PlatformContext } from '@sky-app/kernel';
import type { AppConfig, AppContentProps as DeviceAppContentProps } from '@sonth87/device-layout';

/**
 * Bridges the kernel's AppModule contract to device-layout's AppConfig.
 *
 * device-layout's <Component appId windowId> only knows about the two IDs —
 * it has no notion of PlatformContext. This wraps each AppModule's `render`
 * so the resulting component still receives `platform`, while satisfying
 * device-layout's AppContentProps shape.
 */
export function toDeviceAppConfig(app: AppModule, platform: PlatformContext): AppConfig {
  function Bridged({ appId, windowId }: DeviceAppContentProps) {
    const AppRender = app.render;
    return createElement(AppRender, { appId, windowId, platform });
  }
  Bridged.displayName = `DeviceShellBridge(${app.id})`;

  return {
    id: app.id,
    name: app.name,
    icon: app.icon,
    category: app.category,
    defaultSize: app.window?.defaultSize,
    minSize: app.window?.minSize,
    hasMenuBar: app.window?.hasMenuBar,
    hasStatusBar: app.window?.hasStatusBar,
    mobileFullscreen: app.window?.mobileFullscreen,
    render: Bridged,
  };
}

export function toDeviceAppConfigs(apps: AppModule[], platform: PlatformContext): AppConfig[] {
  return apps.map((app) => toDeviceAppConfig(app, platform));
}
