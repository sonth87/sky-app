import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Mặc định 'node' — 3 test cũ trong __tests__/ đọc source file trực tiếp qua
    // `new URL('../store.ts', import.meta.url)` (kỹ thuật "đọc source như text" để verify
    // pattern) — jsdom's import.meta.url KHÔNG phải file:// URL hợp lệ, throw "The URL must be
    // of scheme file" (xác nhận qua test thật, 2026-07-19). environmentMatchGlobs override
    // riêng .tsx (component React, Giai đoạn 4a) sang jsdom — giữ nguyên .ts cũ chạy node.
    // Vitest 3.2 báo deprecated (gợi ý test.projects) — CHẤP NHẬN ĐƯỢC, vẫn hoạt động đúng, không
    // đổi sang test.projects (API phức tạp hơn, chưa có tiền lệ nào khác trong monorepo dùng).
    environment: 'node',
    environmentMatchGlobs: [['src/**/*.test.tsx', 'jsdom']],
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
    css: false,
  },
});
