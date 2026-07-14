interface DebugLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  component: string;
  action: string;
  data?: unknown;
}

interface DebugInspector {
  all: () => DebugLog[];
  info: () => DebugLog[];
  warn: () => DebugLog[];
  error: () => DebugLog[];
  component: (name: string) => DebugLog[];
  action: (action: string) => DebugLog[];
  table: () => void;
  clear: () => void;
  export: () => string;
}

declare global {
  interface Window {
    __DEBUG_LOGS__: DebugLog[];
    __DEBUG_INSPECT: DebugInspector;
  }
}

export {};
