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

  it('env = electron', () => {
    expect(createElectronPlatform().env).toBe('electron');
  });

  it('có đủ capability mà web không có', () => {
    const platform = createElectronPlatform();
    expect(platform.capabilities.has('secondary-display')).toBe(true);
    expect(platform.capabilities.has('card-reader')).toBe(true);
    expect(platform.capabilities.has('tts-local')).toBe(true);
    expect(platform.capabilities.has('keystore')).toBe(true);
    expect(platform.capabilities.has('fs')).toBe(true);
  });

  it('đăng ký TtsPort + DisplayPort trong ServiceRegistry', () => {
    const platform = createElectronPlatform();
    expect(platform.services.has('tts')).toBe(true);
    expect(platform.services.has('display')).toBe(true);
  });

  it('TtsPort.speak gọi window.sky.invoke đúng channel', async () => {
    const platform = createElectronPlatform();
    const tts = platform.services.get<{ speak: (t: string, o?: unknown) => Promise<void> }>('tts')!;
    await tts.speak('hello', { voiceId: 'v1' });

    expect(window.sky.invoke).toHaveBeenCalledWith('kernel:tts:speak', 'hello', { voiceId: 'v1' });
  });

  it('DisplayPort.setFullscreen gọi window.sky.invoke đúng channel', async () => {
    const platform = createElectronPlatform();
    const display = platform.services.get<{ setFullscreen: (v: boolean) => Promise<void> }>('display')!;
    await display.setFullscreen(true);

    expect(window.sky.invoke).toHaveBeenCalledWith('kernel:display:setFullscreen', true);
  });
});
