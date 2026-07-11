/**
 * Hằng số dùng chung giữa main process (electron) và renderer.
 * Nguồn DUY NHẤT — không hardcode lại ở nơi khác.
 */

/** Ngưỡng dung lượng file ZIP import (Node Buffer trần ~4GB). */
export const IMPORT_WARN_SIZE = 1.5 * 1024 ** 3; // 1.5GB — cảnh báo nhưng vẫn cho import
export const IMPORT_MAX_SIZE = 2 * 1024 ** 3;     // 2GB — chặn hẳn (adm-zip in-memory sẽ crash)

/** Định dạng bytes → "X.XGB" (dùng chung cho cảnh báo dung lượng). */
export function formatGB(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
}
