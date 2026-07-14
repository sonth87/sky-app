import type { SlideApi } from '@sky-app/slide-shared';

/** True khi chạy trong Electron shell (window.slide bridge có sẵn từ preload). */
export function isElectronRuntime(): boolean {
  return typeof window !== 'undefined' && !!window.slide;
}

const warned = new Set<string>();

/**
 * Safe accessor cho window.slide — trả undefined thay vì throw khi chạy
 * ngoài Electron (web chưa có adapter cho phần lớn API này, xem
 * docs/guides/ports-and-adapters.md). Log cảnh báo 1 lần/feature (key tùy
 * chọn) thay vì spam console mỗi lần gọi.
 */
export function useSlide(warnKey?: string): SlideApi | undefined {
  if (isElectronRuntime()) return window.slide;
  const key = warnKey ?? 'slide';
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(`[ceremony] window.slide không khả dụng ngoài Electron — tính năng "${key}" bị tắt trên web.`);
  }
  return undefined;
}
