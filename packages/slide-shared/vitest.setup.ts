import '@testing-library/jest-dom/vitest';

// jsdom không implement ResizeObserver.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error -- test polyfill, không phải implementation đầy đủ
globalThis.ResizeObserver ??= ResizeObserverStub;
