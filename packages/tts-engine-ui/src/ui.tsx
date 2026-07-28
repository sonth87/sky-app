/**
 * UI primitive tối giản, TỰ CHỨA cho package này.
 *
 * Cố tình KHÔNG import Button của modules/ceremony: package phải dùng được cả ở TTS
 * Studio lẫn Ceremony. Đây đúng khuôn packages/voice-catalog-ui: chỉ react +
 * lucide-react, style bằng Tailwind token dùng chung (bg-card, text-foreground…) nên tự
 * khớp theme của app nhúng.
 */
import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary-outline' | 'danger-ghost';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  'secondary-outline': 'border border-border bg-transparent text-foreground hover:bg-muted',
  'danger-ghost': 'bg-transparent text-destructive hover:bg-destructive/10',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary-outline',
  loading = false,
  icon,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xxs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
