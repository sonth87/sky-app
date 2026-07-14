import { describe, it, expect } from 'vitest';
import { isPayloadValid } from '../license.js';

describe('isPayloadValid', () => {
  it('hợp lệ khi expiry null (vĩnh viễn)', () => {
    expect(isPayloadValid({ entitlements: [], expiry: null })).toBe(true);
  });

  it('hợp lệ khi expiry ở tương lai', () => {
    const now = new Date('2026-07-12T00:00:00.000Z');
    expect(
      isPayloadValid({ entitlements: [], expiry: '2027-01-01T00:00:00.000Z' }, { now }),
    ).toBe(true);
  });

  it('không hợp lệ khi expiry ở quá khứ', () => {
    const now = new Date('2026-07-12T00:00:00.000Z');
    expect(
      isPayloadValid({ entitlements: [], expiry: '2025-01-01T00:00:00.000Z' }, { now }),
    ).toBe(false);
  });

  it('không hợp lệ khi expiry là chuỗi ngày sai định dạng', () => {
    expect(isPayloadValid({ entitlements: [], expiry: 'không-phải-ngày' })).toBe(false);
  });

  it('hợp lệ khi deviceBinding khớp deviceId truyền vào', () => {
    expect(
      isPayloadValid(
        { entitlements: [], expiry: null, deviceBinding: 'device-1' },
        { deviceId: 'device-1' },
      ),
    ).toBe(true);
  });

  it('không hợp lệ khi deviceBinding không khớp deviceId', () => {
    expect(
      isPayloadValid(
        { entitlements: [], expiry: null, deviceBinding: 'device-1' },
        { deviceId: 'device-2' },
      ),
    ).toBe(false);
  });

  it('bỏ qua deviceBinding nếu không truyền deviceId (chưa biết thiết bị hiện tại)', () => {
    expect(
      isPayloadValid({ entitlements: [], expiry: null, deviceBinding: 'device-1' }),
    ).toBe(true);
  });
});
