// LayoutRenderer — render 1 LayoutContent thuần ra DOM, dùng chung bởi layout-designer (preview)
// và ceremony/backdrop (runtime). Theo docs/roadmap/plans/layout-designer/04-schema-layout-
// document.md (resolveVariant/computeScale/toRenderBox) + 11-canonical-da-loai-va-loop.md
// (render LoopItem theo CanonicalGroup.members).

import { useMemo, useRef, type CSSProperties } from 'react';
import type { Background, Box, LayoutContent, LayoutItem, LayoutVariant, RichTextContent } from './types.js';
import type { CanonicalGroup, CanonicalRecord, CanonicalSubject } from './canonical.js';
import { isCanonicalGroup, resolveCanonicalField } from './canonical.js';
import { computeLoopLayout, renderOverflowMoreText } from './loop.js';
import { resolveTokens, resolveContentTokens } from './tokens.js';
import { SHAPE_CLIP_PATHS } from './shapeClipPaths.js';
import { useAutoFitFontSize } from './useAutoFitFontSize.js';

/** Chọn variant khớp tỷ lệ màn hình gần nhất (04-schema-layout-document.md). */
export function resolveVariant(content: LayoutContent, screen: { w: number; h: number }): LayoutVariant | null {
  if (content.variants.length === 0) return null;
  const target = screen.w / screen.h;
  let best = content.variants[0]!;
  let bestDiff = Infinity;
  for (const v of content.variants) {
    const diff = Math.abs(v.aspect.w / v.aspect.h - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = v;
    }
  }
  return best;
}

/**
 * 2 scale RIÊNG BIỆT (không phải 1 scale chung) — khi variant khớp tỷ lệ màn thì scaleX=scaleY
 * (không méo); khi lệch thì STRETCH (kéo giãn méo, KHÔNG letterbox — quyết định file 04 #9).
 */
export function computeScale(variant: LayoutVariant, screen: { w: number; h: number }): { scaleX: number; scaleY: number } {
  return { scaleX: screen.w / variant.refW, scaleY: screen.h / variant.refH };
}

function toRenderBox(box: Box, scaleX: number, scaleY: number): CSSProperties {
  return {
    position: 'absolute',
    left: box.x * scaleX,
    top: box.y * scaleY,
    width: box.w * scaleX,
    height: box.h * scaleY,
    transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
    zIndex: box.z,
  };
}

/** fontSize khi stretch (scaleX≠scaleY): min(scaleX,scaleY) — chữ không tràn box (chốt GĐ1). */
function fontScale(scaleX: number, scaleY: number): number {
  return Math.min(scaleX, scaleY);
}

function getShadowCSS(shadow: boolean | import('./types.js').TextShadow | undefined): string | undefined {
  if (!shadow) return undefined;
  if (typeof shadow === 'boolean') {
    return '0 2px 4px rgba(0,0,0,0.35)';
  }
  return `${shadow.offsetX ?? 0}px ${shadow.offsetY ?? 0}px ${shadow.blur ?? 0}px ${shadow.color ?? 'rgba(0,0,0,0.4)'}`;
}

export interface LayoutRendererProps {
  content: LayoutContent;
  /** Kích thước thật của khung hiển thị (px), dùng để chọn variant + tính scale-to-fit. */
  screen: { w: number; h: number };
  /** Record đưa vào render — 1 cá nhân hoặc 1 nhóm (11-canonical-da-loai-va-loop.md). */
  record: CanonicalRecord;
  /** Giá trị demo/preview khi record không phải nguồn thật (editor dùng để xem trước). */
  resolveAsset?: (relativePath: string) => string;
  className?: string;
  style?: CSSProperties;
}

export function LayoutRenderer({ content, screen, record, resolveAsset, className, style }: LayoutRendererProps) {
  const variant = useMemo(() => resolveVariant(content, screen), [content, screen]);
  const scale = useMemo(() => (variant ? computeScale(variant, screen) : null), [variant, screen]);

  if (!variant || !scale) {
    // 07-luong-hoat-dong.md: resolveLayout/variant null → màn nền trung tính, không throw.
    return <div className={className} style={{ width: '100%', height: '100%', background: '#000', ...style }} />;
  }

  const resolveAssetSafe = resolveAsset ?? ((p: string) => p);

  return (
    <div
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', ...style }}
    >
      {variant.background && (
        <BackgroundLayer background={variant.background} resolveAsset={resolveAssetSafe} />
      )}
      {variant.items.map((item) => (
        <ItemRenderer key={item.id} item={item} scaleX={scale.scaleX} scaleY={scale.scaleY} record={record} resolveAsset={resolveAssetSafe} />
      ))}
    </div>
  );
}

function BackgroundLayer({ background, resolveAsset }: { background: Background; resolveAsset: (p: string) => string }) {
  const style: CSSProperties = { position: 'absolute', inset: 0 };
  if (background.kind === 'image' && background.src) {
    style.backgroundImage = `url("${resolveAsset(background.src)}")`;
    style.backgroundSize = '100% 100%';
    style.backgroundPosition = 'center';
  } else if (background.kind === 'color' && background.color) {
    style.backgroundColor = background.color;
  } else if (background.kind === 'gradient' && background.gradient) {
    style.background = background.gradient;
  }
  return <div style={style} />;
}

interface ItemRendererProps {
  item: LayoutItem;
  scaleX: number;
  scaleY: number;
  record: CanonicalRecord;
  resolveAsset: (p: string) => string;
}

function ItemRenderer({ item, scaleX, scaleY, record, resolveAsset }: ItemRendererProps) {
  if (item.hidden) return null;

  switch (item.type) {
    case 'text':
      return <TextItemView item={item} scaleX={scaleX} scaleY={scaleY} record={record} />;
    case 'ribbon':
      return <RibbonItemView item={item} scaleX={scaleX} scaleY={scaleY} record={record} />;
    case 'image':
      return <ImageItemView item={item} scaleX={scaleX} scaleY={scaleY} record={record} resolveAsset={resolveAsset} />;
    case 'shape':
      return <ShapeItemView item={item} scaleX={scaleX} scaleY={scaleY} />;
    case 'loop':
      return <LoopItemView item={item} scaleX={scaleX} scaleY={scaleY} record={record} resolveAsset={resolveAsset} />;
    default: {
      const _exhaustive: never = item;
      return _exhaustive;
    }
  }
}

/** ctx: subject hiện tại để resolve token — record gốc (ngoài loop) hoặc 1 member (trong loop).
 * `content` có thể là string (RibbonItem LUÔN, TextItem layout cũ) hoặc RichTextContent (TextItem
 * đã qua rich-text editor, Bước 12) — resolveContentTokens trả ĐÚNG CÙNG KIỂU với input. */
function resolveContent<T extends string | RichTextContent>(content: T, ctx: CanonicalSubject | CanonicalGroup): T {
  return resolveContentTokens(content, (key) => resolveCanonicalField(ctx, key)) as T;
}

function TextItemView({
  item,
  scaleX,
  scaleY,
  record,
}: {
  item: Extract<LayoutItem, { type: 'text' }>;
  scaleX: number;
  scaleY: number;
  record: CanonicalRecord;
}) {
  const textRef = useRef<HTMLElement>(null);
  const fScale = fontScale(scaleX, scaleY);
  const resolved = resolveContent(item.content, record);
  const requestedPx = item.fontSize * fScale;
  const fittedPx = useAutoFitFontSize(textRef, {
    text: typeof resolved === 'string' ? resolved : resolved.html,
    boxWidthPx: item.box.w * scaleX,
    boxHeightPx: item.box.h * scaleY,
    requestedFontSizePx: requestedPx,
    minFontSizePx: requestedPx * 0.4,
    wrap: false,
    enabled: item.overflow === 'shrink',
  });
  const style: CSSProperties = {
    ...toRenderBox(item.box, scaleX, scaleY),
    opacity: item.opacity != null ? item.opacity / 100 : undefined,
    fontFamily: item.fontFamily,
    fontSize: fittedPx,
    fontWeight: item.fontWeight,
    color: item.color,
    textAlign: item.align,
    fontStyle: item.italic ? 'italic' : undefined,
    textTransform: item.uppercase ? 'uppercase' : undefined,
    lineHeight: item.lineHeight,
    display: 'flex',
    alignItems: item.vAlign === 'top' ? 'flex-start' : item.vAlign === 'bottom' ? 'flex-end' : 'center',
    justifyContent: item.align === 'left' ? 'flex-start' : item.align === 'right' ? 'flex-end' : 'center',
    overflow: item.overflow === 'clip' ? 'hidden' : undefined,
    whiteSpace: item.overflow === 'wrap' ? 'pre-wrap' : 'pre',
    textShadow: item.shadow
      ? typeof item.shadow === 'boolean'
        ? '0 2px 4px rgba(0,0,0,0.4)'
        : `${item.shadow.offsetX ?? 0}px ${item.shadow.offsetY ?? 0}px ${item.shadow.blur ?? 0}px ${item.shadow.color ?? 'rgba(0,0,0,0.4)'}`
      : undefined,
  };
  if (typeof resolved === 'string') {
    return <div ref={textRef as any} style={style}>{resolved}</div>;
  }
  return <div ref={textRef as any} style={style} dangerouslySetInnerHTML={{ __html: resolved.html }} />;
}

function RibbonItemView({
  item,
  scaleX,
  scaleY,
  record,
}: {
  item: Extract<LayoutItem, { type: 'ribbon' }>;
  scaleX: number;
  scaleY: number;
  record: CanonicalRecord;
}) {
  const fScale = fontScale(scaleX, scaleY);
  const text = resolveContent(item.content, record);
  const bgValue = typeof item.bg === 'string' ? item.bg : (item.bg?.kind === 'gradient' ? item.bg.value : undefined);
  const shadowCSS = getShadowCSS(item.shadow);
  const style: CSSProperties = {
    ...toRenderBox(item.box, scaleX, scaleY),
    opacity: item.opacity != null ? item.opacity / 100 : undefined,
    background: bgValue,
    color: item.color,
    fontSize: item.fontSize * fScale,
    fontWeight: item.fontWeight,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: item.borderW ? `${item.borderW * Math.min(scaleX, scaleY)}px solid ${item.borderColor ?? '#000'}` : undefined,
    boxShadow: shadowCSS,
  };
  return <div style={style}>{text}</div>;
}

function ImageItemView({
  item,
  scaleX,
  scaleY,
  record,
  resolveAsset,
}: {
  item: Extract<LayoutItem, { type: 'image' }>;
  scaleX: number;
  scaleY: number;
  record: CanonicalRecord;
  resolveAsset: (p: string) => string;
}) {
  const relPath = item.varKey ? resolveCanonicalField(record as CanonicalSubject, item.varKey) : item.src;
  const shadowCSS = getShadowCSS(item.shadow);
  const style: CSSProperties = {
    ...toRenderBox(item.box, scaleX, scaleY),
    opacity: item.opacity != null ? item.opacity / 100 : undefined,
    overflow: 'hidden',
    borderRadius: item.clipPath ? undefined : (item.shape === 'circle' ? '50%' : item.shape === 'round' ? 12 : undefined),
    clipPath: item.clipPath ?? undefined,
    border: item.borderW ? `${item.borderW * Math.min(scaleX, scaleY)}px solid ${item.borderColor ?? '#fff'}` : undefined,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0002',
    boxShadow: shadowCSS,
  };
  if (!relPath) {
    return <div style={style}>{item.fallbackText ?? ''}</div>;
  }
  const focalX = (item.focalX ?? 0.5) * 100;
  const focalY = (item.focalY ?? 0.5) * 100;
  return (
    <div style={style}>
      <img
        src={resolveAsset(relPath)}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: item.fit ?? 'cover',
          objectPosition: (item.fit ?? 'cover') === 'cover' ? `${focalX}% ${focalY}%` : undefined,
        }}
      />
    </div>
  );
}

function ShapeItemView({ item, scaleX, scaleY }: { item: Extract<LayoutItem, { type: 'shape' }>; scaleX: number; scaleY: number }) {
  const fScale = Math.min(scaleX, scaleY);
  const fillValue = typeof item.fill === 'string' ? item.fill : (item.fill?.kind === 'gradient' ? item.fill.value : undefined);
  const shadowCSS = getShadowCSS(item.shadow);
  const outerStyle = toRenderBox(item.box, scaleX, scaleY);
  const opacity = item.opacity != null ? item.opacity / 100 : undefined;

  // 'line' — không phải "cắt hình", là 1 đường kẻ mảnh nằm giữa box (khớp ItemContent.tsx's
  // ShapeItemContent, GĐ10 2026-08-06 — trước đó renderer.tsx THIẾU HẲN nhánh này, chỉ editor
  // preview có, gây lệch WYSIWYG editor-vs-backdrop thật).
  if (item.shape === 'line') {
    return (
      <div style={{ ...outerStyle, opacity }}>
        <div style={{ width: '100%', height: item.strokeW ? item.strokeW * fScale : 2, background: item.stroke ?? fillValue ?? '#000', marginTop: '50%' }} />
      </div>
    );
  }
  // 'frame' — khung viền RỖNG (không fill giữa), mặc định viền 2px nếu strokeW chưa set (chọn
  // hình này mà không viền thì vô hình, không có ý nghĩa).
  if (item.shape === 'frame') {
    const border = item.strokeW ? `${item.strokeW * fScale}px solid ${item.stroke ?? '#000'}` : `${2 * fScale}px solid ${item.stroke ?? fillValue ?? '#000'}`;
    return <div style={{ ...outerStyle, opacity, background: 'transparent', border, boxShadow: shadowCSS }} />;
  }

  const style: CSSProperties = {
    ...outerStyle,
    opacity,
    background: fillValue,
    border: item.strokeW ? `${item.strokeW * fScale}px solid ${item.stroke ?? '#000'}` : undefined,
    borderRadius: item.shape === 'circle' ? '50%' : item.shape === 'rect' ? item.radius : undefined,
    clipPath: SHAPE_CLIP_PATHS[item.shape],
    boxShadow: shadowCSS,
  };
  return <div style={style} />;
}

function LoopItemView({
  item,
  scaleX,
  scaleY,
  record,
  resolveAsset,
}: {
  item: Extract<LayoutItem, { type: 'loop' }>;
  scaleX: number;
  scaleY: number;
  record: CanonicalRecord;
  resolveAsset: (p: string) => string;
}) {
  // LoopItem chỉ áp dụng khi record là group; cá nhân → tự ẩn (11 §resolveVariant/render).
  const members = isCanonicalGroup(record) ? record.members : undefined;
  const result = useMemo(() => computeLoopLayout(item, members), [item, members]);

  if (result.cells.length === 0) return null;

  const outerStyle = toRenderBox(item.box, scaleX, scaleY);

  return (
    <div style={outerStyle}>
      {result.cells.map((cell) => (
        <div
          key={cell.member.id}
          style={{
            position: 'absolute',
            left: cell.x * scaleX,
            top: cell.y * scaleY,
            width: item.itemBox.w * scaleX * cell.itemScale,
            height: item.itemBox.h * scaleY * cell.itemScale,
          }}
        >
          {item.itemTemplate.map((subItem) => (
            <ItemRenderer
              key={subItem.id}
              item={subItem}
              scaleX={scaleX * cell.itemScale}
              scaleY={scaleY * cell.itemScale}
              record={cell.member}
              resolveAsset={resolveAsset}
            />
          ))}
        </div>
      ))}
      {result.overflowed && result.overflowCount > 0 && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            fontSize: 14 * Math.min(scaleX, scaleY),
            color: '#fff',
            opacity: 0.85,
          }}
        >
          {renderOverflowMoreText(item.overflowMoreText, result.overflowCount)}
        </div>
      )}
    </div>
  );
}
