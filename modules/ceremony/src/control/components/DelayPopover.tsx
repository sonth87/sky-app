import { useControlStore } from '../store';
import { cn } from '../lib/cn';

const DELAY_PRESETS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

interface DelayPopoverContentProps {
  onSelect: () => void;
}

/** Nội dung chọn delay — nhúng bên trong <PopoverContent> của Radix ở call site (AutoPlayBar). */
export function DelayPopoverContent({ onSelect }: DelayPopoverContentProps) {
  const { autoPlay, setAutoPlay } = useControlStore();

  return (
    <div className="flex flex-col gap-1 w-20">
      {DELAY_PRESETS.map((seconds) => (
        <button
          key={seconds}
          onClick={() => {
            setAutoPlay({ delaySeconds: seconds });
            onSelect();
          }}
          className={cn(
            'w-full rounded px-2 py-1.5 text-xs font-medium transition-colors text-left',
            autoPlay.delaySeconds === seconds
              ? 'bg-primary text-primary-foreground'
              : 'border border-border text-foreground hover:bg-muted'
          )}
        >
          {seconds}s
        </button>
      ))}
    </div>
  );
}
