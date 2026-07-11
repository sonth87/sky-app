import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SkyDeviceLayout } from '@sky-app/device-shell';
import { createWebPlatform } from '@sky-app/platform-web';
import { mockAppModule } from '@sky-app/module-mock-app';

const platform = createWebPlatform();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SkyDeviceLayout apps={[mockAppModule]} platform={platform} />
  </StrictMode>,
);
