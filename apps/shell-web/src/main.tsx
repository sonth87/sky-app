import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SkyDeviceLayout } from '@sky-app/device-shell';
import { createWebPlatform } from '@sky-app/platform-web';
import { mockAppModule } from '@sky-app/module-mock-app';
import { DEV_LICENSE_PUBLIC_KEY_HEX } from '@sky-app/licensing';
import '@sonth87/device-layout/style.css';

async function main() {
  const platform = await createWebPlatform({ licensePublicKeyHex: DEV_LICENSE_PUBLIC_KEY_HEX });

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <SkyDeviceLayout apps={[mockAppModule]} platform={platform} />
    </StrictMode>,
  );
}

main();
