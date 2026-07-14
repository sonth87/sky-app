import { useState, useRef, useEffect, useMemo, type CSSProperties } from 'react';
import type { BackdropAspectRatio, Ceremony, Student, BackdropTemplateMap, BackdropTemplate } from './types.js';
import { resolveTemplateVariant } from './types.js';
import { DynamicBackdropView } from './DynamicBackdropView.js';

export interface BackdropViewProps {
  student: Student | null;
  ceremony: Ceremony;
  layouts: BackdropTemplateMap | null;
  layoutOverrides?: Record<string, Partial<BackdropTemplate>>;
  resolveAsset: (relativePath: string) => string;
  idle?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Tỷ lệ màn hình đang chiếu — quyết định dùng biến thể image/avatar/panels nào. Mặc định 16:9. */
  aspectRatio?: BackdropAspectRatio;
}

export function BackdropView({
  student,
  ceremony,
  layouts,
  layoutOverrides,
  resolveAsset,
  idle,
  className,
  style,
  aspectRatio = '16:9',
}: BackdropViewProps) {
  const showIdle = idle || !student;

  const resolvedLayout = useMemo((): BackdropTemplate | null => {
    if (!layouts || !student) return null;

    // award_type_code === 3 (hoặc "3") → layout-3 (center)
    // còn lại → layout-1 (left)
    let layoutKey: string;
    if (student.award_type_code !== null && String(student.award_type_code) === '3') {
      layoutKey = 'layout-3';
    } else {
      layoutKey = 'layout-1';
    }

    const baseLayout = (layouts[layoutKey] ?? layouts['default'] ?? null) as BackdropTemplate | null;
    if (!baseLayout) return null;

    const overrides = layoutOverrides?.[layoutKey] || {};

    return {
      ...baseLayout,
      ...overrides,
      fields: {
        ...(baseLayout.fields || {}),
        ...(overrides.fields || {})
      }
    };
  }, [layouts, student, layoutOverrides]);

  // Template "hiệu lực": image/avatar/panels đã resolve theo tỷ lệ màn hình đang chiếu.
  const effectiveTemplate = useMemo((): BackdropTemplate | null => {
    if (!resolvedLayout) return null;
    const v = resolveTemplateVariant(resolvedLayout, aspectRatio);

    // Thực hiện merge sâu (deep merge) cho từng field để giữ nguyên các thuộc tính color, uppercase,... gốc
    const mergedFields = { ...(resolvedLayout.fields || {}) };
    if (v.fields) {
      for (const [key, val] of Object.entries(v.fields)) {
        mergedFields[key] = {
          ...(mergedFields[key] || {}),
          ...val,
        };
      }
    }

    return {
      ...resolvedLayout,
      image: v.image,
      avatar: v.avatar,
      panels: v.panels,
      fields: mergedFields,
    };
  }, [resolvedLayout, aspectRatio]);

  const bgUrl = effectiveTemplate?.image ? resolveAsset(effectiveTemplate.image) : null;
  const logoUrl = resolveAsset(ceremony.logo);
  const idleImageUrl = ceremony.idle_image_variants?.[aspectRatio]
    ? resolveAsset(ceremony.idle_image_variants[aspectRatio]!)
    : ceremony.idle_image
      ? resolveAsset(ceremony.idle_image)
      : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setContainerH(entries[0]!.contentRect.height); // an toàn: observe 1 el luôn trả ≥1 entry
    });
    ro.observe(el);

    const timer = setTimeout(() => {
      if (containerH === 0 && el) {
        setContainerH(el.clientHeight || window.innerHeight);
      }
    }, 100);

    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, [containerH]);

  const rootStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#001a4d',
    ...(bgUrl
      ? {
          backgroundImage: `url("${bgUrl}")`,
          backgroundSize: '100% 100%',
          backgroundPosition: 'center',
        }
      : {}),
    color: '#fff',
    fontFamily: '"Montserrat", system-ui, "Segoe UI", Roboto, sans-serif',
    ...style,
  };

  return (
    <div ref={containerRef} className={className} style={rootStyle} data-testid="backdrop-view">
      {showIdle ? (
        <IdleContent ceremony={ceremony} logoUrl={logoUrl} idleImageUrl={idleImageUrl} />
      ) : effectiveTemplate ? (
        <DynamicBackdropView
          student={student!}
          template={effectiveTemplate}
          resolveAsset={resolveAsset}
          containerH={containerH}
        />
      ) : null}
    </div>
  );
}

// ---- Idle ----

function IdleContent({
  ceremony,
  logoUrl,
  idleImageUrl,
}: {
  ceremony: Ceremony;
  logoUrl: string;
  idleImageUrl: string | null;
}) {
  return (
    <>
      {idleImageUrl && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url("${idleImageUrl}")`,
            backgroundSize: '100% 100%',
            backgroundPosition: 'center',
          }}
        />
      )}
      {!idleImageUrl && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {logoUrl && (
            <img src={logoUrl} alt="logo" style={{ height: 80, marginBottom: '1.5rem' }} />
          )}
          <h1 style={{ fontSize: '3.5rem', fontWeight: 800, textAlign: 'center', margin: 0 }}>
            {ceremony.name}
          </h1>
          <p style={{ fontSize: '1.6rem', opacity: 0.9, marginTop: '1rem' }}>{ceremony.venue}</p>
        </div>
      )}
    </>
  );
}
