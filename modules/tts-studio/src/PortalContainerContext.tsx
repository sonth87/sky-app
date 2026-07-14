import { createContext, useContext, type RefObject } from 'react';

/**
 * Container DOM cho mọi Radix Portal — trỏ vào root wrapper của TTS Studio
 * (`.tts-studio-root`) thay vì mặc định document.body. Bắt buộc vì styles.css
 * scope biến theme theo `.tts-studio-root` — portal ra ngoài subtree đó sẽ mất
 * hết theme (xem docs/guides/app-css-theming.md Rule 4).
 */
const PortalContainerContext = createContext<RefObject<HTMLElement | null> | null>(null);

export function usePortalContainer(): HTMLElement | undefined {
  const ref = useContext(PortalContainerContext);
  return ref?.current ?? undefined;
}

export { PortalContainerContext };
