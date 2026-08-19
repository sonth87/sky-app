import { Loader2, Sparkles } from 'lucide-react';

export interface GenerateButtonProps {
  generating: boolean;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
  className?: string;
  /** `'pill'` (mặc định) = nút dài có chữ. `'icon'` = nút tròn chỉ icon, màu accent (giống nút
   *  sparkle tròn của voicebox) — `title` thay cho chữ vì không có chỗ hiện label. */
  variant?: 'pill' | 'icon';
}

/** Nút "Sinh"/"Tạo giọng nói" có loading spinner — dùng chung cho mọi nơi kích hoạt synthesize. */
export function GenerateButton({ generating, disabled, onClick, label = 'Tạo giọng nói', className, variant = 'pill' }: GenerateButtonProps) {
  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || generating}
        title={label}
        aria-label={label}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ''}`}
      >
        {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled || generating}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ''}`}
    >
      {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
      {label}
    </button>
  );
}
