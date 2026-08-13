// ImageFramePanel — panel 5 tab (Khung/Bóng/Hình dạng/Viền/Đặc biệt) áp style trang trí cho
// ImageItem — port từ my-builder (packages/builder-editor/src/panels/ImageFramePanel.tsx). Dùng
// CHUNG ở CẢ ItemToolbar (popover nổi trên canvas) LẪN ImageControls (PropertyPanel bên phải).
import { useState, type CSSProperties } from 'react';
import type { LayoutItem } from '@sky-app/slide-shared';
import { FRAME_PRESETS, SHADOW_PRESETS, SHAPE_PRESETS, SPECIAL_PRESETS, DROP_SHADOW_PRESETS, type FramePreset, type ShadowPreset, type ShapePreset, type SpecialPreset, type DropShadowPreset } from '@sky-app/slide-shared';
import { Tabs, TabsList, TabsTrigger, TabsContent, Slider, ColorfulSwatchButton, cn } from '@sky-app/ui';

type ImageItem = Extract<LayoutItem, { type: 'image' }>;

export interface ImageFramePanelProps {
  item: ImageItem;
  patch: (p: Partial<LayoutItem>) => void;
}

// ── Border shorthand parser (VD "2px solid #000000" → {width, style, color}) ──────────────────

function parseBorderShorthand(border?: string): { width: number; style: ImageItem['borderStyle']; color: string } {
  if (!border || border === 'none') return { width: 0, style: 'solid', color: '#000000' };
  const parts = border.trim().split(/\s+/);
  return {
    width: parseInt(parts[0] ?? '0', 10) || 0,
    style: (parts[1] as ImageItem['borderStyle']) ?? 'solid',
    color: parts[2] ?? '#000000',
  };
}

function parseRadiusPx(radius?: string): number {
  if (!radius) return 0;
  return parseInt(radius, 10) || 0;
}

// ── Swatch helpers ────────────────────────────────────────────────────────

function PreviewBox({ style, selected, onClick, label }: { style: CSSProperties; selected: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 p-1 rounded-lg transition-all cursor-pointer',
        selected ? 'ring-2 ring-[#4b57e6] bg-[#4b57e6]/5' : 'ring-1 ring-transparent hover:ring-[#e6e6ee]'
      )}
    >
      <div style={{ background: '#d1d5db', width: 48, height: 36, ...style }} className="rounded-sm shrink-0" />
      <span className="text-[9px] text-[#9a9bab] leading-none truncate w-full text-center">{label}</span>
    </button>
  );
}

function ShapeBox({ preset, selected, onClick }: { preset: ShapePreset; selected: boolean; onClick: () => void }) {
  const shapeStyle: CSSProperties = {
    background: '#4b57e6',
    width: 40,
    height: 40,
    clipPath: preset.clipPath,
    borderRadius: preset.clipPath ? undefined : (preset.borderRadius ?? '0px'),
  };
  return (
    <button
      type="button"
      title={preset.label}
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 p-1.5 rounded-lg transition-all cursor-pointer',
        selected ? 'ring-2 ring-[#4b57e6] bg-[#4b57e6]/5' : 'ring-1 ring-transparent hover:ring-[#e6e6ee]'
      )}
    >
      <div style={shapeStyle} className="shrink-0" />
      <span className="text-[9px] text-[#9a9bab] leading-none truncate w-full text-center">{preset.label}</span>
    </button>
  );
}

function SpecialCard({ preset, selected, onClick }: { preset: SpecialPreset; selected: boolean; onClick: () => void }) {
  const previewContent = (() => {
    if (preset.value === 'tape') {
      return (
        <div className="relative w-full h-10 bg-[#d1d5db] rounded-sm overflow-visible">
          {[{ top: '-5px', left: '8px', rotate: '-18deg' }, { top: '-5px', right: '8px', rotate: '18deg' }].map((t, i) => (
            <div key={i} style={{ position: 'absolute', width: 18, height: 7, background: 'rgba(215,205,165,0.85)', transform: `rotate(${t.rotate})`, ...t }} />
          ))}
        </div>
      );
    }
    if (preset.value === 'polaroid') {
      return (
        <div className="w-full bg-white flex flex-col items-center" style={{ padding: '4px 4px 14px', boxShadow: '0 2px 6px rgba(0,0,0,0.2)', transform: 'rotate(-1deg)' }}>
          <div className="w-full h-8 bg-[#d1d5db]" />
        </div>
      );
    }
    if (preset.value === 'vintage') {
      return <div className="w-full h-10 bg-[#d1d5db]" style={{ border: '4px solid #d4b896', outline: '1px solid #a08060', outlineOffset: '-6px' }} />;
    }
    return <div className="w-full h-10 bg-[#d1d5db] rounded-sm" />;
  })();

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1.5 p-2 rounded-lg border cursor-pointer transition-colors text-left',
        selected ? 'ring-2 ring-[#4b57e6] border-[#4b57e6] bg-[#4b57e6]/5' : 'border-[#e6e6ee] hover:border-[#4b57e6]/40'
      )}
    >
      {previewContent}
      <div>
        <p className="text-[10px] font-semibold leading-none text-[#3a3a46]">{preset.label}</p>
        <p className="text-[9px] text-[#9a9bab] mt-0.5 leading-snug">{preset.description}</p>
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function ImageFramePanel({ item, patch }: ImageFramePanelProps) {
  const [tab, setTab] = useState<'frame' | 'shadow' | 'shape' | 'border' | 'special'>('frame');

  const borderRadiusVal = typeof item.borderRadius === 'number' ? item.borderRadius : 0;
  const borderWidthVal = item.borderW ?? 0;
  const borderColorVal = item.borderColor ?? '#000000';
  const borderStyleVal = item.borderStyle ?? 'solid';

  const currentFramePreset =
    FRAME_PRESETS.find((p) => {
      if (p.value === 'none') return !borderWidthVal;
      const parsed = parseBorderShorthand(p.style.border);
      return borderWidthVal === parsed.width && borderStyleVal === parsed.style && borderColorVal === parsed.color && borderRadiusVal === parseRadiusPx(p.style.borderRadius);
    })?.value ?? 'none';

  const currentShadow = SHADOW_PRESETS.find((p) => (p.value === 'none' ? !item.boxShadow : item.boxShadow === p.boxShadow))?.value ?? 'none';
  const currentDropShadow = DROP_SHADOW_PRESETS.find((p) => (p.value === 'none' ? !item.dropShadow : item.dropShadow === p.dropShadow))?.value ?? 'none';

  const currentShape =
    SHAPE_PRESETS.find((p) => {
      if (p.value === 'none') return !item.clipPath && !borderRadiusVal;
      if (p.clipPath) return item.clipPath === p.clipPath;
      return !item.clipPath && String(item.borderRadius ?? '') === p.borderRadius;
    })?.value ?? 'none';

  const currentSpecial = item.specialFrame ?? 'none';

  return (
    <div className="w-[260px]">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="w-full grid grid-cols-5 h-8">
          <TabsTrigger value="frame" className="text-[10px] px-1">Khung</TabsTrigger>
          <TabsTrigger value="shadow" className="text-[10px] px-1">Bóng</TabsTrigger>
          <TabsTrigger value="shape" className="text-[10px] px-1">Dạng</TabsTrigger>
          <TabsTrigger value="border" className="text-[10px] px-1">Viền</TabsTrigger>
          <TabsTrigger value="special" className="text-[10px] px-1">Đặc biệt</TabsTrigger>
        </TabsList>

        {/* ── Khung (border preset) ── */}
        <TabsContent value="frame">
          <div className="grid grid-cols-4 gap-1 p-1 max-h-[220px] overflow-y-auto">
            {FRAME_PRESETS.map((preset: FramePreset) => (
              <PreviewBox
                key={preset.value}
                label={preset.label}
                selected={currentFramePreset === preset.value}
                style={{ border: preset.style.border, borderRadius: preset.style.borderRadius }}
                onClick={() => {
                  const parsed = parseBorderShorthand(preset.style.border);
                  patch({ borderW: parsed.width, borderStyle: parsed.style, borderColor: parsed.color, borderRadius: parseRadiusPx(preset.style.borderRadius) });
                }}
              />
            ))}
          </div>
        </TabsContent>

        {/* ── Bóng: box-shadow (bám hình chữ nhật khung) + drop-shadow (bám alpha ảnh thật) ── */}
        <TabsContent value="shadow">
          <div className="max-h-[260px] overflow-y-auto">
            <div className="text-[10px] font-bold text-[#9a9bab] uppercase px-1 pt-1 pb-1.5">Đổ bóng khối</div>
            <div className="grid grid-cols-3 gap-1.5 p-1">
              {SHADOW_PRESETS.map((preset: ShadowPreset) => (
                <PreviewBox
                  key={preset.value}
                  label={preset.label}
                  selected={currentShadow === preset.value}
                  style={{ boxShadow: preset.boxShadow === 'none' ? undefined : preset.boxShadow, background: '#fff' }}
                  onClick={() => patch({ boxShadow: preset.boxShadow === 'none' ? undefined : preset.boxShadow })}
                />
              ))}
            </div>
            <div className="text-[10px] font-bold text-[#9a9bab] uppercase px-1 pt-2 pb-1.5 border-t border-[#f0f0f5] mt-1">
              Đổ bóng theo ảnh
            </div>
            <div className="grid grid-cols-3 gap-1.5 p-1">
              {DROP_SHADOW_PRESETS.map((preset: DropShadowPreset) => (
                <PreviewBox
                  key={preset.value}
                  label={preset.label}
                  selected={currentDropShadow === preset.value}
                  style={{ filter: preset.dropShadow === 'none' ? undefined : preset.dropShadow, background: 'transparent', borderRadius: '20%' }}
                  onClick={() => patch({ dropShadow: preset.dropShadow === 'none' ? undefined : preset.dropShadow })}
                />
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ── Hình dạng (clip-path / borderRadius) ── */}
        <TabsContent value="shape">
          <div className="grid grid-cols-4 gap-1 p-1 max-h-[220px] overflow-y-auto">
            {SHAPE_PRESETS.map((preset: ShapePreset) => (
              <ShapeBox
                key={preset.value}
                preset={preset}
                selected={currentShape === preset.value}
                onClick={() =>
                  patch({
                    clipPath: preset.clipPath ?? undefined,
                    borderRadius: preset.clipPath ? undefined : (preset.borderRadius),
                  })
                }
              />
            ))}
          </div>
        </TabsContent>

        {/* ── Viền (control thủ công) ── */}
        <TabsContent value="border">
          <div className="p-2 space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[10px] font-semibold text-[#5c5d6e]">Bo góc</label>
                <span className="text-[10px] text-[#9a9bab]">{borderRadiusVal}px</span>
              </div>
              <Slider min={0} max={100} step={1} value={[borderRadiusVal]} onValueChange={([v]) => patch({ borderRadius: v, clipPath: undefined })} />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[10px] font-semibold text-[#5c5d6e]">Độ dày viền</label>
                <span className="text-[10px] text-[#9a9bab]">{borderWidthVal}px</span>
              </div>
              <Slider min={0} max={20} step={1} value={[borderWidthVal]} onValueChange={([v]) => patch({ borderW: v })} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#5c5d6e] block mb-1.5">Màu viền</label>
              <ColorfulSwatchButton color={borderColorVal} onChange={(borderColor) => patch({ borderColor })} title="Màu viền" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#5c5d6e] block mb-1.5">Kiểu viền</label>
              <select
                value={borderStyleVal}
                onChange={(e) => patch({ borderStyle: e.target.value as ImageItem['borderStyle'] })}
                className="w-full px-2 py-1.5 border border-[#e6e6ee] rounded-[6px] text-[11px]"
              >
                <option value="solid">Liền</option>
                <option value="dashed">Nét đứt</option>
                <option value="dotted">Chấm chấm</option>
                <option value="double">Đôi</option>
              </select>
            </div>
          </div>
        </TabsContent>

        {/* ── Đặc biệt (tape/polaroid/vintage) ── */}
        <TabsContent value="special">
          <div className="grid grid-cols-2 gap-2 p-1 max-h-[260px] overflow-y-auto">
            {SPECIAL_PRESETS.map((preset: SpecialPreset) => (
              <SpecialCard
                key={preset.value}
                preset={preset}
                selected={currentSpecial === preset.value}
                onClick={() => patch({ specialFrame: preset.value })}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
