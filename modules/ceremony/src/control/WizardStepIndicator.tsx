// WizardStepIndicator — thanh hiển thị tiến trình cho CreateEventWizard (Bước 1-4). Phát hiện
// qua phản hồi thật (2026-07-20): trước đó chỉ có text "Bước X/Y" trong title Modal, KHÔNG có
// thanh trực quan — user tưởng nhầm các bước Layout/Ghép biến "biến mất" dù thực ra vẫn còn
// nguyên trong luồng, chỉ là không thấy được tổng quan các bước còn lại.

import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface WizardStepIndicatorProps {
  /** Nhãn ngắn cho từng bước, theo đúng thứ tự — độ dài mảng = tổng số bước hiệu quả (2 nếu bỏ
   * qua Bước 2 import, 3 nếu có). */
  labels: string[];
  /** Số thứ tự bước đang đứng (1-based), PHẢI nằm trong khoảng [1, labels.length]. */
  currentOrdinal: number;
}

export function WizardStepIndicator({ labels, currentOrdinal }: WizardStepIndicatorProps) {
  const { t } = useTranslation();
  return (
    <div className="mb-4 flex items-center" aria-label={t('createEventWizard.stepIndicatorAriaLabel') as string}>
      {labels.map((label, index) => {
        const ordinal = index + 1;
        const isDone = ordinal < currentOrdinal;
        const isCurrent = ordinal === currentOrdinal;
        return (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  isDone
                    ? 'bg-primary text-primary-foreground'
                    : isCurrent
                      ? 'border-2 border-primary text-primary'
                      : 'border border-border text-muted-foreground'
                }`}
              >
                {isDone ? <Check size={13} /> : ordinal}
              </div>
              <span className={`whitespace-nowrap text-[11px] ${isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{label}</span>
            </div>
            {ordinal < labels.length && <div className={`mx-1.5 h-px flex-1 ${isDone ? 'bg-primary' : 'bg-border'}`} />}
          </div>
        );
      })}
    </div>
  );
}
