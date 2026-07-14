import type { LicensePort } from '@sky-app/service-contracts';
import { createLicensePort, type LicenseStorage } from '@sky-app/licensing';

/**
 * Web LicenseStorage — localStorage, same-origin, per-browser (not shared
 * across devices like Electron's userData isn't either). No IPC hop needed
 * — the browser itself gates cross-origin access, unlike Electron's
 * contextIsolation which requires the main-process round trip.
 */
function createWebLicenseStorage(storageKey: string): LicenseStorage {
  return {
    async read() {
      return localStorage.getItem(storageKey);
    },
    async write(licenseKey) {
      localStorage.setItem(storageKey, licenseKey);
    },
  };
}

export interface CreateWebLicensePortOptions {
  /** Public key Ed25519 (hex) nhúng trong app — xác định entitlements nào được tin. */
  publicKeyHex: string;
  deviceId?: string;
  /** localStorage key lưu license key thô. Default: 'sky-app-license'. */
  storageKey?: string;
  /** Endpoint gọi license server refresh entitlements — optional (chưa có server thật). */
  fetchRemoteLicenseKey?: () => Promise<string | null>;
}

export function createWebLicensePort(opts: CreateWebLicensePortOptions): LicensePort {
  return createLicensePort({
    storage: createWebLicenseStorage(opts.storageKey ?? 'sky-app-license'),
    publicKeyHex: opts.publicKeyHex,
    deviceId: opts.deviceId,
    fetchRemoteLicenseKey: opts.fetchRemoteLicenseKey,
  });
}
