import { createContext, useContext, type RefObject } from 'react';

/**
 * Container DOM cho mọi Radix Portal (Popover/DropdownMenu/Tooltip/Dialog/...) và
 * `InfoTip`'s createPortal — trỏ vào root wrapper của Ceremony (`.ceremony-root`,
 * xem ControlApp.tsx) thay vì mặc định document.body. Bắt buộc vì styles.css scope
 * biến theme theo `.ceremony-root` — portal ra ngoài subtree đó sẽ mất hết theme.
 */
const PortalContainerContext = createContext<RefObject<HTMLElement | null> | null>(null);

export function usePortalContainer(): HTMLElement | undefined {
  const ref = useContext(PortalContainerContext);
  return ref?.current ?? undefined;
}

export { PortalContainerContext };
