import { ChevronDown, ChevronUp, Lock, Pin, PinOff, Unlock } from 'lucide-react';
import type { LayoutItem } from '@sky-app/slide-shared';
import { SyncBadge } from '../SyncBadge.js';

export interface PanelHeaderProps {
  item: LayoutItem;
  isSyncParent: boolean;
  patch: (p: Partial<LayoutItem>) => void;
  onDelete: () => void;
  onToggleLock: () => void;
}

export function PanelHeader({
  item,
  isSyncParent,
  patch,
  onDelete,
  onToggleLock,
}: PanelHeaderProps) {
  const typeName: Record<LayoutItem['type'], string> = {
    text: 'Văn bản',
    ribbon: 'Ruy-băng',
    image: 'Hình ảnh',
    shape: 'Hình khối',
    loop: 'Khung lặp',
  };
  const iconBtnStyle: React.CSSProperties = {
    cursor: 'pointer',
    color: '#9a9bab',
    border: '1px solid #e6e6ee',
    borderRadius: 7,
    width: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
  };
  return (
    <div style={{ padding: '13px 15px', borderBottom: '1px solid #e6e6ee' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{typeName[item.type]}</span>
        <SyncBadge item={item} isParent={isSyncParent} size={13} />
        <span style={{ flex: 1 }} />
        {/* z-order — Box.z (Bước 2). Bằng nhau → thứ tự mảng variant.items[] vẫn là tie-breaker,
           không cần xử lý gì thêm ở đây. */}
        <button onClick={() => patch({ box: { ...item.box, z: (item.box.z ?? 0) + 1 } })} aria-label="Lên 1 lớp" style={iconBtnStyle}>
          <ChevronUp size={13} />
        </button>
        <button onClick={() => patch({ box: { ...item.box, z: (item.box.z ?? 0) - 1 } })} aria-label="Xuống 1 lớp" style={iconBtnStyle}>
          <ChevronDown size={13} />
        </button>
        {/* locked (Bước 2) — khoá DI CHUYỂN thông thường, dùng icon Pin/PinOff — CỐ Ý KHÁC icon
           Lock/Unlock của syncLocked bên dưới (khoá ĐỒNG BỘ giữa variant) để tránh nhầm lẫn 2
           khái niệm khoá độc lập nhau (review 2026-07-18, Bước 2 kế hoạch). */}
        <button
          onClick={() => patch({ locked: !item.locked })}
          aria-label={item.locked ? 'Mở khoá di chuyển' : 'Khoá di chuyển'}
          title={item.locked ? 'Đang khoá — không kéo được trên canvas' : 'Khoá để tránh kéo nhầm'}
          style={{ ...iconBtnStyle, color: item.locked ? 'var(--accent-color, #4b57e6)' : '#9a9bab' }}
        >
          {item.locked ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
        {item.syncRef && (
          <button onClick={onToggleLock} aria-label={item.syncLocked ? 'Mở khoá đồng bộ' : 'Khoá đồng bộ'} style={iconBtnStyle}>
            {item.syncLocked ? <Unlock size={13} /> : <Lock size={13} />}
          </button>
        )}
        <span onClick={onDelete} style={{ ...iconBtnStyle, cursor: 'pointer' }}>
          🗑
        </span>
      </div>
      {/* name (Bước 2) — nhãn tuỳ chỉnh hiện trong Layers panel (Flyout.tsx's LayersPanel),
         KHÔNG bắt buộc — bỏ trống thì Layers fallback về nhãn tự sinh theo content/type như cũ. */}
      <input
        type="text"
        value={item.name ?? ''}
        onChange={(e) => patch({ name: e.target.value || undefined })}
        placeholder="Đặt tên (tuỳ chọn)…"
        style={{ width: '100%', border: '1px solid #e6e6ee', borderRadius: 7, padding: '6px 8px', fontSize: 11.5 }}
      />
    </div>
  );
}
