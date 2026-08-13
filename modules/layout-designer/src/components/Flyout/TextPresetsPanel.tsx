// TextPresetsPanel — nhóm "Văn bản" trong Rail 8-nhóm (GĐ19, 10-rail-assembly.md). Nội dung 12
// preset "Titles" theo docs/roadmap/plans/canva-ux/content-spec-van-ban.md — bộ preset TỰ SOẠN
// cho ceremony (không port từ my-builder), map field CÓ SẴN của TextItem (fontSize/fontWeight/
// fontFamily/italic/uppercase/color), không cần field mới. Paragraphs/Text Mask/Text Marquee/
// Themed Text (cần field mới `textFill`/`marquee`, hoặc phụ thuộc Titles ổn định trước) — CHƯA
// làm ở đợt này, xem checklist còn lại trong content-spec-van-ban.md.
import type { LayoutItem } from '@sky-app/slide-shared';
import type { SpawnKind } from './useSpawnDrag.js';
import { cn } from '@sky-app/ui';

export interface TextPresetsPanelProps {
  onSpawnDown: (k: SpawnKind) => (e: React.MouseEvent) => void;
}

interface TitlePreset {
  label: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  italic?: boolean;
  uppercase?: boolean;
  /** TALL TITLE — chưa có font condensed trong bộ font hiện tại, giả lập co hẹp chiều ngang bằng
   * CSS transform (đúng như content-spec-van-ban.md's checklist đề xuất khi chưa có font thật). */
  scaleX?: number;
  letterSpacing?: string;
}

const TITLE_PRESETS: TitlePreset[] = [
  { label: 'CAPS TITLE', fontSize: 28, fontWeight: 600, fontFamily: 'Georgia, serif', uppercase: true, letterSpacing: '0.04em' },
  { label: 'Small Title', fontSize: 16, fontWeight: 700, fontFamily: 'system-ui, sans-serif' },
  { label: 'Business Title', fontSize: 24, fontWeight: 500, fontFamily: 'Georgia, serif' },
  { label: 'Huge Title', fontSize: 48, fontWeight: 800, fontFamily: 'system-ui, sans-serif' },
  { label: 'Bold Title', fontSize: 32, fontWeight: 800, fontFamily: 'system-ui, sans-serif' },
  { label: 'Elegant Title', fontSize: 26, fontWeight: 400, fontFamily: 'Georgia, serif', italic: true },
  { label: 'Classic Title', fontSize: 22, fontWeight: 400, fontFamily: 'Georgia, serif' },
  { label: 'MAGAZINE TITLE', fontSize: 30, fontWeight: 700, fontFamily: 'Georgia, serif', uppercase: true },
  { label: 'TALL TITLE', fontSize: 34, fontWeight: 800, fontFamily: 'system-ui, sans-serif', uppercase: true, scaleX: 0.75 },
  { label: 'Small Running Title', fontSize: 14, fontWeight: 300, fontFamily: 'system-ui, sans-serif' },
  { label: 'FASHION TITLE', fontSize: 15, fontWeight: 400, fontFamily: 'Georgia, serif', uppercase: true, letterSpacing: '0.12em' },
  { label: 'Thin Title', fontSize: 40, fontWeight: 200, fontFamily: 'system-ui, sans-serif' },
];

/** Cỡ chữ preview trong tile — co theo tỷ lệ cố định từ cỡ chữ THẬT sẽ áp khi thả ra canvas, chặn
 * trần để tile cao nhất (Huge Title 48px) vẫn không vỡ layout tile ~50px cao. */
function previewFontSize(realSize: number): number {
  return Math.min(Math.round(realSize * 0.42), 21);
}

export function TextPresetsPanel({ onSpawnDown }: TextPresetsPanelProps) {
  return (
    <>
      <div className="px-[15px] pt-[15px] pb-[10px] font-bold text-[13px]">Văn bản</div>
      <div className="px-[14px] pb-[6px] text-[11px] text-[#9a9bab] leading-[1.45]">
        Kéo 1 kiểu chữ ra canvas — nội dung mặc định là tên kiểu, sửa lại sau khi thả.
      </div>
      <div className="p-[8px_14px_14px] overflow-y-auto flex-1 flex flex-col gap-[8px]">
        <div className="shrink-0 text-[11px] font-semibold uppercase text-[#9a9bab] px-0 pt-1 pb-1">Titles</div>
        {TITLE_PRESETS.map((preset) => {
          const overrides: Partial<LayoutItem> = {
            content: preset.label,
            fontSize: preset.fontSize,
            fontWeight: preset.fontWeight,
            fontFamily: preset.fontFamily,
            italic: preset.italic,
            uppercase: preset.uppercase,
            align: 'center',
          };
          const spawnKind: SpawnKind = { kind: 'itemType', type: 'text', label: preset.label, overrides };
          return (
            <button
              key={preset.label}
              onMouseDown={onSpawnDown(spawnKind)}
              title={preset.label}
              className={cn(
                'h-[52px] shrink-0 border border-[#e6e6ee] rounded-[10px] flex items-center justify-center px-2',
                'bg-[#fcfcfd] hover:bg-neutral-50 hover:border-[#4b57e6]/50 cursor-grab transition-colors overflow-hidden',
              )}
            >
              <span
                className="truncate text-[#2b2b36]"
                style={{
                  fontSize: previewFontSize(preset.fontSize),
                  fontWeight: preset.fontWeight,
                  fontFamily: preset.fontFamily,
                  fontStyle: preset.italic ? 'italic' : undefined,
                  textTransform: preset.uppercase ? 'uppercase' : undefined,
                  letterSpacing: preset.letterSpacing,
                  transform: preset.scaleX ? `scaleX(${preset.scaleX})` : undefined,
                }}
              >
                {preset.label}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
