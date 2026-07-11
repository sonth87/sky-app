import { describe, it, expect } from 'vitest';
import { generateLicenseKeyPair, signLicense } from '../sign.js';
import { verifyLicenseKey } from '../verify.js';

describe('sign + verify round-trip', () => {
  it('verify trả đúng payload khi chữ ký hợp lệ', async () => {
    const { privateKeyHex, publicKeyHex } = await generateLicenseKeyPair();
    const payload = { entitlements: ['app.ceremony'], expiry: null };
    const key = await signLicense(payload, privateKeyHex);

    const result = await verifyLicenseKey(key, publicKeyHex);
    expect(result).toEqual(payload);
  });

  it('verify trả null khi ký bằng key khác (chữ ký không khớp public key)', async () => {
    const pairA = await generateLicenseKeyPair();
    const pairB = await generateLicenseKeyPair();
    const payload = { entitlements: ['app.ceremony'], expiry: null };
    const key = await signLicense(payload, pairA.privateKeyHex);

    const result = await verifyLicenseKey(key, pairB.publicKeyHex);
    expect(result).toBeNull();
  });

  it('verify trả null khi payload bị sửa sau khi ký (tamper)', async () => {
    const { privateKeyHex, publicKeyHex } = await generateLicenseKeyPair();
    const payload = { entitlements: ['app.ceremony'], expiry: null };
    const key = await signLicense(payload, privateKeyHex);

    const [payloadB64, sigB64] = key.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ entitlements: ['app.ceremony', 'app.tts-studio'], expiry: null }),
    )
      .toString('base64url');
    const tamperedKey = `${tamperedPayload}.${sigB64}`;
    void payloadB64;

    const result = await verifyLicenseKey(tamperedKey, publicKeyHex);
    expect(result).toBeNull();
  });

  it('verify trả null khi chuỗi license key sai định dạng', async () => {
    const { publicKeyHex } = await generateLicenseKeyPair();
    expect(await verifyLicenseKey('không-phải-license-key', publicKeyHex)).toBeNull();
    expect(await verifyLicenseKey('', publicKeyHex)).toBeNull();
    expect(await verifyLicenseKey('a.b.c', publicKeyHex)).toBeNull();
  });

  it('verify giữ nguyên entitlements/expiry/deviceBinding qua round-trip', async () => {
    const { privateKeyHex, publicKeyHex } = await generateLicenseKeyPair();
    const payload = {
      entitlements: ['app.ceremony', 'feature.ceremony.voice-clone'],
      expiry: '2027-01-01T00:00:00.000Z',
      deviceBinding: 'device-abc-123',
    };
    const key = await signLicense(payload, privateKeyHex);

    const result = await verifyLicenseKey(key, publicKeyHex);
    expect(result).toEqual(payload);
  });
});
