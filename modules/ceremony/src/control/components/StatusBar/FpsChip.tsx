import { useTranslation } from 'react-i18next';
import { Dot } from './Dot';
import { StatusPopover } from './StatusPopover';
import { StatRow } from './statusRow';
import { useFps } from './useFps';

export function FpsChip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const fps = useFps();

  if (fps === null) return null;

  const fpsColor = fps < 20 ? 'text-destructive' : fps < 40 ? 'text-warning' : 'text-muted-foreground';
  const dotColor = fps < 20 ? 'red' : fps < 40 ? 'yellow' : 'green';
  const fpsLabel = fps < 20 ? t('statusBar.fps.lag') : fps < 40 ? t('statusBar.fps.normal') : t('statusBar.fps.smooth');
  // Interval confetti thích nghi: max(4s, ticks*0.75/fps)
  const confettiInterval = Math.max(4, Math.round((400 * 0.75) / fps));

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 px-2 hover:bg-muted h-full transition-colors"
        title={t('statusBar.fps.frameRate')}
      >
        <Dot color={dotColor} />
        <span className="text-muted-foreground">FPS</span>
        <span className={fpsColor}>{fps}</span>
      </button>
      <StatusPopover open={open} onClose={onToggle} className="right-0">
        <div className="px-3 py-2 border-b border-border font-semibold text-foreground">
          {t('statusBar.fps.frameRateControl')}
        </div>
        <div className="px-3 py-2 space-y-1">
          <StatRow
            label={t('statusBar.fps.currentFps')}
            value={`${fps} fps`}
            accent={dotColor}
            tooltip={t('statusBar.fps.currentFpsTooltip')}
          />
          <StatRow
            label={t('statusBar.fps.level')}
            value={fpsLabel}
            accent={dotColor}
            tooltip={t('statusBar.fps.levelTooltip')}
          />
          <StatRow
            label={t('statusBar.fps.confettiInterval')}
            value={t('statusBar.fps.confettiIntervalValue', { seconds: confettiInterval })}
            tooltip={t('statusBar.fps.confettiIntervalTooltip')}
          />
          <StatRow
            label={t('statusBar.fps.description')}
            value={t('statusBar.fps.descriptionValue')}
            tooltip={t('statusBar.fps.descriptionTooltip')}
          />
        </div>
      </StatusPopover>
    </div>
  );
}
