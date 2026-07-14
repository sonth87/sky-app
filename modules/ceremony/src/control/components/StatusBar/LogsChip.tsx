import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useControlStore } from '../../store';
import { Dot } from './Dot';
import { useSlide } from '../../lib/slide';

export function LogsChip() {
  const { t } = useTranslation();
  const slide = useSlide('logs');
  const logsDrawerOpen = useControlStore((s) => s.logsDrawerOpen);
  const setLogsDrawerOpen = useControlStore((s) => s.setLogsDrawerOpen);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!slide) return;
    slide.getLogs().then(setLogs);
    const unsub = slide.onLogsChanged((updatedLogs) => {
      setLogs(updatedLogs);
    });
    return unsub;
  }, [slide]);

  const failedCount = logs.filter((l) => l.apiStatus === 'failed').length;
  const pendingCount = logs.filter((l) => l.apiStatus === 'pending').length;

  let dotColor: 'green' | 'red' | 'yellow' = 'green';
  let label = t('statusBar.logs.ok');

  if (failedCount > 0) {
    dotColor = 'red';
    label = t('statusBar.logs.errors', { count: failedCount });
  } else if (pendingCount > 0) {
    dotColor = 'yellow';
    label = t('statusBar.logs.sending');
  }

  return (
    <div className="relative">
      <button
        onClick={() => setLogsDrawerOpen(!logsDrawerOpen)}
        className={`flex items-center gap-1.5 px-3.5 h-full transition-colors cursor-pointer select-none font-semibold ${
          logsDrawerOpen
            ? 'bg-muted text-foreground border-l border-r border-border'
            : 'hover:bg-muted text-foreground'
        }`}
        title={t('statusBar.logs.toggleTooltip')}
      >
        <Dot color={dotColor} />
        <span>{label}</span>
      </button>
    </div>
  );
}
