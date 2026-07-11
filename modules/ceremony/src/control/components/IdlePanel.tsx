import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSocketRef } from '../SocketContext';
import { useControlStore } from '../store';
import { RainbowBorder } from './RainbowBorder';
import { TooltipSimple as Tooltip } from './ui/TooltipSimple';

/** Đếm ngược idle-timer dựa theo wall-clock (startedAt + totalSeconds) — không lệch khi tab bị throttle. */
function useIdleCountdown() {
  const idleTimer = useControlStore((s) => s.idleTimer);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!idleTimer.active || !idleTimer.startedAt) {
      setRemaining(0);
      return;
    }
    const startedMs = new Date(idleTimer.startedAt).getTime();
    let rafId: number;
    const tick = () => {
      const elapsed = (Date.now() - startedMs) / 1000;
      setRemaining(Math.max(0, idleTimer.totalSeconds - elapsed));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [idleTimer.active, idleTimer.startedAt, idleTimer.totalSeconds]);

  return {
    active: idleTimer.active,
    remaining,
    progress: idleTimer.active && idleTimer.totalSeconds > 0
      ? (idleTimer.totalSeconds - remaining) / idleTimer.totalSeconds
      : 0,
  };
}

/** Nút chuyển Backdrop về màn hình chào mừng (cmd:clear) — hiện đếm ngược khi idle-timeout đang chạy. */
export function IdlePanel() {
  const { t } = useTranslation();
  const socket = useSocketRef();
  const idleCountdown = useIdleCountdown();

  return (
    <RainbowBorder active={idleCountdown.active} progress={idleCountdown.progress} className="bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          {t('idlePanel.welcomeScreen')}
        </span>
        {idleCountdown.active && (
          <Tooltip content={t('idlePanel.autoReturnTooltip')}>
            <span className="cursor-help font-mono text-xs font-semibold tabular-nums text-warning">
              {t('idlePanel.autoReturnIn', { seconds: Math.ceil(idleCountdown.remaining) })}
            </span>
          </Tooltip>
        )}
      </div>
      <div className="mb-3 overflow-hidden rounded-md bg-muted">
        <img
          src="sample-bundle/assets/2026/backdrop_idle.jpg"
          alt={t('idlePanel.welcomeScreen')}
          className="h-32 w-full object-cover"
        />
      </div>
      <button
        onClick={() => socket.current?.emit('cmd:clear')}
        className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/90"
      >
        ⌂ {t('idlePanel.showWelcomeScreen')}
      </button>
    </RainbowBorder>
  );
}
