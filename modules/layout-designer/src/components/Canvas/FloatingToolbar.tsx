import { MousePointer2, Hand, Undo2, Redo2, Minus, Plus, Maximize } from 'lucide-react';
import { MIN_ZOOM, MAX_ZOOM } from '@sky-app/layout-editor-core';
import { cn } from '../../lib/cn.js';

export const ZOOM_STEP_FACTOR = 1.1;

export function toolBtnStyle(active: boolean, enabled = true): React.CSSProperties {
  return {
    width: 26,
    height: 26,
    borderRadius: 7,
    border: 'none',
    background: active ? 'color-mix(in srgb, var(--accent-color, #4b57e6) 12%, transparent)' : 'transparent',
    color: !enabled ? '#d3d4de' : active ? 'var(--accent-color, #4b57e6)' : '#5c5d6e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: enabled ? 'pointer' : 'default',
  };
}

export function Divider() {
  return <div className="w-[1px] h-[20px] bg-[#e6e6ee] mx-[2px]" />;
}

export interface FloatingToolbarProps {
  toolMode: 'select' | 'hand';
  onToolModeChange: (mode: 'select' | 'hand') => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  containerEl: HTMLDivElement | null;
}

export function FloatingToolbar({
  toolMode,
  onToolModeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomChange,
  containerEl,
}: FloatingToolbarProps) {
  const zoomIn = () => onZoomChange(Math.min(MAX_ZOOM, zoom * ZOOM_STEP_FACTOR));
  const zoomOut = () => onZoomChange(Math.max(MIN_ZOOM, zoom / ZOOM_STEP_FACTOR));
  const reset = () => onZoomChange(1);
  const toggleFullscreen = () => {
    if (!containerEl) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void containerEl.requestFullscreen();
    }
  };

  const getBtnClass = (active: boolean, enabled = true) =>
    cn(
      'w-[26px] h-[26px] rounded-[7px] border-none flex items-center justify-center transition-colors duration-100',
      !enabled ? 'text-[#d3d4de] cursor-default bg-transparent' : active ? 'bg-[#4b57e6]/12 text-[#4b57e6] cursor-pointer' : 'bg-transparent text-[#5c5d6e] hover:bg-[#f4f5f9] cursor-pointer'
    );

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-0.5 items-center bg-white border border-[#e6e6ee] rounded-[10px] p-[4px_6px] shadow-[0_4px_14px_rgba(0,0,0,0.08)] z-[5]">
      <button onClick={() => onToolModeChange('select')} aria-label="Công cụ chọn" aria-pressed={toolMode === 'select'} className={getBtnClass(toolMode === 'select')}>
        <MousePointer2 size={15} />
      </button>
      <button onClick={() => onToolModeChange('hand')} aria-label="Công cụ tay (pan)" aria-pressed={toolMode === 'hand'} className={getBtnClass(toolMode === 'hand')}>
        <Hand size={15} />
      </button>
      <Divider />
      <button onClick={onUndo} disabled={!canUndo} aria-label="Hoàn tác" className={getBtnClass(false, canUndo)}>
        <Undo2 size={15} />
      </button>
      <button onClick={onRedo} disabled={!canRedo} aria-label="Làm lại" className={getBtnClass(false, canRedo)}>
        <Redo2 size={15} />
      </button>
      <Divider />
      <button onClick={zoomOut} aria-label="Thu nhỏ" className={getBtnClass(false)}>
        <Minus size={15} />
      </button>
      <button onClick={reset} aria-label="Đặt lại zoom 100%" className={cn(getBtnClass(false), 'w-[48px] text-[11.5px] font-semibold')}>
        {Math.round(zoom * 100)}%
      </button>
      <button onClick={zoomIn} aria-label="Phóng to" className={getBtnClass(false)}>
        <Plus size={15} />
      </button>
      <Divider />
      <button onClick={toggleFullscreen} aria-label="Toàn màn hình" className={getBtnClass(false)}>
        <Maximize size={15} />
      </button>
    </div>
  );
}
