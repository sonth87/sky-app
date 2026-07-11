/**
 * LicensePort — đọc + verify license. Electron: file + OS keystore.
 * Web: gọi license server. Xem docs/guides/licensing-entitlement.md.
 */
export interface LicensePayload {
  entitlements: string[];
  expiry: string | null;
  deviceBinding?: string;
}

export interface LicensePort {
  getCurrent(): Promise<LicensePayload | null>;
  /** Verify chữ ký + expiry, trả về payload nếu hợp lệ */
  verify(licenseKey: string): Promise<LicensePayload | null>;
  /** Refresh entitlement từ license server nếu có mạng — không bắt buộc để hoạt động offline */
  refresh(): Promise<LicensePayload | null>;
}
