import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Required for @testing-library/react's auto-cleanup (afterEach) to
    // register itself — without it, DOM from one test leaks into the next
    // within the same describe block.
    globals: true,
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    css: false,
  },
});
