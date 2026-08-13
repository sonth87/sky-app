/**
 * TtsEnginePort — quản lý ENGINE TTS và THIẾT BỊ chạy (CPU/GPU).
 *
 * Tách riêng khỏi `TtsPort` (tổng hợp giọng nói) vì khác trách nhiệm: port này lo
 * "chạy bằng engine nào, trên phần cứng nào", không lo "đọc câu này ra sao".
 *
 * Phân tầng theo khả năng nền tảng:
 *   - Nhóm ĐỌC (bắt buộc): mọi adapter đều làm được — Electron qua IPC, Web qua HTTP
 *     tới `/engines`, `/capabilities`, `/config` của tts-service.
 *   - Nhóm CÀI ĐẶT (optional): tải model/runtime về máy — chỉ Electron. Adapter Web
 *     bỏ hẳn các method này.
 *
 * UI nên dựa vào capability `'tts-local'` của PlatformContext để ẩn/hiện khối cài đặt,
 * thay vì kiểm tra sự tồn tại của từng method.
 *
 * Type dữ liệu tái dùng nguyên từ `@sky-app/slide-shared` (nguồn chuẩn duy nhất — chiều
 * phụ thuộc hiện có là service-contracts → slide-shared, KHÔNG được đảo ngược).
 */
import type {
  TtsConfig,
  TtsEngineInfo,
  TtsEngines,
  EngineInstallProgress,
  TtsEnginePreflight,
  TtsCapabilities,
  TtsProcessStatus,
  TtsDebugInfo,
  TtsLogLine,
} from '@sky-app/slide-shared';

export type {
  TtsConfig,
  TtsEngineInfo,
  TtsEngines,
  EngineInstallProgress,
  TtsEnginePreflight,
  TtsCapabilities,
  TtsProcessStatus,
  TtsDebugInfo,
  TtsLogLine,
};

/** Kết quả chung của các thao tác thay đổi trạng thái. */
export interface EngineOpResult {
  ok: boolean;
  error?: string;
}

export interface TtsEnginePort {
  // ── Đọc trạng thái — mọi nền tảng ────────────────────────────────────────
  /** Danh sách engine đã đăng ký + engine đang chạy. */
  listEngines(): Promise<TtsEngines | null>;
  /** Provider phần cứng (CPU/CUDA/DirectML/CoreML) và trạng thái dùng được. */
  getCapabilities(): Promise<TtsCapabilities | null>;
  /** Config hiện tại (tham số infer + device + engine). */
  getConfig(): Promise<TtsConfig | null>;

  // ── Thay đổi cấu hình ────────────────────────────────────────────────────
  /**
   * Ghi đè một phần config. LƯU Ý: đổi `infer` áp dụng ngay, nhưng đổi `device`
   * hoặc `engine` chỉ có hiệu lực sau khi service khởi động lại — gọi `restart()`.
   */
  setConfig?(partial: Partial<TtsConfig>): Promise<{ ok: boolean; config?: TtsConfig; error?: string }>;
  /** Đổi engine đang dùng (tự lo restart service ở phía Electron). */
  switchEngine?(engineId: string): Promise<EngineOpResult>;
  /** Khởi động lại tts-service. Web không có (service chạy từ xa, không thuộc quyền client). */
  restart?(): Promise<EngineOpResult>;

  // ── Cài đặt engine mở rộng — chỉ nền tảng có capability 'tts-local' ───────
  /** Kiểm tra đĩa/RAM/GPU/mạng TRƯỚC khi cho tải. */
  preflight?(engineId: string): Promise<TtsEnginePreflight>;
  installStart?(engineId: string): Promise<{ ok: boolean; error?: string; preflight?: TtsEnginePreflight }>;
  installPause?(engineId: string): Promise<{ ok: boolean }>;
  installResume?(engineId: string): Promise<EngineOpResult>;
  installCancel?(engineId: string): Promise<{ ok: boolean }>;
  /** Dry-run xác nhận engine load được TRƯỚC khi cho đổi sang. */
  verify?(engineId: string): Promise<{ ok: boolean; error?: string; capabilities?: unknown }>;
  deleteEngine?(engineId: string): Promise<EngineOpResult>;
  diskUsage?(engineId: string): Promise<{ bytes: number }>;
  /**
   * Dung lượng runtime DÙNG CHUNG theo kind ('torch'/'onnx-ext'/'onnx-accel') — KHÔNG
   * thuộc riêng engine nào. UI dùng để hiện "torch dùng chung ~2.5GB — cho VoxCPM" thay vì
   * cộng nhầm vào `diskUsage()` của từng engine (từ GĐ C, engine không còn giữ bản runtime
   * riêng — xem docs/roadmap/plans/tts-engine-architecture.md).
   */
  runtimeDiskUsage?(): Promise<Array<{ kind: string; bytes: number; engineIds: string[] }>>;
  /**
   * Nhả RAM của engine đang giữ ấm nhưng GIỮ NGUYÊN dữ liệu đã tải trên đĩa — khác hẳn
   * `deleteEngine` (xoá sạch, phải tải lại từ mạng). Lần dùng sau nạp lại từ đĩa được ngay.
   */
  unloadEngine?(engineId: string): Promise<EngineOpResult>;
  /** Đường dẫn thư mục lưu engine/model đã tải. */
  enginesDir?(): Promise<{ path: string }>;
  /** Mở thư mục đó bằng trình quản lý tệp của hệ điều hành (Finder/Explorer). */
  openEnginesDir?(): Promise<EngineOpResult>;
  /** Nạp engine từ thư mục có sẵn trên máy (dùng khi không có mạng). */
  importLocal?(engineId: string): Promise<EngineOpResult>;
  /** Xuất engine đã cài ra thư mục để chép sang máy khác. */
  exportLocal?(engineId: string): Promise<{ ok: boolean; error?: string; count?: number }>;

  // ── Tăng tốc phần cứng ───────────────────────────────────────────────────
  /**
   * Cài gói tăng tốc (onnxruntime-gpu | onnxruntime-directml). Danh sách gói được
   * whitelist ở phía main process — truyền tên ngoài whitelist sẽ bị từ chối.
   */
  installAccel?(packageName: string): Promise<{ ok: boolean; error?: string; log?: string }>;

  // ── Sự kiện tiến độ tải ──────────────────────────────────────────────────
  /** Trả hàm huỷ đăng ký (theo mẫu `CardReaderPort.onScan`). */
  onInstallProgress?(handler: (progress: EngineInstallProgress) => void): () => void;

  // ── Sức khoẻ dịch vụ ─────────────────────────────────────────────────────
  /**
   * Health check thuần HTTP (GET /health) — hoạt động trên MỌI nền tảng, vì tts-service
   * luôn expose endpoint này bất kể ai khởi động nó (Electron tự spawn cục bộ, hay một
   * service dùng chung mà Web trỏ tới từ xa). Đây là nguồn sự thật CHUNG duy nhất cho cả
   * Ceremony lẫn TTS Studio — icon trạng thái trên menu bar dựa vào method này làm nền,
   * bồi thêm chi tiết từ nhóm bên dưới khi có (Electron).
   */
  getHealth(): Promise<{ ok: boolean }>;

  // ── Trạng thái tiến trình chi tiết — chỉ nền tảng tự spawn service (Electron) ───────
  /**
   * Bắt được pha 'starting' TRƯỚC KHI HTTP server kịp lắng nghe — lúc đó getHealth() chỉ
   * báo được "không kết nối được", không phân biệt nổi "đang khởi động" với "đã crash".
   */
  getProcessStatus?(): Promise<TtsProcessStatus>;
  /** Trả hàm huỷ đăng ký (theo mẫu `CardReaderPort.onScan`). */
  onProcessStatus?(handler: (status: TtsProcessStatus) => void): () => void;
  /** Debug chi tiết (PID, exit code, stderr gần nhất, nhật ký hoạt động) — nguồn dữ liệu
   * cho cửa sổ xem log. */
  getDebugInfo?(): Promise<TtsDebugInfo>;
  /**
   * Dòng stdout/stderr thô realtime của tiến trình Python — nguồn cho tab "Nhật ký" cuộn
   * liên tục kiểu voicebox (khác `getDebugInfo`'s `recentStderr`, giới hạn cứng 60 dòng và
   * phải poll). Chỉ Electron có (tiến trình con thuộc quyền client) — Web adapter không
   * implement, tab Logs tự ẩn phần realtime khi thiếu, giống cách xử lý `getDebugInfo`.
   * Trả hàm huỷ đăng ký (theo mẫu `CardReaderPort.onScan`).
   */
  subscribeLogLines?(handler: (entry: TtsLogLine) => void): () => void;
  /**
   * Buffer log gần nhất, gọi 1 lần lúc mount để nạp lại lịch sử — `subscribeLogLines` chỉ
   * đẩy các dòng phát sinh SAU khi đăng ký nên remount (chuyển tab/mở lại cửa sổ) trước đây
   * luôn thấy trống rỗng dù tiến trình Python vẫn đang chạy.
   */
  getLogLines?(): Promise<TtsLogLine[]>;
}
