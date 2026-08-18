import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePortalContainer } from '../PortalContainerContext';

export interface PromptDialogProps {
  open: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/**
 * Thay `window.prompt()` — Electron's BrowserWindow KHÔNG implement dialog này (khác
 * `window.confirm()`/`window.alert()` vẫn hoạt động bình thường): `prompt()` trả `null` NGAY
 * LẬP TỨC, không hiện UI nào cả. Bug thật 2026-08-17 — cả 2 nơi dùng `window.prompt()`
 * trong module này ("Story mới", "Lưu thành preset mới") đều im lặng không làm gì khi bấm
 * trên Electron, dù chạy đúng trên trình duyệt lúc dev bằng `pnpm dev:web`. Đây là component
 * DÙNG CHUNG cho cả 2 nơi, thay vì tự dựng input tại chỗ mỗi lần cần hỏi 1 chuỗi ngắn.
 */
export function PromptDialog({ open, title, placeholder, initialValue = '', onSubmit, onCancel }: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  // Portal ra `.tts-studio-root` (KHÔNG dùng container mặc định document.body) — component
  // này thường được gọi từ trong sidebar (`overflow-y-auto`), 1 `absolute inset-0` con của
  // nó chỉ phủ đúng khung sidebar chứ không phải toàn app. Portal ra root là containing
  // block đúng cho `absolute inset-0`, đồng thời giữ trong subtree `.tts-studio-root` để
  // không mất biến theme (xem PortalContainerContext.tsx's docstring).
  const portalContainer = usePortalContainer();

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      // Focus lúc mở — window.prompt() cũ tự focus, giữ đúng kỳ vọng gõ ngay không cần bấm.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, initialValue]);

  if (!open) return null;

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  const dialog = (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm"
      onPointerDown={onCancel}
    >
      <div
        className="w-80 rounded-xl border border-border bg-popover p-3 shadow-lg"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="mb-2 text-sm font-medium text-foreground">{title}</p>
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            else if (e.key === 'Escape') onCancel();
          }}
          className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary"
        />
        <div className="mt-2.5 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-2.5 py-1 text-2xs hover:bg-muted/50"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim()}
            className="rounded-lg bg-primary px-2.5 py-1 text-2xs text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  );

  // Không có container (context vắng — vd test đơn vị dựng component trơ) → render tại chỗ,
  // còn hơn không hiện gì. Trong app thật `TtsStudioApp` luôn cấp context này.
  return portalContainer ? createPortal(dialog, portalContainer) : dialog;
}
