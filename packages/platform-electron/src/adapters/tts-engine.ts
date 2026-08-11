import type { TtsEnginePort } from '@sky-app/service-contracts';
import type { SlideApi } from '@sky-app/slide-shared';

declare global {
  interface Window {
    slide: SlideApi;
  }
}

/**
 * Electron TtsEnginePort — bọc window.slide (preload bridge, xem
 * apps/shell-electron/electron/slide/preload.ts:143-195). Ánh xạ 1-1, KHÔNG chứa
 * logic nghiệp vụ: mọi kiểm tra (preflight, whitelist gói tăng tốc, quyền ghi đĩa)
 * đã nằm ở main process.
 *
 * Lý do phải có lớp này thay vì gọi thẳng window.slide từ UI: UI quản lý engine
 * dùng chung cho cả TTS Studio lẫn Ceremony và phải chạy được trên Web — nên nó
 * chỉ được phụ thuộc vào port, không phụ thuộc bridge riêng của Electron.
 *
 * Preload dùng optional method (`?.`) vì bản Electron cũ có thể thiếu handler mới;
 * ở đây trả giá trị mặc định an toàn thay vì để undefined lọt lên UI.
 */
export function createElectronTtsEnginePort(): TtsEnginePort {
  return {
    async listEngines() {
      return (await window.slide.listEngines?.()) ?? null;
    },
    async getCapabilities() {
      return (await window.slide.getTtsCapabilities?.()) ?? null;
    },
    async getConfig() {
      return (await window.slide.getTtsConfig?.()) ?? null;
    },

    async setConfig(partial) {
      return (await window.slide.setTtsConfig?.(partial)) ?? { ok: false, error: 'Bridge không hỗ trợ setTtsConfig' };
    },
    async switchEngine(engineId) {
      return (await window.slide.engineSwitch?.(engineId)) ?? { ok: false, error: 'Bridge không hỗ trợ engineSwitch' };
    },
    async restart() {
      return (await window.slide.restartTts?.()) ?? { ok: false, error: 'Bridge không hỗ trợ restartTts' };
    },

    async preflight(engineId) {
      const res = await window.slide.enginePreflight?.(engineId);
      return (
        res ?? {
          ok: false,
          blocks: ['Bridge không hỗ trợ enginePreflight'],
          warnings: [],
          info: { totalRamGb: 0, freeDiskGb: null, requiredDiskGb: 0, engineTotalMb: 0 },
        }
      );
    },
    async installStart(engineId) {
      return (await window.slide.engineInstallStart?.(engineId)) ?? { ok: false, error: 'Bridge không hỗ trợ engineInstallStart' };
    },
    async installPause(engineId) {
      return (await window.slide.engineInstallPause?.(engineId)) ?? { ok: false };
    },
    async installResume(engineId) {
      return (await window.slide.engineInstallResume?.(engineId)) ?? { ok: false, error: 'Bridge không hỗ trợ engineInstallResume' };
    },
    async installCancel(engineId) {
      return (await window.slide.engineInstallCancel?.(engineId)) ?? { ok: false };
    },
    async verify(engineId) {
      return (await window.slide.engineVerify?.(engineId)) ?? { ok: false, error: 'Bridge không hỗ trợ engineVerify' };
    },
    async deleteEngine(engineId) {
      return (await window.slide.engineDelete?.(engineId)) ?? { ok: false, error: 'Bridge không hỗ trợ engineDelete' };
    },
    async diskUsage(engineId) {
      return (await window.slide.engineDiskUsage?.(engineId)) ?? { bytes: 0 };
    },
    async runtimeDiskUsage() {
      return (await window.slide.runtimeDiskUsage?.()) ?? [];
    },
    async unloadEngine(engineId) {
      return (await window.slide.engineUnload?.(engineId)) ?? { ok: false, error: 'Bridge không hỗ trợ engineUnload' };
    },
    async enginesDir() {
      return (await window.slide.ttsEnginesDir?.()) ?? { path: '' };
    },
    async openEnginesDir() {
      return (await window.slide.openTtsEnginesDir?.()) ?? { ok: false, error: 'Bridge không hỗ trợ openTtsEnginesDir' };
    },
    async importLocal(engineId) {
      return (await window.slide.engineImportLocal?.(engineId)) ?? { ok: false, error: 'Bridge không hỗ trợ engineImportLocal' };
    },
    async exportLocal(engineId) {
      return (await window.slide.engineExportLocal?.(engineId)) ?? { ok: false, error: 'Bridge không hỗ trợ engineExportLocal' };
    },

    async installAccel(packageName) {
      return (await window.slide.installAccel?.(packageName)) ?? { ok: false, error: 'Bridge không hỗ trợ installAccel' };
    },

    onInstallProgress(handler) {
      // Preload trả sẵn hàm huỷ đăng ký; nếu bridge cũ không có thì trả no-op để
      // caller vẫn gọi được trong cleanup của useEffect mà không cần kiểm tra null.
      return window.slide.onEngineInstallProgress?.(handler) ?? (() => {});
    },

    async getHealth() {
      // Không có IPC health-check thuần riêng — getTtsStatus() đã theo dõi trực tiếp
      // subprocess nên phản ánh đúng "sẵn sàng phục vụ chưa", dùng luôn thay vì mở thêm
      // 1 kênh IPC chỉ để trả cùng 1 thông tin.
      try {
        const s = await window.slide.getTtsStatus?.();
        return { ok: s?.status === 'ready' };
      } catch {
        return { ok: false };
      }
    },
    async getProcessStatus() {
      return (
        (await window.slide.getTtsStatus?.()) ?? { status: 'error', detail: 'Bridge không hỗ trợ getTtsStatus' }
      );
    },
    onProcessStatus(handler) {
      return window.slide.onPythonStatus?.(handler) ?? (() => {});
    },
    async getDebugInfo() {
      const info = await window.slide.getTtsDebug?.();
      if (!info) throw new Error('Bridge không hỗ trợ getTtsDebug');
      return info;
    },
  };
}
