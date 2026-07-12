import { createPlatformContext, createAllowAllEntitlementSet, type PlatformContext } from '@sky-app/kernel';
import { resolveEntitlementsFromPort } from '@sky-app/licensing';
import { createWebTtsPort } from './adapters/tts.js';
import { createWebLicensePort } from './adapters/license.js';

export interface CreateWebPlatformOptions {
  ttsBaseUrl?: string;
  assetUrl?: (path: string) => string;
  /**
   * Public key Ed25519 (hex) nhúng trong app — xác định entitlements nào
   * được tin (xem docs/guides/licensing-entitlement.md). Bỏ qua = mọi
   * entitlement đều mở (dev/chưa cấu hình licensing) — KHÔNG dùng giá trị
   * này để phát hành thật, chỉ hợp lệ khi chưa cài licensing.
   */
  licensePublicKeyHex?: string;
  deviceId?: string;
}

/**
 * Builds the PlatformContext for apps/shell-web.
 *
 * Async vì entitlements cần đọc + verify license (localStorage) trước khi
 * dock có thể quyết định app nào bị khóa — cùng lý do createElectronPlatform
 * là async (xem docs/dev/history.md GĐ6), giữ 2 platform nhất quán thay vì
 * entitlements reactive.
 */
export async function createWebPlatform(opts: CreateWebPlatformOptions = {}): Promise<PlatformContext> {
  const entitlements = opts.licensePublicKeyHex
    ? await resolveEntitlementsFromPort(
        createWebLicensePort({ publicKeyHex: opts.licensePublicKeyHex, deviceId: opts.deviceId }),
      )
    : ('all' as const);

  const platform = createPlatformContext({
    env: 'web',
    // Web has no secondary display, no native card reader, no local TTS
    // binary, no OS keystore — those ports stay unregistered and their
    // capability stays off, so apps degrade instead of crashing.
    capabilities: ['network', 'tts'],
    entitlements,
    assetUrl: opts.assetUrl,
  });

  platform.services.register('tts', createWebTtsPort(opts.ttsBaseUrl));

  return platform;
}

export { createAllowAllEntitlementSet };
