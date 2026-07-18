// VariantTabs — thanh tab tỷ lệ (variant) nổi góc trên-trái canvas, theo 12-thu-vien-layout.md
// §"Vị trí thao tác Sao chép": "[Thanh tab tỷ lệ trên canvas] 16:9 25:9 [+ Thêm tỷ lệ ▾]".
// Mỗi LayoutDocument có thể có NHIỀU variant (biến thể theo tỷ lệ màn hình — khác nhau về
// refW/refH/background/items, xem slide-shared/layout/types.ts's LayoutVariant) — tab này cho
// phép chuyển qua lại và thêm tỷ lệ mới TRỰC TIẾP trong 1 layout đang mở.
//
// Review 2026-07-18 (mới nhất): CLICK vào BẤT KỲ tab nào (active hay không) → LUÔN mở 1 popover
// 3 nút (Copy / Đổi tỷ lệ / Xoá — nút Xoá màu đỏ) bên dưới tab đó, ĐỒNG THỜI chuyển active nếu
// tab đó chưa active — thay cho 2 icon nhỏ hiện khi hover (Copy, RefreshCw) của bản trước đó.
// Trước đó (review 2026-07-18 sớm hơn trong ngày): nút Copy/Đổi-tỷ-lệ CHỈ hiện khi HOVER, hover
// highlight cho tab, và confirm 1 lớp trước khi xoá variant — các phần này GIỮ NGUYÊN không đổi.

import { useState } from 'react';
import { Copy, Plus, RefreshCw, X } from 'lucide-react';
import type { AspectRatio, LayoutVariant } from '@sky-app/slide-shared';
import type { OverwriteAllLockStrategy } from '@sky-app/layout-editor-core';
import { AddVariantModal } from './AddVariantModal.js';
import { CopyVariantPopover, type CopyVariantMode } from './CopyVariantPopover.js';

export interface VariantTabsProps {
  variants: LayoutVariant[];
  activeVariantId: string;
  onSelect: (variantId: string) => void;
  onAdd: (aspect: AspectRatio) => void;
  /** Bỏ trống = ẩn nút xoá trên tab (VD khi chỉ còn 1 variant — không cho xoá variant cuối). */
  onRemove?: (variantId: string) => void;
  /** Bỏ trống = ẩn nút "Copy từ tỷ lệ khác" — chỉ hiện khi có ≥2 variant (copy cần ít nhất 1
   * nguồn khác), cùng điều kiện với nút xoá. */
  onCopyFromVariant?: (sourceVariantId: string, targetVariantId: string, mode: CopyVariantMode, lockStrategy?: OverwriteAllLockStrategy) => void;
  /** Bỏ trống = ẩn nút "Đổi tỷ lệ" — đổi aspect CỦA CHÍNH variant đó tại chỗ (không tạo bản sao,
   * giữ nguyên liên kết sync đã có), khác hẳn onAdd (tạo variant MỚI). */
  onChangeAspect?: (variantId: string, newAspect: AspectRatio) => void;
}

/** Nhãn NGẮN GỌN cho tab — ưu tiên `label` NẾU nó ngắn (preset không gán label dài, xem
 * AddVariantModal.tsx), fallback về "w:h" tính từ aspect (đúng ý "text phải là tỷ lệ màn hình,
 * VD 16:9" — KHÔNG hiện thẳng `aspect.id` vì id custom có dạng "custom:5x2" xấu khi hiện). */
function formatAspectLabel(aspect: AspectRatio): string {
  return aspect.label ?? `${aspect.w}:${aspect.h}`;
}

/** Popover con nào đang mở, lồng từ popover 3 nút chính — `null` = chỉ hiện popover 3 nút, chưa
 * bấm vào nút con nào. */
type SubPopover = 'copy' | 'change-aspect' | 'remove' | null;

export function VariantTabs({ variants, activeVariantId, onSelect, onAdd, onRemove, onCopyFromVariant, onChangeAspect }: VariantTabsProps) {
  const [modalOpen, setModalOpen] = useState(false);
  // Tab nào đang mở popover 3 nút (Copy/Đổi tỷ lệ/Xoá) — CLICK vào tab BẤT KỲ (kể cả đang active)
  // sẽ mở popover này, thay cho 2 icon nhỏ hiện khi hover ở bản trước (review 2026-07-18 mới nhất).
  const [actionVariantId, setActionVariantId] = useState<string | null>(null);
  const [subPopover, setSubPopover] = useState<SubPopover>(null);
  const [hoveredVariantId, setHoveredVariantId] = useState<string | null>(null);
  const usedAspectIds = new Set(variants.map((v) => v.aspect.id));

  const closeAll = () => {
    setActionVariantId(null);
    setSubPopover(null);
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 5,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: '#fff',
        border: '1px solid #e6e6ee',
        borderRadius: 10,
        padding: 4,
        boxShadow: '0 4px 14px rgba(0,0,0,.08)',
      }}
    >
      {variants.map((v) => {
        const active = v.aspect.id === activeVariantId;
        const hovered = hoveredVariantId === v.aspect.id;
        return (
          <div
            key={v.aspect.id}
            onClick={() => {
              // Click tab BẤT KỲ (active hay không) → vừa chuyển active (nếu chưa active) VỪA mở
              // popover 3 nút của CHÍNH tab đó (chốt 2026-07-18: "click vào tab thì vừa chuyển
              // tab (nếu chưa active), vừa hiện popover" — LUÔN LUÔN, không chỉ khi đã active).
              if (!active) onSelect(v.aspect.id);
              setActionVariantId(v.aspect.id);
              setSubPopover(null);
            }}
            onMouseEnter={() => setHoveredVariantId(v.aspect.id)}
            onMouseLeave={() => setHoveredVariantId((cur) => (cur === v.aspect.id ? null : cur))}
            style={{
              position: 'relative', // containing block cho popover/modal của CHÍNH tab này
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              height: 26,
              padding: '0 8px',
              borderRadius: 7,
              cursor: 'pointer',
              // Hover highlight nhẹ (khác màu active — active dùng accent, hover dùng xám nhạt để
              // phân biệt rõ "đang xem" vs "đang rê chuột qua") — chỉ áp dụng khi KHÔNG active
              // (tab active đã có màu riêng, không cần thêm hiệu ứng hover chồng lên).
              background: active ? 'color-mix(in srgb, var(--accent-color, #4b57e6) 12%, transparent)' : hovered ? '#f4f5f9' : 'transparent',
              color: active ? 'var(--accent-color, #4b57e6)' : '#5c5d6e',
              fontWeight: 600,
              fontSize: 11.5,
              transition: 'background 0.1s ease',
            }}
          >
            <span>{formatAspectLabel(v.aspect)}</span>
            {actionVariantId === v.aspect.id && subPopover === null && (
              <VariantActionPopover
                label={formatAspectLabel(v.aspect)}
                canCopy={Boolean(onCopyFromVariant) && variants.length > 1}
                canChangeAspect={Boolean(onChangeAspect)}
                canRemove={Boolean(onRemove) && variants.length > 1}
                onClose={closeAll}
                onPickCopy={() => setSubPopover('copy')}
                onPickChangeAspect={() => setSubPopover('change-aspect')}
                onPickRemove={() => setSubPopover('remove')}
              />
            )}
            {actionVariantId === v.aspect.id && subPopover === 'copy' && onCopyFromVariant && (
              <CopyVariantPopover
                variants={variants}
                targetVariantId={v.aspect.id}
                onClose={closeAll}
                onConfirm={(sourceId, mode, lockStrategy) => {
                  onCopyFromVariant(sourceId, v.aspect.id, mode, lockStrategy);
                  closeAll();
                }}
              />
            )}
            {actionVariantId === v.aspect.id && subPopover === 'change-aspect' && onChangeAspect && (
              <AddVariantModal
                title={`Đổi tỷ lệ (hiện tại: ${formatAspectLabel(v.aspect)})`}
                confirmLabel="Đổi"
                // Loại trừ CHÍNH tỷ lệ hiện tại của variant này khỏi danh sách "đã dùng" — đổi
                // sang chính nó vô nghĩa nhưng không cần bị disable (không phải lỗi dữ liệu).
                usedAspectIds={new Set([...usedAspectIds].filter((id) => id !== v.aspect.id))}
                onClose={closeAll}
                onConfirm={(newAspect) => {
                  onChangeAspect(v.aspect.id, newAspect);
                  closeAll();
                }}
              />
            )}
            {actionVariantId === v.aspect.id && subPopover === 'remove' && onRemove && (
              <RemoveVariantConfirm
                label={formatAspectLabel(v.aspect)}
                onClose={closeAll}
                onConfirm={() => {
                  onRemove(v.aspect.id);
                  closeAll();
                }}
              />
            )}
          </div>
        );
      })}
      <button
        onClick={() => setModalOpen(true)}
        aria-label="Thêm tỷ lệ"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          borderRadius: 7,
          border: 'none',
          background: 'transparent',
          color: '#5c5d6e',
          cursor: 'pointer',
        }}
      >
        <Plus size={15} />
      </button>
      {modalOpen && (
        <AddVariantModal
          usedAspectIds={usedAspectIds}
          onClose={() => setModalOpen(false)}
          onConfirm={(aspect) => {
            onAdd(aspect);
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Popover 3 nút (Copy / Đổi tỷ lệ / Xoá) mở khi CLICK vào tab (review 2026-07-18 mới nhất) —
 * thay cho 2 icon nhỏ hiện khi hover ở bản trước. Nút Xoá tô màu đỏ để phân biệt hành động phá
 * huỷ. Theo đúng pattern popover đã có: backdrop `position:absolute inset:-1000px` (KHÔNG dùng
 * `position:fixed` — containing-block bug đã gặp ở Flyout.tsx ghost label).
 */
function VariantActionPopover({
  label,
  canCopy,
  canChangeAspect,
  canRemove,
  onClose,
  onPickCopy,
  onPickChangeAspect,
  onPickRemove,
}: {
  label: string;
  canCopy: boolean;
  canChangeAspect: boolean;
  canRemove: boolean;
  onClose: () => void;
  onPickCopy: () => void;
  onPickChangeAspect: () => void;
  onPickRemove: () => void;
}) {
  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 10px',
    background: 'transparent',
    border: 'none',
    borderRadius: 7,
    fontWeight: 600,
    fontSize: 12.5,
    cursor: 'pointer',
    textAlign: 'left',
  };
  return (
    <>
      <div
        onClick={(e) => {
          // stopPropagation() BẮT BUỘC — backdrop này là CON của div tab (containing block cục
          // bộ), div tab cũng có onClick riêng (mở lại popover). Không chặn bubble thì click ra
          // ngoài sẽ: onClose() chạy → state reset → nhưng event bubble tiếp lên tab cha → tab's
          // onClick chạy NGAY SAU đó → mở lại popover → nhìn như "không đóng được" (bug thật,
          // 2026-07-18: user báo click ra ngoài không đóng popover Copy/Đổi tỷ lệ/Xoá).
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
          width: 190,
          background: '#fff',
          border: '1px solid #e6e6ee',
          borderRadius: 11,
          boxShadow: '0 14px 34px rgba(20,20,40,.18)',
          zIndex: 10,
          padding: 5,
        }}
      >
        <div style={{ padding: '5px 8px 7px', fontSize: 11, fontWeight: 700, color: '#9a9bab' }}>{label}</div>
        {canChangeAspect && (
          <button onClick={onPickChangeAspect} style={{ ...itemStyle, color: '#5c5d6e' }} onMouseEnter={(e) => (e.currentTarget.style.background = '#f4f5f9')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            <RefreshCw size={13} />
            Đổi tỷ lệ
          </button>
        )}
        {canCopy && (
          <button onClick={onPickCopy} style={{ ...itemStyle, color: '#5c5d6e' }} onMouseEnter={(e) => (e.currentTarget.style.background = '#f4f5f9')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            <Copy size={13} />
            Copy từ tỷ lệ khác
          </button>
        )}
        {canRemove && (
          <button onClick={onPickRemove} style={{ ...itemStyle, color: '#e05656' }} onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, #e05656 8%, transparent)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            <X size={13} />
            Xoá
          </button>
        )}
      </div>
    </>
  );
}

/** Confirm 1 lớp trước khi xoá variant — trước đó xoá NGAY không hỏi (review 2026-07-18). Theo
 * đúng pattern popover đã có (AddVariantModal/CopyVariantPopover): backdrop position:absolute
 * (KHÔNG dùng position:fixed — containing-block bug đã gặp ở Flyout.tsx ghost label). */
function RemoveVariantConfirm({ label, onClose, onConfirm }: { label: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <>
      <div
        onClick={(e) => {
          // stopPropagation() BẮT BUỘC — backdrop này là CON của div tab (containing block cục
          // bộ), div tab cũng có onClick riêng (mở lại popover). Không chặn bubble thì click ra
          // ngoài sẽ: onClose() chạy → state reset → nhưng event bubble tiếp lên tab cha → tab's
          // onClick chạy NGAY SAU đó → mở lại popover → nhìn như "không đóng được" (bug thật,
          // 2026-07-18: user báo click ra ngoài không đóng popover Copy/Đổi tỷ lệ/Xoá).
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
          padding: 14,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Xoá tỷ lệ {label}?</div>
        <div style={{ fontSize: 11.5, color: '#5c5d6e', marginBottom: 12 }}>Toàn bộ nội dung của tỷ lệ này sẽ bị xoá. Có thể hoàn tác bằng Ctrl/Cmd+Z.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '7px 0', background: '#f4f5f9', color: '#5c5d6e', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            Huỷ
          </button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '7px 0', background: '#e05656', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            Xoá
          </button>
        </div>
      </div>
    </>
  );
}
