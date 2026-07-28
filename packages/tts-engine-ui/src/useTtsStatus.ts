import { useEffect, useRef, useState } from 'react';
import type { TtsEnginePort, TtsProcessStatus } from '@sky-app/service-contracts';

/**
 * Cùng 4 giá trị với `MenuBarExtraStatus` của @sonth87/device-layout — CỐ TÌNH không
 * import type đó ở đây: package này (@sky-app/tts-engine-ui) là UI quản lý engine dùng
 * chung, không phụ thuộc bất kỳ shell chrome cụ thể nào. Tương thích cấu trúc
 * (structural typing) là đủ để nơi lắp ráp (packages/device-shell, nơi đã phụ thuộc
 * device-layout sẵn) gán thẳng `status` vào `MenuBarExtraItem.status` không cần ép kiểu.
 */
export type TtsStatusLevel = 'ok' | 'busy' | 'error' | 'neutral';

export interface TtsStatus {
  status: TtsStatusLevel;
  detail: string;
}

const POLL_INTERVAL_MS = 5000;

/**
 * Trạng thái tts-service, tính theo 2 nguồn tuỳ nền tảng:
 *   - Electron: subscribe `port.onProcessStatus` (push, theo dõi trực tiếp subprocess) —
 *     bắt được pha "đang khởi động" trước cả khi HTTP server kịp lắng nghe.
 *   - Web (không có onProcessStatus): poll `port.getHealth()` mỗi 5s. Chưa từng "ready"
 *     lần nào → coi là đang khởi động (busy); đã từng ready rồi mà giờ fail → coi là lỗi
 *     (mất kết nối/service crash), không lẫn với pha khởi động ban đầu.
 */
export function useTtsStatus(port: TtsEnginePort | undefined): TtsStatus {
  const [state, setState] = useState<TtsStatus>({ status: 'neutral', detail: 'Chưa kết nối' });
  const everReadyRef = useRef(false);

  useEffect(() => {
    everReadyRef.current = false;
    if (!port) {
      setState({ status: 'neutral', detail: 'Chưa kết nối' });
      return;
    }

    if (port.onProcessStatus) {
      const mapPhase = (p: TtsProcessStatus): TtsStatus => ({
        status: p.status === 'ready' ? 'ok' : p.status === 'error' ? 'error' : 'busy',
        detail: p.detail || (p.status === 'ready' ? 'Sẵn sàng' : p.status === 'error' ? 'Lỗi' : 'Đang khởi động…'),
      });
      // Đọc trạng thái hiện tại ngay (tránh chờ tới sự kiện push kế tiếp mới có dữ liệu).
      port.getProcessStatus?.().then((p) => setState(mapPhase(p))).catch(() => {});
      return port.onProcessStatus((p) => setState(mapPhase(p)));
    }

    let cancelled = false;
    const check = async () => {
      const { ok } = await port.getHealth();
      if (cancelled) return;
      if (ok) {
        everReadyRef.current = true;
        setState({ status: 'ok', detail: 'Sẵn sàng' });
      } else if (everReadyRef.current) {
        setState({ status: 'error', detail: 'Mất kết nối tới TTS service' });
      } else {
        setState({ status: 'busy', detail: 'Đang kết nối…' });
      }
    };
    void check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [port]);

  return state;
}
