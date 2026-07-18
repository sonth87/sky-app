import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Thư mục dữ liệu offline của buổi lễ trong userData */
export function ceremonyDataDir(): string {
  return join(app.getPath('userData'), 'ceremony-data');
}

/** @deprecated Giai đoạn 0 chuyển sang SQLite — giữ hàm này chỉ để cancelImport/commitStaging
 * dọn dẹp file bundle.json cũ có thể còn sót từ bản cài trước, không còn được ghi mới. */
export function bundleJsonPath(): string {
  return join(ceremonyDataDir(), 'bundle.json');
}

export function ceremonyDbPath(): string {
  return join(ceremonyDataDir(), 'ceremony.db');
}

export function appConfigJsonPath(): string {
  return join(app.getPath('userData'), 'app_config.json');
}

export function sessionJsonPath(): string {
  return join(ceremonyDataDir(), 'session.json');
}

export function assetsDir(): string {
  return join(ceremonyDataDir(), 'assets');
}

/** Ảnh do layout-designer chọn (nền/avatar tĩnh) — thư mục con riêng trong assets/, tránh trộn
 * lẫn với ảnh sinh viên nhập qua ZIP (image/, assets/ gốc — xem resolveLocalAsset dưới). */
export function layoutAssetsDir(): string {
  return join(assetsDir(), 'layout');
}

export function autoPlayJsonPath(): string {
  return join(ceremonyDataDir(), 'autoplay.json');
}

/** Thư mục assets lễ cố định (bg, logo) trong ceremony-data — KHÔNG bị ZIP ghi đè */
export function defaultAssetsDir(): string {
  return join(ceremonyDataDir(), '_assets');
}

/** Thư mục assets từ sample-bundle (luôn có sẵn kèm app) */
export function sampleAssetsDir(): string {
  return join(sampleBundleDir(), 'assets');
}

/** Thư mục data của sample-bundle (students.json + image/) */
export function sampleDataDir(): string {
  return join(sampleBundleDir(), 'data');
}

/**
 * Resolve asset tương đối thành đường dẫn tuyệt đối trong ceremony-data.
 * Thứ tự ưu tiên khi resolve assets/:
 *   1. ceremony-data/assets/ (từ ZIP hoặc sync)
 *   2. ceremony-data/_assets/ (copy cố định từ sample, không bị ghi đè)
 */

/** Tên thư mục ảnh sinh viên được chấp nhận (theo thứ tự ưu tiên) */
export const PHOTO_DIR_NAMES = ['image', 'images', 'photo', 'photos', 'avatar'] as const;

export function resolveLocalAsset(relativePath: string): string {
  const dataDir = ceremonyDataDir();
  const isPhotoPath = PHOTO_DIR_NAMES.some((d) => relativePath.startsWith(`${d}/`));

  if (isPhotoPath) {
    return join(dataDir, relativePath);
  }

  if (relativePath.startsWith('assets/')) {
    // Thử assets/ từ ZIP trước, nếu không có fallback sang _assets/ (sample)
    const fromZip = join(dataDir, relativePath);
    if (existsSync(fromZip)) return fromZip;
    return join(dataDir, '_assets', relativePath.slice('assets/'.length));
  }

  return join(assetsDir(), relativePath);
}

export function piperBinPath(): string {
  const platformDir = process.platform === 'win32' ? 'win' : 'mac';
  const bin = process.platform === 'win32' ? 'piper.exe' : 'piper';
  if (app.isPackaged) {
    return join(process.resourcesPath, 'piper', platformDir, bin);
  }
  // Khi dev: dùng resources/ trong project
  return join(app.getAppPath(), 'resources', 'piper', platformDir, bin);
}

export function piperModelPath(customModelName?: string): string {
  const modelName = customModelName || 'vi_VN-vais1000-medium.onnx';
  if (app.isPackaged) {
    return join(process.resourcesPath, 'piper', modelName);
  }
  return join(app.getAppPath(), 'resources', 'piper', modelName);
}

/** Đường dẫn sample-bundle đóng kèm app (hoặc cạnh source khi dev) */
export function sampleBundleDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'sample-bundle');
  }
  return join(app.getAppPath(), 'sample-bundle');
}

/** Thư mục chứa VieNeu-TTS models (HuggingFace cache, được pre-download lúc build) */
export function vieneuDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'vn');
  }
  return join(app.getAppPath(), 'resources', 'vieneu');
}

/**
 * Thư mục GHI ĐƯỢC cho voice của VieNeu (ref clone + registry), nằm trong userData.
 * Trước đây registry + ref clone bị ghi vào resources/ của bundle (read-only trên
 * macOS đã ký, PermissionError trên Windows per-machine). Chuyển ra userData để
 * clone voice hoạt động trên bản đóng gói. Preview WAV vẫn đọc từ bundle (RESOURCES_PATH).
 */
export function vieneuUserDataDir(): string {
  return join(app.getPath('userData'), 'vieneu-voices');
}

/** Thư mục chứa ref WAV (bao gồm cả giọng clone người dùng tạo) trong userData */
export function vieneuRefDir(): string {
  return join(vieneuUserDataDir(), 'ref');
}

/** Đường dẫn voice-registry.json ghi được trong userData */
export function vieneuRegistryPath(): string {
  return join(vieneuUserDataDir(), 'voice-registry.json');
}

/** Đường dẫn config.json (advanced infer params + device + engine) trong userData */
export function vieneuConfigPath(): string {
  return join(vieneuUserDataDir(), 'config.json');
}

/**
 * Thư mục gốc chứa các engine TTS mở rộng TẢI THEO NHU CẦU (ngoài VieNeu bundled).
 * Mỗi engine tự chứa: runtime (Python embeddable + torch...), model, manifest.
 * Cấu trúc: <root>/<engineId>/{runtime, model, install-state.json, manifest.json}.
 */
export function ttsEnginesDir(): string {
  return join(app.getPath('userData'), 'tts-engines');
}

/** Thư mục cài đặt của 1 engine mở rộng cụ thể */
export function ttsEngineDir(engineId: string): string {
  // Chặn path traversal: engineId chỉ nhận ký tự an toàn.
  const safe = engineId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(ttsEnginesDir(), safe);
}

/** Thư mục chứa file WAV đã pre-gen cho 1 batch */
export function ttsPregenDir(batchId: string): string {
  return join(app.getPath('userData'), 'tts-pregen', batchId);
}

/** Đường dẫn manifest.json của batch */
export function ttsPregenManifestPath(batchId: string): string {
  return join(ttsPregenDir(batchId), 'manifest.json');
}

/** Đường dẫn file WAV đã pre-gen cho 1 sinh viên */
export function ttsPregenWavPath(batchId: string, studentCode: string): string {
  const safeCode = studentCode.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(ttsPregenDir(batchId), `${safeCode}.wav`);
}
