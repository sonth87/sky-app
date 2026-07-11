// Ported từ packages/shared/src/node.ts (repo trao-bang-tot-nghiep-2026) —
// chỉ phần dùng ở Electron main process, KHÔNG bao gồm phần React của
// @trao-bang/shared gốc (chưa dùng tới trong sky-app).
export * from './types.js';
export * from './socket-events.js';
export * from './status.js';
export * from './format.js';
export * from './constants.js';
