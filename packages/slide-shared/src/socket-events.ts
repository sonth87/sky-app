/**
 * Hợp đồng Socket.IO giữa main process (server) và các renderer (Control, Backdrop).
 * Dùng typed events cho cả server và client để tránh sai tên event / payload.
 *
 * Nguyên tắc: SERVER giữ state, CLIENT phản chiếu.
 * Control gửi cmd:* -> server cập nhật state + ghi session -> broadcast state:* tới mọi client.
 *
 * Xem DESIGN.md §6 (Giao thức Socket).
 */
import type { BackdropAspectRatio, CustomVariable, OperatingMode, OnStageSource, SessionState, TtsCondition } from './types.js';
import type { CanonicalRecord } from './layout/canonical.js';
import type { RecordRuntimeState } from './layout/event.js';

/** Sự kiện Client -> Server (lệnh điều khiển) */
export interface ClientToServerEvents {
  /** Hiển thị record lên backdrop (chuyển status -> on_stage) */
  'cmd:show': (payload: { id: string; source: Exclude<OnStageSource, null> }) => void;
  /** Ẩn record, backdrop về Idle (status record hiện tại -> returned) */
  'cmd:clear': () => void;
  /** Hiển thị record kế tiếp theo displayOrder */
  'cmd:next': () => void;
  /** Hiển thị record trước đó theo displayOrder */
  'cmd:prev': () => void;
  /** Đưa record vào "pending" (chờ Play), KHÔNG lên backdrop */
  'cmd:preview': (payload: { id: string }) => void;
  /** Xác nhận record vừa quét -> tùy mode mà show hoặc đưa vào pending */
  'cmd:confirmScan': (payload: { id: string }) => void;
  /** Đổi chế độ vận hành */
  'cmd:setMode': (payload: { mode: OperatingMode }) => void;
  /** Đổi hội trường đang trao bằng (0 - Quảng trường, 1 - HTL-GD1, 2 - HT1-GD2, 3 - HT2-GD2) */
  'cmd:setAwardLocation': (payload: { code: number }) => void;
  /** Sửa trạng thái thủ công (sửa nhầm) */
  'cmd:setStatus': (payload: { id: string; status: RecordRuntimeState['status'] }) => void;
  /** App quét QR (hoặc client) đẩy id vừa quét vào hệ thống */
  'scan:qr': (payload: { id: string }) => void;
  /** Bật/tắt hiệu ứng confetti khi chuyển slide (đồng bộ tới Backdrop) */
  'cmd:setConfetti': (payload: { enabled: boolean }) => void;
  /** Bật/tắt lặp lại confetti (đồng bộ tới Backdrop) */
  'cmd:setConfettiRepeat': (payload: { repeat: boolean }) => void;
  /** Bật/tắt chế độ bắn bổ sung nhẹ khi lặp lại confetti */
  'cmd:setConfettiBurst': (payload: { burst: boolean }) => void;
  /** Cấu hình số lượng hạt confetti */
  'cmd:setConfettiAmount': (payload: { amount: string }) => void;
  /** Cấu hình tốc độ rơi confetti */
  'cmd:setConfettiSpeed': (payload: { speed: string }) => void;
  /** Kiểu bắn confetti: standard | sides | rain | cannon | center_up */
  'cmd:setConfettiType': (payload: { confettiType: string }) => void;
  /** Kiểu ribbon: none | wave | classic */
  'cmd:setConfettiRibbon': (payload: { ribbon: string }) => void;
  /** Preset màu sắc confetti: colorful | gold | silver | pink | green | blue | red | purple */
  'cmd:setConfettiColorStyle': (payload: { colorStyle: string }) => void;
  /** Hình dạng hạt confetti: default | star | circle | square */
  'cmd:setConfettiShape': (payload: { shape: string }) => void;
  /** Cấu hình thời gian sống/thời gian tồn tại của hạt confetti: short | normal | long | very_long */
  'cmd:setConfettiTicks': (payload: { ticks: string }) => void;
  /** Cấu hình thông số chi tiết của Ribbon */
  'cmd:setRibbonConfig': (payload: { config: any }) => void;
  /** Cấu hình kích cỡ và tỷ lệ hạt confetti */
  'cmd:setConfettiSizeConfig': (payload: { config: any }) => void;
  /** Bật/tắt giọng đọc TTS khi chuyển slide (đồng bộ tới Backdrop) */
  'cmd:setTts': (payload: { enabled: boolean }) => void;
  /** Chọn model giọng đọc TTS (đồng bộ tới Backdrop) */
  'cmd:setTtsModel': (payload: { model: string }) => void;
  /** Chọn tốc độ đọc TTS (đồng bộ tới Backdrop) */
  'cmd:setTtsSpeed': (payload: { speed: number }) => void;
  /** Chọn delay trước khi đọc TTS (đồng bộ tới Backdrop) */
  'cmd:setTtsDelay': (payload: { delay: number }) => void;
  /** Chọn khoảng cách giữa các từ TTS (đồng bộ tới Backdrop) */
  'cmd:setTtsWordGap': (payload: { wordGap: number }) => void;
  /** Chọn câu chào/câu bắt đầu TTS (đồng bộ tới Backdrop) */
  'cmd:setTtsSentencePrefix': (payload: { prefix: string }) => void;
  /** Template câu đọc với @variable (thay thế sentencePrefix) */
  'cmd:setTtsTemplate': (payload: { template: string }) => void;
  /** Chế độ phát: realtime | pregen | pregen-fallback */
  'cmd:setTtsPlayMode': (payload: { playMode: 'realtime' | 'pregen' | 'pregen-fallback' }) => void;
  /** Cấu hình điều kiện phân giọng */
  'cmd:setTtsConditions': (payload: { conditions: TtsCondition[] }) => void;
  /** Cấu hình biến điều kiện tùy chỉnh dùng trong template TTS */
  'cmd:setCustomVariables': (payload: { variables: CustomVariable[] }) => void;
  /** Cấu hình nhóm giọng được sử dụng */
  'cmd:setTtsVoicePool': (payload: { voicePool: string[] }) => void;
  /** Cấu hình ghi đè layout theo từng template */
  'cmd:setLayoutOverrides': (payload: { overrides: Record<string, any> }) => void;
  /** Chọn tỷ lệ màn hình backdrop đang chiếu (áp dụng cho cả preview) */
  'cmd:setBackdropAspectRatio': (payload: { aspectRatio: BackdropAspectRatio }) => void;
  /** Client yêu cầu gửi lại full state (khi vừa connect / reload) */
  'state:request': () => void;
}

/** 1 record kèm trạng thái vận hành hiện tại — dùng cho payload onStage/pending/scanned
 * (giai đoạn "bỏ Student", 2026-07-22: record TĨNH + runtimeState tách riêng, xem
 * RecordRuntimeState ở layout/event.ts). */
export interface RecordWithRuntimeState {
  record: CanonicalRecord;
  runtimeState: RecordRuntimeState;
}

/** Snapshot toàn bộ state hiện tại (gửi khi connect hoặc thay đổi lớn) */
export interface FullStatePayload {
  session: SessionState;
  onStage: RecordWithRuntimeState | null;
  pending: RecordWithRuntimeState | null;
}

/** Sự kiện Server -> Client (broadcast) */
export interface ServerToClientEvents {
  /** Toàn bộ state hiện tại */
  'state:full': (payload: FullStatePayload) => void;
  /** record đang hiển thị thay đổi (Backdrop render theo đây) */
  'state:onStage': (payload: { data: RecordWithRuntimeState | null }) => void;
  /** record đang chờ ở hộp quét thay đổi (Control hiển thị) */
  'state:pending': (payload: { data: RecordWithRuntimeState | null }) => void;
  /** Event (đợt lễ) active vừa đổi qua EventPort.setActive() — Control tự nạp lại data theo
   * Event mới, Backdrop tự về Idle (id cũ thuộc DataSource khác, vô nghĩa với Event mới —
   * docs/roadmap/plans/layout-designer/13-ceremony-mo-rong.md §"setActive giữa lễ"). */
  'state:activeEventChanged': (payload: { eventId: string }) => void;
  /** Có QR vừa được quét (Control bật âm thanh / nhấp nháy hộp quét) */
  'event:scanned': (payload: { data: RecordWithRuntimeState; ts: string }) => void;
  /** Mode thay đổi */
  'event:mode': (payload: { mode: OperatingMode }) => void;
  /** Hội trường đang trao bằng thay đổi */
  'event:awardLocation': (payload: { code: number }) => void;
  /** Trạng thái confetti thay đổi (Backdrop dùng để quyết định có bắn không) */
  'event:confetti': (payload: { enabled: boolean }) => void;
  /** Trạng thái lặp lại confetti thay đổi */
  'event:confettiRepeat': (payload: { repeat: boolean }) => void;
  /** Trạng thái bắn bổ sung confetti thay đổi */
  'event:confettiBurst': (payload: { burst: boolean }) => void;
  /** Số lượng hạt confetti thay đổi */
  'event:confettiAmount': (payload: { amount: string }) => void;
  /** Tốc độ rơi confetti thay đổi */
  'event:confettiSpeed': (payload: { speed: string }) => void;
  /** Kiểu bắn confetti thay đổi */
  'event:confettiType': (payload: { confettiType: string }) => void;
  /** Kiểu ribbon thay đổi */
  'event:confettiRibbon': (payload: { ribbon: string }) => void;
  /** Preset màu sắc confetti thay đổi */
  'event:confettiColorStyle': (payload: { colorStyle: string }) => void;
  /** Hình dạng hạt confetti thay đổi */
  'event:confettiShape': (payload: { shape: string }) => void;
  /** Thời gian sống/thời gian tồn tại của hạt confetti thay đổi */
  'event:confettiTicks': (payload: { ticks: string }) => void;
  /** Cấu hình chi tiết Ribbon thay đổi */
  'event:ribbonConfig': (payload: { config: any }) => void;
  /** Cấu hình kích cỡ và tỷ lệ hạt confetti thay đổi */
  'event:confettiSizeConfig': (payload: { config: any }) => void;
  /** Trạng thái TTS thay đổi (Backdrop dùng để quyết định có đọc không) */
  'event:tts': (payload: { enabled: boolean }) => void;
  /** Model giọng đọc TTS thay đổi */
  'event:ttsModel': (payload: { model: string }) => void;
  /** Tốc độ đọc TTS thay đổi */
  'event:ttsSpeed': (payload: { speed: number }) => void;
  /** Delay trước khi đọc TTS thay đổi */
  'event:ttsDelay': (payload: { delay: number }) => void;
  /** Khoảng cách giữa các từ TTS thay đổi */
  'event:ttsWordGap': (payload: { wordGap: number }) => void;
  /** Câu chào/câu bắt đầu TTS thay đổi */
  'event:ttsSentencePrefix': (payload: { prefix: string }) => void;
  /** Template câu đọc thay đổi */
  'event:ttsTemplate': (payload: { template: string }) => void;
  /** Chế độ phát thay đổi */
  'event:ttsPlayMode': (payload: { playMode: 'realtime' | 'pregen' | 'pregen-fallback' }) => void;
  /** Điều kiện phân giọng thay đổi */
  'event:ttsConditions': (payload: { conditions: TtsCondition[] }) => void;
  /** Biến điều kiện tùy chỉnh thay đổi */
  'event:customVariables': (payload: { variables: CustomVariable[] }) => void;
  /** Nhóm giọng sử dụng thay đổi */
  'event:ttsVoicePool': (payload: { voicePool: string[] }) => void;
  /** Cấu hình ghi đè layout thay đổi */
  'event:layoutOverrides': (payload: { overrides: Record<string, any> }) => void;
  /** Tỷ lệ màn hình backdrop thay đổi */
  'event:backdropAspectRatio': (payload: { aspectRatio: BackdropAspectRatio }) => void;
  /** Lỗi (vd quét MSSV không tồn tại) */
  'event:error': (payload: { code: string; message: string }) => void;
  /**
   * Đếm ngược "tự động về màn chờ" (idle timeout) — bắt đầu khi 1 SV mới lên sân khấu
   * (nếu tính năng bật), hủy khi có SV khác lên hoặc bấm Clear. Control dùng để hiển thị
   * đếm ngược/hiệu ứng viền giống ô "Đang trên sân khấu".
   */
  'event:idleTimer': (payload: { active: boolean; totalSeconds: number; startedAt: string | null }) => void;
}

/** Mã lỗi chuẩn cho event:error */
export const SocketErrorCode = {
  STUDENT_NOT_FOUND: 'STUDENT_NOT_FOUND',
  STUDENT_ABSENT: 'STUDENT_ABSENT',
  NO_DATA: 'NO_DATA',
  INTERNAL: 'INTERNAL',
} as const;

export type SocketErrorCode = (typeof SocketErrorCode)[keyof typeof SocketErrorCode];
