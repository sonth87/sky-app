/**
 * Verify license Ed25519 offline — xem docs/guides/licensing-entitlement.md.
 *
 * Format license key: base64url(JSON payload) + "." + base64url(signature 64 byte).
 * Chữ ký áp trên UTF-8 bytes của JSON.stringify(payload) — decode phần trước dấu
 * "." ra bytes rồi verify/parse trực tiếp trên đúng bytes đó (không re-serialize),
 * để không lệch nếu key order hay whitespace khác giữa lúc ký và lúc verify.
 */
import { verifyAsync } from '@noble/ed25519';
import type { LicensePayload } from '@sky-app/service-contracts';
import { hexToBytes } from './hex.js';

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function encodeLicenseKey(payload: LicensePayload, signature: Uint8Array): string {
  const payloadB64 = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sigB64 = bytesToBase64Url(signature);
  return `${payloadB64}.${sigB64}`;
}

/**
 * Verify chữ ký + parse payload. KHÔNG kiểm expiry/deviceBinding — đó là bước
 * riêng ở license.ts's isPayloadValid(), vì "còn hạn không" phụ thuộc thời điểm
 * gọi, không phải một phần của việc verify chữ ký có hợp lệ hay không.
 */
export async function verifyLicenseKey(
  licenseKey: string,
  publicKeyHex: string,
): Promise<LicensePayload | null> {
  const parts = licenseKey.trim().split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  let payloadBytes: Uint8Array;
  let signature: Uint8Array;
  try {
    payloadBytes = base64UrlToBytes(payloadB64);
    signature = base64UrlToBytes(sigB64);
  } catch {
    return null;
  }

  const publicKey = hexToBytes(publicKeyHex);
  const valid = await verifyAsync(signature, payloadBytes, publicKey).catch(() => false);
  if (!valid) return null;

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(payloadBytes));
    return isLicensePayloadShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isLicensePayloadShape(v: unknown): v is LicensePayload {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    Array.isArray(p.entitlements) &&
    p.entitlements.every((e) => typeof e === 'string') &&
    (p.expiry === null || typeof p.expiry === 'string') &&
    (p.deviceBinding === undefined || typeof p.deviceBinding === 'string')
  );
}
