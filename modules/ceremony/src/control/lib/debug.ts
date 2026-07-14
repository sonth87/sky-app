export type LogLevel = 'info' | 'warn' | 'error';

const logLevelStyles: Record<LogLevel, string> = {
  info: 'color: #0ea5e9; font-weight: bold;',
  warn: 'color: #f59e0b; font-weight: bold;',
  error: 'color: #ef4444; font-weight: bold;',
};

const createLogger = (component: string) => {
  const log = (level: LogLevel, action: string, data?: unknown) => {
    const timestamp = new Date().toLocaleTimeString();
    const style = logLevelStyles[level];
    const prefix = `[${timestamp}] [${component}] [${action}]`;

    if (data) {
      console.log(`%c${prefix}`, style, data);
    } else {
      console.log(`%c${prefix}`, style);
    }

    // Store in debug log for later inspection
    if (window.__DEBUG_LOGS__) {
      window.__DEBUG_LOGS__.push({
        timestamp,
        level,
        component,
        action,
        data,
      });
    }
  };

  return {
    info: (action: string, data?: unknown) => log('info', action, data),
    warn: (action: string, data?: unknown) => log('warn', action, data),
    error: (action: string, data?: unknown) => log('error', action, data),
  };
};

// Initialize global debug logs array
if (typeof window !== 'undefined') {
  (window as any).__DEBUG_LOGS__ = [];
}

export { createLogger };
