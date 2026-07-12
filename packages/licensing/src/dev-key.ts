/**
 * Public key Ed25519 dùng chung cho MỌI shell (Electron, Web, ...) trong dev
 * — 1 license được cấp cho khách phải verify được ở bất kỳ shell nào họ
 * dùng, nên chỉ có 1 nguồn chân lý cho public key thay vì mỗi app tự copy
 * (dễ lệch khi đổi key). CHỈ dùng verify chữ ký, không có khả năng tự ký
 * license — an toàn để nhúng vào app đã build.
 *
 * ⚠️ Đây là DEV KEY dùng để chứng minh chuỗi hoạt động end-to-end (GĐ6-7) —
 * private key tương ứng KHÔNG được commit (xem scripts/gen-dev-license.mjs,
 * nơi nó tồn tại dạng hằng số công khai — chỉ hợp lệ cho dev/test).
 * Trước khi phát hành thật: sinh cặp key mới (generateLicenseKeyPair()),
 * giữ private key ngoài repo, KHÔNG dùng hằng số này.
 */
export const DEV_LICENSE_PUBLIC_KEY_HEX =
  '7862b6b9d24f3321a29f300306479ef1025e1cc5ec44ce4b7fe42d3937102885';
