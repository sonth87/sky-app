import React, { useState, useRef, useEffect, type CSSProperties } from 'react';
import type {
  Student,
  BackdropTemplate,
  BackdropPanel,
  BackdropFieldOverride,
  BackdropRegion,
  BackdropTextStyle,
} from './types.js';
import { displayName, formatGpa } from './format.js';

export interface DynamicBackdropViewProps {
  student: Student;
  template: BackdropTemplate;
  resolveAsset: (relativePath: string) => string;
  containerH: number;
}

export function DynamicBackdropView({
  student,
  template,
  resolveAsset,
  containerH,
}: DynamicBackdropViewProps) {
  const photoUrl = student.image_relative_path ? resolveAsset(student.image_relative_path) : null;
  const isCircle = (template.avatarShape ?? 'circle') === 'circle';
  const ringUrl = template.ring ? resolveAsset(template.ring) : null;

  const hasClassification =
    student.classification &&
    !['khong', 'không', 'none', ''].includes(student.classification.toLowerCase().trim());

  // Các field content: key → nội dung hiển thị
  const fieldContent: Record<string, React.ReactNode> = {
    template_type: student.presentation_template_type,
    title: template.title ?? student.award_content,
    full_name: displayName(student.full_name),
    major_name: student.major_name,
    classification: hasClassification
      ? `${student.classification.replace(/^Xếp loại tốt nghiệp:\s*/i, '')}${student.classification.toLowerCase().includes('học tập') ? '' : ' TRONG HỌC TẬP'}: ${formatGpa(student.gpa)}`
      : '',
    award_title:
      student.award_type === 'KHENTHUONG'
        ? student.achievement_title &&
          !['khong', 'không', 'none', ''].includes(student.achievement_title.toLowerCase().trim())
          ? student.achievement_title
          : 'ĐẠT DANH HIỆU'
        : '',
    classification_gpa: hasClassification
      ? `${student.classification}\n${formatGpa(student.gpa)}`
      : '',
    ...(student.quote ? { quote: <>&ldquo; {student.quote} &rdquo;</> } : {}),
    ...(template.extra
      ? Object.fromEntries(
          Object.keys(template.extra).map((k) => [
            k,
            ((student as unknown as Record<string, unknown>)[k] as string) ?? '',
          ]),
        )
      : {}),
  };

  return (
    <>
      {template.avatar && (
        <AbsoluteRegion region={template.avatar}>
          <PhotoWithFallback
            url={photoUrl}
            alt={student.full_name}
            circle={isCircle}
            ringUrl={ringUrl}
          />
        </AbsoluteRegion>
      )}

      {template.panels?.map((panel, i) => (
        <PanelRegion
          key={i}
          panel={panel}
          fields={template.fields ?? {}}
          fieldContent={fieldContent}
          containerH={containerH}
        />
      ))}
    </>
  );
}

function AbsoluteRegion({
  region,
  children,
}: {
  region: BackdropRegion;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${region.x}%`,
        top: `${region.y}%`,
        width: `${region.width}%`,
        height: `${region.height}%`,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

function PhotoWithFallback({
  url,
  alt,
  circle,
  ringUrl,
}: {
  url: string | null;
  alt: string;
  circle: boolean;
  ringUrl?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const shapeStyle: CSSProperties = circle ? { borderRadius: '50%' } : { borderRadius: '8px' };
  const hasPhoto = url && !failed;

  const containerRef = useRef<HTMLDivElement>(null);
  const [boxSize, setBoxSize] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const paddingLeft = parseFloat(style.paddingLeft || '0');
      const paddingRight = parseFloat(style.paddingRight || '0');
      const paddingTop = parseFloat(style.paddingTop || '0');
      const paddingBottom = parseFloat(style.paddingBottom || '0');

      const contentW = rect.width - paddingLeft - paddingRight;
      const contentH = rect.height - paddingTop - paddingBottom;
      const size = Math.min(contentW, contentH);
      setBoxSize(size > 0 ? size : null);
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...(boxSize !== null
            ? {
                width: boxSize,
                height: boxSize,
              }
            : {
                width: '100%',
                maxHeight: '100%',
                aspectRatio: '1/1',
              }),
        }}
      >
        {/* 1. Khung viền vàng nằm dưới, phủ trọn khung vuông chuẩn */}
        {ringUrl && (
          <img
            src={ringUrl}
            alt="ring"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        )}

        {/* 2. Phần ruột (Ảnh sinh viên hoặc Placeholder) nằm trên, co về 80% để nằm lọt lòng viền vàng */}
        <div
          style={{
            position: 'relative',
            width: ringUrl ? '80%' : '100%',
            height: ringUrl ? '80%' : '100%',
            ...shapeStyle,
            overflow: 'hidden',
            zIndex: 2,
          }}
        >
          {hasPhoto ? (
            <img
              src={url}
              alt={alt}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
              onError={() => setFailed(true)}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                background: 'rgba(255,255,255,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem',
                opacity: 0.6,
              }}
            >
              Không có ảnh
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const DEFAULT_FIELD_ORDER = [
  'template_type',
  'title',
  'full_name',
  'major_name',
  'classification',
  'quote',
];

function PanelRegion({
  panel,
  fields,
  fieldContent,
  containerH,
}: {
  panel: BackdropPanel;
  fields: Record<string, BackdropFieldOverride>;
  fieldContent: Record<string, React.ReactNode>;
  containerH: number;
}) {
  const gapPx = containerH > 0 ? ((panel.gap ?? 1) / 100) * containerH : (panel.gap ?? 1) * 8;

  const visibleFields = (panel.fieldOrder ?? DEFAULT_FIELD_ORDER).filter((key: string) => {
    const override = fields[key];
    if (override?.show === false) return false;
    const content = override?.text !== undefined ? override.text : fieldContent[key];
    return content != null && content !== '';
  });

  const justify =
    panel.vAlign === 'bottom' ? 'flex-end' : panel.vAlign === 'center' ? 'center' : 'flex-start';

  return (
    <div
      style={{
        position: 'absolute',
        left: `${panel.x}%`,
        top: `${panel.y}%`,
        width: `${panel.width}%`,
        height: `${panel.height}%`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justify,
        alignItems:
          panel.align === 'right' ? 'flex-end' : panel.align === 'center' ? 'center' : 'flex-start',
        gap: `${gapPx}px`,
        overflow: 'hidden',
      }}
    >
      {visibleFields.map((key: string) => {
        const override = fields[key] ?? {};
        const merged: BackdropTextStyle = {
          align: override.align ?? panel.align,
          fontSize: override.fontSize ?? panel.fontSize,
          fontWeight: override.fontWeight ?? panel.fontWeight,
          color: override.color ?? panel.color,
          italic: override.italic ?? panel.italic,
          uppercase: override.uppercase ?? panel.uppercase,
        };
        const rawContent = override.text !== undefined ? override.text : fieldContent[key];
        const content = override.prefix ? (
          <>
            <span style={override.prefixFontWeight !== undefined ? { fontWeight: override.prefixFontWeight } : undefined}>
              {override.prefix}
            </span>
            {rawContent}
          </>
        ) : (
          rawContent
        );
        return (
          <PanelField key={key} style={merged} fieldKey={key} containerH={containerH}>
            {content}
          </PanelField>
        );
      })}
    </div>
  );
}

function PanelField({
  style: s,
  fieldKey,
  containerH,
  children,
}: {
  style: BackdropTextStyle;
  fieldKey: string;
  containerH: number;
  children: React.ReactNode;
}) {
  const fontSizePx =
    containerH > 0 ? ((s.fontSize ?? 3) / 100) * containerH : (s.fontSize ?? 3) * 8;

  const css: CSSProperties = {
    fontSize: `${fontSizePx}px`,
    fontWeight: s.fontWeight ?? 400,
    fontStyle: s.italic ? 'italic' : 'normal',
    color: s.color ?? '#fff',
    textTransform: s.uppercase ? 'uppercase' : 'none',
    textAlign: s.align ?? 'left',
    lineHeight: 1.3,
    wordBreak: 'break-word',
    maxWidth: '100%',
    whiteSpace: 'pre-line',
    ...((fieldKey === 'template_type' || fieldKey === 'title') ? { fontFamily: '"Times New Roman", Times, serif' } : {}),
  };

  return <div style={css}>{children}</div>;
}
