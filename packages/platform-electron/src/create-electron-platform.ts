import { createPlatformContext, type PlatformContext } from '@sky-app/kernel';
import { resolveEntitlementsFromPort } from '@sky-app/licensing';
import { createElectronTtsPort } from './adapters/tts.js';
import { createElectronDisplayPort } from './adapters/display.js';
import { createElectronLicensePort } from './adapters/license.js';

export interface CreateElectronPlatformOptions {
  assetUrl?: (path: string) => string;
  /**
   * Public key Ed25519 (hex) nhúng trong app — xác định entitlements nào
   * được tin (xem docs/guides/licensing-entitlement.md). Bỏ qua = mọi
   * entitlement đều mở (dev/chưa cấu hình licensing) — KHÔNG dùng giá trị
   * này để phát hành thật, chỉ hợp lệ khi chưa cài licensing.
   */
  licensePublicKeyHex?: string;
  /** Device id để kiểm license.deviceBinding nếu license có ràng buộc thiết bị. */
  deviceId?: string;
}

/**
 * Builds the PlatformContext for apps/shell-electron. Requires window.sky
 * (see preload.ts) to already be exposed — i.e. this must run in a renderer
 * whose BrowserWindow was created with the platform-electron preload script.
 *
 * Async vì entitlements cần đọc + verify license (file I/O qua IPC) trước khi
 * dock có thể quyết định app nào bị khóa — xem docs/dev/history.md GĐ6 cho lý
 * do chọn "await trước render" thay vì entitlements reactive.
 */
export async function createElectronPlatform(
  opts: CreateElectronPlatformOptions = {},
): Promise<PlatformContext> {
  const entitlements = opts.licensePublicKeyHex
    ? await resolveEntitlementsFromPort(
        createElectronLicensePort({ publicKeyHex: opts.licensePublicKeyHex, deviceId: opts.deviceId }),
      )
    : ('all' as const);

  const platform = createPlatformContext({
    env: 'electron',
    capabilities: ['network', 'fs', 'tts', 'tts-local', 'card-reader', 'secondary-display', 'keystore'],
    entitlements,
    assetUrl: opts.assetUrl,
  });

  platform.services.register('tts', createElectronTtsPort());
  platform.services.register('display', createElectronDisplayPort());

  return platform;
}
