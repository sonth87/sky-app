import type { LicensePort } from '@sky-app/service-contracts';
import { createLicensePort, type LicenseStorage } from '@sky-app/licensing';
import '../bridge-types.js';

/**
 * Electron LicenseStorage — routes to main process file I/O
 * (apps/shell-electron/electron/ipc.ts's kernel:license:* handlers), vì
 * renderer không có quyền fs trực tiếp (contextIsolation). File lưu trong
 * app.getPath('userData') — xem main process handler.
 */
function createElectronLicenseStorage(): LicenseStorage {
  return {
    async read() {
      return (await window.sky.invoke('kernel:license:read')) as string | null;
    },
    async write(licenseKey) {
      await window.sky.invoke('kernel:license:write', licenseKey);
    },
  };
}

export interface CreateElectronLicensePortOptions {
  /** Public key Ed25519 (hex) nhúng trong app — xác định entitlements nào được tin. */
  publicKeyHex: string;
  deviceId?: string;
}

export function createElectronLicensePort(opts: CreateElectronLicensePortOptions): LicensePort {
  return createLicensePort({
    storage: createElectronLicenseStorage(),
    publicKeyHex: opts.publicKeyHex,
    deviceId: opts.deviceId,
    // Chưa có license server thật — refresh() chỉ re-verify license đã lưu
    // (không throw khi offline, xem packages/licensing/src/license-port.ts).
  });
}
