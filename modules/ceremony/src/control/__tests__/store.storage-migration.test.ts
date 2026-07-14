import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { STORAGE_KEY, OLD_STORAGE_KEY, readPersistedState } from '../storage-key';

/**
 * A9 / BUG-005 — GĐ7.5 Sóng 2: verify FIX của bug "đổi storage key không có migration".
 *
 * Bản gốc (trao-bang-tot-nghiep-2026): zustand persist name = 'slide-control-storage'.
 * Bản đích (sky-app/modules/ceremony) đổi thành 'ceremony-control-storage'. Trước fix,
 * `store.ts`/`i18n.ts`/`theme.ts` đọc thẳng key mới, không fallback key cũ -> user nâng
 * cấp từ app cũ mất toàn bộ ~28 field đã lưu (confetti*, tts*, theme*, language, v.v.).
 *
 * FIX (GĐ7.5 Sóng 2): tạo `storage-key.ts` làm nguồn chân lý duy nhất cho STORAGE_KEY +
 * `readPersistedState()` (dùng bởi i18n.ts/theme.ts, chạy trước React mount) — fallback
 * đọc OLD_STORAGE_KEY nếu STORAGE_KEY chưa tồn tại. `store.ts`'s `persist()` dùng
 * `storage: createJSONStorage(...)` với `getItem` custom cùng logic fallback (không dùng
 * `migrate` option vì zustand/persist chỉ gọi `migrate` khi key MỚI đã tồn tại với version
 * khác — key mới hoàn toàn vắng mặt thì `migrate` không bao giờ chạy, xem comment trong
 * store.ts giải thích chi tiết + trích dẫn dòng source zustand xác nhận).
 *
 * Test này import THẬT `readPersistedState` từ `storage-key.ts` (module không phụ thuộc
 * DOM/window.slide nên an toàn trong môi trường vitest `environment: 'node'`) — không còn
 * mô phỏng logic tay như phiên bản audit trước (Sóng 1). `store.ts`/`i18n.ts`/`theme.ts`
 * vẫn không import trực tiếp được (phụ thuộc `document`/`window.slide`) nên phần "store.ts
 * dùng đúng storage fallback" được verify bằng cách đọc lại chính xác đoạn code nguồn
 * (xem test cuối file) thay vì import module.
 */

function stubLocalStorage() {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  });
  return map;
}

describe('BUG-005 (đã fix) — storage-key migration (slide-control-storage -> ceremony-control-storage)', () => {
  beforeEach(() => {
    stubLocalStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('readPersistedState() (dùng thật bởi i18n.ts/theme.ts) đọc được state từ key CŨ khi key MỚI chưa tồn tại', () => {
    const userSavedConfig = {
      state: {
        confettiEnabled: false,
        confettiColorStyle: 'blue',
        ttsDelay: 3.2,
        ttsTemplate: 'Xin chúc mừng {{student.full_name}}',
        language: 'en',
        themeMode: 'dark',
        themePalette: 'violet-bloom',
        awardLocationCode: 5,
      },
      version: 0,
    };
    localStorage.setItem(OLD_STORAGE_KEY, JSON.stringify(userSavedConfig));

    const state = readPersistedState();

    expect(state).not.toBeNull();
    expect(state?.confettiEnabled).toBe(false);
    expect(state?.confettiColorStyle).toBe('blue');
    expect(state?.ttsDelay).toBe(3.2);
    expect(state?.language).toBe('en');
    expect(state?.themeMode).toBe('dark');
    expect(state?.themePalette).toBe('violet-bloom');
    expect(state?.awardLocationCode).toBe(5);
  });

  it('readPersistedState() ưu tiên key MỚI nếu đã tồn tại (không đọc key cũ đè lên)', () => {
    localStorage.setItem(OLD_STORAGE_KEY, JSON.stringify({ state: { language: 'en' }, version: 0 } ));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { language: 'vi' }, version: 0 }));

    const state = readPersistedState();
    expect(state?.language).toBe('vi');
  });

  it('cài đặt mới hoàn toàn (không có key cũ lẫn key mới) — trả về null, không throw', () => {
    expect(readPersistedState()).toBeNull();
  });

  it('JSON hỏng trong localStorage — trả về null thay vì throw', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');
    expect(readPersistedState()).toBeNull();
  });

  it('STORAGE_KEY/OLD_STORAGE_KEY export đúng giá trị dùng bởi store.ts/i18n.ts/theme.ts', () => {
    expect(STORAGE_KEY).toBe('ceremony-control-storage');
    expect(OLD_STORAGE_KEY).toBe('slide-control-storage');
  });
});

describe('BUG-005 (đã fix) — xác nhận store.ts dùng storage fallback đúng cách (đọc source)', () => {
  it('store.ts import storage-key.ts (STORAGE_KEY/OLD_STORAGE_KEY) và dùng createJSONStorage với getItem fallback', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const storeSourcePath = fileURLToPath(new URL('../store.ts', import.meta.url));
    const source = readFileSync(storeSourcePath, 'utf-8');

    // Phải import hằng số dùng chung, không hardcode lại chuỗi 'ceremony-control-storage'.
    expect(source).toMatch(/import\s*\{[^}]*STORAGE_KEY[^}]*\}\s*from\s*['"]\.\/storage-key['"]/);
    // Phải dùng storage.getItem fallback OLD_STORAGE_KEY (không dùng migrate option, vì
    // migrate không bao giờ chạy khi key mới hoàn toàn vắng mặt — xem comment trong store.ts).
    expect(source).toMatch(/getItem[^}]*localStorage\.getItem\(name\)\s*\?\?\s*localStorage\.getItem\(OLD_STORAGE_KEY\)/);
  });

  it('i18n.ts và theme.ts dùng chung readPersistedState() từ storage-key.ts (không hardcode STORAGE_KEY riêng)', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const i18nSource = readFileSync(fileURLToPath(new URL('../i18n.ts', import.meta.url)), 'utf-8');
    const themeSource = readFileSync(fileURLToPath(new URL('../theme.ts', import.meta.url)), 'utf-8');

    expect(i18nSource).toMatch(/from ['"]\.\/storage-key['"]/);
    expect(i18nSource).not.toMatch(/const STORAGE_KEY = /);

    expect(themeSource).toMatch(/from ['"]\.\/storage-key['"]/);
    expect(themeSource).not.toMatch(/const STORAGE_KEY = /);
  });
});
