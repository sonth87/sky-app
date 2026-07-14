import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Minus, Plus } from 'lucide-react';
import { useControlStore } from '../store';
import { DelayPopoverContent } from './DelayPopover';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

interface AutoPlayBarProps {
  countdown: number;
  progress: number;
  togglePlay: () => void;
}

export function AutoPlayBar({ countdown, progress, togglePlay }: AutoPlayBarProps) {
  const { t } = useTranslation();
  const { autoPlay, setAutoPlay, mode } = useControlStore();
  const { isPlaying, delaySeconds, currentCode } = autoPlay;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const disabledInAutoMode = mode === 'auto';

  const adjustDelay = (delta: number) => {
    const next = Math.min(60, Math.max(5, delaySeconds + delta));
    setAutoPlay({ delaySeconds: next });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-end gap-5">
        {/* Delay setting */}
        <div className="flex items-center gap-1.5 text-sm text-foreground">
          <button
            onClick={() => adjustDelay(-1)}
            disabled={disabledInAutoMode || delaySeconds <= 5}
            className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted disabled:opacity-30 font-medium"
          >
            <Minus size={14} />
          </button>
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                onClick={() => !disabledInAutoMode && setPopoverOpen(!popoverOpen)}
                disabled={disabledInAutoMode}
                className="w-10 text-center font-semibold tabular-nums cursor-pointer rounded px-2 py-1 hover:bg-muted"
              >
                {delaySeconds}s
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2">
              <DelayPopoverContent onSelect={() => setPopoverOpen(false)} />
            </PopoverContent>
          </Popover>
          <button
            onClick={() => adjustDelay(1)}
            disabled={disabledInAutoMode || delaySeconds >= 60}
            className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted disabled:opacity-30 font-medium"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Play / Pause */}
        <button
          onClick={togglePlay}
          disabled={disabledInAutoMode}
          title={disabledInAutoMode ? t('autoPlayBar.manualOnly') : undefined}
          className={`flex items-center gap-2 rounded px-3.5 py-2 text-sm font-medium transition-colors flex-shrink-0 ${
            isPlaying
              ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          {isPlaying ? t('autoPlayBar.stop') : t('autoPlayBar.auto')}
        </button>

        {/* Countdown */}
        {isPlaying && currentCode && (
          <span className="font-mono text-sm font-semibold tabular-nums text-destructive">
            {countdown}s
          </span>
        )}
      </div>

      {/* Progress bar */}
      {isPlaying && currentCode && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-destructive transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

