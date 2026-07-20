// AddVariantModal — chọn tỷ lệ, dùng cho 2 mục đích (icon "+" Thêm tỷ lệ MỚI, và icon "Đổi tỷ lệ"
// khi hover tab — đổi aspect CỦA CHÍNH variant đang có, xem changeVariantAspectCommand). Danh
// sách preset PHỔ BIẾN (không đóng cứng — slide-shared's AspectRatio cho phép mọi id, xem
// "custom:WxH" bên dưới), disable preset đã dùng trong layout hiện tại (mỗi tỷ lệ chỉ 1 variant/
// layout). Mục "Tuỳ chỉnh" cuối danh sách cho tự nhập W:H bất kỳ.

import { useState } from 'react';
import type { AspectRatio } from '@sky-app/slide-shared';

const PRESETS: { id: string; w: number; h: number; label: string }[] = [
  { id: '16:9', w: 16, h: 9, label: '16:9 — Màn hình rộng' },
  { id: '4:3', w: 4, h: 3, label: '4:3 — Tiêu chuẩn' },
  { id: '21:9', w: 21, h: 9, label: '21:9 — Ultrawide' },
  { id: '25:9', w: 25, h: 9, label: '25:9 — Màn ghép LED' },
  { id: '32:9', w: 32, h: 9, label: '32:9 — Siêu rộng' },
  { id: '1:1', w: 1, h: 1, label: '1:1 — Vuông' },
  { id: '9:16', w: 9, h: 16, label: '9:16 — Dọc (điện thoại)' },
  { id: '3:4', w: 3, h: 4, label: '3:4 — Dọc tiêu chuẩn' },
];

export interface AddVariantModalProps {
  usedAspectIds: Set<string>;
  onClose: () => void;
  onConfirm: (aspect: AspectRatio) => void;
  /** Bỏ trống = tiêu đề "Thêm tỷ lệ màn hình", nút "Thêm" (hành vi mặc định — nút "+"). Truyền
   * vào khi dùng cho "Đổi tỷ lệ" (hover tab) — tiêu đề/nút khác để không gây hiểu nhầm 2 hành vi. */
  title?: string;
  confirmLabel?: string;
}

export function AddVariantModal({ usedAspectIds, onClose, onConfirm, title = 'Thêm tỷ lệ màn hình', confirmLabel = 'Thêm' }: AddVariantModalProps) {
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');
  // Trạng thái hover cho từng preset (review 2026-07-18: "khi bật phần chọn thay đổi tỷ lệ màn
  // hình thì cho trạng thái hover đi" — trước đó background luôn 'transparent' cố định, không có
  // phản hồi thị giác khi rê chuột qua, khác các danh sách khác trong module đã có hover — VD
  // VariantTabs.tsx's hoveredVariantId).
  const [hoveredPresetId, setHoveredPresetId] = useState<string | null>(null);

  const customWNum = Number(customW);
  const customHNum = Number(customH);
  const customValid = customW.trim() !== '' && customH.trim() !== '' && customWNum > 0 && customHNum > 0;
  const customId = customValid ? `custom:${customWNum}x${customHNum}` : '';
  const customUsed = customValid && usedAspectIds.has(customId);

  function confirmCustom() {
    if (!customValid || customUsed) return;
    // Không gán label dài — tab (VariantTabs) hiện gọn "customWxH" qua fallback aspect.id, nhất
    // quán với preset (xem comment ở nút preset bên dưới).
    onConfirm({ id: customId, w: customWNum, h: customHNum });
  }

  return (
    <>
      {/* Backdrop — click ra ngoài để đóng, KHÔNG dùng position:fixed (containing-block bug đã
         gặp ở Flyout.tsx ghost label — root app device-layout giữ transform inline thường trực).
         stopPropagation() BẮT BUỘC — khi dùng cho "Đổi tỷ lệ" (lồng trong tab của VariantTabs.tsx),
         backdrop nằm bên trong div tab vốn CŨNG có onClick riêng (mở lại popover 3 nút) — không
         chặn bubble thì click ra ngoài sẽ đóng rồi MỞ LẠI NGAY do event nổi lên tab cha (bug thật,
         báo 2026-07-18). Vô hại khi dùng cho nút "+" (không lồng trong tab). */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{ position: 'absolute', inset: '-1000px', zIndex: 9 }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 6,
          width: 260,
          background: '#fff',
          border: '1px solid #e6e6ee',
          borderRadius: 11,
          boxShadow: '0 14px 34px rgba(20,20,40,.18)',
          zIndex: 10,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '10px 12px 6px', fontWeight: 700, fontSize: 12, color: '#5c5d6e' }}>{title}</div>
        <div style={{ maxHeight: 260, overflowY: 'auto', padding: '2px 6px' }}>
          {PRESETS.map((p) => {
            const disabled = usedAspectIds.has(p.id);
            const hovered = !disabled && hoveredPresetId === p.id;
            return (
              <button
                key={p.id}
                disabled={disabled}
                // KHÔNG gán p.label (mô tả dài "16:9 — Màn hình rộng") vào AspectRatio.label —
                // đó là text CHỈ DÙNG hiển thị trong modal này; VariantTabs cần label NGẮN GỌN
                // (chính aspect.id, "16:9") để tab không bị dài quá khổ. Bỏ trống label → tab
                // fallback hiện aspect.id (xem VariantTabs.tsx: v.aspect.label ?? v.aspect.id).
                onClick={() => onConfirm({ id: p.id, w: p.w, h: p.h })}
                onMouseEnter={() => setHoveredPresetId(p.id)}
                onMouseLeave={() => setHoveredPresetId((cur) => (cur === p.id ? null : cur))}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 8px',
                  borderRadius: 7,
                  border: 'none',
                  background: hovered ? '#f4f5f9' : 'transparent',
                  color: disabled ? '#c9c9d3' : '#26262e',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: disabled ? 'default' : 'pointer',
                  transition: 'background 0.1s ease',
                }}
              >
                {p.label}
                {disabled && <span style={{ marginLeft: 6, fontWeight: 400, fontSize: 10.5 }}>(đã dùng)</span>}
              </button>
            );
          })}
        </div>
        <div style={{ borderTop: '1px solid #f0f0f5', padding: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 11, color: '#9a9bab', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Tuỳ chỉnh</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="number"
              min={1}
              placeholder="W"
              value={customW}
              onChange={(e) => setCustomW(e.target.value)}
              style={{ width: 0, flex: 1, border: '1px solid #e6e6ee', borderRadius: 7, padding: '6px 8px', fontSize: 12 }}
            />
            <span style={{ color: '#9a9bab', fontSize: 12 }}>:</span>
            <input
              type="number"
              min={1}
              placeholder="H"
              value={customH}
              onChange={(e) => setCustomH(e.target.value)}
              style={{ width: 0, flex: 1, border: '1px solid #e6e6ee', borderRadius: 7, padding: '6px 8px', fontSize: 12 }}
            />
            <button
              onClick={confirmCustom}
              disabled={!customValid || customUsed}
              style={{
                padding: '6px 12px',
                borderRadius: 7,
                border: 'none',
                background: !customValid || customUsed ? '#e6e6ee' : 'var(--accent-color, #4b57e6)',
                color: !customValid || customUsed ? '#9a9bab' : '#fff',
                fontWeight: 700,
                fontSize: 11.5,
                cursor: !customValid || customUsed ? 'default' : 'pointer',
              }}
            >
              {confirmLabel}
            </button>
          </div>
          {customUsed && <div style={{ fontSize: 10.5, color: '#e05656', marginTop: 4 }}>Tỷ lệ này đã có trong layout.</div>}
        </div>
      </div>
    </>
  );
}
