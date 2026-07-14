/**
 * Hex <-> bytes helpers dùng chung cho verify.ts (verify chữ ký) và sign.ts
 * (ký + sinh keypair) — tách ra đây để tránh 2 bản định nghĩa trùng identical
 * (audit GĐ7.5, mục E4 #1: packages/licensing/src/verify.ts:68-75 và
 * sign.ts:20-27 trước khi tách).
 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
