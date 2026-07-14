import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusPopover } from './StatusPopover';
import { StatRow } from './statusRow';
import type { SystemStats } from './types';
import { useSlide } from '../../lib/slide';

export function SystemInfo() {
  const { t } = useTranslation();
  const slide = useSlide('system-stats');
  const [stats, setStats] = useState<SystemStats | null>(null);
  const prevCpuRef = useRef<{ user: number; system: number; time: number } | null>(null);
  const [cpuPercent, setCpuPercent] = useState<number | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    if (!slide) return;
    let cancelled = false;
    const fetch = async () => {
      if (cancelled) return;
      const s = await slide.getSystemStats();
      if (cancelled) return;
      setStats(s);

      const now = Date.now();
      if (prevCpuRef.current) {
        const elapsedMs = now - prevCpuRef.current.time;
        const cpuMs =
          s.cpuUserMs + s.cpuSystemMs - (prevCpuRef.current.user + prevCpuRef.current.system);
        setCpuPercent(Math.min(100, Math.max(0, Math.round((cpuMs / elapsedMs) * 100))));
      }
      prevCpuRef.current = { user: s.cpuUserMs, system: s.cpuSystemMs, time: now };
    };

    fetch();
    const id = setInterval(fetch, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [slide]);

  if (!stats) return <span className="px-2 text-muted-foreground">{t('statusBar.system.ramDash')}</span>;

  const ramUsagePercent = Math.round((stats.appRamMb / stats.totalRamMb) * 100);
  const systemRamPercent = Math.round((stats.usedRamMb / stats.totalRamMb) * 100);

  return (
    <div className="relative flex items-center">
      <button
        onClick={() => setPopoverOpen(!popoverOpen)}
        className="flex items-center gap-3 px-2 text-muted-foreground hover:bg-muted h-full transition-colors"
      >
        <span className="text-muted-foreground">RAM</span> {stats.appRamMb}MB{' '}
        <span className="text-muted-foreground">({ramUsagePercent}%)</span>
        {cpuPercent !== null && (
          <>
            <span className="text-muted-foreground">CPU</span> {cpuPercent}%
          </>
        )}
      </button>
      <StatusPopover open={popoverOpen} onClose={() => setPopoverOpen(false)} className="left-0">
        <div className="px-3 py-2 border-b border-border font-semibold text-foreground">
          {t('statusBar.system.title')}
        </div>
        <div className="px-3 py-2 space-y-1">
          <StatRow
            label={t('statusBar.system.appRam')}
            value={`${stats.appRamMb} MB (${ramUsagePercent}%)`}
            accent="slate"
            tooltip={t('statusBar.system.appRamTooltip')}
          />
          <StatRow
            label={t('statusBar.system.systemRam')}
            value={`${stats.usedRamMb} MB (${systemRamPercent}%)`}
            accent="slate"
            tooltip={t('statusBar.system.systemRamTooltip')}
          />
          <StatRow
            label={t('statusBar.system.totalRam')}
            value={`${stats.totalRamMb} MB`}
            tooltip={t('statusBar.system.totalRamTooltip')}
          />
          {cpuPercent !== null && (
            <StatRow
              label={t('statusBar.system.cpuUsage')}
              value={`${cpuPercent}%`}
              accent="slate"
              tooltip={t('statusBar.system.cpuUsageTooltip')}
            />
          )}
          <StatRow
            label={t('statusBar.system.cpuSys')}
            value={`${stats.cpuSystemMs} ms`}
            tooltip={t('statusBar.system.cpuSysTooltip')}
          />
          <StatRow
            label={t('statusBar.system.cpuUser')}
            value={`${stats.cpuUserMs} ms`}
            tooltip={t('statusBar.system.cpuUserTooltip')}
          />
          <StatRow
            label={t('statusBar.system.description')}
            value={t('statusBar.system.descriptionValue')}
            tooltip={t('statusBar.system.descriptionTooltip')}
          />
        </div>
      </StatusPopover>
    </div>
  );
}
