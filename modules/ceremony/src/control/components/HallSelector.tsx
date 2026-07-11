import { useTranslation } from 'react-i18next';
import { useControlStore } from '../store';
import { useSocketRef } from '../SocketContext';

const HALLS = [
  { code: 0, name: 'Quảng trường' },
  { code: 1, name: 'HTL - GD1' },
  { code: 2, name: 'HT1- GD2' },
  { code: 3, name: 'HT2-GD2' },
];

export function HallSelector() {
  const { t } = useTranslation();
  const code = useControlStore((s) => s.awardLocationCode ?? 0);
  const socket = useSocketRef();

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase text-muted-foreground select-none">{t('hallSelector.label')}</span>
      <select
        value={code}
        onChange={(e) => {
          const val = parseInt(e.target.value, 10);
          socket.current?.emit('cmd:setAwardLocation', { code: val });
        }}
        className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground outline-none hover:bg-muted hover:border-primary/50 focus:border-info focus:ring-1 focus:ring-info transition-colors cursor-pointer"
      >
        {HALLS.map((h) => (
          <option key={h.code} value={h.code}>
            {h.code} - {h.name}
          </option>
        ))}
      </select>
    </div>
  );
}
