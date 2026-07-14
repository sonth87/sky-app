/**
 * Helper để inspect debug logs từ console.
 * Sử dụng: window.__DEBUG_INSPECT() để xem tất cả logs
 */

export function setupDebugInspect() {
  (window as any).__DEBUG_INSPECT = {
    // Xem tất cả logs
    all: () => (window as any).__DEBUG_LOGS__,

    // Lọc logs theo level
    info: () => (window as any).__DEBUG_LOGS__.filter((l: any) => l.level === 'info'),
    warn: () => (window as any).__DEBUG_LOGS__.filter((l: any) => l.level === 'warn'),
    error: () => (window as any).__DEBUG_LOGS__.filter((l: any) => l.level === 'error'),

    // Lọc logs theo component
    component: (name: string) =>
      (window as any).__DEBUG_LOGS__.filter((l: any) => l.component === name),

    // Lọc logs theo action
    action: (action: string) =>
      (window as any).__DEBUG_LOGS__.filter((l: any) => l.action === action),

    // In tất cả logs dạng table
    table: () => console.table((window as any).__DEBUG_LOGS__),

    // Clear logs
    clear: () => {
      (window as any).__DEBUG_LOGS__ = [];
    },

    // Xuất logs dạng JSON
    export: () => JSON.stringify((window as any).__DEBUG_LOGS__, null, 2),
  };

  console.log('%c✓ Debug Inspector ready', 'color: #10b981; font-weight: bold;');
  console.log('%cUsage: window.__DEBUG_INSPECT.all() or window.__DEBUG_INSPECT.error() etc', 'color: #6366f1;');
}
