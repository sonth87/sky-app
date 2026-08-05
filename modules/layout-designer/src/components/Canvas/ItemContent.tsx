import type { LayoutItem, TextItem } from '@sky-app/slide-shared';
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
  switch (item.type) {
    case 'text': {
      // vAlign dùng flexbox trên WRAPPER ngoài (item.box đã là 100% width/height của div này) —
      // textAlign (align) là CSS riêng biệt cho căn NGANG dòng chữ, vAlign căn theo trục DỌC.
      const justify = item.vAlign === 'top' ? 'flex-start' : item.vAlign === 'bottom' ? 'flex-end' : 'center';
      const textStyle = computeTextStyle(item, fScale);
      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: justify, overflow: item.overflow === 'clip' ? 'hidden' : undefined }}>
          {/* content string (layout cũ/chưa qua rich-text editor) → render trực tiếp qua
             children. RichTextContent (Bước 12) → dùng THẲNG content.html (đã sinh sẵn lúc soạn
             qua editor.getHTML(), KHÔNG gọi generateHTML() ở đây — sửa lại 2026-07-19: bỏ hẳn
             @tiptap/html khỏi cả slide-shared lẫn module này, tránh vỡ build Electron main
             process khi bundle, xem RichTextContent's comment ở slide-shared/types.ts), read-only
             preview khi KHÔNG đang double-click sửa trực tiếp (xem TiptapTextEditor.tsx). */}
          {typeof item.content === 'string' ? (
            <div style={textStyle}>{item.content}</div>
          ) : (
            <div style={textStyle} dangerouslySetInnerHTML={{ __html: item.content.html }} />
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
        borderRadius: item.shape === 'circle' ? '50%' : item.shape === 'round' ? 16 : 2,
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

/** Bước 5 kế hoạch — thêm stroke/strokeW (mọi shape) + 2 dạng mới 'frame' (viền rỗng, không
 * fill giữa) / 'line' (1 đường kẻ mảnh ngang giữa box) — 'triangle'/'diamond' GIỮ NGUYÊN như cũ
 * (chưa có style đặc trưng riêng, CHỦ ĐỘNG ngoài phạm vi bước này theo đúng plan). */
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
      }}
    />
  );
}
