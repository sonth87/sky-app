import { createPlatformContext, type PlatformContext } from '@sky-app/kernel';
import { createElectronTtsPort } from './adapters/tts.js';
import { createElectronDisplayPort } from './adapters/display.js';

export interface CreateElectronPlatformOptions {
  assetUrl?: (path: string) => string;
}

/**
 * Builds the PlatformContext for apps/shell-electron. Requires window.sky
 * (see preload.ts) to already be exposed — i.e. this must run in a renderer
 * whose BrowserWindow was created with the platform-electron preload script.
 */
export function createElectronPlatform(opts: CreateElectronPlatformOptions = {}): PlatformContext {
  const platform = createPlatformContext({
    env: 'electron',
    capabilities: ['network', 'fs', 'tts', 'tts-local', 'card-reader', 'secondary-display', 'keystore'],
    entitlements: 'all',
    assetUrl: opts.assetUrl,
  });

  platform.services.register('tts', createElectronTtsPort());
  platform.services.register('display', createElectronDisplayPort());

  return platform;
}
