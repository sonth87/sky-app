import { useRef } from 'react';

/**
 * Detect đầu đọc thẻ HID dựa theo timing:
 * - Đầu đọc gõ toàn bộ mã + Enter trong vòng maxTotalMs (~500ms)
 * - Người gõ tay thì chậm hơn nhiều
 * - Nếu không có Enter, cũng phát hiện khi chuyển focus (blur)
 *
 * Sau khi phát hiện quét thẻ: clear input để lần quét tiếp theo không nối chuỗi.
 */

interface Options {
  /** Tổng thời gian tối đa từ ký tự đầu đến Enter để coi là đầu đọc thẻ (ms). */
  maxTotalMs?: number;
  /** Độ dài tối thiểu của mã hợp lệ. */
  minLength?: number;
}

interface CardReaderHandlers {
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
}

export function useCardReader(
  onScan: (code: string) => void,
  opts: Options = {},
): CardReaderHandlers {
  const { maxTotalMs = 500, minLength = 3 } = opts;

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  // Thời điểm ký tự đầu tiên được gõ vào input (reset khi focus hoặc sau mỗi Enter)
  const firstKeyAt = useRef<number | null>(null);

  const onFocus = () => {
    firstKeyAt.current = null;
  };

  const handleScan = (input: HTMLInputElement) => {
    const code = input.value.trim();
    const elapsed = firstKeyAt.current !== null ? performance.now() - firstKeyAt.current : Infinity;

    if (code.length >= minLength && elapsed <= maxTotalMs) {
      onScanRef.current(code);
      input.value = '';
      return true;
    }
    return false;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === 'Enter' || e.key === 'Tab') {
      const input = e.currentTarget;

      if (handleScan(input)) {
        e.preventDefault();
      }
      // Gõ tay Enter (elapsed dài): không làm gì, để browser xử lý bình thường
      firstKeyAt.current = null;
      return;
    }

    // Ghi nhận thời điểm ký tự đầu tiên
    if (e.key.length === 1 && firstKeyAt.current === null) {
      firstKeyAt.current = performance.now();
    }
  };

  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Nếu có text trong input và nó được gõ nhanh → có thể là quét thẻ
    if (e.currentTarget.value && firstKeyAt.current !== null) {
      handleScan(e.currentTarget);
    }
    firstKeyAt.current = null;
  };

  return { onKeyDown, onFocus, onBlur };
}
