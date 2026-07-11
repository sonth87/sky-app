import { describe, expect, it, vi } from 'vitest';
import { createWebPlatform } from '../create-web-platform.js';

describe('createWebPlatform', () => {
  it('env = web', () => {
    expect(createWebPlatform().env).toBe('web');
  });

  it('không có capability chỉ Electron mới cấp (secondary-display, card-reader, tts-local, keystore)', () => {
    const platform = createWebPlatform();
    expect(platform.capabilities.has('secondary-display')).toBe(false);
    expect(platform.capabilities.has('card-reader')).toBe(false);
    expect(platform.capabilities.has('tts-local')).toBe(false);
    expect(platform.capabilities.has('keystore')).toBe(false);
  });

  it('có network + tts', () => {
    const platform = createWebPlatform();
    expect(platform.capabilities.has('network')).toBe(true);
    expect(platform.capabilities.has('tts')).toBe(true);
  });

  it('đăng ký sẵn TtsPort trong ServiceRegistry', () => {
    const platform = createWebPlatform();
    expect(platform.services.has('tts')).toBe(true);
  });

  it('entitlements mặc định allow-all (chưa có licensing thật — GĐ6)', () => {
    const platform = createWebPlatform();
    expect(platform.entitlements.has('anything')).toBe(true);
  });

  it('TtsPort.speak gọi đúng endpoint qua fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);

    const platform = createWebPlatform({ ttsBaseUrl: '/custom/tts' });
    const tts = platform.services.get<{ speak: (t: string) => Promise<void> }>('tts')!;
    await tts.speak('hello');

    expect(fetchMock).toHaveBeenCalledWith(
      '/custom/tts/speak',
      expect.objectContaining({ method: 'POST' }),
    );
    vi.unstubAllGlobals();
  });
});
