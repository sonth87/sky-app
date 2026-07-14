/**
 * Ký license — chỉ dùng phía PHÁT HÀNH (CLI cấp key nội bộ, test), KHÔNG bao giờ
 * chạy trong app đã phát hành cho khách (private key không được nhúng vào app).
 */
import { getPublicKeyAsync, signAsync, utils } from '@noble/ed25519';
import type { LicensePayload } from '@sky-app/service-contracts';
import { encodeLicenseKey } from './verify.js';
import { bytesToHex, hexToBytes } from './hex.js';

export interface LicenseKeyPair {
  privateKeyHex: string;
  publicKeyHex: string;
}

/** Sinh cặp khóa mới — chạy 1 lần khi thiết lập, private key giữ bí mật (KHÔNG commit). */
export async function generateLicenseKeyPair(): Promise<LicenseKeyPair> {
  const privateKey = utils.randomSecretKey();
  const publicKey = await getPublicKeyAsync(privateKey);
  return { privateKeyHex: bytesToHex(privateKey), publicKeyHex: bytesToHex(publicKey) };
}

/** Ký 1 license payload bằng private key — trả license key dạng chuỗi để giao khách. */
export async function signLicense(
  payload: LicensePayload,
  privateKeyHex: string,
): Promise<string> {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const privateKey = hexToBytes(privateKeyHex);
  const signature = await signAsync(payloadBytes, privateKey);
  return encodeLicenseKey(payload, signature);
}
