import { useMemo } from 'react';
import type { AppModule, PlatformContext } from '@sky-app/kernel';
import { DeviceLayout } from '@sonth87/device-layout';
import { toDeviceAppConfigs } from './to-device-app-config.js';

export interface SkyDeviceLayoutProps {
  apps: AppModule[];
  platform: PlatformContext;
  /** Base URL for device-layout's own assets (wallpapers, icons). Forwarded as-is. */
  assetBaseUrl?: string;
}

/**
 * Entry point sky-app's shells (Electron/Web) render: takes the kernel's
 * AppModule[] + PlatformContext and mounts them inside device-layout's
 * desktop-OS chrome (window manager, dock, menu bar).
 */
export function SkyDeviceLayout({ apps, platform, assetBaseUrl }: SkyDeviceLayoutProps) {
  const deviceApps = useMemo(() => toDeviceAppConfigs(apps, platform), [apps, platform]);

  return <DeviceLayout apps={deviceApps} assetBaseUrl={assetBaseUrl} />;
}
