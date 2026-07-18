// GradientEditor — component ĐỘC LẬP (tái sử dụng được ở nơi khác ngoài PropertyPanel, theo yêu
// cầu 2026-07-18) để chỉnh 1 CSS gradient string qua UI trực quan (dải preview kéo-thả stop,
// chọn Linear/Radial, góc độ, color picker RGBA + hex, danh sách STOPS) — thay cho input text
// thô yêu cầu tự gõ cú pháp CSS. Value/onChange VẪN LÀ STRING (Background.gradient không đổi
// schema) — component tự parse string CSS → state có cấu trúc để hiển thị, rồi build lại string
// CSS mỗi khi user chỉnh sửa (quyết định 2026-07-18: giữ string ở tầng lưu trữ, GradientEditor
// tự lo phần parse/build, không đổi Background type trong slide-shared).

import { useEffect, useRef, useState } from 'react';
import Colorful from '@uiw/react-color-colorful';
import { hexToHsva, hsvaToHex, type ColorResult, type HsvaColor } from '@uiw/color-convert';

export type GradientType = 'linear' | 'radial';

export interface GradientStop {
  /** id nội bộ ổn định cho React key + để nhận diện stop đang chọn — KHÔNG xuất ra CSS. */
  id: string;
  color: string;
  /** rgba() alpha (0-100, giống UI ảnh mẫu — % không phải 0-1) — lưu riêng để hiện ô "A" trong RGBA. */
  alpha: number;
  /** Vị trí % (0-100) trên dải gradient. */
  offset: number;
}

let stopIdCounter = 0;
function nextStopId(): string {
  stopIdCounter += 1;
  return `gstop_${stopIdCounter}`;
}

const DEFAULT_CSS = 'linear-gradient(135deg, #201748 0%, #4b57e6 100%)';

/** Parse 1 màu CSS (#hex, #hex bỏ #, hoặc rgba(...)) → {hex, alpha 0-100}. Fail-soft: trả màu đen
 * đặc nếu không nhận diện được — KHÔNG throw, gradient CSS tự do nên không chặn parse thất bại. */
function parseColor(raw: string): { hex: string; alpha: number } {
  const trimmed = raw.trim();
  const rgbaMatch = trimmed.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (rgbaMatch) {
    const r = Math.round(Number(rgbaMatch[1]));
    const g = Math.round(Number(rgbaMatch[2]));
    const b = Math.round(Number(rgbaMatch[3]));
    const a = rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) : 1;
    return { hex: rgbToHex(r, g, b), alpha: Math.round(a * 100) };
  }
  if (/^#?[0-9a-f]{6}$/i.test(trimmed)) {
    return { hex: trimmed.startsWith('#') ? trimmed : `#${trimmed}`, alpha: 100 };
  }
  if (/^#?[0-9a-f]{3}$/i.test(trimmed)) {
    const h = trimmed.replace('#', '');
    const hex = `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    return { hex, alpha: 100 };
  }
  return { hex: '#000000', alpha: 100 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return { r, g, b };
}

function stopToCssColor(stop: GradientStop): string {
  const { r, g, b } = hexToRgb(stop.color);
  return `rgba(${r}, ${g}, ${b}, ${(stop.alpha / 100).toFixed(2).replace(/\.?0+$/, '') || '0'})`;
}

interface ParsedGradient {
  type: GradientType;
  angle: number;
  stops: GradientStop[];
}

/** Parse 1 CSS gradient string → {type, angle, stops}. Fail-soft TUYỆT ĐỐI: bất kỳ chuỗi không
 * nhận diện được (rỗng, không phải gradient, cú pháp lạ...) đều trả về gradient mặc định thay vì
 * throw — vì đây là input tự do trước đây (textarea CSS thô), dữ liệu cũ có thể không khớp cú
 * pháp mà regex ở đây hỗ trợ. */
function parseGradientCss(css: string): ParsedGradient {
  const trimmed = css.trim();
  const isRadial = /^radial-gradient\(/i.test(trimmed);
  const isLinear = /^linear-gradient\(/i.test(trimmed);
  if (!isRadial && !isLinear) return parseGradientCss(DEFAULT_CSS);

  const inner = trimmed.replace(/^(linear|radial)-gradient\(/i, '').replace(/\)\s*$/, '');
  // Tách theo dấu phẩy TRÊN CÙNG CẤP (không tách trong rgba(...)) — đếm ngoặc mở/đóng.
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of inner) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  let angle = 135;
  let stopParts = parts;
  if (isLinear && parts.length > 0) {
    const angleMatch = parts[0]!.match(/^(-?\d+(?:\.\d+)?)deg$/i);
    if (angleMatch) {
      angle = Number(angleMatch[1]);
      stopParts = parts.slice(1);
    } else if (/^to\s+/i.test(parts[0]!)) {
      // "to right"/"to bottom right" etc — quy đổi thô về góc gần đúng, đủ dùng cho UI chỉnh tiếp.
      angle = keywordToAngle(parts[0]!);
      stopParts = parts.slice(1);
    }
  } else if (isRadial && parts.length > 0 && /^(circle|ellipse)/i.test(parts[0]!)) {
    stopParts = parts.slice(1);
  }

  if (stopParts.length === 0) return parseGradientCss(DEFAULT_CSS);

  const stops: GradientStop[] = stopParts.map((part, i) => {
    const offsetMatch = part.match(/(-?\d+(?:\.\d+)?)%\s*$/);
    const offset = offsetMatch ? Number(offsetMatch[1]) : Math.round((i / Math.max(1, stopParts.length - 1)) * 100);
    const colorPart = offsetMatch ? part.slice(0, offsetMatch.index).trim() : part.trim();
    const { hex, alpha } = parseColor(colorPart);
    return { id: nextStopId(), color: hex, alpha, offset };
  });

  return { type: isRadial ? 'radial' : 'linear', angle, stops };
}

function keywordToAngle(keyword: string): number {
  const k = keyword.replace(/^to\s+/i, '').trim().toLowerCase();
  const map: Record<string, number> = { top: 0, 'top right': 45, right: 90, 'bottom right': 135, bottom: 180, 'bottom left': 225, left: 270, 'top left': 315 };
  return map[k] ?? 135;
}

function buildGradientCss(g: ParsedGradient): string {
  const sorted = [...g.stops].sort((a, b) => a.offset - b.offset);
  const stopsCss = sorted.map((s) => `${stopToCssColor(s)} ${Math.round(s.offset)}%`).join(', ');
  if (g.type === 'radial') return `radial-gradient(circle, ${stopsCss})`;
  return `linear-gradient(${Math.round(g.angle)}deg, ${stopsCss})`;
}

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
    // updateStop dùng closure `parsed` tại thời điểm gắn listener — an toàn vì mỗi pointerdown
    // gắn listener MỚI với `id` cố định, chỉ patch offset của đúng stop đó qua emit() (không phụ
    // thuộc thứ tự stops đổi trong lúc kéo).
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
              // stopPropagation() RIÊNG cho click — bắt buộc kể cả đã stopPropagation() ở
              // onPointerDown: pointerdown→pointerup nhanh trên CÙNG phần tử luôn khiến trình
              // duyệt tự tổng hợp thêm 1 sự kiện "click" ĐỘC LẬP ngay sau đó, sự kiện này bubble
              // lên bar cha (onClick={handleBarClick}) và bị hiểu nhầm thành "click vào dải →
              // thêm stop mới" — bug thật báo 2026-07-18: "click và giữ để drag các node này thì
              // nó lại thành add thêm cái mới".
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
                // Nền = MÀU CỦA CHÍNH STOP (không phải trắng trơn) — viền trắng dày để tách khỏi
                // nền track phía sau, thêm viền ngoài accent khi đang chọn (boxShadow lồng, vì
                // border chỉ có 1 lớp) để không phải đánh đổi mất viền trắng lúc chọn.
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
            {/* Bấm swatch → mở POPOVER Colorful nổi lên (yêu cầu 2026-07-18: "khi stop ấn vào
               color thì cũng bật lên cái color picker" giống ảnh mẫu) — thay cho input
               type="color" hệ thống trước đó (đã sửa 1 bug tương tự trước, giờ nâng cấp UX lên
               popover riêng cho nhất quán với StopColorPicker ở trên). */}
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

/** Kích thước picker vuông (Saturation) — "cho nhỏ cái picker đi" (phản hồi 2026-07-18, bản
 * trước để width:'100%' chiếm hết panel, quá to). @uiw/react-color-colorful mặc định width:200,
 * override nhỏ hơn qua PICKER_SIZE + prop style. */
const PICKER_SIZE = 168;

/**
 * PICKER dùng @uiw/react-color-colorful's <Colorful> (Saturation+Hue+Alpha GỘP SẴN, đúng UI ảnh
 * mẫu 2026-07-18 — trước đó tự ghép Saturation+Hue rời rạc, thiếu cột Alpha dạng thanh trượt
 * checkerboard). Layout RESPONSIVE qua flex-wrap: panel đủ rộng → Picker bên TRÁI, Hex+RGBA bên
 * PHẢI cùng hàng; panel hẹp → Hex+RGBA tự rớt xuống dưới Picker (yêu cầu: "nếu panel lớn hơn thì
 * picker bên trái, hex bên phải"). Hex input GIỮ NGUYÊN (không hề bị xoá ở bản trước — có thể chỉ
 * bị crop ngoài khung nhìn do bố cục dọc quá dài; giờ đặt rõ ràng ở cột phải, ngay dưới Picker).
 *
 * `onChange` nhận 1 PATCH GỘP (color?, alpha?) — bug đã sửa 2026-07-18 "không thấy drag được để
 * thay đổi màu": bản trước gọi RIÊNG 2 callback `onChangeColor`+`onChangeAlpha` liên tiếp trong
 * CÙNG 1 lượt (`handleColorfulChange`), mỗi callback tự dispatch `updateStop()` đọc closure
 * `parsed` (state) CŨ — vì React chưa kịp re-render giữa 2 lệnh đồng bộ, lệnh dispatch THỨ HAI
 * (alpha) vẫn đọc `parsed` CŨ và GHI ĐÈ mất thay đổi màu từ lệnh THỨ NHẤT → kéo trong Saturation
 * (chỉ đổi s/v, alpha giữ nguyên) trông như "không kéo được" vì màu bị revert ngay lập tức mỗi
 * lần onChange bắn ra. Fix: gộp cả color+alpha vào 1 patch, dispatch ĐÚNG 1 LẦN duy nhất.
 *
 * `hsva` GIỮ TRONG STATE NỘI BỘ (không suy từ `hexToHsva(color)` mỗi render) — bug thứ 2 đã sửa
 * 2026-07-18 "kéo hết dải Hue sang phải thì tự nhảy về đầu": hex KHÔNG PHÂN BIỆT được hue=0° và
 * hue=360° (cùng ra 1 giá trị hex, VD đỏ thuần). Trước đó mỗi lần Colorful.onChange bắn ra →
 * onChange(patch) → cha cập nhật `color` (hex) → StopColorPicker re-render → TÍNH LẠI hsva bằng
 * `hexToHsva(color)` → luôn trả `h=0` (không bao giờ ra 360) → con trỏ Hue bị "kéo giật" về đầu
 * track ngay khi vừa chạm gần cuối. Fix: giữ hue/saturation/value trong state riêng, CHỈ ghi đè
 * từ `color` prop khi nó đổi TỪ NGUỒN KHÁC (không phải chính Colorful vừa emit ra) — same pattern
 * `lastEmittedRef` đã dùng ở GradientEditor cha để tránh vòng lặp phản hồi mất thông tin.
 */
function StopColorPicker({
  color,
  alpha,
  onChange,
}: {
  color: string;
  alpha: number;
  onChange: (patch: { color?: string; alpha?: number }) => void;
}) {
  const [hsva, setHsva] = useState<HsvaColor>(() => ({ ...hexToHsva(color), a: alpha / 100 }));
  const lastEmittedHexRef = useRef<string>(color);

  useEffect(() => {
    if (color === lastEmittedHexRef.current && Math.round(hsva.a * 100) === alpha) return;
    setHsva({ ...hexToHsva(color), a: alpha / 100 });
    lastEmittedHexRef.current = color;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ theo dõi color/alpha props, hsva tự set bên trong
  }, [color, alpha]);

  function handleColorfulChange(result: ColorResult) {
    setHsva(result.hsva);
    lastEmittedHexRef.current = result.hex;
    onChange({ color: result.hex, alpha: Math.round(result.rgba.a * 100) });
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
      <Colorful color={hsva} onChange={handleColorfulChange} style={{ width: PICKER_SIZE, flex: 'none' }} />
      <div style={{ flex: '1 1 140px', minWidth: 140 }}>
        <label style={{ ...labelStyle, marginBottom: 6 }}>Hex</label>
        <input
          type="text"
          value={color}
          onChange={(e) => onChange({ color: e.target.value })}
          style={{ ...numberInputStyle(undefined), width: '100%', fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <RgbaField label="R" value={hexToRgb(color).r} onChange={(r) => onChange({ color: rgbToHex(r, hexToRgb(color).g, hexToRgb(color).b) })} />
          <RgbaField label="G" value={hexToRgb(color).g} onChange={(g) => onChange({ color: rgbToHex(hexToRgb(color).r, g, hexToRgb(color).b) })} />
          <RgbaField label="B" value={hexToRgb(color).b} onChange={(b) => onChange({ color: rgbToHex(hexToRgb(color).r, hexToRgb(color).g, b) })} />
          <RgbaField label="A" value={alpha} max={100} onChange={(a) => onChange({ alpha: a })} />
        </div>
      </div>
    </div>
  );
}

/**
 * Popover Colorful nổi lên khi bấm swatch ở 1 dòng "Stops" — theo đúng pattern popover đã có
 * trong module (backdrop `position:absolute inset:-1000px`, KHÔNG dùng `position:fixed` —
 * containing-block bug đã gặp ở Flyout.tsx ghost label, xem comment ở đó).
 *
 * `onChange` nhận 1 PATCH GỘP (color?, alpha?) — cùng bug/fix đã ghi ở StopColorPicker phía trên
 * ("không thấy drag được để thay đổi màu", 2026-07-18): gọi 2 callback riêng trong cùng 1 lượt sẽ
 * khiến lệnh dispatch thứ hai ghi đè mất thay đổi của lệnh thứ nhất do đọc closure state cũ.
 *
 * `hsva` GIỮ TRONG STATE NỘI BỘ — cùng bug/fix "kéo hết dải Hue sang phải tự nhảy về đầu" đã ghi
 * ở StopColorPicker (hex không phân biệt được hue=0°/360°, round-trip qua hex mỗi render làm mất
 * thông tin hue khi gần biên).
 */
function SwatchColorPopover({
  color,
  alpha,
  onChange,
  onClose,
}: {
  color: string;
  alpha: number;
  onChange: (patch: { color?: string; alpha?: number }) => void;
  onClose: () => void;
}) {
  const [hsva, setHsva] = useState<HsvaColor>(() => ({ ...hexToHsva(color), a: alpha / 100 }));
  const lastEmittedHexRef = useRef<string>(color);

  useEffect(() => {
    if (color === lastEmittedHexRef.current && Math.round(hsva.a * 100) === alpha) return;
    setHsva({ ...hexToHsva(color), a: alpha / 100 });
    lastEmittedHexRef.current = color;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ theo dõi color/alpha props, hsva tự set bên trong
  }, [color, alpha]);

  function handleChange(result: ColorResult) {
    setHsva(result.hsva);
    lastEmittedHexRef.current = result.hex;
    onChange({ color: result.hex, alpha: Math.round(result.rgba.a * 100) });
  }

  return (
    <>
      {/* stopPropagation() — backdrop nằm bên trong dòng Stop (div cha CÓ onClick riêng để chọn
         stop). KHÁC bug đã gặp ở VariantTabs.tsx/CopyVariantPopover.tsx (nơi cha trực tiếp chính
         là nút TOGGLE popover, gây mở lại ngay lập tức) — ở đây onClick của dòng Stop chỉ đổi
         `selectedStopId`, không mở lại popover, nên không tái diễn CHÍNH XÁC bug đó. Vẫn giữ
         stopPropagation() để phòng side-effect khác: click ra ngoài để đóng popover không nên
         VÔ TÌNH đổi stop đang chọn (selectedStopId) sang đúng dòng chứa backdrop đang che phủ. */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{ position: 'absolute', inset: '-1000px', zIndex: 9 }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 6,
          zIndex: 10,
          borderRadius: 11,
          boxShadow: '0 14px 34px rgba(20,20,40,.18)',
          background: '#fff',
          padding: 10,
        }}
      >
        <Colorful color={hsva} onChange={handleChange} style={{ width: PICKER_SIZE }} />
      </div>
    </>
  );
}

function RgbaField({ label, value, onChange, max = 255 }: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 9.5, color: '#9a9bab', textAlign: 'center', marginBottom: 2 }}>{label}</div>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value))))}
        style={{ ...numberInputStyle(undefined), width: '100%', textAlign: 'center', padding: '6px 2px' }}
      />
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

function numberInputStyle(width: number | undefined): React.CSSProperties {
  return {
    width,
    border: '1px solid #e6e6ee',
    borderRadius: 6,
    padding: '6px 7px',
    fontSize: 11.5,
  };
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 10.5, color: '#9a9bab', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' };
