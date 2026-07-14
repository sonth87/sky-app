import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { createLogger } from '../../lib/debug';
import { Modal } from './Modal';
import { Button } from './Button';

const logger = createLogger('ConfirmModal');

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: ReactNode;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  countdownSeconds?: number;
  danger?: boolean;
}

export function ConfirmModal({
  open,
  title,
  message,
  loading,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
  countdownSeconds,
  danger = true,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  const resolvedConfirmLabel = confirmLabel ?? t('common.delete');
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel');
  const hasCountdown = countdownSeconds != null && countdownSeconds > 0;
  const [countdown, setCountdown] = useState(countdownSeconds ?? 0);

  useEffect(() => {
    if (!open || !hasCountdown) {
      setCountdown(countdownSeconds ?? 0);
      return;
    }

    logger.info('Modal opened', { title });

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          logger.info('Countdown complete', { title });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, title, hasCountdown]);

  const canConfirm = !hasCountdown || countdown === 0;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      closeOnEsc={false}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onCancel} disabled={loading}>
            {resolvedCancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            fullWidth
            onClick={onConfirm}
            disabled={!canConfirm || loading}
          >
            {loading ? t('ui.confirmModal.deleting') : resolvedConfirmLabel}
          </Button>
        </div>
      }
    >
      <h2 className="mb-4 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mb-6 text-sm text-muted-foreground">{message}</p>
      {hasCountdown && !canConfirm && (
        <div className="mb-6 rounded-lg bg-destructive/10 p-4 text-center">
          <p className="text-sm text-destructive">
            {t('ui.confirmModal.enableAfter')} <span className="font-bold">{countdown}</span> {t('ui.confirmModal.seconds')}
          </p>
        </div>
      )}
    </Modal>
  );
}
