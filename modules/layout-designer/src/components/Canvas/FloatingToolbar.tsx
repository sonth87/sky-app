import { MousePointer2, Hand, Undo2, Redo2, Minus, Plus, Maximize } from 'lucide-react';
import { MIN_ZOOM, MAX_ZOOM } from '@sky-app/layout-editor-core';

export const ZOOM_STEP_FACTOR = 1.1;

export function toolBtnStyle(active: boolean, enabled = true): React.CSSProperties {
  return {
    width: 26,
    height: 26,
    borderRadius: 7,
    border: 'none',
    // var(--accent-color) — màu accent hệ thống (device-layout's ThemeProvider set động lên
    // <html> theo Settings > Appearance), KHÔNG hard-code để khớp app khác khi user đổi màu.
    background: active ? 'color-mix(in srgb, var(--accent-color, #4b57e6) 12%, transparent)' : 'transparent',
    color: !enabled ? '#d3d4de' : active ? 'var(--accent-color, #4b57e6)' : '#5c5d6e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: enabled ? 'pointer' : 'default',
  };
}

export function Divider() {
  return <div style={{ width: 1, height: 20, background: '#e6e6ee', margin: '0 2px' }} />;
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

/**
 * Toolbar nổi Ở PHÍA TRÊN canvas (đổi từ đáy → đỉnh theo yêu cầu 2026-07-17) — rút gọn theo ảnh
 * mẫu (đã bỏ: nút AI/sparkle, chọn desktop/mobile view, 2 nút grid/column, logo Figma — những
 * cái đó không cần cho editor này). Giữ lại: select-tool, hand-tool (cố định, khác Space tạm
 * thời), undo/redo, zoom out/%/in, fullscreen — toàn bộ icon dùng lucide-react (đồng bộ với
 * modules/tts-studio, modules/ceremony), KHÔNG dùng emoji/ký tự Unicode tự chọn như trước. KHÔNG
 * phải "toolbar chung" đầy đủ theo plan (chưa có minimap) — chỉ đủ nhóm điều khiển canvas cơ bản.
 */
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

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 2,
        alignItems: 'center',
        background: '#fff',
        border: '1px solid #e6e6ee',
        borderRadius: 10,
        padding: '4px 6px',
        boxShadow: '0 4px 14px rgba(0,0,0,.08)',
        zIndex: 5,
      }}
    >
      <button onClick={() => onToolModeChange('select')} aria-label="Công cụ chọn" aria-pressed={toolMode === 'select'} style={toolBtnStyle(toolMode === 'select')}>
        <MousePointer2 size={15} />
      </button>
      <button onClick={() => onToolModeChange('hand')} aria-label="Công cụ tay (pan)" aria-pressed={toolMode === 'hand'} style={toolBtnStyle(toolMode === 'hand')}>
        <Hand size={15} />
      </button>
      <Divider />
      <button onClick={onUndo} disabled={!canUndo} aria-label="Hoàn tác" style={toolBtnStyle(false, canUndo)}>
        <Undo2 size={15} />
      </button>
      <button onClick={onRedo} disabled={!canRedo} aria-label="Làm lại" style={toolBtnStyle(false, canRedo)}>
        <Redo2 size={15} />
      </button>
      <Divider />
      <button onClick={zoomOut} aria-label="Thu nhỏ" style={toolBtnStyle(false)}>
        <Minus size={15} />
      </button>
      <button onClick={reset} aria-label="Đặt lại zoom 100%" style={{ ...toolBtnStyle(false), width: 48, fontSize: 11.5 }}>
        {Math.round(zoom * 100)}%
      </button>
      <button onClick={zoomIn} aria-label="Phóng to" style={toolBtnStyle(false)}>
        <Plus size={15} />
      </button>
      <Divider />
      <button onClick={toggleFullscreen} aria-label="Toàn màn hình" style={toolBtnStyle(false)}>
        <Maximize size={15} />
      </button>
    </div>
  );
}
