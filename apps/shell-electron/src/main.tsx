import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SkyDeviceLayout } from '@sky-app/device-shell';
import { createElectronPlatform } from '@sky-app/platform-electron';
import { mockAppModule } from '@sky-app/module-mock-app';
import { ceremonyModule } from '@sky-app/module-ceremony';
import { DEV_LICENSE_PUBLIC_KEY_HEX } from './license-config.js';
import '@sonth87/device-layout/style.css';
import '@sky-app/module-ceremony/styles.css';

async function main() {
  const platform = await createElectronPlatform({ licensePublicKeyHex: DEV_LICENSE_PUBLIC_KEY_HEX });

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <SkyDeviceLayout apps={[ceremonyModule, mockAppModule]} platform={platform} />
    </StrictMode>,
  );
}

main();
