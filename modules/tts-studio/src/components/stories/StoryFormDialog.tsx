import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePortalContainer } from '../../PortalContainerContext';

export interface StoryFormDialogProps {
  open: boolean;
  title: string;
  initialName?: string;
  initialDescription?: string;
  onSubmit: (name: string, description: string) => void;
  onCancel: () => void;
}

/**
 * Dùng chung cho tạo MỚI và sửa Story (name + description) — thay `PromptDialog` (chỉ 1
 * field) cho luồng Story cụ thể, vì `storyPort.create`/`update` đều nhận description mà UI cũ
 * chưa hỏi. Cùng khuôn portal `usePortalContainer()` như `PromptDialog`/`AlertDialog`.
 */
export function StoryFormDialog({
  open, title, initialName = '', initialDescription = '', onSubmit, onCancel,
}: StoryFormDialogProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const nameRef = useRef<HTMLInputElement>(null);
  const portalContainer = usePortalContainer();

  useEffect(() => {
    if (open) {
      setName(initialName);
      setDescription(initialDescription);
      requestAnimationFrame(() => nameRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ đồng bộ lúc MỞ, không phải mỗi lần initialName/initialDescription đổi khi đang gõ
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed, description.trim());
  };

  const dialog = (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm"
      onPointerDown={onCancel}
    >
      <div
        className="w-96 rounded-xl border border-border bg-popover p-3 shadow-lg"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="mb-2 text-sm font-medium text-foreground">{title}</p>
        <input
          ref={nameRef}
          type="text"
          value={name}
          placeholder="Tên Story — vd: Lễ tốt nghiệp K10"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) submit();
            else if (e.key === 'Escape') onCancel();
          }}
          className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary"
        />
        <textarea
          value={description}
          placeholder="Mô tả (không bắt buộc)"
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
          rows={2}
          className="mt-2 w-full resize-none rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary"
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
            disabled={!name.trim()}
            className="rounded-lg bg-primary px-2.5 py-1 text-2xs text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  );

  return portalContainer ? createPortal(dialog, portalContainer) : dialog;
}
