import React, { useState, useEffect, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Globe, Plus, Trash2, Download, Upload, Save, FileText } from 'lucide-react';
import { showSuccessToast } from '../../lib/toast';
import type { ApiIntegration } from '@sky-app/slide-shared';
import { useControlStore } from '../../store';
import { useSlide } from '../../lib/slide';

const ACTION_OPTION_KEYS = [
  { value: 'qr_scan', key: 'qrScan' },
  { value: 'play_student', key: 'playStudent' },
  { value: 'welcome_screen', key: 'welcomeScreen' },
  { value: 'backdrop_toggle', key: 'backdropToggle' },
  { value: 'submit_log', key: 'submitLog' },
] as const;

const VARIABLE_SUGGESTION_KEYS: { value: string; key: string; scope: string[] | 'all' }[] = [
  { value: '{{student.student_code}}', key: 'studentCode', scope: ['qr_scan', 'play_student'] },
  { value: '{{student.full_name}}', key: 'fullName', scope: ['qr_scan', 'play_student'] },
  { value: '{{student.phone_number}}', key: 'phoneNumber', scope: ['qr_scan', 'play_student'] },
  { value: '{{student.major_name}}', key: 'majorName', scope: ['qr_scan', 'play_student'] },
  { value: '{{student.class_code}}', key: 'classCode', scope: ['qr_scan', 'play_student'] },
  { value: '{{award_location_code}}', key: 'awardLocationCode', scope: 'all' },
  { value: '{{event}}', key: 'event', scope: 'all' },
  { value: '{{backdrop_open}}', key: 'backdropOpen', scope: ['backdrop_toggle'] },
  { value: '{{logs}}', key: 'logs', scope: ['submit_log'] },
];

// Danh sách field của Student (packages/shared/src/types.ts) dùng cho gợi ý "student.<field>".
const STUDENT_FIELD_KEYS: { key: string }[] = [
  { key: 'student_code' },
  { key: 'display_order' },
  { key: 'full_name' },
  { key: 'gender' },
  { key: 'date_of_birth' },
  { key: 'major_name' },
  { key: 'faculty_name' },
  { key: 'class_code' },
  { key: 'course_code' },
  { key: 'phone_number' },
  { key: 'identity_number' },
  { key: 'email' },
  { key: 'card_code' },
  { key: 'gpa' },
  { key: 'classification' },
  { key: 'classification_type' },
  { key: 'achievement_title' },
  { key: 'award_type' },
  { key: 'award_type_code' },
  { key: 'award_content' },
  { key: 'presentation_template_type' },
  { key: 'quote' },
  { key: 'graduation_batch_id' },
  { key: 'batch_name' },
  { key: 'degree_award_status' },
  { key: 'status' },
  { key: 'staff_presenter' },
];

// Từ khóa gốc trong context template — dùng cho gợi ý cấp 1 (trước dấu chấm).
const TOP_LEVEL_KEYWORD_KEYS: { key: string; isObject?: boolean }[] = [
  { key: 'student', isObject: true },
  { key: 'award_location_code' },
  { key: 'event' },
  { key: 'backdrop_open' },
  { key: 'logs' },
];

interface AutocompleteState {
  target: 'url' | 'payload';
  // Vị trí bắt đầu của "{{" đang gõ dở, để biết chèn/thay thế đoạn nào.
  braceStart: number;
  // Đoạn text đã gõ sau "{{", vd "stu" hoặc "student."
  query: string;
  suggestions: { insertText: string; display: string; label: string }[];
}

// Tìm đoạn "{{<đang gõ dở>" ngay trước vị trí con trỏ (chưa đóng "}}").
function findOpenTemplateTag(text: string, cursor: number): { braceStart: number; query: string } | null {
  const uptoCursor = text.slice(0, cursor);
  const lastOpen = uptoCursor.lastIndexOf('{{');
  if (lastOpen === -1) return null;
  const between = uptoCursor.slice(lastOpen + 2);
  if (between.includes('}}') || between.includes('{{')) return null;
  return { braceStart: lastOpen, query: between };
}

function getAutocompleteSuggestions(
  query: string,
  t: (key: string) => string
): { insertText: string; display: string; label: string }[] {
  if (query.startsWith('student.')) {
    const sub = query.slice('student.'.length).toLowerCase();
    return STUDENT_FIELD_KEYS.filter((f) => f.key.toLowerCase().includes(sub)).map((f) => ({
      insertText: `student.${f.key}`,
      display: `student.${f.key}`,
      label: t(`apiConfig.studentFields.${f.key}`),
    }));
  }
  const q = query.toLowerCase();
  return TOP_LEVEL_KEYWORD_KEYS.filter((k) => k.key.toLowerCase().includes(q)).map((k) => ({
    // Với "object" keyword (student), chèn kèm dấu "." để dropdown tự động chuyển sang gợi ý field bên trong.
    insertText: k.isObject ? `${k.key}.` : k.key,
    display: k.isObject ? `${k.key}.` : k.key,
    label: t(`apiConfig.topLevelKeywords.${k.key}`),
  }));
}

/** Nội dung cấu hình API/webhook tích hợp — nhúng làm 1 tab trong SettingsModal. */
export function ApiConfigContent() {
  const { t } = useTranslation();
  const slide = useSlide('api-integrations');
  const ACTION_OPTIONS = ACTION_OPTION_KEYS.map((opt) => ({
    value: opt.value,
    label: t(`apiConfig.actions.${opt.key}`),
  }));
  const VARIABLE_SUGGESTIONS = VARIABLE_SUGGESTION_KEYS.map((v) => ({
    value: v.value,
    label: t(`apiConfig.variables.${v.key}`),
    scope: v.scope,
  }));
  const [apiIntegrations, setApiIntegrations] = useState<ApiIntegration[]>([]);
  const apiEnvironment = useControlStore((s) => s.apiEnvironment);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasDefaultConfig, setHasDefaultConfig] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Form states
  const [action, setAction] = useState<ApiIntegration['action']>('qr_scan');
  const [method, setMethod] = useState<ApiIntegration['method']>('POST');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([]);
  const [payload, setPayload] = useState('');

  const [isEditingNew, setIsEditingNew] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const payloadRef = useRef<HTMLTextAreaElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  const [autocomplete, setAutocomplete] = useState<AutocompleteState | null>(null);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(0);

  // Load integrations
  useEffect(() => {
    if (!slide) return;
    slide.getApiIntegrations().then((list) => {
      setApiIntegrations(list);
      if (list.length > 0) {
        setSelectedId(list[0].id);
        setIsEditingNew(false);
      } else {
        setSelectedId(null);
        setIsEditingNew(false);
      }
    });

    slide.hasDefaultApiIntegrations().then((hasDefault) => {
      setHasDefaultConfig(hasDefault);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiEnvironment, slide]);

  // Sync selected integration to form
  useEffect(() => {
    if (selectedId) {
      const selected = apiIntegrations.find((i) => i.id === selectedId);
      if (selected) {
        setAction(selected.action);
        setMethod(selected.method);
        setUrl(selected.url);
        setHeaders(selected.headers || []);
        setPayload(selected.payload || '');
        setIsEditingNew(false);
      }
    } else if (!isEditingNew) {
      // Clear form
      setAction('qr_scan');
      setMethod('POST');
      setUrl('');
      setHeaders([]);
      setPayload('');
    }
  }, [selectedId, apiIntegrations, isEditingNew]);

  const envLabel = apiEnvironment === 'prod' ? 'PROD' : 'TEST';
  const envBadgeClass = apiEnvironment === 'prod'
    ? 'border-success/30 bg-success/10 text-success'
    : 'border-warning/30 bg-warning/10 text-warning-foreground';

  // Actions already used
  const usedActions = apiIntegrations
    .filter((i) => i.id !== selectedId)
    .map((i) => i.action);

  const handleAddNew = () => {
    // Find first unused action
    const unused = ACTION_OPTIONS.find((opt) => !usedActions.includes(opt.value as any));
    if (!unused) {
      alert(t('apiConfig.alerts.allActionsConfigured'));
      return;
    }
    setSelectedId(null);
    setIsEditingNew(true);
    setAction(unused.value as any);
    setMethod('POST');
    setUrl('');
    setHeaders([{ key: 'Content-Type', value: 'application/json' }]);
    setPayload('{\n  \n}');
  };

  const handleAddHeader = () => {
    setHeaders([...headers, { key: '', value: '' }]);
  };

  const handleRemoveHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
  };

  const handleHeaderChange = (index: number, field: 'key' | 'value', value: string) => {
    const next = [...headers];
    next[index][field] = value;
    setHeaders(next);
  };

  // Payload là JSON: tự thêm dấu " ở phía nào chưa có sẵn quanh vị trí chèn — người dùng có thể
  // đã tự gõ sẵn 1 bên (vd " mở) — để không phải tự nhớ đặt "{{...}}" đúng cú pháp JSON.
  function wrapWithQuotesIfNeeded(text: string, start: number, end: number, variable: string) {
    const hasQuoteBefore = text[start - 1] === '"';
    const hasQuoteAfter = text[end] === '"';
    return `${hasQuoteBefore ? '' : '"'}${variable}${hasQuoteAfter ? '' : '"'}`;
  }

  const handleInsertVariable = (variable: string) => {
    if (document.activeElement === urlRef.current) {
      const input = urlRef.current;
      if (input) {
        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        const nextUrl = url.substring(0, start) + variable + url.substring(end);
        setUrl(nextUrl);
        setTimeout(() => {
          input.focus();
          input.setSelectionRange(start + variable.length, start + variable.length);
        }, 50);
      }
    } else {
      const textarea = payloadRef.current;
      if (textarea) {
        const start = textarea.selectionStart || 0;
        const end = textarea.selectionEnd || 0;
        const toInsert = wrapWithQuotesIfNeeded(payload, start, end, variable);
        const nextPayload = payload.substring(0, start) + toInsert + payload.substring(end);
        setPayload(nextPayload);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + toInsert.length, start + toInsert.length);
        }, 50);
      } else {
        setPayload(payload + `"${variable}"`);
      }
    }
  };

  // Kiểm tra xem con trỏ có đang gõ dở bên trong "{{...}}" không, để hiện dropdown gợi ý.
  const checkAutocomplete = (target: 'url' | 'payload', text: string, cursor: number) => {
    const open = findOpenTemplateTag(text, cursor);
    if (!open) {
      setAutocomplete(null);
      return;
    }
    const suggestions = getAutocompleteSuggestions(open.query, t);
    if (suggestions.length === 0) {
      setAutocomplete(null);
      return;
    }
    setActiveSuggestionIdx(0);
    setAutocomplete({ target, braceStart: open.braceStart, query: open.query, suggestions });
  };

  const applyAutocompleteSuggestion = (suggestion: { insertText: string; display: string }) => {
    if (!autocomplete) return;
    const el = autocomplete.target === 'url' ? urlRef.current : payloadRef.current;
    const text = autocomplete.target === 'url' ? url : payload;
    const cursor = el ? el.selectionStart ?? text.length : text.length;
    const tagContentStart = autocomplete.braceStart + 2;

    // Nếu chọn "student." (còn đang gõ dở), giữ dropdown mở để tiếp tục gợi ý field bên trong —
    // chưa phải lúc đóng "}}" hay bọc quote vì biến chưa hoàn tất.
    const stillOpen = suggestion.insertText.endsWith('.');
    // "{{...}}" đã có sẵn dấu đóng ngay sau con trỏ chưa (người dùng tự gõ trước đó)?
    const alreadyClosed = text.slice(cursor, cursor + 2) === '}}';

    let nextText: string;
    let nextCursor: number;

    if (!stillOpen && autocomplete.target === 'payload' && !alreadyClosed) {
      // Biến hoàn tất trong payload JSON: tự đóng "}}", và tự thêm dấu " ở phía nào còn thiếu
      // (người dùng có thể đã tự gõ sẵn " mở phía trước) — không cần tự nhớ cú pháp JSON.
      const hasQuoteBefore = text[autocomplete.braceStart - 1] === '"';
      const hasQuoteAfter = text[cursor] === '"';
      const varText = `{{${suggestion.insertText}}}`;
      const insertion = `${hasQuoteBefore ? '' : '"'}${varText}${hasQuoteAfter ? '' : '"'}`;
      nextText = text.slice(0, autocomplete.braceStart) + insertion + text.slice(cursor);
      nextCursor = autocomplete.braceStart + (hasQuoteBefore ? 0 : 1) + varText.length + (hasQuoteAfter ? 0 : 1);
    } else {
      nextText = text.slice(0, tagContentStart) + suggestion.insertText + text.slice(cursor);
      nextCursor = tagContentStart + suggestion.insertText.length;
    }

    if (autocomplete.target === 'url') {
      setUrl(nextText);
    } else {
      setPayload(nextText);
    }

    if (stillOpen) {
      setActiveSuggestionIdx(0);
      setAutocomplete({
        target: autocomplete.target,
        braceStart: autocomplete.braceStart,
        query: suggestion.insertText,
        suggestions: getAutocompleteSuggestions(suggestion.insertText, t),
      });
    } else {
      setAutocomplete(null);
    }

    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      }
    });
  };

  const handleTemplateInputKeyDown = (e: React.KeyboardEvent) => {
    if (!autocomplete || autocomplete.suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIdx((i) => (i + 1) % autocomplete.suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIdx((i) => (i - 1 + autocomplete.suggestions.length) % autocomplete.suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      applyAutocompleteSuggestion(autocomplete.suggestions[activeSuggestionIdx]);
    } else if (e.key === 'Escape') {
      setAutocomplete(null);
    }
  };

  const handleSave = async () => {
    if (!url.trim()) {
      alert(t('apiConfig.alerts.urlRequired'));
      return;
    }
    if (!slide) return;

    const itemToSave: ApiIntegration = {
      id: isEditingNew ? `api-${Date.now()}` : selectedId!,
      action,
      method,
      url: url.trim(),
      headers: headers.filter((h) => h.key.trim() !== ''),
      payload: method !== 'GET' ? payload : '',
    };

    let nextList: ApiIntegration[];
    if (isEditingNew) {
      nextList = [...apiIntegrations, itemToSave];
    } else {
      nextList = apiIntegrations.map((i) => (i.id === selectedId ? itemToSave : i));
    }

    const updated = await slide.setApiIntegrations(nextList);
    setApiIntegrations(updated);
    setSelectedId(itemToSave.id);
    setIsEditingNew(false);
    showSuccessToast(t('apiConfig.toasts.saved'));
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(t('apiConfig.confirms.deleteConfig'))) return;
    if (!slide) return;

    const nextList = apiIntegrations.filter((i) => i.id !== id);
    const updated = await slide.setApiIntegrations(nextList);
    setApiIntegrations(updated);

    if (selectedId === id) {
      if (updated.length > 0) {
        setSelectedId(updated[0].id);
      } else {
        setSelectedId(null);
      }
    }
    showSuccessToast(t('apiConfig.toasts.deleted'));
  };

  const handleExport = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(apiIntegrations, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', 'dnu_api_config.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!slide) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          const validActions = ACTION_OPTIONS.map((o) => o.value);
          const validMethods = ['GET', 'POST', 'PUT', 'DELETE'];
          const valid = parsed.every(
            (item) =>
              item.id &&
              item.url &&
              validActions.includes(item.action) &&
              validMethods.includes(item.method) &&
              Array.isArray(item.headers)
          );
          if (!valid) {
            alert(t('apiConfig.alerts.invalidImportFormat'));
            return;
          }
          const actionSet = new Set(parsed.map((item) => item.action));
          if (actionSet.size !== parsed.length) {
            alert(t('apiConfig.alerts.duplicateActionInImport'));
            return;
          }
          const updated = await slide.setApiIntegrations(parsed);
          setApiIntegrations(updated);
          if (updated.length > 0) {
            setSelectedId(updated[0].id);
          } else {
            setSelectedId(null);
          }
          showSuccessToast(t('apiConfig.toasts.importSuccess'));
        } else {
          alert(t('apiConfig.alerts.importNotArray'));
        }
      } catch {
        alert(t('apiConfig.alerts.cannotReadJsonFile'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleResetToDefault = async () => {
    if (!slide) return;
    setResetLoading(true);
    try {
      const updated = await slide.resetApiIntegrationsToDefault();
      setApiIntegrations(updated);
      if (updated.length > 0) {
        setSelectedId(updated[0].id);
      } else {
        setSelectedId(null);
      }
      setIsEditingNew(false);
      setShowResetConfirm(false);
      showSuccessToast(t('apiConfig.toasts.resetSuccess', { env: envLabel }));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <>
    <div className="flex flex-col h-full -m-6">
    <div className="flex-1 flex min-h-0 divide-x divide-border">
      {/* CỘT TRÁI: Danh sách API */}
      <div className="w-[32%] bg-muted/50 p-5 overflow-y-auto flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {t('apiConfig.configuredCount', { count: apiIntegrations.length })}
          </span>
          <button
            onClick={handleAddNew}
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 hover:bg-primary/10 px-2 py-1 rounded transition-colors"
          >
            <Plus size={14} /> {t('apiConfig.addNew')}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {apiIntegrations.map((item) => {
            const isSelected = item.id === selectedId;
            const opt = ACTION_OPTIONS.find((o) => o.value === item.action);
            return (
              <div
                key={item.id}
                onClick={() => { setSelectedId(item.id); setIsEditingNew(false); }}
                className={`group cursor-pointer rounded-xl p-3 border text-left transition-all duration-150 ${
                  isSelected
                    ? 'bg-primary border-primary text-primary-foreground shadow-md'
                    : 'bg-card border-border text-foreground hover:border-primary/50'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold font-mono tracking-wide">
                    {item.method}
                  </span>
                  <button
                    onClick={(e) => handleDelete(item.id, e)}
                    className={`opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive hover:text-destructive-foreground transition-all ${
                      isSelected ? 'text-primary-foreground/80 hover:bg-primary/90' : 'text-muted-foreground'
                    }`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className={`text-[13px] font-semibold mt-1 truncate ${isSelected ? 'text-primary-foreground' : 'text-foreground'}`}>
                  {opt?.label || item.action}
                </div>
                <div className={`text-[11px] mt-1 truncate font-mono ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                  {item.url}
                </div>
              </div>
            );
          })}

          {apiIntegrations.length === 0 && !isEditingNew && (
            <div className="text-center py-10 text-xs text-muted-foreground">
              {t('apiConfig.emptyList.line1')}
              <br />
              {t('apiConfig.emptyList.line2')}
            </div>
          )}
        </div>
      </div>

      {/* CỘT PHẢI: Form chi tiết */}
      <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-5">
        {selectedId || isEditingNew ? (
          <>
            <div className="flex justify-between items-center border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-foreground">
                  {isEditingNew ? t('apiConfig.createNewTitle') : t('apiConfig.detailTitle')}
                </h3>
                <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${envBadgeClass}`}>
                  {envLabel}
                </span>
              </div>
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-xl text-xs font-semibold shadow transition-colors"
              >
                <Save size={14} /> {t('apiConfig.saveConfig')}
              </button>
            </div>

            {/* Chọn Event/Action */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                {t('apiConfig.triggerEvent')}
              </label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as any)}
                className="border border-border bg-card rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              >
                {ACTION_OPTIONS.map((opt) => {
                  const isDisabled = usedActions.includes(opt.value as any);
                  return (
                    <option key={opt.value} value={opt.value} disabled={isDisabled}>
                      {opt.label} {isDisabled ? t('apiConfig.alreadyUsed') : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Method & URL */}
            <div className="grid grid-cols-4 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                  HTTP Method
                </label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as any)}
                  className="border border-border bg-card rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary font-bold"
                >
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div className="col-span-3 flex flex-col gap-1.5 relative">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                  {t('apiConfig.apiUrl')}
                </label>
                <input
                  ref={urlRef}
                  type="text"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    checkAutocomplete('url', e.target.value, e.target.selectionStart ?? e.target.value.length);
                  }}
                  onKeyDown={handleTemplateInputKeyDown}
                  onClick={(e) => checkAutocomplete('url', url, e.currentTarget.selectionStart ?? url.length)}
                  onBlur={() => setTimeout(() => setAutocomplete(null), 150)}
                  placeholder="https://example.com/api/v1/..."
                  className="border border-border bg-card rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary font-mono"
                />
                {autocomplete?.target === 'url' && (
                  <AutocompleteDropdown
                    autocomplete={autocomplete}
                    activeIdx={activeSuggestionIdx}
                    onHover={setActiveSuggestionIdx}
                    onSelect={applyAutocompleteSuggestion}
                  />
                )}
              </div>
            </div>

            {/* Headers */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                  HTTP Headers
                </label>
                <button
                  onClick={handleAddHeader}
                  className="text-xs font-semibold text-primary hover:text-primary/80 font-medium"
                >
                  + {t('apiConfig.addHeader')}
                </button>
              </div>

              <div className="flex flex-col gap-2 max-h-[140px] overflow-y-auto pr-1">
                {headers.map((h, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={h.key}
                      onChange={(e) => handleHeaderChange(index, 'key', e.target.value)}
                      placeholder={t('apiConfig.headerKeyPlaceholder')}
                      className="flex-1 border border-border bg-card rounded-lg px-2.5 py-1.5 text-xs text-foreground font-mono"
                    />
                    <input
                      type="text"
                      value={h.value}
                      onChange={(e) => handleHeaderChange(index, 'value', e.target.value)}
                      placeholder={t('apiConfig.headerValuePlaceholder')}
                      className="flex-1 border border-border bg-card rounded-lg px-2.5 py-1.5 text-xs text-foreground font-mono"
                    />
                    <button
                      onClick={() => handleRemoveHeader(index)}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {headers.length === 0 && (
                  <span className="text-[11px] text-muted-foreground italic">{t('apiConfig.noCustomHeaders')}</span>
                )}
              </div>
            </div>

            {/* Payload / Body (Only if method != GET) */}
            {method !== 'GET' && (
              <div className="flex flex-col gap-1.5 relative">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                  {t('apiConfig.payloadBody')}
                </label>
                <textarea
                  ref={payloadRef}
                  value={payload}
                  onChange={(e) => {
                    setPayload(e.target.value);
                    checkAutocomplete('payload', e.target.value, e.target.selectionStart ?? e.target.value.length);
                  }}
                  onKeyDown={handleTemplateInputKeyDown}
                  onClick={(e) => checkAutocomplete('payload', payload, e.currentTarget.selectionStart ?? payload.length)}
                  onBlur={() => setTimeout(() => setAutocomplete(null), 150)}
                  placeholder="{\n  &quot;student_code&quot;: &quot;{{student.student_code}}&quot;\n}"
                  className="border border-border bg-card rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary font-mono leading-relaxed h-[130px] resize-none"
                />
                {autocomplete?.target === 'payload' && (
                  <AutocompleteDropdown
                    autocomplete={autocomplete}
                    activeIdx={activeSuggestionIdx}
                    onHover={setActiveSuggestionIdx}
                    onSelect={applyAutocompleteSuggestion}
                  />
                )}
              </div>
            )}

            {/* Dynamic Variables Selector */}
            <div className="flex flex-col gap-2 bg-muted border border-border rounded-xl p-3">
              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <FileText size={13} />
                {t('apiConfig.variableSuggestionsLabel')}
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {VARIABLE_SUGGESTIONS
                  .filter((v) => v.scope === 'all' || v.scope.includes(action))
                  .map((v) => (
                    <button
                      key={v.value}
                      onClick={() => handleInsertVariable(v.value)}
                      className="group flex items-center gap-1 text-[11px] font-mono font-medium text-foreground bg-card hover:bg-primary/10 hover:text-primary border border-border hover:border-primary/30 rounded px-2 py-0.5 shadow-sm transition-colors"
                      title={t('apiConfig.clickToInsert')}
                    >
                      {v.value}
                      <span className="text-[10px] text-muted-foreground group-hover:text-primary ml-1">
                        ({v.label})
                      </span>
                    </button>
                  ))}
              </div>
              <span className="text-[10px] text-muted-foreground mt-1">
                💡 <Trans i18nKey="apiConfig.insertHint" components={{ b1: <b />, b2: <b /> }} />
              </span>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Globe size={40} className="text-muted-foreground stroke-[1.5]" />
            <span className="text-sm font-semibold">{t('apiConfig.emptyState.title')}</span>
            <span className="text-xs text-center max-w-sm leading-relaxed">
              <Trans i18nKey="apiConfig.emptyState.description" components={{ b: <b /> }} />
            </span>
          </div>
        )}
      </div>
    </div>

      {/* Footer actions (import/export/reset) */}
      <div className="flex-shrink-0 border-t border-border px-5 py-3 flex gap-2 bg-muted/50">
        <button
          onClick={handleImportClick}
          className="flex items-center gap-1.5 border border-border bg-card hover:bg-muted text-foreground px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm"
        >
          <Upload size={14} /> {t('apiConfig.importConfig')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 border border-border bg-card hover:bg-muted text-foreground px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm"
        >
          <Download size={14} /> {t('apiConfig.exportConfig')}
        </button>
        {hasDefaultConfig && (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-1.5 border border-warning/40 bg-warning/10 hover:bg-warning/15 text-warning-foreground px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm"
          >
            {t('apiConfig.resetToDefault')}
          </button>
        )}
      </div>
    </div>

    <ResetApiConfigConfirmModal
      open={showResetConfirm}
      loading={resetLoading}
      envLabel={envLabel}
      onCancel={() => !resetLoading && setShowResetConfirm(false)}
      onConfirm={() => void handleResetToDefault()}
    />
    </>
  );
}

function ResetApiConfigConfirmModal({
  open,
  loading,
  envLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  loading?: boolean;
  envLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!open) {
      setCountdown(10);
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [open]);

  if (!open) return null;

  const canConfirm = countdown === 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="w-[460px] max-w-[92vw] rounded-lg bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-foreground">{t('apiConfig.resetModal.title')}</h2>
        <p className="mb-4 text-sm text-foreground">
          <Trans i18nKey="apiConfig.resetModal.description" values={{ env: envLabel }} components={{ b1: <b />, b2: <b /> }} />
        </p>
        {!canConfirm && (
          <div className="mb-6 rounded-lg bg-warning/10 p-4 text-center">
            <p className="text-sm text-warning-foreground">
              <Trans i18nKey="apiConfig.resetModal.countdown" values={{ countdown }} components={{ span: <span className="font-bold text-warning-foreground" /> }} />
            </p>
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm || loading}
            className="flex-1 rounded bg-warning px-4 py-2 text-sm font-medium text-warning-foreground hover:bg-warning/90 disabled:opacity-50"
          >
            {loading ? t('apiConfig.resetModal.resetting') : t('apiConfig.resetModal.resetDefault')}
          </button>
        </div>
      </div>
    </div>
  );
}

function AutocompleteDropdown({
  autocomplete,
  activeIdx,
  onHover,
  onSelect,
}: {
  autocomplete: AutocompleteState;
  activeIdx: number;
  onHover: (idx: number) => void;
  onSelect: (s: { insertText: string; display: string; label: string }) => void;
}) {
  return (
    <div className="absolute top-full left-0 z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-lg py-1">
      {autocomplete.suggestions.map((s, idx) => (
        <div
          key={s.insertText}
          // onMouseDown thay vì onClick để chạy trước sự kiện onBlur của input/textarea.
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(s);
          }}
          onMouseEnter={() => onHover(idx)}
          className={`flex items-center justify-between gap-3 px-3 py-1.5 text-xs cursor-pointer ${
            idx === activeIdx ? 'bg-primary/10 text-primary' : 'text-foreground'
          }`}
        >
          <span className="font-mono font-semibold">{s.display}</span>
          <span className="text-[10px] text-muted-foreground truncate">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
