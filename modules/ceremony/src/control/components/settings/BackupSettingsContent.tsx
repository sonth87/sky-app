import { useRef, useState } from 'react';
import { AlertTriangle, Download, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useControlStore, type AppFont } from '../../store';
import { useSocketRef } from '../../SocketContext';
import { cn } from '../../lib/cn';
import { showErrorToast, showSuccessToast } from '../../lib/toast';
import {
  buildBackupFile,
  downloadJsonFile,
  parseSettingsBackupFile,
  SETTINGS_GROUP_KEYS,
  type ParsedSettingsGroup,
  type SettingsGroupKey,
} from '../../lib/settingsBackup';

const GROUP_LABELS: Record<SettingsGroupKey, string> = {
  apiConfig: 'backupSettings.group.apiConfig',
  customVariables: 'backupSettings.group.customVariables',
  layoutOverrides: 'backupSettings.group.layoutOverrides',
  tts: 'backupSettings.group.tts',
  appearance: 'backupSettings.group.appearance',
};

/** Tab Backup của SettingsModal — export/import chọn lọc nhiều nhóm cấu hình cùng lúc (không phải dữ liệu sự kiện). */
export function BackupSettingsContent() {
  const { t } = useTranslation();
  const socket = useSocketRef();
  const [mode, setMode] = useState<'export' | 'import'>('export');

  // --- Export ---
  const [exportSelection, setExportSelection] = useState<Set<SettingsGroupKey>>(new Set());
  const [exporting, setExporting] = useState(false);

  const toggleExportGroup = (key: SettingsGroupKey) => {
    setExportSelection((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleExport = async () => {
    if (exportSelection.size === 0) return;
    setExporting(true);
    try {
      const state = useControlStore.getState();
      const groups: Partial<Record<SettingsGroupKey, unknown>> = {};

      if (exportSelection.has('apiConfig')) {
        groups.apiConfig = await window.slide.getApiIntegrations();
      }
      if (exportSelection.has('customVariables')) {
        groups.customVariables = state.customVariables;
      }
      if (exportSelection.has('layoutOverrides')) {
        groups.layoutOverrides = state.layoutOverrides;
      }
      if (exportSelection.has('tts')) {
        groups.tts = {
          ttsDelay: state.ttsDelay,
          ttsTemplate: state.ttsTemplate,
          ttsPlayMode: state.ttsPlayMode,
          ttsConditions: state.ttsConditions,
          ttsVoicePool: state.ttsVoicePool,
        };
      }
      if (exportSelection.has('appearance')) {
        groups.appearance = {
          themeMode: state.themeMode,
          themePalette: state.themePalette,
          appFont: state.appFont,
          letterSpacing: state.letterSpacing,
          appSpacing: state.appSpacing,
          shadowLevel: state.shadowLevel,
        };
      }

      const stamp = new Date().toISOString().slice(0, 10);
      downloadJsonFile(buildBackupFile(groups), `slide-settings-${stamp}.json`);
      showSuccessToast(t('backupSettings.toasts.exportSuccess', { count: exportSelection.size }));
    } catch (err) {
      showErrorToast(t('backupSettings.toasts.exportError', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setExporting(false);
    }
  };

  // --- Import ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedGroups, setParsedGroups] = useState<ParsedSettingsGroup[] | null>(null);
  const [parsedRaw, setParsedRaw] = useState<ReturnType<typeof parseSettingsBackupFile>['data'] | null>(null);
  const [importSelection, setImportSelection] = useState<Set<SettingsGroupKey>>(new Set());
  const [importing, setImporting] = useState(false);

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const { data, groups } = parseSettingsBackupFile(text);
      setParsedRaw(data);
      setParsedGroups(groups);
      setImportSelection(new Set());
    } catch (err) {
      setParsedRaw(null);
      setParsedGroups(null);
      showErrorToast(t('backupSettings.toasts.parseError', { message: err instanceof Error ? err.message : String(err) }));
    }
  };

  const toggleImportGroup = (key: SettingsGroupKey) => {
    setImportSelection((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleImport = async () => {
    if (!parsedRaw || importSelection.size === 0) return;
    setImporting(true);
    try {
      if (importSelection.has('apiConfig') && parsedRaw.apiConfig) {
        await window.slide.setApiIntegrations(parsedRaw.apiConfig);
      }
      if (importSelection.has('customVariables') && parsedRaw.customVariables) {
        socket.current?.emit('cmd:setCustomVariables', { variables: parsedRaw.customVariables });
      }
      if (importSelection.has('layoutOverrides') && parsedRaw.layoutOverrides) {
        socket.current?.emit('cmd:setLayoutOverrides', { overrides: parsedRaw.layoutOverrides });
      }
      if (importSelection.has('tts') && parsedRaw.tts) {
        const ttsGroup = parsedRaw.tts;
        if (ttsGroup.ttsDelay !== undefined) socket.current?.emit('cmd:setTtsDelay', { delay: ttsGroup.ttsDelay });
        if (ttsGroup.ttsTemplate !== undefined) socket.current?.emit('cmd:setTtsTemplate', { template: ttsGroup.ttsTemplate });
        if (ttsGroup.ttsPlayMode !== undefined) socket.current?.emit('cmd:setTtsPlayMode', { playMode: ttsGroup.ttsPlayMode });
        if (ttsGroup.ttsConditions !== undefined) socket.current?.emit('cmd:setTtsConditions', { conditions: ttsGroup.ttsConditions });
        if (ttsGroup.ttsVoicePool !== undefined) socket.current?.emit('cmd:setTtsVoicePool', { voicePool: ttsGroup.ttsVoicePool });
      }
      if (importSelection.has('appearance') && parsedRaw.appearance) {
        const a = parsedRaw.appearance;
        const s = useControlStore.getState();
        if (a.themeMode !== undefined) s.setThemeMode(a.themeMode);
        if (a.themePalette !== undefined) s.setThemePalette(a.themePalette);
        if (a.appFont !== undefined) s.setAppFont(a.appFont as AppFont);
        if (a.letterSpacing !== undefined) s.setLetterSpacing(a.letterSpacing);
        if (a.appSpacing !== undefined) s.setAppSpacing(a.appSpacing);
        if (a.shadowLevel !== undefined) s.setShadowLevel(a.shadowLevel);
      }

      showSuccessToast(t('backupSettings.toasts.importSuccess', { count: importSelection.size }));
      setParsedRaw(null);
      setParsedGroups(null);
      setImportSelection(new Set());
    } catch (err) {
      showErrorToast(t('backupSettings.toasts.importError', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <button
          onClick={() => setMode('export')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors',
            mode === 'export'
              ? 'bg-primary border-primary text-primary-foreground shadow-sm'
              : 'bg-card border-border text-foreground hover:border-primary/50'
          )}
        >
          <Download size={15} />
          {t('backupSettings.exportTab')}
        </button>
        <button
          onClick={() => setMode('import')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors',
            mode === 'import'
              ? 'bg-primary border-primary text-primary-foreground shadow-sm'
              : 'bg-card border-border text-foreground hover:border-primary/50'
          )}
        >
          <Upload size={15} />
          {t('backupSettings.importTab')}
        </button>
      </div>

      {mode === 'export' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">{t('backupSettings.exportHint')}</p>
          <div className="flex flex-col gap-2">
            {SETTINGS_GROUP_KEYS.map((key) => (
              <label
                key={key}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-card cursor-pointer hover:border-primary/50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={exportSelection.has(key)}
                  onChange={() => toggleExportGroup(key)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm font-medium text-foreground">{t(GROUP_LABELS[key])}</span>
              </label>
            ))}
          </div>
          <button
            onClick={handleExport}
            disabled={exportSelection.size === 0 || exporting}
            className={cn(
              'flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors',
              exportSelection.size === 0 || exporting
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            <Download size={15} />
            {t('backupSettings.exportButton')}
          </button>
        </div>
      )}

      {mode === 'import' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">{t('backupSettings.importHint')}</p>
          <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleFileChange} />
          <button
            onClick={handlePickFile}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-border bg-card text-foreground hover:border-primary/50 transition-colors"
          >
            <Upload size={15} />
            {t('backupSettings.chooseFile')}
          </button>

          {parsedGroups && parsedGroups.every((g) => !g.present) && (
            <p className="text-xs text-destructive">{t('backupSettings.noGroupsFound')}</p>
          )}

          {parsedGroups && (
            <div className="flex flex-col gap-2">
              {parsedGroups
                .filter((g) => g.present)
                .map((g) => (
                  <label
                    key={g.key}
                    className={cn(
                      'flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-colors',
                      g.valid ? 'border-border bg-card hover:border-primary/50 cursor-pointer' : 'border-destructive/40 bg-destructive/5 cursor-not-allowed'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={importSelection.has(g.key)}
                      onChange={() => g.valid && toggleImportGroup(g.key)}
                      disabled={!g.valid}
                      className="h-4 w-4 mt-0.5 accent-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground">{t(GROUP_LABELS[g.key])}</span>
                      {!g.valid && (
                        <div className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
                          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                          <span>{g.errors.join('; ')}</span>
                        </div>
                      )}
                    </div>
                  </label>
                ))}
            </div>
          )}

          {parsedGroups && (
            <button
              onClick={handleImport}
              disabled={importSelection.size === 0 || importing}
              className={cn(
                'flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                importSelection.size === 0 || importing
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              <Upload size={15} />
              {t('backupSettings.importButton')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
