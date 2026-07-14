import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// jsdom không implement ResizeObserver — Radix Slider (SpeedSlider) dùng nó.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error -- test polyfill, không phải implementation đầy đủ
globalThis.ResizeObserver ??= ResizeObserverStub;
