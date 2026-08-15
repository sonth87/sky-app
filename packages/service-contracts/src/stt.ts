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
  /**
   * Nhãn nguồn gọi, dùng để gắn cho dòng lịch sử (GĐ 3, xem `SttHistoryEntry`) — BẮT BUỘC
   * truyền tường minh ở mọi call site thật (`'speech_to_text'`/`'voice_clone'`), không có
   * giá trị mặc định hợp lý ở tầng port: `transcribe()` là 1 kênh IPC/HTTP DÙNG CHUNG bởi
   * nhiều caller (app Speech to Text, nút mic trong VoiceCloneModal), không suy ra được từ
   * "port nào gọi" như cách `TtsPort`'s history gắn `source` theo TỪNG FILE Electron riêng.
   * Bỏ trống → server tự gắn `'unknown'`.
   */
  source?: string;
}

export interface TranscribeResult {
  ok: boolean;
  text?: string;
  language?: string;
  durationSec?: number;
  error?: string;
}

/** 1 dòng lịch sử phiên âm (GĐ 3) — CHỈ text, không có audio gốc kèm theo (khác
 * `HistoryEntry` của TTS, nơi audio CHÍNH LÀ kết quả cần giữ lại) — vì vậy KHÔNG có field
 * tương đương `getHistoryAudioUrl`, bất đối xứng có chủ đích so với `TtsPort`. */
export interface SttHistoryEntry {
  id: string;
  source: 'speech_to_text' | 'voice_clone' | 'voice_clone_edit' | 'unknown';
  text: string;
  language?: string;
  durationSec?: number;
  engineId?: string;
  sourceFilename?: string;
  error?: string;
  createdAt: string;
}

export interface SttPort {
  /**
   * Phiên âm 1 file audio. Single-shot: nhận NGUYÊN file, không streaming (khớp giới hạn
   * engine tham chiếu — voicebox cũng chỉ single-shot, xem quyết định phạm vi Phase 1).
   *
   * `filePath` kiểu tuỳ nền tảng: đường dẫn string (Electron, người dùng chọn qua
   * `pickAudioFile()`) hoặc `File` (Web). CHỈ dùng cho file client đang giữ CHƯA gửi lên
   * server (vd mẫu mới chọn trong VoiceCloneModal trước khi bấm "Tạo giọng đọc") — mẫu
   * audio của 1 voice clone ĐÃ CÓ thì dùng `transcribeVoiceSample()` thay vì cái này (xem
   * docstring ở đó cho lý do tách).
   */
  transcribe(filePath: string | any, opts?: TranscribeOptions): Promise<TranscribeResult>;
  /**
   * Phiên âm 1 mẫu audio ĐÃ CÓ SẴN của 1 voice clone đã lưu trên server — dùng khi sửa
   * giọng đã tồn tại (VoiceCloneModal's panel "Sửa mẫu"). Tách khỏi `transcribe()` vì file
   * đã nằm sẵn ở server (`_ref_dir`, xem `main.py`'s
   * `POST /voices/{voice_id}/samples/{sample_id}/transcribe`) — client không còn giữ file
   * gốc (đã upload xong lúc clone/thêm mẫu), nên KHÔNG có `filePath`/`File` nào để đưa vào
   * `transcribe()`. Tra thẳng theo `voiceId`+`sampleId`, không upload lại — tránh vòng round-
   * trip lãng phí (tải bytes về client rồi gửi lại y nguyên) cho dữ liệu server đã có sẵn.
   */
  transcribeVoiceSample?(
    voiceId: string,
    sampleId: string,
    opts?: TranscribeOptions,
  ): Promise<TranscribeResult>;
  /** Mở hộp thoại chọn file audio của OS — chỉ khả dụng trên Electron. Không có gì riêng
   * STT (chọn file không phụ thuộc mục đích dùng sau đó), có thể delegate thẳng kênh chọn
   * file đã có của TtsPort ở tầng adapter. */
  pickAudioFile?(): Promise<{ ok: boolean; filePaths?: string[] }>;

  /** Danh sách lịch sử phiên âm (GĐ 3). Lọc theo `source` để mỗi UI chỉ thấy đúng lịch sử
   * của mình (vd app Speech to Text lọc `source: 'speech_to_text'`, không lẫn dòng ghi từ
   * nút mic trong VoiceCloneModal). */
  listHistory?(opts?: { limit?: number; source?: string }): Promise<SttHistoryEntry[]>;
  deleteHistoryEntry?(id: string): Promise<{ ok: boolean; error?: string }>;
  clearHistory?(): Promise<{ ok: boolean; error?: string; count?: number }>;
}
