import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createWebPlatform } from '../create-web-platform.js';

/** Minimal AudioContext stub — node has no Web Audio API; platform-web's
 * createWebTtsPort only needs the handful of methods playPcm() calls. */
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

/** Minimal localStorage stub — node has no Storage API. */
function stubLocalStorage() {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  });
  return map;
}

describe('createWebPlatform', () => {
  beforeEach(() => {
    stubLocalStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('env = web', async () => {
    expect((await createWebPlatform()).env).toBe('web');
  });

  it('không có capability chỉ Electron mới cấp (secondary-display, card-reader, tts-local, keystore)', async () => {
    const platform = await createWebPlatform();
    expect(platform.capabilities.has('secondary-display')).toBe(false);
    expect(platform.capabilities.has('card-reader')).toBe(false);
    expect(platform.capabilities.has('tts-local')).toBe(false);
    expect(platform.capabilities.has('keystore')).toBe(false);
  });

  it('có network + tts', async () => {
    const platform = await createWebPlatform();
    expect(platform.capabilities.has('network')).toBe(true);
    expect(platform.capabilities.has('tts')).toBe(true);
  });

  it('đăng ký sẵn TtsPort trong ServiceRegistry', async () => {
    const platform = await createWebPlatform();
    expect(platform.services.has('tts')).toBe(true);
  });

  it('entitlements = allow-all khi không truyền licensePublicKeyHex (dev/chưa cài licensing)', async () => {
    const platform = await createWebPlatform();
    expect(platform.entitlements.has('app.anything')).toBe(true);
  });

  it('khi truyền licensePublicKeyHex, đọc license qua localStorage và trả entitlements đúng payload', async () => {
    localStorage.setItem('sky-app-license', VALID_LICENSE_KEY);

    const platform = await createWebPlatform({ licensePublicKeyHex: TEST_PUBLIC_KEY_HEX });
    expect(platform.entitlements.has('app.ceremony')).toBe(true);
    expect(platform.entitlements.has('app.other')).toBe(false);
  });

  it('không có license lưu → entitlements rỗng, mọi app.entitlement bị khóa', async () => {
    const platform = await createWebPlatform({ licensePublicKeyHex: TEST_PUBLIC_KEY_HEX });
    expect(platform.entitlements.has('app.ceremony')).toBe(false);
    expect(platform.entitlements.list()).toEqual([]);
  });
});

describe('TtsPort (web)', () => {
  beforeEach(() => {
    stubAudioContext();
    stubLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('speak() POST tới /synthesize với đúng speaker_id/speed, phát PCM trả về', async () => {
    const pcm = new Int16Array([0, 100, -100]).buffer;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (name: string) => (name === 'X-Sample-Rate' ? '24000' : null) },
      arrayBuffer: async () => pcm,
    });
    vi.stubGlobal('fetch', fetchMock);

    const platform = await createWebPlatform({ ttsBaseUrl: 'http://localhost:9999' });
    const tts = platform.services.get<{ speak: (t: string, o?: unknown) => Promise<void> }>('tts')!;
    await tts.speak('xin chào', { voiceId: 'NF2', speed: 1.2 });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9999/synthesize',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'xin chào', speaker_id: 'NF2', speed: 1.2, temperature: undefined }),
      }),
    );
  });

  it('speak() dùng speaker_id/speed mặc định khi không truyền opts', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    vi.stubGlobal('fetch', fetchMock);

    const platform = await createWebPlatform();
    const tts = platform.services.get<{ speak: (t: string) => Promise<void> }>('tts')!;
    await expect(tts.speak('hello')).rejects.toThrow('Empty PCM buffer');

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(body).toEqual({ text: 'hello', speaker_id: 'NF', speed: 1.0, temperature: undefined });
  });

  it('speak() throw khi server trả lỗi', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    vi.stubGlobal('fetch', fetchMock);

    const platform = await createWebPlatform();
    const tts = platform.services.get<{ speak: (t: string) => Promise<void> }>('tts')!;
    await expect(tts.speak('hello')).rejects.toThrow('TTS synthesize failed: 500 boom');
  });

  it('listVoices() map label→name, region→language', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'NF', label: 'Lan Anh', region: 'Bắc' },
        { id: 'SM', label: 'Gia Huy', region: 'Nam' },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);

    const platform = await createWebPlatform({ ttsBaseUrl: 'http://localhost:9999' });
    const tts = platform.services.get<{ listVoices: () => Promise<{ id: string; name: string; language?: string }[]> }>('tts')!;
    const voices = await tts.listVoices();

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:9999/voices');
    expect(voices).toEqual([
      { id: 'NF', name: 'Lan Anh', language: 'Bắc' },
      { id: 'SM', name: 'Gia Huy', language: 'Nam' },
    ]);
  });
});

// Cặp key + license cố định sinh sẵn (generateLicenseKeyPair() + signLicense())
// cho { entitlements: ['app.ceremony'], expiry: null } — cùng cặp key
// packages/platform-electron's test dùng, cùng key packages/licensing/src/
// dev-key.ts export (1 nguồn chân lý cho mọi shell — xem docs/dev/history.md).
const TEST_PUBLIC_KEY_HEX = '7862b6b9d24f3321a29f300306479ef1025e1cc5ec44ce4b7fe42d3937102885';
const VALID_LICENSE_KEY =
  'eyJlbnRpdGxlbWVudHMiOlsiYXBwLmNlcmVtb255Il0sImV4cGlyeSI6bnVsbH0.L09oZpAVgw_rg7uFiC94M0nd_HXL-6S4kW-9U4FUJFS2O3_e6aF7OYrSi3Zi0FA2OoamoH4kZxEiC38UrcqyDg';
