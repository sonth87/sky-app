import { createPlatformContext, type PlatformContext } from '@sky-app/kernel';
import { resolveEntitlementsFromPort } from '@sky-app/licensing';
import { createElectronTtsPort } from './adapters/tts.js';
import { createElectronTtsEnginePort } from './adapters/tts-engine.js';
import { createElectronSttPort } from './adapters/stt.js';
import { createElectronSttEnginePort } from './adapters/stt-engine.js';
import { createElectronDisplayPort } from './adapters/display.js';
import { createElectronLicensePort } from './adapters/license.js';
import { createElectronLayoutPort } from './adapters/layout.js';
import { createElectronAssetPort } from './adapters/asset.js';
import { createElectronEventPort } from './adapters/event.js';
import { createElectronDataSourcePort } from './adapters/data-source.js';
import { createElectronEffectPresetPort } from './adapters/effect-preset.js';
import { createElectronStoryPort } from './adapters/story.js';

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
    capabilities: ['network', 'fs', 'tts', 'tts-local', 'stt', 'card-reader', 'secondary-display', 'keystore'],
    entitlements,
    assetUrl: opts.assetUrl,
  });

  platform.services.register('tts', createElectronTtsPort());
  platform.services.register('tts-engine', createElectronTtsEnginePort());
  platform.services.register('stt', createElectronSttPort());
  platform.services.register('stt-engine', createElectronSttEnginePort());
  platform.services.register('display', createElectronDisplayPort());
  platform.services.register('layout', createElectronLayoutPort());
  platform.services.register('asset', createElectronAssetPort());
  platform.services.register('event', createElectronEventPort());
  platform.services.register('dataSource', createElectronDataSourcePort());
  platform.services.register('effectPreset', createElectronEffectPresetPort());
  platform.services.register('story', createElectronStoryPort());

  return platform;
}
