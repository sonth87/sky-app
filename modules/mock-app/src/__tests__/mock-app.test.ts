import { describe, expect, it } from 'vitest';
import {
  createEntitlementGate,
  createEntitlementSet,
  createMockPlatformContext,
  createPlatformContext,
} from '@sky-app/kernel';
import type { TtsPort } from '@sky-app/service-contracts';
import { isMockAppActivated, mockAppModule } from '../index.js';

describe('mockAppModule — end-to-end contract usage', () => {
  it('có đủ field bắt buộc của AppModule', () => {
    expect(mockAppModule.id).toBe('mock-app');
    expect(mockAppModule.requiredCapabilities).toContain('network');
    expect(typeof mockAppModule.render).toBe('function');
  });

  it('activate/deactivate chạy được qua PlatformContext', async () => {
    const platform = createMockPlatformContext();
    expect(isMockAppActivated()).toBe(false);

    await mockAppModule.activate?.(platform);
    expect(isMockAppActivated()).toBe(true);

    await mockAppModule.deactivate?.();
    expect(isMockAppActivated()).toBe(false);
  });

  it('app không có entitlement luôn qua được EntitlementGate', () => {
    const gate = createEntitlementGate(createEntitlementSet([]));
    expect(gate.canOpen(mockAppModule)).toBe(true);
  });

  it('app resolve TtsPort qua ServiceRegistry — không đụng môi trường trực tiếp', () => {
    const platform = createPlatformContext({ env: 'electron', capabilities: ['network', 'tts'] });
    const fakeTts: TtsPort = {
      speak: async () => {},
      listVoices: async () => [{ id: 'v1', name: 'Voice 1' }],
    };
    platform.services.register<TtsPort>('tts', fakeTts);

    const resolved = platform.services.get<TtsPort>('tts');
    expect(resolved).toBe(fakeTts);
  });

  it('web platform không có secondary-display → app tự biết để degrade', () => {
    const webPlatform = createPlatformContext({ env: 'web', capabilities: ['network'] });
    expect(webPlatform.capabilities.has('secondary-display')).toBe(false);

    const electronPlatform = createPlatformContext({
      env: 'electron',
      capabilities: ['network', 'secondary-display'],
    });
    expect(electronPlatform.capabilities.has('secondary-display')).toBe(true);
  });
});
