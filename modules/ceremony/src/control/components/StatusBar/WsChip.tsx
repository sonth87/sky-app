import { useTranslation } from 'react-i18next';
import { useControlStore } from '../../store';
import { Dot } from './Dot';
import { StatusPopover } from './StatusPopover';
import { StatRow } from './statusRow';

export function WsChip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const connected = useControlStore((s) => s.connected);
  const wsPort = useControlStore((s) => s.wsPort);

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 px-2 hover:bg-muted h-full transition-colors"
        title={t('statusBar.ws.tooltip')}
      >
        <Dot color={connected ? 'green' : 'red'} />
        <span>{connected ? t('statusBar.ws.connected') : t('statusBar.ws.disconnected')}</span>
      </button>
      <StatusPopover open={open} onClose={onToggle} className="right-0 min-w-[400px] max-w-[450px]">
        <div className="px-3 py-2 border-b border-border font-semibold text-foreground">
          {t('statusBar.ws.title')}
        </div>
        <div className="px-3 py-2 space-y-1">
          <StatRow
            label={t('statusBar.ws.status')}
            value={connected ? t('statusBar.ws.statusConnected') : t('statusBar.ws.statusDisconnected')}
            accent={connected ? 'green' : 'red'}
            tooltip={t('statusBar.ws.statusTooltip')}
          />
          <StatRow
            label={t('statusBar.ws.protocol')}
            value="Socket.IO (WebSocket)"
            tooltip={t('statusBar.ws.protocolTooltip')}
          />
          <StatRow
            label="Port"
            value={`ws://127.0.0.1:${wsPort}`}
            tooltip={t('statusBar.ws.portTooltip')}
          />
          <StatRow
            label={t('statusBar.ws.description')}
            value={t('statusBar.ws.descriptionValue')}
            tooltip={t('statusBar.ws.descriptionTooltip')}
          />
        </div>
      </StatusPopover>
    </div>
  );
}
