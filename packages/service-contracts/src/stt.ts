/**
 * SttPort — phiên âm audio thành văn bản (Speech-to-Text). Electron: client → local Python
 * service (IPC). Web: HTTP → tts-service (cùng service đang phục vụ TTS, xem
 * docs/dev/history/2026-08-14-stt-nen-tang-giai-doan-1.md).
 *
 * Tách khỏi `SttEnginePort` (quản lý engine nào đang chạy) — port này chỉ lo "phiên âm câu
 * này ra sao", đúng cách `TtsPort`/`TtsEnginePort` đã tách.
 */

export interface TranscribeOptions {
  /** Mã ngôn ngữ ISO ngắn (vd "vi", "en") để ép engine — bỏ trống để engine tự nhận diện
   * (nếu hỗ trợ, xem `SttEngineInfo.capabilities.supports_language_hint`). */
  language?: string;
  /** Engine STT cụ thể — bỏ trống để dùng engine đang giữ ấm, hoặc lazy-activate mặc định
   * nếu chưa engine nào được nạp (xem main.py's /stt/transcribe). */
  engineId?: string;
}

export interface TranscribeResult {
  ok: boolean;
  text?: string;
  language?: string;
  durationSec?: number;
  error?: string;
}

export interface SttPort {
  /**
   * Phiên âm 1 file audio. Single-shot: nhận NGUYÊN file, không streaming (khớp giới hạn
   * engine tham chiếu — voicebox cũng chỉ single-shot, xem quyết định phạm vi Phase 1).
   *
   * `filePath` kiểu tuỳ nền tảng: đường dẫn string (Electron, người dùng chọn qua
   * `pickAudioFile()` hoặc đã có sẵn — vd ref audio của voice-clone) hoặc `File` (Web).
   */
  transcribe(filePath: string | any, opts?: TranscribeOptions): Promise<TranscribeResult>;
  /** Mở hộp thoại chọn file audio của OS — chỉ khả dụng trên Electron. Không có gì riêng
   * STT (chọn file không phụ thuộc mục đích dùng sau đó), có thể delegate thẳng kênh chọn
   * file đã có của TtsPort ở tầng adapter. */
  pickAudioFile?(): Promise<{ ok: boolean; filePaths?: string[] }>;
}
