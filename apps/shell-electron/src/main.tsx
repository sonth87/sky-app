import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SkyDeviceLayout } from '@sky-app/device-shell';
import { createElectronPlatform } from '@sky-app/platform-electron';
import type { ImportWallpaperFn } from '@sonth87/device-layout';
import { mockAppModule } from '@sky-app/module-mock-app';
import { ceremonyModule } from '@sky-app/module-ceremony';
import { ttsStudioModule } from '@sky-app/module-tts-studio';
import { DEV_LICENSE_PUBLIC_KEY_HEX } from '@sky-app/licensing';
import { WALLPAPERS } from './wallpapers.js';
import { updateActions } from './updates.js';
import './tailwind-layer-order.css';
import '@sonth87/device-layout/style.css';
import '@sky-app/module-ceremony/styles.css';
import '@sky-app/module-tts-studio/styles.css';

// Wallpaper picker's "Add a Photo" — opens a native file picker via IPC
// (apps/shell-electron/electron/main.ts's kernel:wallpaper:import), which
// copies the chosen image into userData and returns its WallpaperConfig.
const importWallpaper: ImportWallpaperFn = () =>
  window.sky.invoke('kernel:wallpaper:import') as ReturnType<ImportWallpaperFn>;

async function main() {
  const platform = await createElectronPlatform({ licensePublicKeyHex: DEV_LICENSE_PUBLIC_KEY_HEX });

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <SkyDeviceLayout
        apps={[ceremonyModule, ttsStudioModule, mockAppModule]}
        platform={platform}
        onImportWallpaper={importWallpaper}
        wallpapers={WALLPAPERS}
        updateActions={updateActions}
      />
    </StrictMode>,
  );
}

main();
