// Hàm thuần cho rotate-handle (Bước 4 kế hoạch resize/rotate, 2026-07-18) — tách khỏi UI để test
// độc lập, cùng convention snap.ts/viewport.ts.

/** Góc (độ) từ tâm (cx,cy) tới điểm (px,py), 0° = hướng LÊN (12 giờ), tăng dần THEO CHIỀU KIM
 * ĐỒNG HỒ — khớp trực giác "xoay" người dùng quen thuộc hơn atan2 toán học chuẩn (0°=phải,
 * ngược kim đồng hồ). atan2(dx, -dy): đảo trục Y (màn hình Y hướng xuống) + hoán vị x/y để 0°
 * ứng với hướng lên thay vì hướng phải. */
export function angleFromCenter(cx: number, cy: number, px: number, py: number): number {
  const dx = px - cx;
  const dy = py - cy;
  const rad = Math.atan2(dx, -dy);
  const deg = (rad * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

/** Chuẩn hoá góc bất kỳ về [0, 360) — dùng cho cả slider (Bước 1) lẫn drag-handle (Bước 4) để
 * 2 đường nhập cho cùng 1 kết quả nhất quán (VD -10 → 350, 370 → 10). */
export function normalizeRotation(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/**
 * Cộng dồn delta góc thay vì dùng góc tuyệt đối mỗi frame — tránh giật 1 vòng khi con trỏ đi
 * qua biên 180°/-180° (atan2 nhảy cực tại đó). So `currentAngle` với `prevAngle` (2 lần gọi
 * atan2 LIÊN TIẾP, cách nhau 1 frame kéo chuột — không phải góc tuyệt đối từ lúc bắt đầu kéo),
 * chọn hướng đi NGẮN NHẤT (delta trong khoảng (-180, 180]) rồi cộng dồn vào rotation hiện tại.
 */
export function accumulateRotation(baseRotation: number, prevAngle: number, currentAngle: number): number {
  let delta = currentAngle - prevAngle;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return normalizeRotation(baseRotation + delta);
}
