// LayoutConfigPanel — PHỤ LỤC "Event Hub" (2026-07-22). Gộp Bước 3 (LayoutRuleTable + màn chờ)
// và Bước 4 (EventFieldMapEditor) cũ của CreateEventWizard.tsx thành 1 panel ĐỘC LẬP mở từ Hub —
// TÁI DÙNG NGUYÊN VẸN 2 component con đó (không viết lại logic bên trong). Có 2 khu vực con
// (tab nội bộ) thay vì 2 "bước" tuyến tính, và tự lưu qua `eventPort.save()` khi bấm "Lưu cấu
// hình layout" — KHÔNG đợi "Hoàn tất" toàn wizard như cũ, đúng tinh thần Hub "mỗi chức năng tự
// lưu độc lập".

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetPort, DataSourcePort, EventPort, LayoutPort } from '@sky-app/service-contracts';
import type { CustomVariable, EventDocument, EventLayoutRef } from '@sky-app/slide-shared';
import { LayoutRuleTable, LayoutPickerButton, type LayoutRuleRow } from './LayoutRuleTable.js';
import { EventFieldMapEditor } from './EventFieldMapEditor.js';
import { Button } from './components/ui/Button.js';
import { showErrorToast, showSuccessToast } from './lib/toast.js';

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** Tách EventLayoutRef[] thành rows (LayoutRuleTable) + defaultRef + idleLayoutRef — theo đúng
 * quy tắc `role` đã chốt (award/idle) từ CreateEventWizard.tsx cũ (di chuyển nguyên vẹn). */
function splitLayoutRefs(layoutRefs: EventLayoutRef[]): {
  rows: LayoutRuleRow[];
  defaultRef: EventLayoutRef | undefined;
  idleLayoutRef: EventLayoutRef | undefined;
} {
  const idleRefs = layoutRefs.filter((r) => r.role === 'idle');
  const idleLayoutRef = idleRefs[idleRefs.length - 1];
  const awardRefs = layoutRefs.filter((r) => r.role !== 'idle');
  const withoutSelector = awardRefs.filter((r) => !r.selector);
  const defaultRef = withoutSelector[withoutSelector.length - 1];
  const rest = awardRefs.filter((r) => r !== defaultRef);
  return {
    rows: rest.map((ref) => ({ id: newId('rule'), label: '', ref })),
    defaultRef,
    idleLayoutRef,
  };
}

interface LayoutConfigPanelProps {
  event: EventDocument;
  eventPort: EventPort;
  layoutPort: LayoutPort;
  assetPort: AssetPort | undefined;
  dataSourcePort: DataSourcePort | undefined;
  onSaved: (updated: EventDocument) => void;
  onBack: () => void;
}

export function LayoutConfigPanel({ event, eventPort, layoutPort, assetPort, dataSourcePort, onSaved, onBack }: LayoutConfigPanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'rules' | 'fieldMap'>('rules');
  const [submitting, setSubmitting] = useState(false);
  const [attrSuggestions, setAttrSuggestions] = useState<string[]>([]);

  const initialSplit = splitLayoutRefs(event.layoutRefs);
  const [layoutRuleRows, setLayoutRuleRows] = useState<LayoutRuleRow[]>(initialSplit.rows);
  const [defaultLayoutRef, setDefaultLayoutRef] = useState<EventLayoutRef | undefined>(initialSplit.defaultRef);
  const [idleLayoutRef, setIdleLayoutRef] = useState<EventLayoutRef | undefined>(initialSplit.idleLayoutRef);
  const [customVariables, setCustomVariables] = useState<CustomVariable[]>(event.customVariables);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!event.dataSourceId || !dataSourcePort) {
        setAttrSuggestions([]);
        return;
      }
      try {
        const ds = await dataSourcePort.get(event.dataSourceId);
        if (!ds?.mappingProfileId) {
          if (!cancelled) setAttrSuggestions([]);
          return;
        }
        const profiles = await dataSourcePort.listFieldMappingProfiles();
        const profile = profiles.find((p) => p.id === ds.mappingProfileId);
        if (!cancelled) setAttrSuggestions(profile ? Object.keys(profile.map) : []);
      } catch {
        if (!cancelled) setAttrSuggestions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event.dataSourceId, dataSourcePort]);

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const layoutRefs: EventLayoutRef[] = [
        ...layoutRuleRows.map((r) => ({ ...r.ref, role: 'award' as const })),
        ...(defaultLayoutRef ? [{ ...defaultLayoutRef, role: 'award' as const }] : []),
        ...(idleLayoutRef ? [{ ...idleLayoutRef, role: 'idle' as const }] : []),
      ];
      const updated: EventDocument = { ...event, layoutRefs, customVariables, updatedAt: new Date().toISOString() };
      await eventPort.save(updated);
      showSuccessToast(t('layoutConfigPanel.saveSuccess'));
      onSaved(updated);
    } catch (err) {
      showErrorToast(t('layoutConfigPanel.saveError', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-auto">
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => setTab('rules')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'rules' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('layoutConfigPanel.tabRules')}
        </button>
        <button
          type="button"
          onClick={() => setTab('fieldMap')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'fieldMap' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('layoutConfigPanel.tabFieldMap')}
        </button>
      </div>

      {tab === 'rules' && (
        <div className="flex flex-col gap-3">
          <LayoutRuleTable
            rows={layoutRuleRows}
            onChange={setLayoutRuleRows}
            defaultRef={defaultLayoutRef}
            onChangeDefaultRef={setDefaultLayoutRef}
            layoutPort={layoutPort}
            assetPort={assetPort}
            attrSuggestions={attrSuggestions}
          />
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3">
            <span className="flex-1 text-sm font-medium text-foreground">{t('createEventWizard.idleLayoutLabel')}</span>
            <LayoutPickerButton
              layoutId={idleLayoutRef?.layoutId ?? ''}
              layoutVersion={idleLayoutRef?.layoutVersion ?? 0}
              layoutPort={layoutPort}
              assetPort={assetPort}
              onPick={(ref) =>
                setIdleLayoutRef({
                  layoutId: ref.layoutId,
                  layoutVersion: ref.layoutVersion,
                  fieldMap: idleLayoutRef?.layoutId === ref.layoutId ? idleLayoutRef.fieldMap : {},
                  role: 'idle',
                })
              }
            />
          </div>
        </div>
      )}

      {tab === 'fieldMap' && (
        <EventFieldMapEditor
          rows={layoutRuleRows}
          onChangeRows={setLayoutRuleRows}
          defaultRef={defaultLayoutRef}
          onChangeDefaultRef={setDefaultLayoutRef}
          idleLayoutRef={idleLayoutRef}
          onChangeIdleLayoutRef={setIdleLayoutRef}
          layoutPort={layoutPort}
          attrSuggestions={attrSuggestions}
          customVariables={customVariables}
          onChangeCustomVariables={setCustomVariables}
        />
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <Button variant="secondary" onClick={onBack}>
          {t('createEventWizard.backButton')}
        </Button>
        <Button variant="primary" loading={submitting} onClick={() => void handleSave()}>
          {t('layoutConfigPanel.saveButton')}
        </Button>
      </div>
    </div>
  );
}
