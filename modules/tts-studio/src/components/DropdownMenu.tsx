import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePortalContainer } from '../PortalContainerContext';

export interface DropdownMenuItemDef {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  destructive?: boolean;
}

export interface DropdownMenuProps {
  trigger: ReactNode;
  /** Danh sách hành động TĨNH, biết trước lúc render. Bỏ qua nếu dùng `children` (nội dung
   *  ĐỘNG, vd lazy-load version list — xem `VersionPicker` trong TimelineItem.tsx). */
  items?: DropdownMenuItemDef[];
  /** Nội dung tự vẽ bên trong menu — dùng khi danh sách cần tải bất đồng bộ (không biết trước
   *  lúc mở), thay cho `items`. */
  children?: ReactNode;
  /** Nhãn cho nút trigger (a11y) — vd 'Tuỳ chọn Story "Lễ tốt nghiệp"'. */
  triggerLabel: string;
  /** Class thêm cho nút trigger — mặc định ẩn tới khi hover cha có `group` (đúng pattern
   *  `StoriesTab.tsx` đang dùng cho nút xoá Story hiện có). */
  triggerClassName?: string;
}

/**
 * Menu 3 chấm tối giản — không dùng thư viện (Radix/headlessui chưa có trong repo), tự dựng
 * bằng vị trí tuyệt đối theo `getBoundingClientRect()` của nút trigger + portal ra
 * `.tts-studio-root` (đúng lý do `PromptDialog`/`AlertDialog` portal, xem docstring 2 file
 * đó — giữ trong subtree để không mất biến theme). Đóng khi click ra ngoài hoặc Escape.
 */
export function DropdownMenu({ trigger, items, children, triggerLabel, triggerClassName }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const portalContainer = usePortalContainer();

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    const containerRect = portalContainer?.getBoundingClientRect();
    if (rect) {
      setPosition({
        top: rect.bottom - (containerRect?.top ?? 0) + 4,
        left: rect.right - (containerRect?.left ?? 0) - 160, // căn phải theo mép trigger, menu rộng ~160px
      });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const menu = open && (
    <div
      ref={menuRef}
      style={{ position: 'absolute', top: position.top, left: Math.max(4, position.left) }}
      className="z-30 w-40 rounded-lg border border-border bg-popover py-1 shadow-md"
    >
      {children ?? items?.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={() => { setOpen(false); item.onClick(); }}
          className={
            item.destructive
              ? 'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-2xs text-destructive hover:bg-destructive/10'
              : 'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-2xs text-foreground hover:bg-muted/60'
          }
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        onClick={(e) => { e.stopPropagation(); open ? setOpen(false) : openMenu(); }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {menu && (portalContainer ? createPortal(menu, portalContainer) : menu)}
    </>
  );
}
