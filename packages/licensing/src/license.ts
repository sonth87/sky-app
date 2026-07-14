import type { LicensePayload } from '@sky-app/service-contracts';

export interface IsPayloadValidOptions {
  /** Device id hiện tại — so khớp payload.deviceBinding nếu có. Bỏ qua nếu không truyền. */
  deviceId?: string;
  /** Thời điểm kiểm — mặc định now(), truyền vào để test được. */
  now?: Date;
}

/**
 * Payload đã verify chữ ký hợp lệ (verifyLicenseKey) không tự nhiên nghĩa là còn
 * dùng được — còn phải chưa hết hạn, và khớp deviceBinding nếu license có ràng buộc
 * thiết bị. Tách riêng khỏi verify chữ ký vì "còn hạn" phụ thuộc thời điểm gọi.
 */
export function isPayloadValid(payload: LicensePayload, opts: IsPayloadValidOptions = {}): boolean {
  const now = opts.now ?? new Date();
  if (payload.expiry !== null) {
    const expiry = new Date(payload.expiry);
    if (Number.isNaN(expiry.getTime())) return false;
    if (expiry.getTime() < now.getTime()) return false;
  }
  if (payload.deviceBinding !== undefined && opts.deviceId !== undefined) {
    if (payload.deviceBinding !== opts.deviceId) return false;
  }
  return true;
}
