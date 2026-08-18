import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePortalContainer } from '../PortalContainerContext';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Thay `window.confirm()` — dialog gốc của hệ điều hành, phá theme của app, cùng lý do đổi
 * `window.prompt()`/`window.alert()` sang `PromptDialog`/`AlertDialog` (xem 2 file đó's
 * docstring). `window.confirm()` vẫn hoạt động đúng trên Electron (khác `prompt()`), nhưng
 * nhìn không đồng bộ theme — đổi cho nhất quán khi làm UI Story giống voicebox.
 */
export function ConfirmDialog({
  open, title, message, confirmLabel = 'Xoá', destructive = true, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const portalContainer = usePortalContainer();

  useEffect(() => {
    if (open) requestAnimationFrame(() => confirmRef.current?.focus());
  }, [open]);

  if (!open) return null;

  const dialog = (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm"
      onPointerDown={onCancel}
    >
      <div
        className="w-80 rounded-xl border border-border bg-popover p-3 shadow-lg"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="mb-1 text-sm font-medium text-foreground">{title}</p>
        {message && <p className="mb-2 text-xs text-muted-foreground">{message}</p>}
        <div className="mt-2.5 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-2.5 py-1 text-2xs hover:bg-muted/50"
          >
            Huỷ
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
            className={
              destructive
                ? 'rounded-lg bg-destructive px-2.5 py-1 text-2xs text-destructive-foreground hover:opacity-90'
                : 'rounded-lg bg-primary px-2.5 py-1 text-2xs text-primary-foreground hover:opacity-90'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return portalContainer ? createPortal(dialog, portalContainer) : dialog;
}
