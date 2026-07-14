import { useState } from 'react';
import { EnvChip } from './EnvChip';
import { FpsChip } from './FpsChip';
import { LogsChip } from './LogsChip';
import { PreGenChip } from './PreGenChip';
import { QrChip } from './QrChip';
import { SystemInfo } from './SystemInfo';
import { TtsChip } from './TtsChip';
import type { PopoverKey } from './types';
import { WsChip } from './WsChip';

export function StatusBar() {
  const [openPopover, setOpenPopover] = useState<PopoverKey>(null);

  const toggle = (key: PopoverKey) => setOpenPopover((prev) => (prev === key ? null : key));

  return (
    <footer className="flex h-6 items-stretch justify-between border-t border-border bg-muted text-xxs font-medium text-foreground select-none">
      {/* Trái: tài nguyên */}
      <div className="flex items-center">
        <SystemInfo />
      </div>

      {/* Phải: chip trạng thái */}
      <div className="flex items-stretch divide-x divide-border">
        <EnvChip open={openPopover === 'env'} onToggle={() => toggle('env')} />
        <FpsChip open={openPopover === 'fps'} onToggle={() => toggle('fps')} />
        <WsChip open={openPopover === 'ws'} onToggle={() => toggle('ws')} />
        <TtsChip open={openPopover === 'tts'} onToggle={() => toggle('tts')} />
        <PreGenChip open={openPopover === 'pregen'} onToggle={() => toggle('pregen')} />
        <QrChip open={openPopover === 'qr'} onToggle={() => toggle('qr')} />
        <LogsChip />
      </div>
    </footer>
  );
}
