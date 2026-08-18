/** Hằng số layout canvas timeline — dùng chung giữa Timeline/TimelineTrack/TimelineItem. */

/** Tỉ lệ pixel/giây cố định — không có zoom ở v1 (xem kế hoạch Phase 4's "cắt phạm vi"). */
export const PX_PER_SEC = 60;
export const PX_PER_MS = PX_PER_SEC / 1000;

/** Chiều cao 1 hàng track, px. */
export const TRACK_HEIGHT = 72;

/** Độ dài hiệu dụng (sau trim) tối thiểu 1 item được phép còn lại — kéo handle trim quá giới
 *  hạn này sẽ bị chặn lại, tránh tạo item 0ms không nghe được gì. */
export const MIN_EFFECTIVE_MS = 150;

/** Khoảng dịch chuột tối thiểu (px) để tính là "đang kéo" thay vì "bấm chọn" — dưới ngưỡng
 *  này, pointerup được coi là click (chọn item), không commit thay đổi vị trí/trim. */
export const DRAG_THRESHOLD_PX = 3;
