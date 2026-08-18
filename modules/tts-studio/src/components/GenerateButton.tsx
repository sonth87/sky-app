import { Loader2, Sparkles } from 'lucide-react';
import { ButtonPrimitive } from '@sky-app/ui';

export interface GenerateButtonProps {
  generating: boolean;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
  size?: 'xs' | 'sm' | 'default' | 'lg';
  className?: string;
}

/** Nút "Sinh"/"Tạo giọng nói" có loading spinner — tách từ `GenerateBar.tsx` để
 *  `FloatingGenerateBox.tsx` (Story) dùng lại đúng 1 hành vi/hình thức. */
export function GenerateButton({ generating, disabled, onClick, label = 'Tạo giọng nói', size = 'sm', className }: GenerateButtonProps) {
  return (
    <ButtonPrimitive type="button" size={size} disabled={disabled || generating} onClick={onClick} className={className}>
      {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
      {label}
    </ButtonPrimitive>
  );
}
