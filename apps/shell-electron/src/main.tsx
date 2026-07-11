import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SkyDeviceLayout } from '@sky-app/device-shell';
import { createElectronPlatform } from '@sky-app/platform-electron';
import { mockAppModule } from '@sky-app/module-mock-app';

const platform = createElectronPlatform();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SkyDeviceLayout apps={[mockAppModule]} platform={platform} />
  </StrictMode>,
);
