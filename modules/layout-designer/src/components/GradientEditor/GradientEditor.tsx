import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_CSS,
  parseGradientCss,
  buildGradientCss,
  nextStopId,
  labelStyle,
  numberInputStyle,
  type ParsedGradient,
  type GradientStop,
} from './helpers.js';
import { ColorfulPicker, ColorfulSwatchPopover, cn } from '@sky-app/ui';

export interface GradientEditorProps {
  value: string;
  onChange: (css: string) => void;
}

export function GradientEditor({ value, onChange }: GradientEditorProps) {
  const [parsed, setParsed] = useState<ParsedGradient>(() => parseGradientCss(value || DEFAULT_CSS));
  const [selectedStopId, setSelectedStopId] = useState<string>(() => parsed.stops[0]?.id ?? '');
  const barRef = useRef<HTMLDivElement>(null);
  const [openSwatchPopoverId, setOpenSwatchPopoverId] = useState<string | null>(null);

  const lastEmittedRef = useRef<string>(value);
  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    const next = parseGradientCss(value || DEFAULT_CSS);
    setParsed(next);
    setSelectedStopId(next.stops[0]?.id ?? '');
    lastEmittedRef.current = value;
  }, [value]);

  function emit(next: ParsedGradient) {
    setParsed(next);
    const css = buildGradientCss(next);
    lastEmittedRef.current = css;
    onChange(css);
  }

  const sortedStops = [...parsed.stops].sort((a, b) => a.offset - b.offset);
  const selectedStop = parsed.stops.find((s) => s.id === selectedStopId) ?? parsed.stops[0];
  const previewCss = buildGradientCss(parsed);

  function updateStop(id: string, patch: Partial<GradientStop>) {
    emit({ ...parsed, stops: parsed.stops.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  function removeStop(id: string) {
    if (parsed.stops.length <= 2) return;
    const remaining = parsed.stops.filter((s) => s.id !== id);
    emit({ ...parsed, stops: remaining });
    if (selectedStopId === id) setSelectedStopId(remaining[0]!.id);
  }

  function addStopAt(offset: number) {
    const id = nextStopId();
    const nearestLeft = [...sortedStops].reverse().find((s) => s.offset <= offset) ?? sortedStops[0]!;
    const newStop: GradientStop = { id, color: nearestLeft.color, alpha: nearestLeft.alpha, offset };
    emit({ ...parsed, stops: [...parsed.stops, newStop] });
    setSelectedStopId(id);
  }

  function handleBarClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    const offset = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    addStopAt(Math.round(offset));
  }

  function handleHandlePointerDown(id: string, e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.preventDefault();
    setSelectedStopId(id);
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    function onMove(ev: PointerEvent) {
      const offset = Math.max(0, Math.min(100, ((ev.clientX - rect!.left) / rect!.width) * 100));
      updateStop(id, { offset: Math.round(offset) });
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <div>
      <div
        ref={barRef}
        onClick={handleBarClick}
        className="relative h-[22px] m-[9px_8px_0] rounded-[11px] cursor-copy"
        style={{
          background: previewCss,
          cursor: 'copy',
        }}
      >
        {parsed.stops.map((s) => {
          const isSelected = s.id === selectedStopId;
          return (
            <div
              key={s.id}
              onPointerDown={(e) => handleHandlePointerDown(s.id, e)}
              onClick={(e) => e.stopPropagation()}
              title={`${Math.round(s.offset)}%`}
              className={cn(
                'absolute -translate-x-1/2 -translate-y-1/2 w-[14px] h-[34px] rounded-[7px] border-[3px] border-white cursor-grab',
                isSelected ? 'top-1/2 scale-[1.08] shadow-[0_2px_6px_rgba(0,0,0,0.25),0_0_0_2px_#4b57e6] z-[2]' : 'top-1/2 shadow-[0_2px_6px_rgba(0,0,0,0.25)] z-[1]'
              )}
              style={{
                left: `${s.offset}%`,
                background: s.color,
                cursor: 'grab',
              }}
            />
          );
        })}
      </div>

      <div className="relative h-[26px] m-[10px_8px_14px] border-t border-[#e6e6ee]">
        {sortedStops.map((s) => {
          const isSelected = s.id === selectedStopId;
          return (
            <input
              key={s.id}
              type="number"
              min={0}
              max={100}
              value={Math.round(s.offset)}
              onFocus={() => setSelectedStopId(s.id)}
              onChange={(e) => updateStop(s.id, { offset: Number(e.target.value) })}
              className={cn(
                'absolute top-[6px] -translate-x-1/2 w-[44px] text-center rounded-[7px] p-[4px_2px] text-[11px] bg-white border',
                isSelected ? 'border-[#4b57e6]' : 'border-[#e6e6ee]'
              )}
              style={{
                left: `${s.offset}%`,
              }}
            />
          );
        })}
      </div>

      <div className="flex gap-[6px] mb-[10px]">
        <button
          onClick={() => emit({ ...parsed, type: 'linear' })}
          className={cn(
            'flex-1 py-[6px] rounded-[7px] text-[11px] font-semibold border cursor-pointer max-w-[70px]',
            parsed.type === 'linear' ? 'border-[#4b57e6] bg-[#4b57e6]/10 text-[#4b57e6]' : 'border-[#e6e6ee] bg-[#fcfcfd] text-[#5c5d6e]'
          )}
          style={{
            color: parsed.type === 'linear' ? 'var(--accent-color, #4b57e6)' : '#5c5d6e',
          }}
        >
          Linear
        </button>
        <button
          onClick={() => emit({ ...parsed, type: 'radial' })}
          className={cn(
            'flex-1 py-[6px] rounded-[7px] text-[11px] font-semibold border cursor-pointer max-w-[70px]',
            parsed.type === 'radial' ? 'border-[#4b57e6] bg-[#4b57e6]/10 text-[#4b57e6]' : 'border-[#e6e6ee] bg-[#fcfcfd] text-[#5c5d6e]'
          )}
          style={{
            color: parsed.type === 'radial' ? 'var(--accent-color, #4b57e6)' : '#5c5d6e',
          }}
        >
          Radial
        </button>
        {parsed.type === 'linear' && (
          <div className="flex items-center gap-[6px] ml-auto">
            <input
              type="number"
              min={0}
              max={360}
              value={Math.round(parsed.angle)}
              onChange={(e) => emit({ ...parsed, angle: Number(e.target.value) })}
              style={numberInputStyle(52)}
            />
            <span className="text-[11px] text-[#9a9bab]">°</span>
          </div>
        )}
      </div>

      {selectedStop && (
        <ColorfulPicker
          key={selectedStop.id}
          color={selectedStop.color}
          alpha={selectedStop.alpha}
          onChange={(patch) => updateStop(selectedStop.id, patch)}
        />
      )}

      <label style={labelStyle}>Stops</label>
      <div className="flex flex-col gap-[6px]">
        {sortedStops.map((s) => (
          <div
            key={s.id}
            onClick={() => setSelectedStopId(s.id)}
            className={cn(
              'flex items-center gap-[6px] p-[6px] rounded-lg border cursor-pointer',
              s.id === selectedStopId ? 'border-[#4b57e6] bg-[#4b57e6]/10' : 'border-[#e6e6ee] bg-transparent'
            )}
          >
            <div className="relative shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedStopId(s.id);
                  setOpenSwatchPopoverId((cur) => (cur === s.id ? null : s.id));
                }}
                aria-label={`Chọn màu điểm dừng ${Math.round(s.offset)}%`}
                className="w-[26px] h-[26px] p-0 border border-[#e6e6ee] rounded-md cursor-pointer"
                style={{ background: s.color }}
              />
              {openSwatchPopoverId === s.id && (
                <ColorfulSwatchPopover
                  color={s.color}
                  alpha={s.alpha}
                  onChange={(patch) => updateStop(s.id, patch)}
                  onClose={() => setOpenSwatchPopoverId(null)}
                />
              )}
            </div>
            <input
              type="text"
              value={s.color}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => updateStop(s.id, { color: e.target.value })}
              className="flex-1 border border-[#e6e6ee] rounded-md p-[6px_7px] text-[11.5px]"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={Math.round(s.offset)}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => updateStop(s.id, { offset: Number(e.target.value) })}
              className="w-[50px] border border-[#e6e6ee] rounded-md p-[6px_7px] text-[11.5px]"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeStop(s.id);
              }}
              disabled={parsed.stops.length <= 2}
              aria-label={`Xoá điểm dừng ${Math.round(s.offset)}%`}
              className={cn(
                'border-none bg-transparent text-[14px] px-[3px] leading-none',
                parsed.stops.length <= 2 ? 'text-[#d3d4de] cursor-default' : 'text-[#9a9bab] cursor-pointer hover:text-red-500'
              )}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
