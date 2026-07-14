import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useControlStore } from '../../store';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Dot } from './Dot';
import { StatusPopover } from './StatusPopover';
import { useSlide } from '../../lib/slide';

export function EnvChip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const slide = useSlide('api-integrations');
  const apiEnvironment = useControlStore((s) => s.apiEnvironment);
  const setApiEnvironment = useControlStore((s) => s.setApiEnvironment);
  const [saving, setSaving] = useState(false);
  const [pendingEnv, setPendingEnv] = useState<'prod' | 'test' | null>(null);

  const requestChange = (next: 'prod' | 'test') => {
    if (saving || next === apiEnvironment) return;
    setPendingEnv(next);
  };

  const handleConfirmChange = async () => {
    if (!pendingEnv || saving || !slide) return;

    setSaving(true);
    try {
      const updated = await slide.setApiEnvironment(pendingEnv);
      setApiEnvironment(updated);
      setPendingEnv(null);
      onToggle();
    } finally {
      setSaving(false);
    }
  };

  const isProd = apiEnvironment === 'prod';

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`flex items-center gap-1 px-2 h-full transition-colors disabled:opacity-50 ${
          isProd
            ? 'bg-success/10 text-success hover:bg-success/15'
            : 'bg-warning/10 text-warning-foreground hover:bg-warning/15'
        }`}
        title={t('statusBar.env.switchTooltip')}
      >
        <Dot color={isProd ? 'green' : 'yellow'} />
        <span>{t('statusBar.env.label', { env: isProd ? 'PROD' : 'TEST' })}</span>
      </button>

      <StatusPopover open={open} onClose={onToggle} className="right-0 min-w-[360px] max-w-[420px]">
        <div className="px-3 py-2 border-b border-border font-semibold text-foreground">
          {t('statusBar.env.apiEnvironment')}
        </div>
        <div className="px-3 py-2 space-y-2">
          <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 items-start">
            <span className="text-muted-foreground">{t('statusBar.env.current')}</span>
            <span className={`font-semibold ${isProd ? 'text-success' : 'text-warning-foreground'}`}>
              {isProd ? 'PROD' : 'TEST'}
            </span>

            <span className="text-muted-foreground">{t('statusBar.env.description')}</span>
            <span>
              {isProd
                ? t('statusBar.env.descriptionProd')
                : t('statusBar.env.descriptionTest')}
            </span>

            <span className="text-muted-foreground">{t('statusBar.env.impact')}</span>
            <span>
              {t('statusBar.env.impactDetail')}
            </span>
          </div>

          <div className="pt-2 border-t border-border">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('statusBar.env.switchEnvironment')}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => requestChange('prod')}
                disabled={saving || apiEnvironment === 'prod'}
                className="rounded border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success hover:bg-success/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                PROD
              </button>
              <button
                onClick={() => requestChange('test')}
                disabled={saving || apiEnvironment === 'test'}
                className="rounded border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning-foreground hover:bg-warning/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                TEST
              </button>
            </div>
          </div>
        </div>
      </StatusPopover>

      <ConfirmModal
        open={pendingEnv !== null}
        title={t('statusBar.env.confirmSwitchTitle')}
        message={
          pendingEnv
            ? t('statusBar.env.confirmSwitchMessage', { from: apiEnvironment.toUpperCase(), to: pendingEnv.toUpperCase() })
            : ''
        }
        confirmLabel={pendingEnv ? t('statusBar.env.switchTo', { env: pendingEnv.toUpperCase() }) : t('common.confirm')}
        danger={false}
        loading={saving}
        onConfirm={() => void handleConfirmChange()}
        onCancel={() => !saving && setPendingEnv(null)}
      />
    </div>
  );
}
