import { useTranslation } from 'react-i18next';
import { useControlStore } from '../store';
import { useSocketRef } from '../SocketContext';
import { ToolbarGroup } from './ToolbarGroup';

const AMOUNT_OPTIONS = [
  { value: 'very_low',  labelKey: 'confettiToggle.amount.veryLow' },
  { value: 'low',       labelKey: 'confettiToggle.amount.low' },
  { value: 'medium',    labelKey: 'confettiToggle.amount.medium' },
  { value: 'high',      labelKey: 'confettiToggle.amount.high' },
  { value: 'very_high', labelKey: 'confettiToggle.amount.veryHigh' },
];

const SPEED_OPTIONS = [
  { value: 'very_slow', labelKey: 'confettiToggle.speed.verySlow' },
  { value: 'slow',      labelKey: 'confettiToggle.speed.slow' },
  { value: 'normal',    labelKey: 'confettiToggle.speed.normal' },
  { value: 'fast',      labelKey: 'confettiToggle.speed.fast' },
  { value: 'very_fast', labelKey: 'confettiToggle.speed.veryFast' },
];

export function ConfettiToggle() {
  const { t } = useTranslation();
  const socket = useSocketRef();
  const enabled = useControlStore((s) => s.confettiEnabled);
  const repeat = useControlStore((s) => s.confettiRepeat);
  const burst = useControlStore((s) => s.confettiBurst);
  const amount = useControlStore((s) => s.confettiAmount);
  const speed = useControlStore((s) => s.confettiSpeed);
  const setConfettiModalOpen = useControlStore((s) => s.setConfettiModalOpen);
  const { setConfettiEnabled, setConfettiRepeat, setConfettiBurst, setConfettiAmount, setConfettiSpeed } = useControlStore();

  const toggle = (next: boolean) => {
    setConfettiEnabled(next);
    socket.current?.emit('cmd:setConfetti', { enabled: next });
  };
  const toggleRepeat = (next: boolean) => {
    setConfettiRepeat(next);
    socket.current?.emit('cmd:setConfettiRepeat', { repeat: next });
  };
  const toggleBurst = (next: boolean) => {
    setConfettiBurst(next);
    socket.current?.emit('cmd:setConfettiBurst', { burst: next });
  };
  const changeAmount = (next: string) => {
    setConfettiAmount(next);
    socket.current?.emit('cmd:setConfettiAmount', { amount: next });
  };
  const changeSpeed = (next: string) => {
    setConfettiSpeed(next);
    socket.current?.emit('cmd:setConfettiSpeed', { speed: next });
  };

  return (
    <ToolbarGroup icon="🎉" label={t('confettiToggle.label')} active={enabled}>
      {(close) => (
        <div className="flex min-w-[220px] flex-col gap-2 p-3">
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => toggle(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-indigo-600"
            />
            {t('confettiToggle.enable')}
          </label>

          {enabled && (
            <div className="flex flex-col gap-2 border-t border-border pt-2">
              {/* Số lượng hạt */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{t('confettiToggle.intensity')}</span>
                  <span className="text-xs font-semibold text-primary">
                    {t(AMOUNT_OPTIONS.find((o) => o.value === amount)?.labelKey ?? 'confettiToggle.amount.high')}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={4}
                  step={1}
                  value={AMOUNT_OPTIONS.findIndex((o) => o.value === amount)}
                  onChange={(e) => changeAmount(AMOUNT_OPTIONS[+e.target.value].value)}
                  className="w-full accent-indigo-600"
                />
                <div className="mt-0.5 flex justify-between text-2xs text-muted-foreground">
                  <span>{t('confettiToggle.amount.veryLow')}</span>
                  <span>{t('confettiToggle.amount.veryHigh')}</span>
                </div>
              </div>

              {/* Tốc độ rơi */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{t('confettiToggle.fallSpeed')}</span>
                  <span className="text-xs font-semibold text-primary">
                    {t(SPEED_OPTIONS.find((o) => o.value === speed)?.labelKey ?? 'confettiToggle.speed.normal')}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={4}
                  step={1}
                  value={SPEED_OPTIONS.findIndex((o) => o.value === speed)}
                  onChange={(e) => changeSpeed(SPEED_OPTIONS[+e.target.value].value)}
                  className="w-full accent-indigo-600"
                />
                <div className="mt-0.5 flex justify-between text-2xs text-muted-foreground">
                  <span>{t('confettiToggle.speed.verySlow')}</span>
                  <span>{t('confettiToggle.speed.veryFast')}</span>
                </div>
              </div>

              {/* Lặp lại */}
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={repeat}
                  onChange={(e) => toggleRepeat(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-indigo-600"
                />
                {t('confettiToggle.repeat')}
              </label>

              {repeat && (
                <label className="flex cursor-pointer select-none items-center gap-2 pl-5 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={burst}
                    onChange={(e) => toggleBurst(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-indigo-600"
                  />
                  <span>
                    {t('confettiToggle.burst')}
                    <span className="ml-1 text-xs text-muted-foreground">({t('confettiToggle.burstHint')})</span>
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Nút Nâng cao */}
          <div className="border-t border-border pt-2">
            <button
              type="button"
              onClick={() => { close(); setConfettiModalOpen(true); }}
              className="flex w-full items-center justify-between gap-1.5 rounded border border-border bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
            >
              <span className="flex items-center gap-1.5">
                <span>⚙️</span>
                <span>{t('confettiToggle.advanced')}</span>
              </span>
              <span className="text-muted-foreground">›</span>
            </button>
          </div>
        </div>
      )}
    </ToolbarGroup>
  );
}
