import type { SlideApi } from '@sky-app/slide-shared';

declare global {
  interface Window {
    slide: SlideApi;
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
