import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SkyDeviceLayout } from '@sky-app/device-shell';
import { createWebPlatform } from '@sky-app/platform-web';
import { mockAppModule } from '@sky-app/module-mock-app';
import { ceremonyModule } from '@sky-app/module-ceremony';
import { DEV_LICENSE_PUBLIC_KEY_HEX } from '@sky-app/licensing';
import { WALLPAPERS } from './wallpapers.js';
import './tailwind-layer-order.css';
import '@sonth87/device-layout/style.css';
import '@sky-app/module-ceremony/styles.css';

async function main() {
  const platform = await createWebPlatform({ licensePublicKeyHex: DEV_LICENSE_PUBLIC_KEY_HEX });

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <SkyDeviceLayout apps={[ceremonyModule, mockAppModule]} platform={platform} wallpapers={WALLPAPERS} />
    </StrictMode>,
  );
}

main();
