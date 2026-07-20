// Property panel — theo prototype "Backdrop Editor 2a - keo tha.dc.html" §PROPERTY PANEL.
// Mỗi thay đổi qua patchItemCommand (KHÔNG coalesce — mỗi lần sửa field là 1 undo riêng, khác
// move/resize trên canvas cần coalesce theo khung hình kéo chuột).

import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Lock, Pin, PinOff, Unlock } from 'lucide-react';
import type { Background, LayoutItem, LayoutVariant, TextShadow } from '@sky-app/slide-shared';
import { patchItemCommand, patchVariantBackgroundCommand, removeItemCommand, resolveEditingItems, toggleSyncLockCommand } from '@sky-app/layout-editor-core';
import type { Editor } from '@sky-app/layout-editor-core';
import { useEditorState } from './useEditor.js';
import { VariableTextarea } from './VariableTextarea.js';
import { collectUsedTokenKeys } from './Flyout.js';
import { useResolvedAssetUrl } from './useResolvedAssetUrl.js';
import { SyncBadge } from './SyncBadge.js';
import { GradientEditor } from './GradientEditor.js';

/** Style dùng chung cho nút chọn (căn lề/hình dạng/bộ lọc...) — active dùng var(--accent-color)
 * (màu accent hệ thống, device-layout's ThemeProvider set động theo Settings > Appearance),
 * KHÔNG hard-code để khớp app khác khi user đổi màu. */
function pickerBtnStyle(active: boolean, extra?: React.CSSProperties): React.CSSProperties {
  return {
    border: `1px solid ${active ? 'var(--accent-color, #4b57e6)' : '#e6e6ee'}`,
    background: active ? 'color-mix(in srgb, var(--accent-color, #4b57e6) 10%, transparent)' : '#fcfcfd',
    cursor: 'pointer',
    ...extra,
  };
}

export interface PropertyPanelProps {
  editor: Editor;
  variantId: string;
  /** Gợi ý toàn cục từ variable_registry (file 09 §2.6, sub-bước 2.5) — gộp với token đã dùng
   * trong layout hiện tại. Bỏ trống = chỉ gợi ý theo layout hiện tại (như trước 2.5). */
  globalSuggestions?: string[];
  /** Gọi khi user CHỌN 1 token từ dropdown autocomplete — chuyển tiếp lên LayoutDesignerAppModule
   * để ghi nhận vào variable_registry qua LayoutPort. */
  onTokenInserted?: (key: string) => void;
  /** Mở file picker + lưu ảnh qua AssetPort, trả `relativePath` để gán vào ImageItem.src.
   * Bỏ trống = ẩn nút "Đổi ảnh" (VD preview độc lập không có AssetPort). */
  pickAndSaveImage?: () => Promise<{ relativePath: string } | null>;
  resolveAssetUrl?: (path: string) => Promise<string>;
  /** Bỏ trống = rộng mặc định 302px (hành vi cũ). Truyền vào khi caller cho phép resize panel
   * (LayoutDesignerApp.tsx — review 2026-07-18 "panel property nên cho to thêm 1 chút, và có thể
   * drag để resize được"). */
  width?: number;
}

export function PropertyPanel({ editor, variantId, globalSuggestions, onTokenInserted, pickAndSaveImage, resolveAssetUrl, width = 302 }: PropertyPanelProps) {
  const selection = useEditorState(editor, (s) => s.selection);
  const doc = useEditorState(editor, (s) => s.doc);
  // editingLoopId (Bước 10 kế hoạch resize/rotate, 2026-07-18) — khi có giá trị, lookup item
  // trong itemTemplate của LoopItem đó thay vì variant.items top-level (resolveEditingItems).
  const editingLoopId = useEditorState(editor, (s) => s.editingLoopId);

  const variant = doc.variants.find((v) => v.aspect.id === variantId);
  const editingItems = variant ? resolveEditingItems(variant, editingLoopId) : [];
  const item = editingItems.find((i) => i.id === selection[0]);
  const tokenSuggestions = useMemo(() => {
    const local = variant ? [...collectUsedTokenKeys(variant)] : [];
    if (!globalSuggestions || globalSuggestions.length === 0) return local;
    // Gộp, khử trùng — token local (đã dùng trong layout này) đứng TRƯỚC (liên quan trực tiếp
    // hơn), rồi tới gợi ý toàn cục theo usage_count (đã sắp sẵn từ LayoutPort.listTopVariables).
    const seen = new Set(local);
    const merged = [...local];
    for (const key of globalSuggestions) {
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(key);
      }
    }
    return merged;
  }, [variant, globalSuggestions]);

  const patch = useCallback(
    (patchValue: Partial<LayoutItem>) => {
      if (!item) return;
      editor.store.getState().dispatch(patchItemCommand(variantId, item.id, item, patchValue, editingLoopId));
    },
    [editor, item, variantId, editingLoopId],
  );

  // Không có item nào đang chọn → hiện thuộc tính CỦA CHÍNH Frame/Canvas (nền màu/gradient/ảnh —
  // review 2026-07-18, trước đó chỉ hiện text hướng dẫn tĩnh "Chọn một thành phần"). KHÔNG hiện
  // khi đang edit-mode (Bước 10) — ngữ cảnh "ô mẫu" không có nền variant thật để chỉnh.
  if (!item) {
    if (!variant || editingLoopId) return null;
    return (
      <FrameBackgroundControls
        variant={variant}
        onChange={(background) => editor.store.getState().dispatch(patchVariantBackgroundCommand(variantId, variant.background, background))}
        pickAndSaveImage={pickAndSaveImage}
        resolveAssetUrl={resolveAssetUrl}
        width={width}
      />
    );
  }

  const isSyncParent = !editingLoopId && Boolean(item.syncKey && doc.variants.some((v) => v.items.some((i) => i.syncRef === item.syncKey)));

  return (
    <div style={{ width, flex: 'none', borderLeft: '1px solid #e6e6ee', background: '#fff', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <PanelHeader
        item={item}
        isSyncParent={isSyncParent}
        patch={patch}
        onDelete={() => editor.store.getState().dispatch(removeItemCommand(variantId, item.id, editingLoopId))}
        onToggleLock={() => editor.store.getState().dispatch(toggleSyncLockCommand(variantId, item.id, !item.syncLocked, editingLoopId))}
      />
      {item.type === 'text' && <TextControls item={item} patch={patch} tokenSuggestions={tokenSuggestions} onTokenInserted={onTokenInserted} />}
      {item.type === 'ribbon' && <RibbonControls item={item} patch={patch} tokenSuggestions={tokenSuggestions} onTokenInserted={onTokenInserted} />}
      {item.type === 'image' && (
        <ImageControls item={item} patch={patch} pickAndSaveImage={pickAndSaveImage} resolveAssetUrl={resolveAssetUrl} />
      )}
      {item.type === 'shape' && <ShapeControls item={item} patch={patch} />}
      <RotationControl value={item.box.rotation ?? 0} onChange={(v) => patch({ box: { ...item.box, rotation: v } })} />
      <OpacityControl value={item.opacity ?? 100} onChange={(v) => patch({ opacity: v })} />
    </div>
  );
}

function PanelHeader({
  item,
  isSyncParent,
  patch,
  onDelete,
  onToggleLock,
}: {
  item: LayoutItem;
  isSyncParent: boolean;
  patch: (p: Partial<LayoutItem>) => void;
  onDelete: () => void;
  onToggleLock: () => void;
}) {
  const typeName: Record<LayoutItem['type'], string> = {
    text: 'Văn bản',
    ribbon: 'Ruy-băng',
    image: 'Hình ảnh',
    shape: 'Hình khối',
    loop: 'Khung lặp',
  };
  const iconBtnStyle: React.CSSProperties = {
    cursor: 'pointer',
    color: '#9a9bab',
    border: '1px solid #e6e6ee',
    borderRadius: 7,
    width: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
  };
  return (
    <div style={{ padding: '13px 15px', borderBottom: '1px solid #e6e6ee' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{typeName[item.type]}</span>
        <SyncBadge item={item} isParent={isSyncParent} size={13} />
        <span style={{ flex: 1 }} />
        {/* z-order — Box.z (Bước 2). Bằng nhau → thứ tự mảng variant.items[] vẫn là tie-breaker,
           không cần xử lý gì thêm ở đây. */}
        <button onClick={() => patch({ box: { ...item.box, z: (item.box.z ?? 0) + 1 } })} aria-label="Lên 1 lớp" style={iconBtnStyle}>
          <ChevronUp size={13} />
        </button>
        <button onClick={() => patch({ box: { ...item.box, z: (item.box.z ?? 0) - 1 } })} aria-label="Xuống 1 lớp" style={iconBtnStyle}>
          <ChevronDown size={13} />
        </button>
        {/* locked (Bước 2) — khoá DI CHUYỂN thông thường, dùng icon Pin/PinOff — CỐ Ý KHÁC icon
           Lock/Unlock của syncLocked bên dưới (khoá ĐỒNG BỘ giữa variant) để tránh nhầm lẫn 2
           khái niệm khoá độc lập nhau (review 2026-07-18, Bước 2 kế hoạch). */}
        <button
          onClick={() => patch({ locked: !item.locked })}
          aria-label={item.locked ? 'Mở khoá di chuyển' : 'Khoá di chuyển'}
          title={item.locked ? 'Đang khoá — không kéo được trên canvas' : 'Khoá để tránh kéo nhầm'}
          style={{ ...iconBtnStyle, color: item.locked ? 'var(--accent-color, #4b57e6)' : '#9a9bab' }}
        >
          {item.locked ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
        {item.syncRef && (
          <button onClick={onToggleLock} aria-label={item.syncLocked ? 'Mở khoá đồng bộ' : 'Khoá đồng bộ'} style={iconBtnStyle}>
            {item.syncLocked ? <Unlock size={13} /> : <Lock size={13} />}
          </button>
        )}
        <span onClick={onDelete} style={{ ...iconBtnStyle, cursor: 'pointer' }}>
          🗑
        </span>
      </div>
      {/* name (Bước 2) — nhãn tuỳ chỉnh hiện trong Layers panel (Flyout.tsx's LayersPanel),
         KHÔNG bắt buộc — bỏ trống thì Layers fallback về nhãn tự sinh theo content/type như cũ. */}
      <input
        type="text"
        value={item.name ?? ''}
        onChange={(e) => patch({ name: e.target.value || undefined })}
        placeholder="Đặt tên (tuỳ chọn)…"
        style={{ width: '100%', border: '1px solid #e6e6ee', borderRadius: 7, padding: '6px 8px', fontSize: 11.5 }}
      />
    </div>
  );
}

/**
 * Thuộc tính của CHÍNH Frame/Canvas (khi không có item nào đang chọn) — chọn kiểu nền: Không có
 * (mặc định trắng — xem Canvas.tsx đổi 2026-07-18, TRƯỚC ĐÓ mặc định tím `#201748`)/Màu/Gradient/
 * Ảnh. `video`/`effect` CHƯA làm (hoãn — cần đổi cả LayoutRenderer runtime, xem plan Giai đoạn 2.6
 * review "Property panel canvas" — chỉ làm color/gradient/image trước theo quyết định 2026-07-18).
 */
function FrameBackgroundControls({
  variant,
  onChange,
  pickAndSaveImage,
  resolveAssetUrl,
  width = 302,
}: {
  variant: LayoutVariant;
  onChange: (background: Background | undefined) => void;
  pickAndSaveImage?: () => Promise<{ relativePath: string } | null>;
  resolveAssetUrl?: (path: string) => Promise<string>;
  width?: number;
}) {
  const background = variant.background;
  const kind = background?.kind ?? 'none';
  const previewUrl = useResolvedAssetUrl(background?.kind === 'image' ? background.src : undefined, resolveAssetUrl);
  const [picking, setPicking] = useState(false);

  async function handlePickImage() {
    if (!pickAndSaveImage) return;
    setPicking(true);
    try {
      const result = await pickAndSaveImage();
      if (result) onChange({ kind: 'image', src: result.relativePath });
    } finally {
      setPicking(false);
    }
  }

  return (
    <div style={{ width, flex: 'none', borderLeft: '1px solid #e6e6ee', background: '#fff', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ padding: '13px 15px', borderBottom: '1px solid #e6e6ee' }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{variant.aspect.label ?? `${variant.aspect.w}:${variant.aspect.h}`} — Canvas</span>
        <div style={{ fontSize: 11, color: '#9a9bab', marginTop: 3 }}>Không có phần tử nào đang chọn — chỉnh nền chung cho toàn bộ tỷ lệ này.</div>
      </div>
      <Section title="Kiểu nền">
        <div style={{ display: 'flex', gap: 6 }}>
          {(
            [
              { value: 'none', label: 'Không có' },
              { value: 'color', label: 'Màu' },
              { value: 'gradient', label: 'Gradient' },
              { value: 'image', label: 'Ảnh' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                if (opt.value === 'none') onChange(undefined);
                else if (opt.value === 'color') onChange({ kind: 'color', color: background?.kind === 'color' ? background.color : '#201748' });
                else if (opt.value === 'gradient') onChange({ kind: 'gradient', gradient: background?.kind === 'gradient' ? background.gradient : 'linear-gradient(135deg, #201748, #4b57e6)' });
                else onChange({ kind: 'image', src: background?.kind === 'image' ? background.src : undefined });
              }}
              style={pickerBtnStyle(kind === opt.value, { flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 10.5 })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Section>
      {kind === 'color' && (
        <Section title="Màu nền">
          <input
            type="color"
            value={background?.kind === 'color' ? background.color : '#201748'}
            onChange={(e) => onChange({ kind: 'color', color: e.target.value })}
          />
        </Section>
      )}
      {kind === 'gradient' && (
        <Section title="Gradient">
          <GradientEditor
            value={(background?.kind === 'gradient' ? background.gradient : undefined) ?? 'linear-gradient(135deg, #201748, #4b57e6)'}
            onChange={(gradient) => onChange({ kind: 'gradient', gradient })}
          />
        </Section>
      )}
      {kind === 'image' && pickAndSaveImage && (
        <Section title="Ảnh nền">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {previewUrl ? (
              <img src={previewUrl} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', border: '1px solid #e6e6ee' }} />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: 8, border: '1px dashed #cfd0da', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#9a9bab' }}>
                ẢNH
              </div>
            )}
            <button
              onClick={handlePickImage}
              disabled={picking}
              style={{
                flex: 1,
                padding: '8px 0',
                background: picking ? '#c9c9d3' : 'var(--accent-color, #4b57e6)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 11.5,
                cursor: picking ? 'default' : 'pointer',
              }}
            >
              {picking ? 'Đang chọn…' : 'Đổi ảnh'}
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid #f0f0f5', padding: '13px 15px' }}>
      <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', color: '#9a9bab', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function TextControls({
  item,
  patch,
  tokenSuggestions,
  onTokenInserted,
}: {
  item: Extract<LayoutItem, { type: 'text' }>;
  patch: (p: Partial<LayoutItem>) => void;
  tokenSuggestions: string[];
  onTokenInserted?: (key: string) => void;
}) {
  const boldActive = (item.fontWeight ?? 400) >= 700;
  return (
    <>
      <Section title="Nội dung">
        {/* content string (layout cũ/chưa qua rich-text editor) → sửa qua VariableTextarea như
           cũ. Đã qua rich-text editor (Tiptap JSON, Bước 12) → CHỈ hiện preview read-only + gợi ý
           "Sửa trên canvas" (tránh 2 nguồn chỉnh sửa cùng lúc gây desync giữa sidebar và canvas,
           quyết định đã chốt trong plan) — double-click trực tiếp trên canvas mới mở editor thật. */}
        {typeof item.content === 'string' ? (
          <VariableTextarea value={item.content} onChange={(v) => patch({ content: v })} suggestions={tokenSuggestions} onTokenInserted={onTokenInserted} />
        ) : (
          <div style={{ border: '1px solid #e6e6ee', borderRadius: 9, padding: '9px 10px', fontSize: 12.5, color: '#5c5d6e', background: '#fafafd' }}>
            Nội dung đã có định dạng (chữ đậm/nghiêng...) — nhấp đúp vào ô văn bản trên canvas để sửa.
          </div>
        )}
        <div style={{ fontSize: 10.5, color: '#9a9bab', marginTop: 6 }}>
          Gõ <b style={{ color: '#c07a1e' }}>@ten_bien</b> để chèn token — gợi ý theo layout này và biến hay dùng.
        </div>
      </Section>
      <Section title="Font chữ">
        <input
          type="text"
          value={item.fontFamily ?? ''}
          onChange={(e) => patch({ fontFamily: e.target.value || undefined })}
          placeholder="Mặc định hệ thống…"
          style={{ width: '100%', border: '1px solid #e6e6ee', borderRadius: 7, padding: '6px 8px', fontSize: 11.5, marginBottom: 8 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11.5 }}>Cỡ chữ</span>
          <input type="range" min={10} max={72} value={item.fontSize} onChange={(e) => patch({ fontSize: Number(e.target.value) })} style={{ flex: 1 }} />
          <span style={{ fontSize: 11, width: 34, textAlign: 'right' }}>{item.fontSize}</span>
        </div>
      </Section>
      <Section title="Kiểu">
        <div style={{ display: 'flex', gap: 7 }}>
          <button onClick={() => patch({ fontWeight: boldActive ? 400 : 700 })} style={pickerBtnStyle(boldActive, { flex: 1, padding: '7px 0', borderRadius: 8, fontWeight: 700 })}>
            B
          </button>
          <button onClick={() => patch({ italic: !item.italic })} style={pickerBtnStyle(Boolean(item.italic), { flex: 1, padding: '7px 0', borderRadius: 8, fontStyle: 'italic' })}>
            I
          </button>
          <button onClick={() => patch({ uppercase: !item.uppercase })} style={pickerBtnStyle(Boolean(item.uppercase), { flex: 1, padding: '7px 0', borderRadius: 8 })}>
            AA
          </button>
        </div>
      </Section>
      <Section title="Giãn dòng">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="range" min={0.8} max={2.5} step={0.02} value={item.lineHeight ?? 1.18} onChange={(e) => patch({ lineHeight: Number(e.target.value) })} style={{ flex: 1 }} />
          <span style={{ fontSize: 11, width: 34, textAlign: 'right' }}>{(item.lineHeight ?? 1.18).toFixed(2)}</span>
        </div>
      </Section>
      <Section title="Màu chữ">
        <input type="color" value={item.color ?? '#ffffff'} onChange={(e) => patch({ color: e.target.value })} />
      </Section>
      <Section title="Căn ngang">
        <div style={{ display: 'flex', gap: 7 }}>
          {(['left', 'center', 'right'] as const).map((a) => (
            <button key={a} onClick={() => patch({ align: a })} style={pickerBtnStyle(item.align === a, { flex: 1, padding: '7px 0', borderRadius: 8 })}>
              {a === 'left' ? '◧' : a === 'center' ? '▣' : '◨'}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Căn dọc">
        <div style={{ display: 'flex', gap: 7 }}>
          {(['top', 'center', 'bottom'] as const).map((v) => (
            <button key={v} onClick={() => patch({ vAlign: v })} style={pickerBtnStyle((item.vAlign ?? 'center') === v, { flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 10.5 })}>
              {v === 'top' ? 'Trên' : v === 'center' ? 'Giữa' : 'Dưới'}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Khi tràn khung">
        <div style={{ display: 'flex', gap: 7 }}>
          {(
            [
              { value: 'wrap', label: 'Xuống dòng' },
              { value: 'shrink', label: 'Co chữ' },
              { value: 'clip', label: 'Cắt' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => patch({ overflow: opt.value })}
              style={pickerBtnStyle((item.overflow ?? 'wrap') === opt.value, { flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 10 })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Section>
      <ShadowControl value={item.shadow} onChange={(v) => patch({ shadow: v })} />
    </>
  );
}

function RibbonControls({
  item,
  patch,
  tokenSuggestions,
  onTokenInserted,
}: {
  item: Extract<LayoutItem, { type: 'ribbon' }>;
  patch: (p: Partial<LayoutItem>) => void;
  tokenSuggestions: string[];
  onTokenInserted?: (key: string) => void;
}) {
  const boldActive = (item.fontWeight ?? 400) >= 700;
  return (
    <>
      <Section title="Nội dung">
        <VariableTextarea value={item.content} onChange={(v) => patch({ content: v })} suggestions={tokenSuggestions} onTokenInserted={onTokenInserted} />
        <div style={{ fontSize: 10.5, color: '#9a9bab', marginTop: 6 }}>
          Gõ <b style={{ color: '#c07a1e' }}>@ten_bien</b> để chèn token — gợi ý theo layout này và biến hay dùng.
        </div>
      </Section>
      <Section title="Kiểu chữ">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11.5 }}>Cỡ chữ</span>
          <input type="range" min={10} max={72} value={item.fontSize} onChange={(e) => patch({ fontSize: Number(e.target.value) })} style={{ flex: 1 }} />
          <span style={{ fontSize: 11, width: 34, textAlign: 'right' }}>{item.fontSize}</span>
        </div>
        <button onClick={() => patch({ fontWeight: boldActive ? 400 : 700 })} style={pickerBtnStyle(boldActive, { padding: '7px 14px', borderRadius: 8, fontWeight: 700 })}>
          B
        </button>
      </Section>
      <Section title="Màu chữ">
        <input type="color" value={item.color ?? '#ffffff'} onChange={(e) => patch({ color: e.target.value })} />
      </Section>
      <Section title="Nền dải ruy-băng">
        <input type="color" value={item.bg ?? '#b9902f'} onChange={(e) => patch({ bg: e.target.value })} />
      </Section>
    </>
  );
}

function ShadowControl({ value, onChange }: { value: TextShadow | boolean | undefined; onChange: (v: TextShadow | undefined) => void }) {
  const enabled = Boolean(value);
  const obj = typeof value === 'object' ? value : {};
  return (
    <Section title="Đổ bóng">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: enabled ? 10 : 0 }}>
        <button
          onClick={() => onChange(enabled ? undefined : { color: 'rgba(0,0,0,0.35)', blur: 4, offsetX: 0, offsetY: 2 })}
          style={pickerBtnStyle(enabled, { flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11 })}
        >
          {enabled ? 'Đang bật' : 'Bật đổ bóng'}
        </button>
      </div>
      {enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input type="color" value={obj.color ?? '#000000'} onChange={(e) => onChange({ ...obj, color: e.target.value })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ fontSize: 10.5, color: '#9a9bab', flex: 1 }}>
              Lệch X
              <input type="number" value={obj.offsetX ?? 0} onChange={(e) => onChange({ ...obj, offsetX: Number(e.target.value) })} style={{ width: '100%', border: '1px solid #e6e6ee', borderRadius: 6, padding: '4px 6px', fontSize: 11 }} />
            </label>
            <label style={{ fontSize: 10.5, color: '#9a9bab', flex: 1 }}>
              Lệch Y
              <input type="number" value={obj.offsetY ?? 2} onChange={(e) => onChange({ ...obj, offsetY: Number(e.target.value) })} style={{ width: '100%', border: '1px solid #e6e6ee', borderRadius: 6, padding: '4px 6px', fontSize: 11 }} />
            </label>
            <label style={{ fontSize: 10.5, color: '#9a9bab', flex: 1 }}>
              Độ mờ nhoè
              <input type="number" min={0} value={obj.blur ?? 4} onChange={(e) => onChange({ ...obj, blur: Number(e.target.value) })} style={{ width: '100%', border: '1px solid #e6e6ee', borderRadius: 6, padding: '4px 6px', fontSize: 11 }} />
            </label>
          </div>
        </div>
      )}
    </Section>
  );
}

function ImageControls({
  item,
  patch,
  pickAndSaveImage,
  resolveAssetUrl,
}: {
  item: Extract<LayoutItem, { type: 'image' }>;
  patch: (p: Partial<LayoutItem>) => void;
  pickAndSaveImage?: () => Promise<{ relativePath: string } | null>;
  resolveAssetUrl?: (path: string) => Promise<string>;
}) {
  const previewUrl = useResolvedAssetUrl(item.src, resolveAssetUrl);
  const [picking, setPicking] = useState(false);

  async function handlePickImage() {
    if (!pickAndSaveImage) return;
    setPicking(true);
    try {
      const result = await pickAndSaveImage();
      if (result) patch({ src: result.relativePath });
    } finally {
      setPicking(false);
    }
  }

  return (
    <>
      {pickAndSaveImage && (
        <Section title="Nguồn ảnh">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {previewUrl ? (
              <img src={previewUrl} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', border: '1px solid #e6e6ee' }} />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: 8, border: '1px dashed #cfd0da', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#9a9bab' }}>
                ẢNH
              </div>
            )}
            <button
              onClick={handlePickImage}
              disabled={picking}
              style={{
                flex: 1,
                padding: '8px 0',
                background: picking ? '#c9c9d3' : 'var(--accent-color, #4b57e6)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 11.5,
                cursor: picking ? 'default' : 'pointer',
              }}
            >
              {picking ? 'Đang chọn…' : 'Đổi ảnh'}
            </button>
          </div>
        </Section>
      )}
      {/* varKey (Bước 5 kế hoạch) — QUAN TRỌNG NHẤT của ImageItem: bind ảnh theo biến để 1 layout
          dùng chung cho N người, mỗi người ảnh khác nhau. Ưu tiên hơn src khi có record thật (xem
          LayoutRenderer/resolveTokens ở runtime) — src ở trên chỉ dùng khi KHÔNG bind biến. */}
      <Section title="Bind theo biến ảnh">
        <input
          type="text"
          value={item.varKey ?? ''}
          onChange={(e) => patch({ varKey: e.target.value || undefined })}
          placeholder="VD: anh_dai_dien (bỏ trống = dùng ảnh tĩnh trên)"
          style={{ width: '100%', border: '1px solid #e6e6ee', borderRadius: 7, padding: '6px 8px', fontSize: 11.5 }}
        />
      </Section>
      <Section title="Chữ thay thế khi không có ảnh">
        <input
          type="text"
          value={item.fallbackText ?? ''}
          onChange={(e) => patch({ fallbackText: e.target.value || undefined })}
          placeholder="Mặc định: tên biến hoặc 'ẢNH'"
          style={{ width: '100%', border: '1px solid #e6e6ee', borderRadius: 7, padding: '6px 8px', fontSize: 11.5 }}
        />
      </Section>
      <Section title="Cách lấp đầy khung">
        <div style={{ display: 'flex', gap: 7 }}>
          {(
            [
              { value: 'cover', label: 'Lấp đầy (cắt bớt)' },
              { value: 'contain', label: 'Vừa khung (giữ nguyên)' },
            ] as const
          ).map((opt) => (
            <button key={opt.value} onClick={() => patch({ fit: opt.value })} style={pickerBtnStyle((item.fit ?? 'cover') === opt.value, { flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 10 })}>
              {opt.label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Hình dạng & viền">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          {(['rect', 'round', 'circle'] as const).map((s) => (
            <button
              key={s}
              onClick={() => patch({ shape: s })}
              style={pickerBtnStyle(item.shape === s, { width: 30, height: 30, borderRadius: 7 })}
            >
              {s === 'circle' ? '●' : '▢'}
            </button>
          ))}
          <span style={{ fontSize: 11.5, marginLeft: 6 }}>Viền</span>
          <input type="range" min={0} max={16} value={item.borderW ?? 0} onChange={(e) => patch({ borderW: Number(e.target.value) })} style={{ flex: 1 }} />
        </div>
        {(item.borderW ?? 0) > 0 && <input type="color" value={item.borderColor ?? '#000000'} onChange={(e) => patch({ borderColor: e.target.value })} />}
      </Section>
      <Section title="Bộ lọc">
        <div style={{ display: 'flex', gap: 8 }}>
          {(['none', 'bright', 'gray', 'warm'] as const).map((f) => (
            <button key={f} onClick={() => patch({ filter: f })} style={pickerBtnStyle(item.filter === f, { fontSize: 10.5, padding: '4px 8px', borderRadius: 6 })}>
              {f}
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}

function ShapeControls({ item, patch }: { item: Extract<LayoutItem, { type: 'shape' }>; patch: (p: Partial<LayoutItem>) => void }) {
  return (
    <>
      <Section title="Hình dạng">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['rect', 'circle', 'triangle', 'diamond', 'frame', 'line'] as const).map((s) => (
            <button
              key={s}
              onClick={() => patch({ shape: s })}
              style={pickerBtnStyle(item.shape === s, { width: 30, height: 30, borderRadius: 7 })}
            >
              {s === 'circle' ? '●' : s === 'triangle' ? '▲' : s === 'diamond' ? '◆' : s === 'frame' ? '▢' : s === 'line' ? '―' : '▮'}
            </button>
          ))}
        </div>
      </Section>
      {item.shape !== 'line' && (
        <Section title="Màu nền">
          <input type="color" value={item.fill ?? '#4b57e6'} onChange={(e) => patch({ fill: e.target.value })} />
        </Section>
      )}
      {item.shape === 'rect' && (
        <Section title="Bo góc">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="range" min={0} max={100} value={item.radius ?? 0} onChange={(e) => patch({ radius: Number(e.target.value) })} style={{ flex: 1 }} />
            <span style={{ fontSize: 11, width: 34, textAlign: 'right' }}>{item.radius ?? 0}</span>
          </div>
        </Section>
      )}
      <Section title="Viền">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: (item.strokeW ?? 0) > 0 ? 8 : 0 }}>
          <input type="range" min={0} max={16} value={item.strokeW ?? 0} onChange={(e) => patch({ strokeW: Number(e.target.value) })} style={{ flex: 1 }} />
          <span style={{ fontSize: 11, width: 34, textAlign: 'right' }}>{item.strokeW ?? 0}</span>
        </div>
        {(item.strokeW ?? 0) > 0 && <input type="color" value={item.stroke ?? '#000000'} onChange={(e) => patch({ stroke: e.target.value })} />}
      </Section>
    </>
  );
}

/** Xoay item quanh tâm (Box.rotation, độ, mặc định 0) — LUÔN hiện cho mọi loại item, giống
 * OpacityControl (BaseItem field chung). Kéo drag-handle trên Canvas (Bước 4 kế hoạch) dùng
 * rotateItemCommand riêng (coalescable); input số ở đây dùng patchItemCommand thường (mỗi lần gõ
 * = 1 undo, hợp lý vì đây là thao tác rời rạc, không phải kéo chuột liên tục). */
function RotationControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Section title="Xoay">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="range" min={0} max={360} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
        <span style={{ fontSize: 11, width: 34, textAlign: 'right' }}>{value}°</span>
      </div>
    </Section>
  );
}

function OpacityControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Section title="Độ mờ">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="range" min={10} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
        <span style={{ fontSize: 11, width: 34, textAlign: 'right' }}>{value}</span>
      </div>
    </Section>
  );
}
