import { useResolvedAssetUrl } from '../../hooks/useResolvedAssetUrl.js';
import type { LayoutVariant } from '@sky-app/slide-shared';

/**
 * Nền + viền + bóng của Frame — tách RIÊNG khỏi artEl (containing items) thành 1 sibling
 * `position:absolute inset:0` phủ đúng vùng Frame, để `overflow:hidden`/`borderRadius` CỦA NÓ
 * không cắt items nằm trong artEl (bỏ overflow:hidden trên artEl 2026-07-18 — xem comment đầu
 * file). `pointerEvents:'none'` để không chặn thao tác chuột lên item nằm ĐÈ lên vị trí này.
 * KHÔNG có lưới chấm ở đây (đổi 2026-07-18 — lưới là trang trí của CANVAS/vùng làm việc, không
 * phải nội dung Frame, xem style của containerRef trong Canvas()) — Frame LUÔN có nền đặc (màu
 * tuỳ chỉnh hoặc trắng mặc định), không lộ lưới bên dưới dù variant chưa có background riêng.
 */
export function FrameSurface({ variant, resolvedBackgroundUrl }: { variant: LayoutVariant; resolvedBackgroundUrl: string | undefined }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 10,
        overflow: 'hidden',
        pointerEvents: 'none',
        // Viền rõ đánh dấu biên Frame — "trong = hiện trên slide thật, ngoài = vùng nháp/
        // backstage chỉ dùng để thao tác, không xuất bản" (xem comment đầu file).
        border: '1.5px solid rgba(20,10,50,.18)',
        // Mặc định TRẮNG khi không có background tuỳ chỉnh (đổi 2026-07-18, TRƯỚC ĐÓ mặc định
        // tím #201748 — đúng ý "nền canvas mặc định màu trắng"). Xử lý đủ 3 loại nền (color/
        // gradient/image) — trước đó CHỈ xử lý color, gradient/image bị bỏ sót (bug thật, dùng
        // FrameBackgroundControls chọn gradient/ảnh sẽ không thấy gì trên canvas).
        background:
          variant.background?.kind === 'color'
            ? variant.background.color
            : variant.background?.kind === 'gradient'
              ? variant.background.gradient
              : variant.background?.kind === 'image' && resolvedBackgroundUrl
                ? `center/cover url(${resolvedBackgroundUrl})`
                : '#fff',
        boxShadow: '0 20px 60px -20px rgba(20,10,50,.6)',
      }}
    />
  );
}

/** Nền khung "ô mẫu" khi đang ở chế độ sửa mẫu LoopItem (Bước 10) — trung tính, KHÁC FrameSurface
 * (không dùng background thật của variant, vì đây không phải render Frame chính). */
export function LoopEditFrameSurface() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 10,
        overflow: 'hidden',
        pointerEvents: 'none',
        border: '1.5px dashed var(--accent-color, #4b57e6)',
        background: '#f4f5f9',
      }}
    />
  );
}
