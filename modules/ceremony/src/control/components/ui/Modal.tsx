import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full' | { width: string; maxHeight?: string };

// `h-[90vh]` (trước đây) tính theo viewport TRÌNH DUYỆT — sai khi Ceremony
// chạy trong device-layout's giả lập cửa sổ (window chỉ là 1 div, không phải
// viewport thật), khiến modal cao hơn cửa sổ và tràn ra ngoài viền. Dùng
// `max-h-full` thay vì `h-[90vh]`: modal co theo chiều cao containing block
// thật (backdrop's `fixed inset-0` bên dưới, đã đúng theo window content area
// nhờ Window.tsx's transform tạo containing block cho `position: fixed`) —
// hoạt động đúng cả khi chạy standalone Electron (containing block = viewport
// thật, hành vi không đổi) lẫn trong device-layout (containing block = window).
const SIZE_CLASS: Record<Exclude<ModalSize, object>, string> = {
  sm: 'w-96',
  md: 'w-[560px]',
  lg: 'w-[620px]',
  xl: 'w-[1020px] max-w-[95%] max-h-full',
  full: 'w-[1200px] max-w-[95%] max-h-full',
};

const BACKDROP_CLASS: Record<'plain' | 'blur', string> = {
  plain: 'bg-black/40',
  blur: 'bg-black/25 backdrop-blur-sm',
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  size?: ModalSize;
  backdrop?: 'plain' | 'blur';
  title?: ReactNode;
  footer?: ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  children: ReactNode;
  contentClassName?: string;
  /** Bỏ khung mặc định (rounded/bg-card/shadow) — dùng khi children tự lo toàn bộ style khung (vd video/preview full-bleed). */
  unstyled?: boolean;
}

export function Modal({
  open,
  onClose,
  size = 'md',
  backdrop = 'plain',
  title,
  footer,
  closeOnBackdrop = true,
  closeOnEsc = true,
  children,
  contentClassName,
  unstyled = false,
}: ModalProps) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, closeOnEsc, onClose]);

  if (!open) return null;

  const sizeClass = typeof size === 'string' ? SIZE_CLASS[size] : undefined;
  const sizeStyle =
    typeof size === 'object' ? { width: size.width, maxHeight: size.maxHeight } : undefined;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-8',
        BACKDROP_CLASS[backdrop]
      )}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={cn(
          'flex flex-col overflow-hidden',
          !unstyled && 'rounded-lg bg-card shadow-xl',
          sizeClass
        )}
        style={sizeStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              aria-label={t('common.close')}
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className={cn('flex-1 min-h-0', contentClassName ?? (unstyled ? undefined : 'p-6'))}>
          {children}
        </div>
        {footer !== undefined && (
          <div className="border-t border-border px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
