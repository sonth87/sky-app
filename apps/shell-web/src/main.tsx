import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SkyDeviceLayout } from '@sky-app/device-shell';
import { createWebPlatform } from '@sky-app/platform-web';
import { mockAppModule } from '@sky-app/module-mock-app';
import { ceremonyModule } from '@sky-app/module-ceremony';
import { ttsStudioModule } from '@sky-app/module-tts-studio';
import { DEV_LICENSE_PUBLIC_KEY_HEX } from '@sky-app/licensing';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { WALLPAPERS } from './wallpapers.js';
import './tailwind-layer-order.css';
import '@sonth87/device-layout/style.css';
import '@sky-app/module-ceremony/styles.css';
import '@sky-app/module-tts-studio/styles.css';

async function main() {
  const platform = await createWebPlatform({
    licensePublicKeyHex: DEV_LICENSE_PUBLIC_KEY_HEX,
    // apps/tts-service (server/main.py) mặc định lắng nghe cổng 8089 (DEFAULT_PORT,
    // khớp Electron's python-server.ts) — TtsPort.createWebTtsPort's default 8093
    // KHÔNG khớp, nên phải truyền tường minh. Web không tự spawn server (khác
    // Electron) — cần tự chạy `apps/tts-service` trước khi test.
    ttsBaseUrl: 'http://localhost:8089',
    // Fallback SqliteWasmAdapter's sync({useSample:true}) khi data-service không khả dụng —
    // xem createWebPlatform's resolveDataPort (health-check data-service → fallback WASM).
    sampleStudentsUrl: '/sample-data/students.json',
    sqlWasmUrl,
  });

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <SkyDeviceLayout apps={[ceremonyModule, ttsStudioModule, mockAppModule]} platform={platform} wallpapers={WALLPAPERS} />
    </StrictMode>,
  );
}

main();
