import { ChevronDown, ChevronUp, Lock, Pin, PinOff, Unlock } from 'lucide-react';
import type { LayoutItem } from '@sky-app/slide-shared';
import { SyncBadge } from '../SyncBadge.js';
import { cn } from '../../lib/cn.js';

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
  
  const iconBtnClass = "cursor-pointer text-[#9a9bab] border border-[#e6e6ee] rounded-[7px] w-[26px] h-[26px] flex items-center justify-center bg-transparent hover:bg-[#f4f5f9]";

  return (
    <div className="p-[13px_15px] border-b border-[#e6e6ee]">
      <div className="flex items-center gap-[9px] mb-2">
        <span className="font-bold text-[13px]">{typeName[item.type]}</span>
        <SyncBadge item={item} isParent={isSyncParent} size={13} />
        <span className="flex-1" />
        <button onClick={() => patch({ box: { ...item.box, z: (item.box.z ?? 0) + 1 } })} aria-label="Lên 1 lớp" className={iconBtnClass}>
          <ChevronUp size={13} />
        </button>
        <button onClick={() => patch({ box: { ...item.box, z: (item.box.z ?? 0) - 1 } })} aria-label="Xuống 1 lớp" className={iconBtnClass}>
          <ChevronDown size={13} />
        </button>
        <button
          onClick={() => patch({ locked: !item.locked })}
          aria-label={item.locked ? 'Mở khoá di chuyển' : 'Khoá di chuyển'}
          title={item.locked ? 'Đang khoá — không kéo được trên canvas' : 'Khoá để tránh kéo nhầm'}
          className={cn(iconBtnClass, item.locked ? 'text-[#4b57e6]' : 'text-[#9a9bab]')}
        >
          {item.locked ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
        {item.syncRef && (
          <button onClick={onToggleLock} aria-label={item.syncLocked ? 'Mở khoá đồng bộ' : 'Khoá đồng bộ'} className={iconBtnClass}>
            {item.syncLocked ? <Unlock size={13} /> : <Lock size={13} />}
          </button>
        )}
        <span onClick={onDelete} className={iconBtnClass}>
          🗑
        </span>
      </div>
      <input
        type="text"
        value={item.name ?? ''}
        onChange={(e) => patch({ name: e.target.value || undefined })}
        placeholder="Đặt tên (tuỳ chọn)…"
        className="w-full border border-[#e6e6ee] rounded-[7px] p-[6px_8px] text-[11.5px]"
      />
    </div>
  );
}
