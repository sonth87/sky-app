/**
 * EventBus — giao tiếp giữa các app, có sticky/replay cho subscriber mount muộn.
 * Học từ mfe-shell-app (window.__MFE_EVENT_BUS__), xem docs/reference/contract-reference.md §EventBus.
 */
export type EventHandler<T = unknown> = (data: T) => void;
export type Unsubscribe = () => void;

export interface EventEmitOptions {
  /** Giữ lại giá trị này trong bao lâu (ms) để replay cho subscriber mount sau. Bỏ qua = không sticky. */
  persistMs?: number;
}

export interface EventOnOptions {
  /** Nếu true và có giá trị sticky còn hạn, gọi handler ngay với giá trị đó khi đăng ký. */
  replayLatest?: boolean;
}

export interface EventBus {
  emit<T = unknown>(event: string, data?: T, opts?: EventEmitOptions): void;
  on<T = unknown>(event: string, handler: EventHandler<T>, opts?: EventOnOptions): Unsubscribe;
  off(event: string, handler: EventHandler): void;
  once<T = unknown>(event: string, handler: EventHandler<T>): Unsubscribe;
}

interface StickyEntry {
  data: unknown;
  expiresAt: number | null;
}

export function createEventBus(): EventBus {
  const handlers = new Map<string, Set<EventHandler>>();
  const sticky = new Map<string, StickyEntry>();

  function isStickyValid(entry: StickyEntry | undefined): entry is StickyEntry {
    if (!entry) return false;
    if (entry.expiresAt === null) return true;
    return Date.now() < entry.expiresAt;
  }

  return {
    emit(event, data, opts) {
      if (opts?.persistMs !== undefined) {
        sticky.set(event, {
          data,
          expiresAt: opts.persistMs > 0 ? Date.now() + opts.persistMs : null,
        });
      }
      const set = handlers.get(event);
      if (!set) return;
      for (const handler of set) handler(data);
    },

    on(event, handler, opts) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(handler as EventHandler);

      if (opts?.replayLatest) {
        const entry = sticky.get(event);
        if (isStickyValid(entry)) handler(entry.data as never);
      }

      return () => {
        set?.delete(handler as EventHandler);
      };
    },

    off(event, handler) {
      handlers.get(event)?.delete(handler);
    },

    once(event, handler) {
      const wrapped: EventHandler = (data) => {
        unsubscribe();
        handler(data as never);
      };
      const unsubscribe = this.on(event, wrapped);
      return unsubscribe;
    },
  };
}
