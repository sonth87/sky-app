/**
 * Helper tạo PlatformContext — dùng thật ở platform-electron/platform-web,
 * và dùng làm mock trong test / mock app ở giai đoạn chưa có adapter thật.
 */
import type { Capability } from './capability.js';
import { createCapabilitySet } from './capability.js';
import { createAllowAllEntitlementSet, createEntitlementSet } from './entitlement.js';
import type { EventBus } from './event-bus.js';
import { createEventBus } from './event-bus.js';
import type { PlatformContext } from './app-module.js';
import { createServiceRegistry } from './service-registry.js';

export interface CreatePlatformContextOptions {
  env: 'electron' | 'web';
  capabilities?: Capability[];
  entitlements?: string[] | 'all';
  /** Dùng chung 1 EventBus giữa nhiều app — mặc định tạo bus mới nếu không truyền */
  events?: EventBus;
  assetUrl?: (path: string) => string;
}

export function createPlatformContext(opts: CreatePlatformContextOptions): PlatformContext {
  return {
    env: opts.env,
    capabilities: createCapabilitySet(opts.capabilities ?? []),
    services: createServiceRegistry(),
    events: opts.events ?? createEventBus(),
    entitlements:
      opts.entitlements === 'all'
        ? createAllowAllEntitlementSet()
        : createEntitlementSet(opts.entitlements ?? []),
    assetUrl: opts.assetUrl ?? ((path: string) => path),
  };
}

/** PlatformContext cho test/mock app: mọi capability + entitlement đều bật. */
export function createMockPlatformContext(
  overrides?: Partial<CreatePlatformContextOptions>,
): PlatformContext {
  return createPlatformContext({
    env: 'web',
    capabilities: ['network', 'fs', 'tts', 'tts-local', 'card-reader', 'secondary-display', 'keystore'],
    entitlements: 'all',
    ...overrides,
  });
}
