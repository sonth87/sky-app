import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePortalContainer } from '../PortalContainerContext';

export interface AlertDialogProps {
  open: boolean;
  title?: string;
  message: string;
  onClose: () => void;
}

/**
 * Thay `window.alert()` — dialog gốc của hệ điều hành, phá theme của app (khung xám/nút màu
 * theo accent color hệ thống, không theo theme trong app). Cùng lý do đổi `window.prompt()`
 * sang `PromptDialog` — xem PromptDialog.tsx's docstring.
 */
export function AlertDialog({ open, title = 'Lỗi', message, onClose }: AlertDialogProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const portalContainer = usePortalContainer();

  useEffect(() => {
    if (open) requestAnimationFrame(() => buttonRef.current?.focus());
  }, [open]);

  if (!open) return null;

  const dialog = (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm"
      onPointerDown={onClose}
    >
      <div
        className="w-80 rounded-xl border border-border bg-popover p-3 shadow-lg"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="mb-2 text-sm font-medium text-foreground">{title}</p>
        <p className="whitespace-pre-wrap text-xs text-muted-foreground">{message}</p>
        <div className="mt-2.5 flex justify-end">
          <button
            ref={buttonRef}
            type="button"
            onClick={onClose}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') onClose(); }}
            className="rounded-lg bg-primary px-2.5 py-1 text-2xs text-primary-foreground hover:opacity-90"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );

  return portalContainer ? createPortal(dialog, portalContainer) : dialog;
}
