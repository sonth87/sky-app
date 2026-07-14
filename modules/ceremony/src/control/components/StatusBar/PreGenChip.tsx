import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useControlStore } from '../../store';
import { PreGenPopover } from '../PreGenPopover';
import { Dot } from './Dot';
import { StatusPopover } from './StatusPopover';
import { useSlide } from '../../lib/slide';

export function PreGenChip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const slide = useSlide('pregen');
  const pregenStatus = useControlStore((s) => s.pregenStatus);

  // Subscribe to IPC progress events and keep store in sync
  useEffect(() => {
    const unsub = slide?.onPregenProgress((status) => {
      useControlStore.setState({ pregenStatus: status });
    }) ?? (() => {});
    return unsub;
  }, [slide]);

  if (!pregenStatus) return null;

  const { done, total, failed, running, paused } = pregenStatus;

  const dotColor: 'green' | 'yellow' | 'red' =
    failed > 0 && !running
      ? 'red'
      : running || paused
        ? 'yellow'
        : done === total
          ? 'green'
          : 'yellow';

  const label =
    running && !paused
      ? t('statusBar.pregen.progress', { done, total })
      : paused
        ? t('statusBar.pregen.paused', { done, total })
        : failed > 0
          ? t('statusBar.pregen.progressFailed', { done, total, failed })
          : t('statusBar.pregen.progressPlain', { done, total });

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 px-2 hover:bg-muted h-full transition-colors"
        title={t('statusBar.pregen.tooltip')}
      >
        <Dot color={dotColor} />
        <span>{label}</span>
      </button>
      <StatusPopover open={open} onClose={onToggle} className="right-0 min-w-[400px] max-w-[450px]">
        <div className="px-3 py-2 border-b border-border font-semibold text-foreground">
          {t('statusBar.pregen.title')}
        </div>
        <PreGenPopover status={pregenStatus} />
      </StatusPopover>
    </div>
  );
}
