import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { buttonVariants } from './button-primitive';

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'secondary-outline'
  | 'danger'
  | 'danger-ghost'
  | 'danger-soft'
  | 'ghost';

type ButtonSize = 'xs' | 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  pill?: boolean;
}

// Map API cũ (primary/secondary-outline/danger*) → variant chuẩn shadcn
const VARIANT_MAP: Record<ButtonVariant, 'default' | 'secondary' | 'outline' | 'destructive' | 'ghost'> = {
  primary: 'default',
  secondary: 'secondary',
  'secondary-outline': 'outline',
  danger: 'destructive',
  'danger-ghost': 'ghost',
  'danger-soft': 'destructive',
  ghost: 'ghost',
};

// Bù màu cho các biến thể không có tương đương trực tiếp trong shadcn (ghost đỏ, soft đỏ bo tròn)
const EXTRA_CLASS: Partial<Record<ButtonVariant, string>> = {
  'danger-ghost': 'text-destructive hover:bg-destructive/10',
  'danger-soft': 'bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-full',
};

const SIZE_MAP: Record<ButtonSize, 'xs' | 'sm' | 'default'> = {
  xs: 'xs',
  sm: 'sm',
  md: 'default',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'sm',
    fullWidth,
    loading,
    icon,
    pill,
    disabled,
    className,
    children,
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        buttonVariants({ variant: VARIANT_MAP[variant], size: SIZE_MAP[size] }),
        EXTRA_CLASS[variant],
        pill && 'rounded-full',
        fullWidth && 'w-full flex-1',
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
});
