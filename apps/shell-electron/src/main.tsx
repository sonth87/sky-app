import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SkyDeviceLayout } from '@sky-app/device-shell';
import { createElectronPlatform } from '@sky-app/platform-electron';
import { mockAppModule } from '@sky-app/module-mock-app';
import { ceremonyModule } from '@sky-app/module-ceremony';
import '@sonth87/device-layout/style.css';
import '@sky-app/module-ceremony/styles.css';

const platform = createElectronPlatform();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SkyDeviceLayout apps={[ceremonyModule, mockAppModule]} platform={platform} />
  </StrictMode>,
);
