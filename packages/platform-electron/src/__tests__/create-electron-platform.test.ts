import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElectronPlatform } from '../create-electron-platform.js';

/** Minimal AudioContext stub — node has no Web Audio API; adapters/tts.ts's
 * playPcm() (dùng bởi speak()) chỉ cần vài method này. */
function stubAudioContext() {
  const source = { connect: vi.fn(), start: vi.fn(), onended: null as (() => void) | null, stop: vi.fn() };
  const ctx = {
    state: 'running',
    resume: vi.fn().mockResolvedValue(undefined),
    createBuffer: vi.fn().mockReturnValue({ copyToChannel: vi.fn() }),
    createBufferSource: vi.fn().mockReturnValue(source),
    destination: {},
  };
  vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => ctx));
  return { ctx, source };
}

describe('createElectronPlatform', () => {
  beforeEach(() => {
    // @ts-expect-error -- test stub for the preload-exposed bridge
    globalThis.window = { sky: { invoke: vi.fn().mockResolvedValue(undefined) } };
  });

  afterEach(() => {
    // @ts-expect-error -- cleanup
    delete globalThis.window;
    vi.unstubAllGlobals();
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

  it('TtsPort.speak gọi window.slide.speak đúng tham số, phát PCM trả về', async () => {
    stubAudioContext();
    const pcm = new Int16Array([0, 100, -100]).buffer;
    // @ts-expect-error -- test stub cho window.slide (bridge riêng Ceremony, adapters/tts.ts dùng trực tiếp)
    globalThis.window.slide = {
      speak: vi.fn().mockResolvedValue({ ok: true, buffer: pcm, sampleRate: 24000 }),
    };

    const platform = await createElectronPlatform();
    const tts = platform.services.get<{ speak: (t: string, o?: unknown) => Promise<void> }>('tts')!;
    await tts.speak('hello', { voiceId: 'v1', speed: 1.2 });

    // @ts-expect-error -- test stub
    expect(window.slide.speak).toHaveBeenCalledWith('hello', 'v1', 1.2);
  });

  it('TtsPort.synthesizeBuffer gọi window.slide.synthesizeTts, trả buffer thô KHÔNG tự phát', async () => {
    const { ctx } = stubAudioContext();
    const pcm = new Int16Array([1, 2, 3]).buffer;
    // @ts-expect-error -- test stub
    globalThis.window.slide = {
      synthesizeTts: vi.fn().mockResolvedValue({ ok: true, buffer: pcm, sampleRate: 48000 }),
    };

    const platform = await createElectronPlatform();
    const tts = platform.services.get<{
      synthesizeBuffer: (t: string, o?: unknown) => Promise<{ buffer: ArrayBuffer; sampleRate: number }>;
    }>('tts')!;
    const result = await tts.synthesizeBuffer('xin chào', { voiceId: 'NF', speed: 1.0 });

    // @ts-expect-error -- test stub
    expect(window.slide.synthesizeTts).toHaveBeenCalledWith('xin chào', 'NF', 1.0);
    expect(result).toEqual({ buffer: pcm, sampleRate: 48000 });
    // Không tự phát — AudioContext không được tạo/dùng.
    expect(ctx.createBufferSource).not.toHaveBeenCalled();
  });

  it('TtsPort.synthesizeBuffer throw khi window.slide.synthesizeTts trả lỗi', async () => {
    // @ts-expect-error -- test stub
    globalThis.window.slide = {
      synthesizeTts: vi.fn().mockResolvedValue({ ok: false, error: 'boom' }),
    };

    const platform = await createElectronPlatform();
    const tts = platform.services.get<{ synthesizeBuffer: (t: string) => Promise<unknown> }>('tts')!;
    await expect(tts.synthesizeBuffer('hello')).rejects.toThrow('boom');
  });

  it('TtsPort.getPreviewUrl gọi window.slide.getTtsPreviewUrl', async () => {
    // @ts-expect-error -- test stub
    globalThis.window.slide = {
      getTtsPreviewUrl: vi.fn().mockResolvedValue('http://127.0.0.1:8093/preview/NF'),
    };

    const platform = await createElectronPlatform();
    const tts = platform.services.get<{ getPreviewUrl: (id: string) => Promise<string> }>('tts')!;
    const url = await tts.getPreviewUrl('NF');

    // @ts-expect-error -- test stub
    expect(window.slide.getTtsPreviewUrl).toHaveBeenCalledWith('NF');
    expect(url).toBe('http://127.0.0.1:8093/preview/NF');
  });

  it('TtsPort.listVoices map thêm field gender từ window.slide.listVoices', async () => {
    // @ts-expect-error -- test stub
    globalThis.window.slide = {
      listVoices: vi.fn().mockResolvedValue([
        { id: 'NF', label: 'Lan Anh', gender: 'female', region: 'Bắc', type: 'cloned', hidden: false },
      ]),
    };

    const platform = await createElectronPlatform();
    const tts = platform.services.get<{ listVoices: () => Promise<{ id: string; name: string; language?: string; gender?: string }[]> }>('tts')!;
    const voices = await tts.listVoices();

    expect(voices).toEqual([{ id: 'NF', name: 'Lan Anh', language: 'Bắc', gender: 'female' }]);
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
