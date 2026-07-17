// Ported từ packages/shared/src/{node.ts,index.ts} (repo trao-bang-tot-nghiep-2026).
// Ban đầu chỉ port phần /node (main process, không React) — khi port
// modules/ceremony (GĐ5) cần thêm BackdropView/DynamicBackdropView (component
// React thật, dùng ở PreviewPanel.tsx), nên package này giờ có cả 2 phần.
export * from './types.js';
export * from './socket-events.js';
export * from './status.js';
export * from './format.js';
export * from './constants.js';
export * from './layout/types.js';
export * from './layout/tokens.js';
export * from './layout/canonical.js';
export * from './layout/loop.js';
export * from './layout/renderer.js';
export * from './layout/preload.js';
export { BackdropView } from './BackdropView.js';
export type { BackdropViewProps } from './BackdropView.js';
export { DynamicBackdropView } from './DynamicBackdropView.js';
export type { DynamicBackdropViewProps } from './DynamicBackdropView.js';
export type {
  SlideApi,
  ApiEnvironment,
  SlideMeta,
  InvalidStudent,
  ImportPreview,
  SyncResult,
  SyncProgress,
  DisplayInfo,
  TtsConfig,
  TtsEngineInfo,
  TtsEngines,
  EngineInstallProgress,
  TtsEnginePreflight,
  TtsCapabilities,
  PreGenStatus,
  PreGenStudentStatus,
} from './slide-api.js';
