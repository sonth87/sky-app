import { createPlatformContext, createAllowAllEntitlementSet, type PlatformContext } from '@sky-app/kernel';
import { createWebTtsPort } from './adapters/tts.js';

export interface CreateWebPlatformOptions {
  ttsBaseUrl?: string;
  assetUrl?: (path: string) => string;
}

/**
 * Builds the PlatformContext for apps/shell-web. No entitlement/license
 * backend exists yet (GĐ6) — allow-all until then, matching kernel's
 * createMockPlatformContext default.
 */
export function createWebPlatform(opts: CreateWebPlatformOptions = {}): PlatformContext {
  const platform = createPlatformContext({
    env: 'web',
    // Web has no secondary display, no native card reader, no local TTS
    // binary, no OS keystore — those ports stay unregistered and their
    // capability stays off, so apps degrade instead of crashing.
    capabilities: ['network', 'tts'],
    entitlements: 'all',
    assetUrl: opts.assetUrl,
  });

  platform.services.register('tts', createWebTtsPort(opts.ttsBaseUrl));

  return platform;
}

export { createAllowAllEntitlementSet };
