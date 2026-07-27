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
import { StopColorPicker } from './StopColorPicker.js';
import { SwatchColorPopover } from './SwatchColorPopover.js';

export interface GradientEditorProps {
  /** CSS gradient string hiện tại (VD "linear-gradient(135deg, #201748 0%, #4b57e6 100%)"). */
  value: string;
  /** Gọi mỗi khi user chỉnh sửa — LUÔN nhận 1 CSS gradient string hoàn chỉnh, đã build sẵn. */
  onChange: (css: string) => void;
}

/**
 * Editor gradient trực quan (dải preview kéo stop, Linear/Radial, góc độ, color picker RGBA+hex,
 * danh sách STOPS) — độc lập với PropertyPanel/LayoutContent, chỉ nói chuyện qua value/onChange
 * dạng CSS string nên gắn được vào bất kỳ nơi nào khác cần chỉnh gradient (yêu cầu 2026-07-18).
 */
export function GradientEditor({ value, onChange }: GradientEditorProps) {
  const [parsed, setParsed] = useState<ParsedGradient>(() => parseGradientCss(value || DEFAULT_CSS));
  const [selectedStopId, setSelectedStopId] = useState<string>(() => parsed.stops[0]?.id ?? '');
  const barRef = useRef<HTMLDivElement>(null);
  // Stop nào đang mở popover Colorful ở dòng "Stops" (bấm vào swatch màu — yêu cầu 2026-07-18:
  // "khi stop ấn vào color thì cũng bật lên cái color picker" giống ảnh mẫu, thay vì input
  // type="color" hệ thống trước đó). `null` = không popover nào đang mở.
  const [openSwatchPopoverId, setOpenSwatchPopoverId] = useState<string | null>(null);

  // Đồng bộ lại khi `value` đổi TỪ BÊN NGOÀI (VD undo/redo, chọn item khác) — so sánh với CSS
  // build lại từ state hiện tại để KHÔNG re-parse khi chính component này vừa gọi onChange (nếu
  // không sẽ mất selection/id ổn định của từng stop ngay sau mỗi lần user tự sửa).
  const lastEmittedRef = useRef<string>(value);
  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    const next = parseGradientCss(value || DEFAULT_CSS);
    setParsed(next);
    setSelectedStopId(next.stops[0]?.id ?? '');
    lastEmittedRef.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ theo dõi value, parsed/selectedStopId tự set bên trong
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
    if (parsed.stops.length <= 2) return; // tối thiểu 2 stop để còn là gradient
    const remaining = parsed.stops.filter((s) => s.id !== id);
    emit({ ...parsed, stops: remaining });
    if (selectedStopId === id) setSelectedStopId(remaining[0]!.id);
  }

  function addStopAt(offset: number) {
    const id = nextStopId();
    // Màu mới = nội suy thô giữa 2 stop lân cận (đơn giản: lấy màu stop gần nhất bên trái).
    const nearestLeft = [...sortedStops].reverse().find((s) => s.offset <= offset) ?? sortedStops[0]!;
    const newStop: GradientStop = { id, color: nearestLeft.color, alpha: nearestLeft.alpha, offset };
    emit({ ...parsed, stops: [...parsed.stops, newStop] });
    setSelectedStopId(id);
  }

  function handleBarClick(e: React.MouseEvent<HTMLDivElement>) {
    // Click vào dải (KHÔNG phải kéo 1 handle có sẵn — xử lý ở handle riêng) → thêm stop mới tại đó.
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
      {/* Track kiểu ảnh mẫu (review 2026-07-18): dải gradient LÀM NỀN cho track, handle là hình
         CON NHỘNG DỌC (pill, cao hơn dải, nhô lên/xuống) thay vì chấm tròn nhỏ nằm giữa dải như
         trước. Handle mang MÀU CỦA CHÍNH STOP đó (phản hồi tiếp theo 2026-07-18: "màu của track
         là màu của phần đấy chứ" — trước đó nền handle luôn trắng, không thể hiện màu stop), viền
         trắng dày để nổi lên trên nền track; handle đang chọn có thêm viền ngoài accent. */}
      <div
        ref={barRef}
        onClick={handleBarClick}
        style={{
          position: 'relative',
          height: 22,
          margin: '9px 8px 0',
          borderRadius: 11,
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
              style={{
                position: 'absolute',
                left: `${s.offset}%`,
                top: '50%',
                transform: isSelected ? 'translate(-50%, -50%) scale(1.08)' : 'translate(-50%, -50%)',
                width: 14,
                height: 34,
                borderRadius: 7,
                background: s.color,
                border: '3px solid #fff',
                boxShadow: isSelected ? '0 2px 6px rgba(0,0,0,.25), 0 0 0 2px var(--accent-color, #4b57e6)' : '0 2px 6px rgba(0,0,0,.25)',
                cursor: 'grab',
                zIndex: isSelected ? 2 : 1,
              }}
            />
          );
        })}
      </div>

      {/* Hàng số offset — MỖI stop hiện 1 ô số CĂN ĐÚNG VỊ TRÍ dưới handle của nó (left theo %,
         giống track phía trên), stop đang chọn tô khung nổi bật. Khác track: đây CHỈ hiển thị
         (không kéo được) — sửa số qua danh sách "Stops" bên dưới hoặc gõ trực tiếp vào ô này. */}
      <div style={{ position: 'relative', height: 26, margin: '10px 8px 14px', borderTop: '1px solid #e6e6ee' }}>
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
              style={{
                position: 'absolute',
                left: `${s.offset}%`,
                top: 6,
                transform: 'translateX(-50%)',
                width: 44,
                textAlign: 'center',
                border: `1px solid ${isSelected ? 'var(--accent-color, #4b57e6)' : '#e6e6ee'}`,
                borderRadius: 7,
                padding: '4px 2px',
                fontSize: 11,
                background: '#fff',
              }}
            />
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button
          onClick={() => emit({ ...parsed, type: 'linear' })}
          style={typeBtnStyle(parsed.type === 'linear')}
        >
          Linear
        </button>
        <button
          onClick={() => emit({ ...parsed, type: 'radial' })}
          style={typeBtnStyle(parsed.type === 'radial')}
        >
          Radial
        </button>
        {parsed.type === 'linear' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <input
              type="number"
              min={0}
              max={360}
              value={Math.round(parsed.angle)}
              onChange={(e) => emit({ ...parsed, angle: Number(e.target.value) })}
              style={numberInputStyle(52)}
            />
            <span style={{ fontSize: 11, color: '#9a9bab' }}>°</span>
          </div>
        )}
      </div>

      {selectedStop && (
        <StopColorPicker
          key={selectedStop.id}
          color={selectedStop.color}
          alpha={selectedStop.alpha}
          onChange={(patch) => updateStop(selectedStop.id, patch)}
        />
      )}

      <label style={labelStyle}>Stops</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sortedStops.map((s) => (
          <div
            key={s.id}
            onClick={() => setSelectedStopId(s.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: 6,
              borderRadius: 8,
              border: `1px solid ${s.id === selectedStopId ? 'var(--accent-color, #4b57e6)' : '#e6e6ee'}`,
              background: s.id === selectedStopId ? 'color-mix(in srgb, var(--accent-color, #4b57e6) 6%, transparent)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <div style={{ position: 'relative', flex: 'none' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedStopId(s.id);
                  setOpenSwatchPopoverId((cur) => (cur === s.id ? null : s.id));
                }}
                aria-label={`Chọn màu điểm dừng ${Math.round(s.offset)}%`}
                style={{ width: 26, height: 26, padding: 0, border: '1px solid #e6e6ee', borderRadius: 6, background: s.color, cursor: 'pointer' }}
              />
              {openSwatchPopoverId === s.id && (
                <SwatchColorPopover
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
              style={{ ...numberInputStyle(undefined), flex: 1 }}
            />
            <input
              type="number"
              min={0}
              max={100}
              value={Math.round(s.offset)}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => updateStop(s.id, { offset: Number(e.target.value) })}
              style={numberInputStyle(50)}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeStop(s.id);
              }}
              disabled={parsed.stops.length <= 2}
              aria-label={`Xoá điểm dừng ${Math.round(s.offset)}%`}
              style={{
                border: 'none',
                background: 'transparent',
                color: parsed.stops.length <= 2 ? '#d3d4de' : '#9a9bab',
                cursor: parsed.stops.length <= 2 ? 'default' : 'pointer',
                fontSize: 14,
                padding: '0 3px',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function typeBtnStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '6px 0',
    borderRadius: 7,
    fontSize: 11,
    fontWeight: 600,
    border: `1px solid ${active ? 'var(--accent-color, #4b57e6)' : '#e6e6ee'}`,
    background: active ? 'color-mix(in srgb, var(--accent-color, #4b57e6) 10%, transparent)' : '#fcfcfd',
    color: active ? 'var(--accent-color, #4b57e6)' : '#5c5d6e',
    cursor: 'pointer',
    maxWidth: 70,
  };
}
