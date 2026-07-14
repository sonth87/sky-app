import { useTranslation } from 'react-i18next';
import { useControlStore } from '../store';
import { useSocketRef } from '../SocketContext';

export function ModeSwitch() {
  const { t } = useTranslation();
  const mode = useControlStore((s) => s.mode);
  const socket = useSocketRef();

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{t('modeSwitch.label')}</span>
      <div className="inline-flex overflow-hidden rounded-md border border-border">
        {(['auto', 'manual'] as const).map((m) => (
          <button
            key={m}
            onClick={() => socket.current?.emit('cmd:setMode', { mode: m })}
            className={`px-3 py-1.5 text-sm ${
              mode === m ? 'bg-info text-info-foreground' : 'bg-card text-foreground hover:bg-muted'
            }`}
          >
            {m === 'auto' ? t('modeSwitch.auto') : t('modeSwitch.manual')}
          </button>
        ))}
      </div>
    </div>
  );
}
