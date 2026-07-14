import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElectronPlatform } from '../create-electron-platform.js';

describe('createElectronPlatform', () => {
  beforeEach(() => {
    // @ts-expect-error -- test stub for the preload-exposed bridge
    globalThis.window = { sky: { invoke: vi.fn().mockResolvedValue(undefined) } };
  });

  afterEach(() => {
    // @ts-expect-error -- cleanup
    delete globalThis.window;
  });

  it('env = electron', async () => {
    expect((await createElectronPlatform()).env).toBe('electron');
  });

  it('có đủ capability mà web không có', async () => {
    const platform = await createElectronPlatform();
    expect(platform.capabilities.has('secondary-display')).toBe(true);
    expect(platform.capabilities.has('card-reader')).toBe(true);
    expect(platform.capabilities.has('tts-local')).toBe(true);
    expect(platform.capabilities.has('keystore')).toBe(true);
    expect(platform.capabilities.has('fs')).toBe(true);
  });

  it('đăng ký TtsPort + DisplayPort trong ServiceRegistry', async () => {
    const platform = await createElectronPlatform();
    expect(platform.services.has('tts')).toBe(true);
    expect(platform.services.has('display')).toBe(true);
  });

  it('TtsPort.speak gọi window.sky.invoke đúng channel', async () => {
    const platform = await createElectronPlatform();
    const tts = platform.services.get<{ speak: (t: string, o?: unknown) => Promise<void> }>('tts')!;
    await tts.speak('hello', { voiceId: 'v1' });

    expect(window.sky.invoke).toHaveBeenCalledWith('kernel:tts:speak', 'hello', { voiceId: 'v1' });
  });

  it('DisplayPort.setFullscreen gọi window.sky.invoke đúng channel', async () => {
    const platform = await createElectronPlatform();
    const display = platform.services.get<{ setFullscreen: (v: boolean) => Promise<void> }>('display')!;
    await display.setFullscreen(true);

    expect(window.sky.invoke).toHaveBeenCalledWith('kernel:display:setFullscreen', true);
  });

  it('entitlements = allow-all khi không truyền licensePublicKeyHex (dev/chưa cài licensing)', async () => {
    const platform = await createElectronPlatform();
    expect(platform.entitlements.has('app.anything')).toBe(true);
  });

  it('khi truyền licensePublicKeyHex, đọc license qua kernel:license:read và trả entitlements đúng payload', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'kernel:license:read') return VALID_LICENSE_KEY;
      return undefined;
    });
    // @ts-expect-error -- test stub
    globalThis.window = { sky: { invoke } };

    const platform = await createElectronPlatform({ licensePublicKeyHex: TEST_PUBLIC_KEY_HEX });
    expect(invoke).toHaveBeenCalledWith('kernel:license:read');
    expect(platform.entitlements.has('app.ceremony')).toBe(true);
    expect(platform.entitlements.has('app.other')).toBe(false);
  });

  it('không có license lưu (kernel:license:read trả null) → entitlements rỗng, mọi app.entitlement bị khóa', async () => {
    const invoke = vi.fn(async () => null);
    // @ts-expect-error -- test stub
    globalThis.window = { sky: { invoke } };

    const platform = await createElectronPlatform({ licensePublicKeyHex: TEST_PUBLIC_KEY_HEX });
    expect(platform.entitlements.has('app.ceremony')).toBe(false);
    expect(platform.entitlements.list()).toEqual([]);
  });
});

// Cặp key + license cố định sinh sẵn (generateLicenseKeyPair() + signLicense())
// cho { entitlements: ['app.ceremony'], expiry: null } — tránh phụ thuộc
// @sky-app/licensing trực tiếp trong test (chỉ test qua bề mặt IPC bridge,
// giống cách app thật gọi).
const TEST_PUBLIC_KEY_HEX = '7862b6b9d24f3321a29f300306479ef1025e1cc5ec44ce4b7fe42d3937102885';
const VALID_LICENSE_KEY =
  'eyJlbnRpdGxlbWVudHMiOlsiYXBwLmNlcmVtb255Il0sImV4cGlyeSI6bnVsbH0.L09oZpAVgw_rg7uFiC94M0nd_HXL-6S4kW-9U4FUJFS2O3_e6aF7OYrSi3Zi0FA2OoamoH4kZxEiC38UrcqyDg';
