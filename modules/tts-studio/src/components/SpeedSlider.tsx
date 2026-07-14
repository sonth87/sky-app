import { Slider } from './ui/slider';
import { useTtsStudioStore } from '../store';

export function SpeedSlider() {
  const speed = useTtsStudioStore((s) => s.speed);
  const setSpeed = useTtsStudioStore((s) => s.setSpeed);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-foreground">Tốc độ đọc</label>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-mono font-bold text-primary">
          {speed.toFixed(1)}x
        </span>
      </div>
      <Slider
        min={0.5}
        max={2.0}
        step={0.1}
        value={[speed]}
        onValueChange={([v]) => v !== undefined && setSpeed(v)}
      />
      <div className="flex justify-between text-2xs text-muted-foreground">
        <span>0.5x</span>
        <span>2.0x</span>
      </div>
    </div>
  );
}
