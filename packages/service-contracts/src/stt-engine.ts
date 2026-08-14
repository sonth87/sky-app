/**
 * SttEnginePort — quản lý ENGINE STT (Speech-to-Text/nhận dạng giọng nói).
 *
 * Tách riêng khỏi `SttPort` (chức năng — transcribe) vì cùng lý do `TtsEnginePort`/`TtsPort`
 * đã tách: port này lo "chạy bằng engine nào", không lo "phiên âm câu này ra sao".
 *
 * KHÔNG tái dùng `TtsEnginePort`/`TtsEngineInfo`/`TtsEngines` — dù bề ngoài giống nhau (đều
 * là "quản lý engine"), 2 loại engine đối nghịch nhau (audio→text vs text→audio) nên
 * `TtsEngineInfo.capabilities` có field sai ngữ nghĩa cho STT (`supports_clone`,
 * `supports_preset`...), và `TtsEngines.current` là khái niệm "engine TTS toàn cục hiện
 * hành, luôn có giá trị fallback từ lúc khởi động" — khác STT, nơi "chưa engine nào được
 * nạp" (current=null) là trạng thái BÌNH THƯỜNG cho tới lần dùng đầu tiên (xem
 * docs/dev/history/2026-08-14-stt-nen-tang-giai-doan-1.md).
 *
 * GĐ 1 CỐ Ý CHỈ khai `listEngines`/`switchEngine` — KHÔNG khai lại bộ method cài đặt
 * (preflight, install..., onInstallProgress) như `TtsEnginePort`: engine STT (`whisper-base`)
 * đăng ký trong CÙNG registry Python (`engine_registry.py`'s `_ENGINES`, chỉ khác
 * `category`), và `GET /engines` (không lọc category) + `EngineManager.tsx` (đã gom nhóm
 * theo category) đã cho tải/cài được Whisper NGAY qua đúng UI Quản lý engine hiện có —
 * không cần dựng thêm 1 bộ kênh `stt:engine-install-*` chỉ để làm lại việc `tts:engine-
 * install-*` đã làm được (Ports & Adapters không có nghĩa là mỗi capability phải có kênh
 * IPC riêng, khi engine STT/TTS dùng CHUNG 1 cơ chế cài đặt tổng quát theo engine_id). Nếu
 * GĐ 3 (app Speech to Text riêng) cần UI cài đặt scope riêng cho STT, thêm lại lúc đó.
 */
import type { SttEngineInfo, SttEngines } from '@sky-app/slide-shared';
import type { EngineOpResult } from './tts-engine.js';

export type { SttEngineInfo, SttEngines, EngineOpResult };

export interface SttEnginePort {
  /** Danh sách engine STT đăng ký + engine đang giữ ấm. Cài đặt/tải model: dùng
   * `TtsEnginePort`'s `preflight`/`installStart` với engine_id này — xem docstring trên. */
  listEngines(): Promise<SttEngines | null>;
  /** Đổi engine STT đang dùng (đơn giản hơn TTS — chỉ 1 instance giữ ấm, không cache đa-
   * instance, xem lý do ở main.py's khối global `_stt_engine`). */
  switchEngine?(engineId: string): Promise<EngineOpResult>;
}
