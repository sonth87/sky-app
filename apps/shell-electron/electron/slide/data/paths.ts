import { app } from 'electron';
import { existsSync, renameSync } from 'node:fs';
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

/**
 * File SQLite DÙNG CHUNG cho toàn app — không phải của riêng Ceremony.
 *
 * Tên cũ `ceremony.db` là di sản của module đầu tiên dùng nó; thực tế file này chứa bảng của
 * layout designer, event/data-source, media library, TTS… (xem packages/app-db/src/migrations).
 * Đổi tên 2026-08-12 cho khớp thực tế — kèm `migrateLegacyDbName()` để bản cài cũ không mất
 * dữ liệu.
 */
export function skyAppDbPath(): string {
  return join(ceremonyDataDir(), 'sky-app.db');
}

/** Đường dẫn cũ, CHỈ dùng cho bước đổi tên một lần. Không mở kết nối vào đây. */
function legacyDbPath(): string {
  return join(ceremonyDataDir(), 'ceremony.db');
}

/**
 * Đổi tên DB của bản cài cũ sang tên mới. Gọi TRƯỚC khi mở kết nối đầu tiên.
 *
 * Đổi cả 3 file: `.db`, `-wal`, `-shm`. Bỏ sót `-wal` là mất những giao dịch chưa
 * checkpoint (WAL có thể giữ lượng ghi đáng kể — app không bao giờ đóng kết nối nên
 * checkpoint chỉ xảy ra tự động theo ngưỡng).
 *
 * Không làm gì nếu file mới đã có (đã đổi rồi, hoặc máy mới) — kể cả khi file cũ vẫn còn,
 * vì lúc đó file cũ là rác chứ không phải nguồn sự thật. Lỗi đổi tên KHÔNG được nuốt: thà
 * dừng có thông báo còn hơn âm thầm tạo DB rỗng rồi người dùng tưởng mất sạch dữ liệu.
 */
export function migrateLegacyDbName(): void {
  const target = skyAppDbPath();
  const legacy = legacyDbPath();
  if (existsSync(target) || !existsSync(legacy)) return;

  console.log(`[DB] Đổi tên ${legacy} → ${target}`);
  renameSync(legacy, target);
  // -wal/-shm có thể không tồn tại (DB đã checkpoint sạch lúc thoát) — không phải lỗi.
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(legacy + suffix)) renameSync(legacy + suffix, target + suffix);
  }
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
 * Mỗi engine tự chứa: model, manifest, install-state — KHÔNG còn runtime riêng (xem
 * `ttsRuntimeDir`, đổi 2026-08-11/GĐ C).
 * Cấu trúc: <root>/<engineId>/{model, install-state.json, manifest.json}.
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

/**
 * Runtime Python (interpreter tải rời + site-packages) DÙNG CHUNG cho mọi engine cùng
 * `runtime_kind` — GĐ C (2026-08-11) của docs/roadmap/plans/tts-engine-architecture.md.
 *
 * Trước đây mỗi engine mở rộng có `runtime/site-packages` RIÊNG (nằm trong
 * `ttsEngineDir(engineId)`) — cài 2 engine cùng cần torch (vd VoxCPM + engine torch
 * tương lai) là torch bị tải VÀ LƯU 2 LẦN, ~2.5GB lãng phí mỗi bản trùng lặp.
 *
 * `kind`: 'torch' | 'onnx-ext' | 'onnx-accel' (không có 'onnx-bundled' — VieNeu chạy
 * bằng binary PyInstaller, không có runtime rời để dùng chung).
 * Cấu trúc: <root>/_runtime/<kind>/{python, site-packages}.
 *
 * `_runtime` có dấu gạch dưới để không trùng ký tự an toàn của bất kỳ `engineId` thật
 * nào (engineId đã bị lọc qua `ttsEngineDir`'s regex, không chứa `_` ở đầu theo quy ước
 * đặt tên hiện tại) — tránh nhầm thư mục runtime dùng chung với thư mục 1 engine cụ thể
 * khi liệt kê `ttsEnginesDir()`.
 */
export function ttsRuntimeDir(kind: string): string {
  const safe = kind.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(ttsEnginesDir(), '_runtime', safe);
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
