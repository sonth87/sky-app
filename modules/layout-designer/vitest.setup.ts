import '@testing-library/jest-dom/vitest';

// jsdom không implement ResizeObserver — canvas dùng nó để fit-to-container.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error -- test polyfill, không phải implementation đầy đủ
globalThis.ResizeObserver ??= ResizeObserverStub;

// jsdom không implement Pointer Capture API — Canvas.tsx dùng để giữ pointer khi kéo item
// ra ngoài biên phần tử (kéo nhanh chuột).
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = function () {};
}
if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = function () {};
}
