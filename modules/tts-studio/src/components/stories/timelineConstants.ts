/** Hằng số layout canvas timeline — dùng chung giữa Timeline/TimelineItem. */

/** Tỉ lệ pixel/giây MẶC ĐỊNH lúc mở Story — Phase 4.5 thêm zoom (`Timeline.tsx`'s state
 *  `pxPerMs`), các hằng số PX_PER_* cũ (cố định, không zoom được) đã bỏ. */
export const DEFAULT_PX_PER_SEC = 60;
export const DEFAULT_PX_PER_MS = DEFAULT_PX_PER_SEC / 1000;
export const MIN_PX_PER_MS = 0.01; // ~10s hiện đủ trong 100px — zoom out tối đa
export const MAX_PX_PER_MS = 0.5;  // 1 giây = 500px — zoom in tối đa

/** Chiều cao 1 hàng track, px. */
export const TRACK_HEIGHT = 72;

/** Độ dài hiệu dụng (sau trim) tối thiểu 1 item được phép còn lại — kéo handle trim quá giới
 *  hạn này sẽ bị chặn lại, tránh tạo item 0ms không nghe được gì. */
export const MIN_EFFECTIVE_MS = 150;

/** Khoảng dịch chuột tối thiểu (px) để tính là "đang kéo" thay vì "bấm chọn" — dưới ngưỡng
 *  này, pointerup được coi là click (chọn item), không commit thay đổi vị trí/trim. */
export const DRAG_THRESHOLD_PX = 3;
