#!/usr/bin/env node
/**
 * Sinh 1 license key ký bằng DEV private key (chỉ dùng phát triển/test —
 * xem packages/licensing/src/dev-key.ts's DEV_LICENSE_PUBLIC_KEY_HEX để
 * biết public key tương ứng, dùng chung cho mọi shell — Electron lẫn Web).
 *
 * KHÔNG dùng script này để cấp license thật cho khách — private key ở đây
 * là hằng số công khai trong repo. Cấp license thật cần private key riêng,
 * sinh bằng generateLicenseKeyPair() và giữ ngoài repo.
 *
 * Usage: node scripts/gen-dev-license.mjs [entitlement...]
 *   node scripts/gen-dev-license.mjs app.ceremony
 *   node scripts/gen-dev-license.mjs app.ceremony feature.ceremony.voice-clone
 */
import { signLicense } from '../packages/licensing/dist/index.js';

// Khớp DEV_LICENSE_PUBLIC_KEY_HEX trong packages/licensing/src/dev-key.ts —
// đổi cả 2 nơi cùng lúc nếu sinh lại dev keypair (generateLicenseKeyPair()).
const DEV_PRIVATE_KEY_HEX = 'bdc8969c155855643090fd289d6f89f92148f87259f6bf75e052d664a1b4c89f';

const entitlements = process.argv.slice(2);
if (entitlements.length === 0) {
  console.error('Usage: node scripts/gen-dev-license.mjs <entitlement...>');
  console.error('  vd:  node scripts/gen-dev-license.mjs app.ceremony');
  process.exit(1);
}

const payload = { entitlements, expiry: null };
const licenseKey = await signLicense(payload, DEV_PRIVATE_KEY_HEX);

console.log(licenseKey);
