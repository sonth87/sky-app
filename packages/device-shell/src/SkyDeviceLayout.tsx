import { useMemo } from 'react';
import type { AppModule, PlatformContext } from '@sky-app/kernel';
import { APPS_CONFIG, DeviceLayout, type AppConfig, type ImportWallpaperFn, type WallpaperConfig } from '@sonth87/device-layout';
import { toDeviceAppConfigs } from './to-device-app-config.js';
import { type BuiltInAppId } from './built-in-apps.js';

export interface SkyDeviceLayoutProps {
  apps: AppModule[];
  platform: PlatformContext;
  /** Base URL for device-layout's own assets (wallpapers, icons). Forwarded as-is. */
  assetBaseUrl?: string;
  /**
   * device-layout's built-in demo apps (Finder, Terminal, Settings,
   * Browser, TextEdit, Clock, Notes, Photos, Music, Calendar, Messages) —
   * on by default (`true`), matching how ThemeProvider behaves when no
   * `apps` prop is passed at all. Pass `false` to hide all of them, or
   * `{ exclude: [...] }` to hide specific ones by id (autocompleted —
   * see BUILT_IN_APP_IDS in built-in-apps.ts).
   */
  builtInApps?: boolean | { exclude: BuiltInAppId[] };
  /**
   * Implements the Wallpaper picker's "Add a Photo" (Electron: native file
   * picker + copy into userData — see apps/shell-electron/src/main.tsx).
   * Omit on platforms without file-system access (e.g. web) to hide the
   * button — forwarded as-is to DeviceLayout.
   */
  onImportWallpaper?: ImportWallpaperFn;
  /**
   * Overrides device-layout's built-in "Pictures" wallpaper set — omit to
   * use device-layout's own full set. Forwarded as-is to DeviceLayout (see
   * apps/shell-electron/src/wallpapers.ts for why sky-app ships a subset).
   */
  wallpapers?: WallpaperConfig[];
}

function resolveBuiltInApps(option: SkyDeviceLayoutProps['builtInApps']): AppConfig[] {
  if (option === false) return [];
  if (option === true || option === undefined) return APPS_CONFIG;
  const excluded = new Set<string>(option.exclude);
  return APPS_CONFIG.filter((app) => !excluded.has(app.id));
}

/**
 * Entry point sky-app's shells (Electron/Web) render: takes the kernel's
 * AppModule[] + PlatformContext and mounts them inside device-layout's
 * desktop-OS chrome (window manager, dock, menu bar).
 */
export function SkyDeviceLayout({ apps, platform, assetBaseUrl, builtInApps, onImportWallpaper, wallpapers }: SkyDeviceLayoutProps) {
  const deviceApps = useMemo(() => {
    const builtIn = resolveBuiltInApps(builtInApps);
    return [...builtIn, ...toDeviceAppConfigs(apps, platform)];
  }, [apps, platform, builtInApps]);

  return (
    <DeviceLayout
      apps={deviceApps}
      assetBaseUrl={assetBaseUrl}
      onImportWallpaper={onImportWallpaper}
      wallpapers={wallpapers}
    />
  );
}
