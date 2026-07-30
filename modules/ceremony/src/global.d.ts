import type { SlideApi } from '@sky-app/slide-shared';

declare global {
  interface Window {
    slide: SlideApi;
    /** Bridge kernel:* (packages/platform-electron/src/bridge-types.ts) — dùng trực tiếp ở
     * BackdropApp.tsx (cửa sổ Backdrop chưa có PlatformContext như control/, xem plan "Nối
     * backdrop trao giải + màn chờ sang LayoutRenderer", 2026-07-28). Khai lại tối thiểu tại đây
     * thay vì import từ @sky-app/platform-electron để tránh module phụ thuộc ngược 1 package
     * adapter cụ thể. */
    sky: {
      invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    };
    __DEBUG_LOGS__?: Array<{
      timestamp: string;
      level: string;
      component: string;
      action: string;
      data?: unknown;
    }>;
  }
}

export {};
