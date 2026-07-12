import type { LicensePayload, LicensePort } from '@sky-app/service-contracts';
import { isPayloadValid } from './license.js';
import { verifyLicenseKey } from './verify.js';

/**
 * Lưu trữ license key thô — Electron: file trong userData, Web: localStorage/
 * server. packages/licensing không tự chạm fs/localStorage (ports & adapters,
 * xem docs/architecture/overview.md) — platform-electron/platform-web cấp
 * adapter cụ thể lúc gọi createLicensePort().
 */
export interface LicenseStorage {
  read(): Promise<string | null>;
  write(licenseKey: string): Promise<void>;
}

export interface CreateLicensePortOptions {
  storage: LicenseStorage;
  /** Public key Ed25519 (hex) nhúng sẵn trong app — dùng verify offline. */
  publicKeyHex: string;
  deviceId?: string;
  /**
   * Gọi license server lấy license key mới nếu có mạng — optional, refresh()
   * trả null (không throw) khi không truyền hoặc khi gọi lỗi (offline-first:
   * refresh thất bại không được phá license hiện tại).
   */
  fetchRemoteLicenseKey?: () => Promise<string | null>;
}

/**
 * Đọc entitlements hiện có từ 1 LicensePort — dùng bởi createElectronPlatform/
 * createWebPlatform khi build PlatformContext (audit GĐ7.5, E4 #2: trước đây
 * mỗi platform tự định nghĩa 1 bản `resolveEntitlements()` giống hệt nhau ở
 * create-electron-platform.ts và create-web-platform.ts — gộp lại đây vì cả 2
 * package đó đã phụ thuộc @sky-app/licensing sẵn, không phát sinh dependency mới).
 */
export async function resolveEntitlementsFromPort(port: LicensePort): Promise<string[]> {
  const payload = await port.getCurrent();
  return payload?.entitlements ?? [];
}

export function createLicensePort(opts: CreateLicensePortOptions): LicensePort {
  async function verifyStored(): Promise<LicensePayload | null> {
    const raw = await opts.storage.read();
    if (!raw) return null;
    const payload = await verifyLicenseKey(raw, opts.publicKeyHex);
    if (!payload) return null;
    return isPayloadValid(payload, { deviceId: opts.deviceId }) ? payload : null;
  }

  return {
    getCurrent: verifyStored,

    async verify(licenseKey) {
      const payload = await verifyLicenseKey(licenseKey, opts.publicKeyHex);
      if (!payload) return null;
      if (!isPayloadValid(payload, { deviceId: opts.deviceId })) return null;
      await opts.storage.write(licenseKey);
      return payload;
    },

    async refresh() {
      if (!opts.fetchRemoteLicenseKey) return verifyStored();
      try {
        const remoteKey = await opts.fetchRemoteLicenseKey();
        if (!remoteKey) return verifyStored();
        const payload = await verifyLicenseKey(remoteKey, opts.publicKeyHex);
        if (!payload || !isPayloadValid(payload, { deviceId: opts.deviceId })) return verifyStored();
        await opts.storage.write(remoteKey);
        return payload;
      } catch {
        // Offline-first: lỗi mạng/server không được phá license đang verify được.
        return verifyStored();
      }
    },
  };
}
