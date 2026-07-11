import { useState, useEffect, useRef, useMemo } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useControlStore } from '../../store';
import { useSocketRef } from '../../SocketContext';
import { resolveAsset } from '../../../lib/assets';
import {
  DynamicBackdropView,
  resolveTemplateVariant,
  type BackdropAspectRatio,
  type BackdropTemplateMap,
  type BackdropTemplate,
  type Student,
  type BackdropFieldOverride,
} from '@sky-app/slide-shared';

const LAYOUT_OPTIONS = [
  { value: 'layout-1', labelKey: 'layoutConfig.layoutOption.layout1' },
  { value: 'layout-3', labelKey: 'layoutConfig.layoutOption.layout3' },
];

const PREVIEW_ASPECT_RATIOS: BackdropAspectRatio[] = ['16:9', '25:9'];

const CONFIGURABLE_FIELDS = [
  { key: 'template_type', labelKey: 'layoutConfig.field.templateType' },
  { key: 'title', labelKey: 'layoutConfig.field.title' },
  { key: 'full_name', labelKey: 'layoutConfig.field.fullName' },
  { key: 'major_name', labelKey: 'layoutConfig.field.majorName' },
  { key: 'classification', labelKey: 'layoutConfig.field.classification' },
  { key: 'quote', labelKey: 'layoutConfig.field.quote' },
];

/** Nội dung cấu hình layout backdrop — nhúng làm 1 tab trong SettingsModal. */
export function LayoutConfigContent() {
  const { t } = useTranslation();
  const socket = useSocketRef();
  const ceremony = useControlStore((s) => s.ceremony);
  const layoutOverrides = useControlStore((s) => s.layoutOverrides || {});
  const students = useControlStore((s) => s.students);

  const [layouts, setLayouts] = useState<BackdropTemplateMap | null>(null);
  const [selectedLayoutKey, setSelectedLayoutKey] = useState<string>('layout-1');

  // Local state for edits before saving
  const [localOverrides, setLocalOverrides] = useState<Record<string, Partial<BackdropTemplate>>>(
    JSON.parse(JSON.stringify(layoutOverrides))
  );

  // Toggle xem trước 16:9/25:9 — độc lập với tỷ lệ đang chiếu thật (chỉ để kiểm tra layout).
  const [previewAspectRatio, setPreviewAspectRatio] = useState<BackdropAspectRatio>('16:9');

  // Fetch base layouts
  useEffect(() => {
    if (ceremony?.backdrops_config) {
      fetch(resolveAsset(ceremony.backdrops_config))
        .then((r) => r.json())
        .then((data) => setLayouts(data))
        .catch(console.error);
    }
  }, [ceremony]);

  const handleSave = () => {
    socket.current?.emit('cmd:setLayoutOverrides', { overrides: localOverrides });
  };

  const handleReset = () => {
    setLocalOverrides({ ...localOverrides, [selectedLayoutKey]: {} });
  };

  const updateField = (fieldKey: string, patch: Partial<BackdropFieldOverride>) => {
    setLocalOverrides((prev) => {
      const layoutOverride = prev[selectedLayoutKey] || {};
      const fields = layoutOverride.fields || {};
      const newFieldOverride = { ...(fields[fieldKey] || {}) };

      // Update or remove keys based on patch
      Object.keys(patch).forEach((k) => {
        const key = k as keyof BackdropFieldOverride;
        if (patch[key] === undefined || patch[key] === '') {
          delete newFieldOverride[key];
        } else {
          // @ts-ignore
          newFieldOverride[key] = patch[key];
        }
      });

      return {
        ...prev,
        [selectedLayoutKey]: {
          ...layoutOverride,
          fields: {
            ...fields,
            [fieldKey]: newFieldOverride,
          },
        },
      };
    });
  };

  // Build the template to preview
  const previewTemplate = useMemo(() => {
    if (!layouts) return null;
    const baseLayout = layouts[selectedLayoutKey] || layouts['default'];
    if (!baseLayout) return null;

    const override = localOverrides[selectedLayoutKey] || {};
    return {
      ...baseLayout,
      ...override,
      fields: {
        ...(baseLayout.fields || {}),
        ...(override.fields || {})
      }
    };
  }, [layouts, selectedLayoutKey, localOverrides]);

  // Template hiệu lực theo tỷ lệ đang xem trước (image/avatar/panels theo variant nếu có)
  const effectivePreviewTemplate = useMemo(() => {
    if (!previewTemplate) return null;
    const v = resolveTemplateVariant(previewTemplate, previewAspectRatio);
    return { ...previewTemplate, image: v.image, avatar: v.avatar, panels: v.panels };
  }, [previewTemplate, previewAspectRatio]);

  // Preview container dimensions
  const previewRef = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(0);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setContainerH(entries[0].contentRect.height);
    });
    ro.observe(el);
    setContainerH(el.clientHeight);
    return () => ro.disconnect();
  }, [selectedLayoutKey]);

  // Fake student for preview
  const sampleStudent: Student = students[0] ?? {
    id: '1',
    student_code: 'SV001',
    display_order: 1,
    full_name: 'Nguyễn Văn Mẫu',
    date_of_birth: '2000-01-01',
    major_name: 'Công nghệ thông tin',
    faculty_name: 'CNTT',
    class_code: 'IT1',
    course_code: 'K1',
    phone_number: '',
    identity_number: '',
    email: '',
    gpa: 3.5,
    classification: 'Giỏi',
    classification_type: 1,
    achievement_title: 'Không',
    award_type: 'TOTNGHIEP',
    award_type_code: '1',
    award_content: 'Cử nhân CNTT',
    presentation_template_type: 'LỄ TRAO BẰNG TỐT NGHIỆP',
    presentation_template_type_code: '1',
    quote: 'Học, học nữa, học mãi!',
    image_file_name: '',
    image_relative_path: '',
    graduation_batch_id: '1',
    batch_name: 'Đợt 1',
    degree_award_status: '1',
    status: 'registered',
    ts_checkin: null,
    ts_called: null,
    ts_on_stage: null,
    ts_returned: null,
    src_on_stage: null,
    staff_presenter: null,
  };

  return (
    <div className="flex min-h-0 h-full divide-x divide-border -m-6">
      {/* CỘT TRÁI: Cấu hình */}
      <div className="w-[400px] flex-shrink-0 p-6 overflow-y-auto flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm-13 font-semibold text-foreground">{t('layoutConfig.selectLayout')}</label>
          <select
            value={selectedLayoutKey}
            onChange={(e) => setSelectedLayoutKey(e.target.value)}
            className="bg-muted hover:bg-muted text-foreground text-sm font-bold rounded-lg px-3 py-2 focus:outline-none transition-colors border-none cursor-pointer"
          >
            {LAYOUT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-4">
          <div className="text-xs font-bold text-primary tracking-wider uppercase">{t('layoutConfig.fieldsSectionTitle')}</div>

          {CONFIGURABLE_FIELDS.map(field => {
            const override = localOverrides[selectedLayoutKey]?.fields?.[field.key] || {};
            const show = override.show ?? true;

            return (
              <div key={field.key} className="flex flex-col gap-2 p-3 border border-border rounded-xl bg-muted/50">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={show}
                      onChange={(e) => updateField(field.key, { show: e.target.checked })}
                      className="h-4 w-4 accent-indigo-600 rounded"
                    />
                    <span className="text-sm font-semibold text-foreground">{t(field.labelKey)}</span>
                  </label>
                </div>

                {show && (
                  <div className="flex flex-col gap-3 mt-1">
                    {['title', 'template_type'].includes(field.key) && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xxs font-medium text-muted-foreground">{t('layoutConfig.customContentHint')}</span>
                        <input
                          type="text"
                          placeholder={t('layoutConfig.customContentPlaceholder')}
                          value={override.text ?? ''}
                          onChange={(e) => updateField(field.key, { text: e.target.value || undefined })}
                          className="text-xs px-2.5 py-1.5 rounded border border-border bg-card w-full"
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-xxs font-medium text-muted-foreground">{t('layoutConfig.textColor')}</span>
                        <input
                          type="text"
                          placeholder="#FFFFFF"
                          value={override.color || ''}
                          onChange={(e) => updateField(field.key, { color: e.target.value || undefined })}
                          className="text-xs px-2.5 py-1.5 rounded border border-border bg-card"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xxs font-medium text-muted-foreground">{t('layoutConfig.fontSize')}</span>
                        <input
                          type="number"
                          step="0.1"
                          placeholder={t('layoutConfig.fontSizeDefault')}
                          value={override.fontSize || ''}
                          onChange={(e) => updateField(field.key, { fontSize: e.target.value ? parseFloat(e.target.value) : undefined })}
                          className="text-xs px-2.5 py-1.5 rounded border border-border bg-card"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CỘT PHẢI: Preview */}
      <div className="flex-1 bg-foreground p-6 flex flex-col relative min-w-0">
        <div className="flex justify-between items-center mb-4 text-background">
          <span className="text-sm font-bold opacity-80">{t('layoutConfig.preview')}</span>
          <div className="flex gap-2">
            {PREVIEW_ASPECT_RATIOS.map((ar) => (
              <button
                key={ar}
                onClick={() => setPreviewAspectRatio(ar)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  previewAspectRatio === ar
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background/10 hover:bg-background/20 text-background'
                }`}
              >
                {ar}
              </button>
            ))}
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/10 hover:bg-background/20 text-background text-xs font-semibold transition-colors"
            >
              <RefreshCw size={14} /> {t('layoutConfig.reset')}
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-colors"
            >
              <Save size={14} /> {t('layoutConfig.saveConfig')}
            </button>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center overflow-hidden">
          <div
            className="relative bg-black w-full rounded overflow-hidden border border-border/50 shadow-2xl"
            ref={previewRef}
            style={{
              aspectRatio: previewAspectRatio === '25:9' ? '25 / 9' : '16 / 9',
              backgroundImage: effectivePreviewTemplate?.image ? `url("${resolveAsset(effectivePreviewTemplate.image)}")` : 'none',
              backgroundSize: '100% 100%',
              backgroundPosition: 'center',
            }}
          >
            {effectivePreviewTemplate && (
              <DynamicBackdropView
                student={sampleStudent}
                template={effectivePreviewTemplate}
                resolveAsset={resolveAsset}
                containerH={containerH}
              />
            )}
          </div>
        </div>
        <p className="text-xxs text-muted-foreground mt-4 text-center">
          {t('layoutConfig.previewNote')}
        </p>
      </div>
    </div>
  );
}
