import { describe, it, expect, vi } from 'vitest';
import { generateLicenseKeyPair, signLicense } from '../sign.js';
import { createLicensePort, type LicenseStorage } from '../license-port.js';

function createMemoryStorage(initial: string | null = null): LicenseStorage & { value: string | null } {
  const storage = {
    value: initial,
    async read() {
      return storage.value;
    },
    async write(key: string) {
      storage.value = key;
    },
  };
  return storage;
}

describe('createLicensePort', () => {
  it('getCurrent trả null khi chưa có license nào lưu', async () => {
    const { publicKeyHex } = await generateLicenseKeyPair();
    const port = createLicensePort({ storage: createMemoryStorage(), publicKeyHex });
    expect(await port.getCurrent()).toBeNull();
  });

  it('verify() lưu license vào storage khi hợp lệ, getCurrent() đọc lại đúng', async () => {
    const { privateKeyHex, publicKeyHex } = await generateLicenseKeyPair();
    const payload = { entitlements: ['app.ceremony'], expiry: null };
    const key = await signLicense(payload, privateKeyHex);

    const storage = createMemoryStorage();
    const port = createLicensePort({ storage, publicKeyHex });

    const verified = await port.verify(key);
    expect(verified).toEqual(payload);
    expect(storage.value).toBe(key);

    expect(await port.getCurrent()).toEqual(payload);
  });

  it('verify() KHÔNG lưu vào storage khi license không hợp lệ (chữ ký sai)', async () => {
    const pairA = await generateLicenseKeyPair();
    const pairB = await generateLicenseKeyPair();
    const payload = { entitlements: ['app.ceremony'], expiry: null };
    const key = await signLicense(payload, pairA.privateKeyHex);

    const storage = createMemoryStorage();
    const port = createLicensePort({ storage, publicKeyHex: pairB.publicKeyHex });

    expect(await port.verify(key)).toBeNull();
    expect(storage.value).toBeNull();
  });

  it('verify() từ chối license đã hết hạn dù chữ ký hợp lệ', async () => {
    const { privateKeyHex, publicKeyHex } = await generateLicenseKeyPair();
    const payload = { entitlements: ['app.ceremony'], expiry: '2020-01-01T00:00:00.000Z' };
    const key = await signLicense(payload, privateKeyHex);

    const port = createLicensePort({ storage: createMemoryStorage(), publicKeyHex });
    expect(await port.verify(key)).toBeNull();
  });

  it('getCurrent() bỏ qua license đã lưu nếu hết hạn (không throw)', async () => {
    const { privateKeyHex, publicKeyHex } = await generateLicenseKeyPair();
    const payload = { entitlements: ['app.ceremony'], expiry: null };
    const key = await signLicense(payload, privateKeyHex);
    const storage = createMemoryStorage(key);

    // Giả lập license hợp lệ lúc lưu nhưng đã hết hạn tại thời điểm đọc lại —
    // dùng deviceId không khớp để mô phỏng "không còn hợp lệ" tương tự expiry.
    const port = createLicensePort({
      storage,
      publicKeyHex,
      deviceId: 'other-device',
    });
    const validPayload = { entitlements: ['app.ceremony'], expiry: null, deviceBinding: 'device-a' };
    const boundKey = await signLicense(validPayload, privateKeyHex);
    await storage.write(boundKey);

    expect(await port.getCurrent()).toBeNull();
  });

  it('refresh() trả license từ storage khi không có fetchRemoteLicenseKey', async () => {
    const { privateKeyHex, publicKeyHex } = await generateLicenseKeyPair();
    const payload = { entitlements: ['app.ceremony'], expiry: null };
    const key = await signLicense(payload, privateKeyHex);
    const storage = createMemoryStorage(key);

    const port = createLicensePort({ storage, publicKeyHex });
    expect(await port.refresh()).toEqual(payload);
  });

  it('refresh() cập nhật storage khi server trả license mới hợp lệ', async () => {
    const { privateKeyHex, publicKeyHex } = await generateLicenseKeyPair();
    const oldPayload = { entitlements: ['app.ceremony'], expiry: null };
    const oldKey = await signLicense(oldPayload, privateKeyHex);
    const newPayload = { entitlements: ['app.ceremony', 'feature.ceremony.voice-clone'], expiry: null };
    const newKey = await signLicense(newPayload, privateKeyHex);

    const storage = createMemoryStorage(oldKey);
    const fetchRemoteLicenseKey = vi.fn().mockResolvedValue(newKey);
    const port = createLicensePort({ storage, publicKeyHex, fetchRemoteLicenseKey });

    const result = await port.refresh();
    expect(result).toEqual(newPayload);
    expect(storage.value).toBe(newKey);
  });

  it('refresh() giữ license cũ khi fetchRemoteLicenseKey throw (offline-first)', async () => {
    const { privateKeyHex, publicKeyHex } = await generateLicenseKeyPair();
    const payload = { entitlements: ['app.ceremony'], expiry: null };
    const key = await signLicense(payload, privateKeyHex);
    const storage = createMemoryStorage(key);
    const fetchRemoteLicenseKey = vi.fn().mockRejectedValue(new Error('network down'));

    const port = createLicensePort({ storage, publicKeyHex, fetchRemoteLicenseKey });
    const result = await port.refresh();
    expect(result).toEqual(payload);
    expect(storage.value).toBe(key);
  });

  it('refresh() giữ license cũ khi server trả license mới KHÔNG hợp lệ', async () => {
    const pairA = await generateLicenseKeyPair();
    const pairB = await generateLicenseKeyPair();
    const payload = { entitlements: ['app.ceremony'], expiry: null };
    const key = await signLicense(payload, pairA.privateKeyHex);
    const storage = createMemoryStorage(key);

    // "invalidKey" ký bằng key khác — verify sẽ fail với publicKeyHex của pairA.
    const invalidKey = await signLicense({ entitlements: ['app.hacked'], expiry: null }, pairB.privateKeyHex);
    const fetchRemoteLicenseKey = vi.fn().mockResolvedValue(invalidKey);

    const port = createLicensePort({ storage, publicKeyHex: pairA.publicKeyHex, fetchRemoteLicenseKey });
    const result = await port.refresh();
    expect(result).toEqual(payload);
    expect(storage.value).toBe(key);
  });
});
