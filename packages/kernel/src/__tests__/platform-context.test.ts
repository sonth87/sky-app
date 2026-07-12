import { describe, expect, it } from 'vitest';
import { createPlatformContext, createMockPlatformContext } from '../platform-context.js';

// Audit GĐ7.5, E2: platform-context.ts trước đây không có test riêng (0% code
// coverage — chỉ được exercise gián tiếp qua platform-web/platform-electron's
// test). Thêm test trực tiếp ở đây để đóng khoảng trống, vì đây là nơi ghép
// CapabilitySet + ServiceRegistry + EventBus + EntitlementSet thành 1
// PlatformContext hoàn chỉnh — behavior riêng của nó (defaults, entitlements
// 'all' vs mảng cụ thể, assetUrl mặc định) chưa có test nào xác nhận.
describe('createPlatformContext', () => {
  it('mặc định: capabilities rỗng, entitlements rỗng, assetUrl identity, EventBus mới tạo', () => {
    const platform = createPlatformContext({ env: 'web' });

    expect(platform.env).toBe('web');
    expect(platform.capabilities.list()).toEqual([]);
    expect(platform.entitlements.list()).toEqual([]);
    expect(platform.assetUrl('foo/bar.png')).toBe('foo/bar.png');
    expect(platform.services.has('anything')).toBe(false);
  });

  it('entitlements: "all" tạo AllowAllEntitlementSet (has() luôn true, list() rỗng)', () => {
    const platform = createPlatformContext({ env: 'electron', entitlements: 'all' });

    expect(platform.entitlements.has('app.ceremony')).toBe(true);
    expect(platform.entitlements.has('app.anything-else')).toBe(true);
    expect(platform.entitlements.list()).toEqual([]);
  });

  it('entitlements: mảng cụ thể chỉ has() đúng entitlement đã cấp', () => {
    const platform = createPlatformContext({ env: 'web', entitlements: ['app.ceremony'] });

    expect(platform.entitlements.has('app.ceremony')).toBe(true);
    expect(platform.entitlements.has('app.other')).toBe(false);
    expect(platform.entitlements.list()).toEqual(['app.ceremony']);
  });

  it('capabilities truyền vào phản ánh đúng trong CapabilitySet', () => {
    const platform = createPlatformContext({ env: 'electron', capabilities: ['tts', 'fs'] });

    expect(platform.capabilities.has('tts')).toBe(true);
    expect(platform.capabilities.has('fs')).toBe(true);
    expect(platform.capabilities.has('card-reader')).toBe(false);
  });

  it('assetUrl tuỳ chỉnh được truyền qua nguyên vẹn', () => {
    const platform = createPlatformContext({
      env: 'electron',
      assetUrl: (path) => `app://resources/${path}`,
    });

    expect(platform.assetUrl('icon.svg')).toBe('app://resources/icon.svg');
  });

  it('dùng chung 1 EventBus khi truyền events (không tạo bus mới)', () => {
    const sharedEvents = { emit: () => {}, on: () => () => {}, off: () => {}, once: () => () => {} };
    const platform = createPlatformContext({ env: 'web', events: sharedEvents });

    expect(platform.events).toBe(sharedEvents);
  });

  it('không truyền events → tự tạo EventBus mới, hoạt động đúng (emit/on round-trip)', () => {
    const platform = createPlatformContext({ env: 'web' });
    let received: unknown;
    platform.events.on('test:event', (data) => { received = data; });
    platform.events.emit('test:event', { ok: true });

    expect(received).toEqual({ ok: true });
  });
});

describe('createMockPlatformContext', () => {
  it('mặc định env=web, mọi capability bật, entitlements="all"', () => {
    const platform = createMockPlatformContext();

    expect(platform.env).toBe('web');
    for (const cap of ['network', 'fs', 'tts', 'tts-local', 'card-reader', 'secondary-display', 'keystore'] as const) {
      expect(platform.capabilities.has(cap)).toBe(true);
    }
    expect(platform.entitlements.has('app.anything')).toBe(true);
  });

  it('overrides ghi đè đúng field mà không phá field khác', () => {
    const platform = createMockPlatformContext({ env: 'electron', entitlements: ['app.ceremony'] });

    expect(platform.env).toBe('electron');
    expect(platform.entitlements.has('app.ceremony')).toBe(true);
    expect(platform.entitlements.has('app.other')).toBe(false);
    // capabilities không bị override vẫn giữ mặc định đầy đủ
    expect(platform.capabilities.has('tts')).toBe(true);
  });
});
