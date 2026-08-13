// usePersistedState — state React ĐỒNG BỘ với localStorage, dùng cho các thiết lập UI CÁ NHÂN
// của người dùng trên MÁY đó (VD panel ẩn/hiện, độ rộng panel) — KHÁC dữ liệu layout/document,
// không lưu qua LayoutPort/SQLite (quyết định 2026-07-18: đây là sở thích UI-state, không phải
// document-data). Fail-soft khi không có `window`/`localStorage` (VD môi trường test/SSR) — trả
// về defaultValue, KHÔNG throw.

import { useEffect, useState } from 'react';

function readStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined' || !window.localStorage) return defaultValue;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

function writeStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded hoặc storage bị chặn (VD chế độ ẩn danh nghiêm ngặt) — fail-soft, không throw.
  }
}

export function usePersistedState<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readStorage(key, defaultValue));

  useEffect(() => {
    writeStorage(key, value);
  }, [key, value]);

  return [value, setValue];
}
