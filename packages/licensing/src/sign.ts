/**
 * Ký license — chỉ dùng phía PHÁT HÀNH (CLI cấp key nội bộ, test), KHÔNG bao giờ
 * chạy trong app đã phát hành cho khách (private key không được nhúng vào app).
 */
import { getPublicKeyAsync, signAsync, utils } from '@noble/ed25519';
import type { LicensePayload } from '@sky-app/service-contracts';
import { encodeLicenseKey } from './verify.js';

export interface LicenseKeyPair {
  privateKeyHex: string;
  publicKeyHex: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
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
