// ImportDataPanel — PHỤ LỤC "Event Hub" (2026-07-22). Thay Step2ImportData cũ (trong
// CreateEventWizard.tsx) — giờ là panel ĐỘC LẬP mở từ Hub, KHÔNG còn là "bước" bắt buộc của
// wizard tuyến tính. Event đã TỒN TẠI thật (có `eventId`) trước khi panel này mở — dùng thẳng
// làm batchId cho voice pregen trong ZIP, giải quyết đúng vướng mắc ban đầu (Event chưa tồn tại
// lúc Bước 2 cũ).
//
// Hỗ trợ 3 nguồn: CSV, Excel (.xlsx/.xls, qua parseSpreadsheet đã có từ Giai đoạn 4a), và ZIP
// (records.json/records.csv + image/ + voice/ tuỳ chọn — CHỈ Electron, DataSourcePort.pickZipFile
// undefined trên Web → nhánh ZIP disable, báo "chưa hỗ trợ trên Web"). Field-mapping dùng CHUNG
// cho cả 3 nguồn (records từ ZIP vẫn là dữ liệu THÔ, đi qua applyMapping y hệt CSV rời).

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileArchive, AlertTriangle } from 'lucide-react';
import type { DataSourcePort } from '@sky-app/service-contracts';
import type { CanonicalGroup, CanonicalSubject, FieldMappingProfile, ImportRowError, MappingRule } from '@sky-app/slide-shared';
import { applyMapping, detectDuplicateNaturalKeys } from '@sky-app/slide-shared';
import { useEventStore } from './eventStore.js';
import { parseSpreadsheet, type ParsedSpreadsheet } from './lib/parseSpreadsheet.js';
import { Button } from './components/ui/Button.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select.js';
import { showErrorToast, showSuccessToast } from './lib/toast.js';

const CORE_FIELDS = ['full_name', 'image_relative_path', 'status'] as const;

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

interface ZipState {
  stagingDir: string;
  hasImageDir: boolean;
  hasVoiceDir: boolean;
}

interface ImportDataPanelProps {
  eventId: string;
  dataSourcePort: DataSourcePort;
  onImported: (dataSourceId: string) => void;
  onBack: () => void;
}

export function ImportDataPanel({ eventId, dataSourcePort, onImported, onBack }: ImportDataPanelProps) {
  const { t } = useTranslation();
  const { createDataSource, importRecords, listFieldMappingProfiles, saveFieldMappingProfile } = useEventStore();

  const [parsed, setParsed] = useState<ParsedSpreadsheet | null>(null);
  const [zip, setZip] = useState<ZipState | null>(null);
  const [fileName, setFileName] = useState('');
  const [dsLabel, setDsLabel] = useState('');
  const [subjectType, setSubjectType] = useState('student');
  const [naturalKeyField, setNaturalKeyField] = useState('');
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'pooled' | 'consumable'>('consumable');
  const [savedProfiles, setSavedProfiles] = useState<FieldMappingProfile[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [rowErrors, setRowErrors] = useState<ImportRowError[]>([]);

  const zipSupported = typeof dataSourcePort.pickZipFile === 'function';

  const buildProfile = (): FieldMappingProfile => {
    const map: Record<string, MappingRule> = {};
    for (const [column, target] of Object.entries(columnMap)) {
      if (!target) continue;
      const key = target.startsWith('extra:') ? target.slice('extra:'.length) : target;
      if (key) map[key] = { kind: 'from', from: column };
    }
    return { id: newId('profile'), label: dsLabel || fileName, subjectType, naturalKeyField, map };
  };

  const mappedRows = useMemo(() => {
    if (!parsed) return [];
    const profile = buildProfile();
    return parsed.rows.map((row) => ({ raw: row, canonical: applyMapping(row, profile) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, columnMap, subjectType]);

  const duplicateGroups = useMemo(() => {
    if (!parsed || !naturalKeyField) return [];
    return detectDuplicateNaturalKeys(parsed.rows, naturalKeyField);
  }, [parsed, naturalKeyField]);

  const duplicateIndexes = new Set(duplicateGroups.flat());
  const duplicateCount = duplicateIndexes.size;
  const canImport = parsed != null && naturalKeyField !== '' && dsLabel.trim() !== '' && duplicateCount === 0;

  const loadProfiles = async () => {
    const profiles = await listFieldMappingProfiles(dataSourcePort);
    setSavedProfiles(profiles);
  };

  const resetParsedState = () => {
    setColumnMap({});
    setNaturalKeyField('');
    setRowErrors([]);
    setZip(null);
  };

  const handleFileSelected = async (file: File) => {
    const buffer = await file.arrayBuffer();
    let result: ParsedSpreadsheet;
    try {
      result = parseSpreadsheet(buffer);
    } catch (err) {
      showErrorToast(t('importDataPanel.parseError', { message: err instanceof Error ? err.message : String(err) }));
      return;
    }
    setParsed(result);
    setFileName(file.name);
    setDsLabel((prev) => prev || file.name.replace(/\.(xlsx|xls|csv)$/i, ''));
    resetParsedState();
    void loadProfiles();
  };

  const handlePickZip = async () => {
    if (!dataSourcePort.pickZipFile) return;
    const result = await dataSourcePort.pickZipFile();
    if (!result) return; // huỷ chọn file
    if ('error' in result) {
      showErrorToast(result.error);
      return;
    }
    setParsed({ columns: result.columns, rows: result.rows });
    setZip({ stagingDir: result.stagingDir, hasImageDir: result.hasImageDir, hasVoiceDir: result.hasVoiceDir });
    setFileName(t('importDataPanel.zipFileLabel') as string);
    setDsLabel((prev) => prev || t('importDataPanel.zipDefaultLabel') as string);
    setColumnMap({});
    setNaturalKeyField('');
    setRowErrors([]);
    void loadProfiles();
  };

  const applySavedProfile = (profile: FieldMappingProfile) => {
    setDsLabel(profile.label);
    setSubjectType(profile.subjectType);
    setNaturalKeyField(profile.naturalKeyField);
    const nextMap: Record<string, string> = {};
    for (const [key, rule] of Object.entries(profile.map)) {
      if (rule.kind === 'from') {
        nextMap[rule.from] = (CORE_FIELDS as readonly string[]).includes(key) ? key : `extra:${key}`;
      }
    }
    setColumnMap(nextMap);
  };

  const handleImport = async () => {
    if (!parsed || !naturalKeyField) return;
    const errors: ImportRowError[] = [];
    const total = mappedRows.length;
    setProgress({ done: 0, total });
    try {
      const profile = buildProfile();
      await saveFieldMappingProfile(dataSourcePort, profile);

      const dsId = newId('ds');
      await createDataSource(dataSourcePort, { id: dsId, label: dsLabel.trim(), mode, naturalKeyField, mappingProfileId: profile.id });

      const validRows: Array<{ raw: Record<string, string>; canonical: Omit<CanonicalSubject, 'id' | 'displayOrder'> }> = [];
      mappedRows.forEach((r, index) => {
        const key = r.raw[naturalKeyField];
        if (!key) {
          errors.push({ rowIndex: index, field: naturalKeyField, message: t('importDataPanel.errorMissingKey') as string });
          return;
        }
        if (!r.canonical.full_name) {
          errors.push({ rowIndex: index, field: 'full_name', message: t('importDataPanel.errorMissingFullName') as string });
        }
        validRows.push(r);
      });
      setProgress({ done: Math.round(total * 0.3), total });

      // ZIP có image/voice — copy sau khi biết naturalKeyField + trước khi ghi record (để set
      // image_relative_path đúng theo file đã copy).
      let imageByKey: Record<string, string> = {};
      if (zip && dataSourcePort.confirmZipImport) {
        const zipResult = await dataSourcePort.confirmZipImport({
          stagingDir: zip.stagingDir,
          naturalKeyField,
          eventId,
          rows: validRows.map((r) => r.raw),
        });
        imageByKey = zipResult.imageByKey;
      }
      setProgress({ done: Math.round(total * 0.6), total });

      const records: Array<CanonicalSubject | CanonicalGroup> = validRows.map((r, index) => {
        const key = r.raw[naturalKeyField]!;
        return {
          ...r.canonical,
          id: key,
          displayOrder: index,
          image_relative_path: imageByKey[key] ?? r.canonical.image_relative_path,
        };
      });

      const result = await importRecords(dataSourcePort, dsId, records);
      setProgress({ done: total, total });
      setRowErrors(errors);
      showSuccessToast(t('importDataPanel.importSuccess', { count: result.imported, label: dsLabel.trim() }));
      onImported(dsId);
    } catch (err) {
      showErrorToast(t('importDataPanel.importError', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setProgress(null);
    }
  };

  if (!parsed) {
    return (
      <div className="flex flex-col gap-4">
        <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-center text-sm text-muted-foreground hover:border-primary/50">
          <Upload size={26} />
          {t('importDataPanel.uploadPrompt')}
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileSelected(file);
            }}
          />
        </label>

        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">{t('common.or')}</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          disabled={!zipSupported}
          onClick={() => void handlePickZip()}
          className="flex h-24 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-center text-sm text-muted-foreground hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
          title={zipSupported ? undefined : (t('importDataPanel.zipUnsupportedHint') as string)}
        >
          <FileArchive size={22} />
          {zipSupported ? t('importDataPanel.zipUploadPrompt') : t('importDataPanel.zipUnsupportedHint')}
        </button>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onBack}>
            {t('createEventWizard.backButton')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-auto">
      <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm">
        <span>{t('createEventWizard.uploadedFileLabel', { filename: fileName, rowCount: parsed.rows.length })}</span>
        <button type="button" className="text-xs text-primary underline" onClick={() => setParsed(null)}>
          {t('createEventWizard.changeFileButton')}
        </button>
      </div>

      {zip && (zip.hasImageDir || zip.hasVoiceDir) && (
        <div className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-xs text-info-foreground">
          {zip.hasImageDir && t('importDataPanel.zipHasImages')}
          {zip.hasImageDir && zip.hasVoiceDir && ' · '}
          {zip.hasVoiceDir && t('importDataPanel.zipHasVoices')}
        </div>
      )}

      {savedProfiles.length > 0 && (
        <Select onValueChange={(id) => { const p = savedProfiles.find((sp) => sp.id === id); if (p) applySavedProfile(p); }}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('createEventWizard.mappingProfileExistingPlaceholder') as string} />
          </SelectTrigger>
          <SelectContent>
            {savedProfiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t('createEventWizard.mappingLabelInput')}</span>
          <input
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={dsLabel}
            onChange={(e) => setDsLabel(e.target.value)}
            placeholder={t('createEventWizard.mappingLabelPlaceholder') as string}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t('createEventWizard.mappingSubjectTypeLabel')}</span>
          <select
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={subjectType}
            onChange={(e) => setSubjectType(e.target.value)}
          >
            <option value="student">{t('createEventWizard.mappingSubjectTypeStudent')}</option>
            <option value="employee">{t('createEventWizard.mappingSubjectTypeEmployee')}</option>
            <option value="other">{t('createEventWizard.mappingSubjectTypeOther')}</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t('createEventWizard.mappingNaturalKeyLabel')}</span>
        <select
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          value={naturalKeyField}
          onChange={(e) => setNaturalKeyField(e.target.value)}
        >
          <option value="">{t('createEventWizard.existingDataSourcePlaceholder')}</option>
          {parsed.columns.map((col) => (
            <option key={col} value={col}>
              {col}
            </option>
          ))}
        </select>
      </label>

      <div className="rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-card">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">{t('createEventWizard.mappingColumnHeader')}</th>
              <th className="px-2 py-1.5 text-left font-medium">{t('createEventWizard.mappingFieldHeader')}</th>
            </tr>
          </thead>
          <tbody>
            {parsed.columns.map((col) => (
              <tr key={col} className="border-t border-border">
                <td className="px-2 py-1.5">{col}</td>
                <td className="px-2 py-1.5">
                  <select
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                    value={columnMap[col] ?? ''}
                    onChange={(e) => setColumnMap({ ...columnMap, [col]: e.target.value })}
                  >
                    <option value="">{t('createEventWizard.mappingFieldSkip')}</option>
                    <option value="full_name">{t('createEventWizard.mappingFieldFullName')}</option>
                    <option value="image_relative_path">{t('createEventWizard.mappingFieldImage')}</option>
                    <option value="status">{t('createEventWizard.mappingFieldStatus')}</option>
                    <option value={`extra:${col}`}>{t('createEventWizard.mappingFieldCustom')}</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{t('createEventWizard.previewTitle')}</span>
        <div className="max-h-48 overflow-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-card">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">{t('createEventWizard.mappingFieldFullName')}</th>
                <th className="px-2 py-1.5 text-left font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {mappedRows.map((r, i) => (
                <tr key={i} className={`border-t border-border ${duplicateIndexes.has(i) ? 'bg-destructive/10' : ''}`}>
                  <td className="px-2 py-1.5">{r.canonical.full_name}</td>
                  <td className="px-2 py-1.5">
                    {r.canonical.full_name ? t('createEventWizard.previewOk') : t('createEventWizard.previewMissing')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {duplicateCount > 0 && <div className="text-xs text-destructive">{t('createEventWizard.duplicateWarning', { count: duplicateCount })}</div>}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">{t('createEventWizard.usageModeLabel')}</span>
        <label className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <input type="radio" className="mt-1" name="usageMode" checked={mode === 'pooled'} onChange={() => setMode('pooled')} />
          <div>
            <div className="font-medium">{t('createEventWizard.usageModePooledTitle')}</div>
            <div className="text-xs text-muted-foreground">{t('createEventWizard.usageModePooledDesc')}</div>
          </div>
        </label>
        <label className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <input type="radio" className="mt-1" name="usageMode" checked={mode === 'consumable'} onChange={() => setMode('consumable')} />
          <div>
            <div className="font-medium">{t('createEventWizard.usageModeConsumableTitle')}</div>
            <div className="text-xs text-muted-foreground">{t('createEventWizard.usageModeConsumableDesc')}</div>
          </div>
        </label>
      </div>

      {progress && (
        <div className="flex flex-col gap-1">
          <progress
            value={progress.done}
            max={progress.total}
            className="h-1.5 w-full rounded [&::-webkit-progress-bar]:rounded [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded [&::-webkit-progress-value]:bg-success"
          />
          <span className="text-xs text-muted-foreground">{t('importDataPanel.progressLabel', { done: progress.done, total: progress.total })}</span>
        </div>
      )}

      {rowErrors.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle size={14} />
            {t('importDataPanel.rowErrorsTitle', { count: rowErrors.length })}
          </span>
          <div className="max-h-40 overflow-auto rounded-md border border-destructive/30">
            <table className="w-full text-xs">
              <thead className="bg-destructive/10">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">{t('importDataPanel.rowErrorRow')}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t('importDataPanel.rowErrorField')}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t('importDataPanel.rowErrorMessage')}</th>
                </tr>
              </thead>
              <tbody>
                {rowErrors.map((e, i) => (
                  <tr key={i} className="border-t border-destructive/20">
                    <td className="px-2 py-1.5">{e.rowIndex + 1}</td>
                    <td className="px-2 py-1.5">{e.field ?? '—'}</td>
                    <td className="px-2 py-1.5">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onBack}>
          {t('createEventWizard.backButton')}
        </Button>
        <Button variant="primary" disabled={!canImport} loading={progress != null} onClick={() => void handleImport()}>
          {t('createEventWizard.importButton')}
        </Button>
      </div>
    </div>
  );
}
