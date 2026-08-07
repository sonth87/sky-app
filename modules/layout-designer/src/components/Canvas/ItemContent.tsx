import { useRef, type CSSProperties } from 'react';
import type { LayoutItem, TextItem } from '@sky-app/slide-shared';
import { SHAPE_CLIP_PATHS, useAutoFitFontSize } from '@sky-app/slide-shared';
import { useResolvedAssetUrl } from '../../hooks/useResolvedAssetUrl.js';

function getCSSValue(value: string | { kind: 'gradient'; value: string } | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.value;
}

export function ItemContent({
  item,
  scaleX,
  scaleY,
  resolveAssetUrl,
}: {
  item: LayoutItem;
  scaleX: number;
  scaleY: number;
  resolveAssetUrl?: (path: string) => Promise<string>;
}) {
  const fScale = Math.min(scaleX, scaleY);
  const textRef = useRef<HTMLDivElement>(null);

  switch (item.type) {
    case 'text': {
      // vAlign dùng flexbox trên WRAPPER ngoài (item.box đã là 100% width/height của div này) —
      // textAlign (align) là CSS riêng biệt cho căn NGANG dòng chữ, vAlign căn theo trục DỌC.
      const justify = item.vAlign === 'top' ? 'flex-start' : item.vAlign === 'bottom' ? 'flex-end' : 'center';
      const requestedPx = item.fontSize * fScale;
      const fittedPx = useAutoFitFontSize(textRef, {
        text: typeof item.content === 'string' ? item.content : item.content.html,
        boxWidthPx: item.box.w * scaleX,
        boxHeightPx: item.box.h * scaleY,
        requestedFontSizePx: requestedPx,
        minFontSizePx: requestedPx * 0.4,
        wrap: false,
        enabled: item.overflow === 'shrink',
      });
      const textStyle: CSSProperties = {
        ...computeTextStyle(item, fScale),
        fontSize: fittedPx,
      };
      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: justify, overflow: item.overflow === 'clip' ? 'hidden' : undefined }}>
          {/* content string (layout cũ/chưa qua rich-text editor) → render trực tiếp qua
             children. RichTextContent (Bước 12) → dùng THẲNG content.html (đã sinh sẵn lúc soạn
             qua editor.getHTML(), KHÔNG gọi generateHTML() ở đây — sửa lại 2026-07-19: bỏ hẳn
             @tiptap/html khỏi cả slide-shared lẫn module này, tránh vỡ build Electron main
             process khi bundle, xem RichTextContent's comment ở slide-shared/types.ts), read-only
             preview khi KHÔNG đang double-click sửa trực tiếp (xem TiptapTextEditor.tsx). */}
          {typeof item.content === 'string' ? (
            <div ref={textRef} style={textStyle}>{item.content}</div>
          ) : (
            <div ref={textRef} style={textStyle} dangerouslySetInnerHTML={{ __html: item.content.html }} />
          )}
        </div>
      );
    }
    case 'ribbon':
      return (
        <div
          style={{
            fontSize: item.fontSize * fScale,
            fontWeight: item.fontWeight,
            color: item.color,
            background: getCSSValue(item.bg),
            textAlign: 'center',
            padding: '6px 4px',
            width: '100%',
            height: '100%',
          }}
        >
          {item.content}
        </div>
      );
    case 'image':
      return <ImageItemContent item={item} fScale={fScale} resolveAssetUrl={resolveAssetUrl} />;
    case 'shape':
      return <ShapeItemContent item={item} fScale={fScale} />;
    case 'loop':
      return (
        <div style={{ width: '100%', height: '100%', border: '1px dashed #9a9bab', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a9bab', fontSize: 11 }}>
          Khung lặp (nhóm)
        </div>
      );
    case 'gallery':
      return <GalleryItemContent item={item} fScale={fScale} resolveAssetUrl={resolveAssetUrl} />;
    default: {
      const _exhaustive: never = item;
      return _exhaustive;
    }
  }
}

export function ImageItemContent({
  item,
  fScale,
  resolveAssetUrl,
}: {
  item: Extract<LayoutItem, { type: 'image' }>;
  fScale: number;
  resolveAssetUrl?: (path: string) => Promise<string>;
}) {
  const resolvedUrl = useResolvedAssetUrl(item.src, resolveAssetUrl);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: item.clipPath ? undefined : (item.shape === 'circle' ? '50%' : item.shape === 'round' ? 16 : 2),
        clipPath: item.clipPath ?? undefined,
        background: resolvedUrl ? `center/${item.fit ?? 'cover'} url(${resolvedUrl})` : 'repeating-linear-gradient(45deg,#c9c9d6 0 8px,#e4e4ee 8px 16px)',
        border: item.borderW ? `${item.borderW * fScale}px solid ${item.borderColor ?? '#000'}` : undefined,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#7c7c8c',
        fontWeight: 700,
        fontSize: 11,
      }}
    >
      {/* fallbackText ưu tiên cao nhất khi có — sau đó mới tới @varKey (bind biến ảnh, hiện tên
          biến khi preview không có data thật) rồi tới chuỗi 'ẢNH' mặc định (Bước 5 kế hoạch). */}
      {!resolvedUrl && (item.fallbackText || (item.varKey ? `@${item.varKey}` : 'ẢNH'))}
    </div>
  );
}

/** Style CSS đầy đủ của 1 TextItem theo layout-scale (fScale, KHÔNG gồm zoom) — dùng chung giữa
 * ItemContent (hiển thị bình thường) và TiptapTextEditor (overlay lúc sửa), để text trong editor
 * trông Y HỆT lúc không sửa thay vì lệch màu/size/font (bug thật, 2026-07-19 — overlay cũ hard-
 * code fontSize/color/background riêng, không khớp style thật của item). */
export function computeTextStyle(item: TextItem, fScale: number): React.CSSProperties {
  return {
    fontSize: item.fontSize * fScale,
    fontFamily: item.fontFamily,
    fontWeight: item.fontWeight,
    fontStyle: item.italic ? 'italic' : undefined,
    textTransform: item.uppercase ? 'uppercase' : undefined,
    color: item.color,
    textAlign: item.align,
    lineHeight: item.lineHeight ?? 1.18,
    textShadow: textShadowCss(item.shadow, fScale),
    whiteSpace: item.overflow === 'wrap' || item.overflow === 'clip' ? 'pre-wrap' : 'pre',
    wordBreak: 'break-word',
  };
}

/** CSS text-shadow từ TextShadow — item.shadow có thể là boolean (true = mặc định nhẹ, theo kiểu
 * prototype cũ) hoặc object đủ field (Bước 5 kế hoạch, patch qua ShadowControl). */
export function textShadowCss(shadow: TextItem['shadow'], fScale: number): string | undefined {
  if (!shadow) return undefined;
  if (shadow === true) return '0 2px 4px rgba(0,0,0,0.35)';
  const { color = 'rgba(0,0,0,0.35)', blur = 4, offsetX = 0, offsetY = 2 } = shadow;
  return `${offsetX * fScale}px ${offsetY * fScale}px ${blur * fScale}px ${color}`;
}

/** Bước 5 kế hoạch — 'frame' (viền rỗng, không fill giữa) / 'line' (1 đường kẻ mảnh ngang giữa
 * box). GĐ10 (2026-08-06) — thêm clip-path cho 'triangle'/'diamond' (trước đó render giống rect,
 * bug đã audit — xem SHAPE_CLIP_PATHS's comment). */
export function GalleryItemContent({
  item,
  fScale,
  resolveAssetUrl,
}: {
  item: Extract<LayoutItem, { type: 'gallery' }>;
  fScale: number;
  resolveAssetUrl?: (path: string) => Promise<string>;
}) {
  const gap = (item.gap ?? 8) * fScale;
  const gridStyle: CSSProperties = item.layout === 'grid'
    ? { display: 'grid', gridTemplateColumns: `repeat(${item.columns ?? 3}, 1fr)`, gap }
    : { display: 'flex', flexDirection: item.layout === 'row' ? 'row' : 'column', gap };

  if (item.images.length === 0) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#7c7c8c',
        fontSize: 12 * fScale,
        background: 'repeating-linear-gradient(45deg,#c9c9d6 0 8px,#e4e4ee 8px 16px)',
      }}>
        Bộ ảnh trống
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', ...gridStyle }}>
      {item.images.map((img) => (
        <GalleryImageCellContent key={img.id} entry={img} fit={item.fit} showCaption={item.showCaption} resolveAssetUrl={resolveAssetUrl} fScale={fScale} />
      ))}
    </div>
  );
}

function GalleryImageCellContent({
  entry,
  fit,
  showCaption,
  resolveAssetUrl,
  fScale,
}: {
  entry: any;
  fit: 'cover' | 'contain';
  showCaption: boolean;
  resolveAssetUrl?: (path: string) => Promise<string>;
  fScale: number;
}) {
  const resolvedUrl = useResolvedAssetUrl(entry.src, resolveAssetUrl);
  const focalX = (entry.focalX ?? 0.5) * 100;
  const focalY = (entry.focalY ?? 0.5) * 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 * fScale }}>
      <div style={{
        aspectRatio: '1',
        background: resolvedUrl
          ? `center/${fit} url(${resolvedUrl})`
          : 'repeating-linear-gradient(45deg,#c9c9d6 0 8px,#e4e4ee 8px 16px)',
        backgroundPosition: fit === 'cover' ? `${focalX}% ${focalY}%` : undefined,
        borderRadius: 4 * fScale,
      }} />
      {showCaption && entry.caption && (
        <div style={{ fontSize: 11 * fScale, color: '#5c5d6e', textAlign: 'center' }}>{entry.caption}</div>
      )}
    </div>
  );
}

export function ShapeItemContent({ item, fScale }: { item: Extract<LayoutItem, { type: 'shape' }>; fScale: number }) {
  const fillCSS = getCSSValue(item.fill);
  const border = item.strokeW ? `${item.strokeW * fScale}px solid ${item.stroke ?? '#000'}` : undefined;
  if (item.shape === 'line') {
    return <div style={{ width: '100%', height: item.strokeW ? item.strokeW * fScale : 2, background: item.stroke ?? fillCSS ?? '#000', marginTop: '50%' }} />;
  }
  if (item.shape === 'frame') {
    return <div style={{ width: '100%', height: '100%', background: 'transparent', border: border ?? `${2 * fScale}px solid ${item.stroke ?? fillCSS ?? '#000'}` }} />;
  }
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: fillCSS,
        border,
        borderRadius: item.shape === 'circle' ? '50%' : item.shape === 'rect' ? item.radius : undefined,
        clipPath: SHAPE_CLIP_PATHS[item.shape],
      }}
    />
  );
}
