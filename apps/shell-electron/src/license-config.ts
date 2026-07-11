/**
 * Public key Ed25519 nhúng trong app — verify license offline (xem
 * docs/guides/licensing-entitlement.md). CHỈ dùng verify chữ ký, không có
 * khả năng tự ký license — an toàn để nhúng vào app đã build.
 *
 * ⚠️ Đây là DEV KEY dùng cho GĐ6 (chứng minh chuỗi hoạt động end-to-end) —
 * private key tương ứng KHÔNG được commit (xem scripts/gen-dev-license.mjs).
 * Trước khi phát hành thật: sinh cặp key mới (generateLicenseKeyPair()),
 * giữ private key ngoài repo, thay hằng số này bằng public key thật.
 */
export const DEV_LICENSE_PUBLIC_KEY_HEX =
  '7862b6b9d24f3321a29f300306479ef1025e1cc5ec44ce4b7fe42d3937102885';
