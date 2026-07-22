import { useRef } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Download, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { renderTemplate } from '../../../lib/renderTemplate';
import { flattenCanonicalRecord, type CanonicalRecord, type CustomVariable, type CustomVariableRule, type VarRuleOp } from '@sky-app/slide-shared';

// Toán tử so khớp cho rule của biến điều kiện
const VAR_OP_OPTIONS: Array<{ value: VarRuleOp; labelKey: string }> = [
  { value: 'equals', labelKey: 'customVariables.op.equals' },
  { value: 'contains', labelKey: 'customVariables.op.contains' },
  { value: 'in', labelKey: 'customVariables.op.in' },
  { value: 'gt', labelKey: 'customVariables.op.gt' },
  { value: 'lt', labelKey: 'customVariables.op.lt' },
  { value: 'gte', labelKey: 'customVariables.op.gte' },
  { value: 'lte', labelKey: 'customVariables.op.lte' },
];

// Field core reserved — dùng để cảnh báo khi user đặt key biến trùng field có sẵn
const RESERVED_VARIABLE_KEYS = new Set([
  'full_name', 'identifierCode', 'identityNumber', 'phone', 'email', 'dateOfBirth', 'title', 'description',
]);

function newId(): string {
  return crypto.randomUUID();
}

export interface CustomVariableEditorProps {
  variables: CustomVariable[];
  onChange: (variables: CustomVariable[]) => void;
  /** 1 record mẫu để preview giá trị biến (`@key` render thành gì) — settings cũ dùng
   * records[0], Event context dùng demoCanonicalSubject/record thật đầu tiên của DataSource. */
  previewRecord: CanonicalRecord | null;
  /** Danh sách record để suy ra gợi ý giá trị có sẵn cho 1 field (VD "Xếp loại" → ["Giỏi",...]). */
  records: CanonicalRecord[];
  /** Gợi ý tên field (TỰ DO — giai đoạn "bỏ Student", 2026-07-22) cho dropdown chọn `attr`, thường
   * lấy từ FieldMappingProfile.map's keys. Rỗng → input gõ tự do hoàn toàn, không gợi ý. */
  attrSuggestions: string[];
}

/** UI thuần quản lý CustomVariable[] — tách khỏi nguồn dữ liệu (socket/store hay EventPort) để
 * dùng chung được cho settings cũ (CustomVariablesContent.tsx) VÀ Event context mới (Giai đoạn
 * 4c mở rộng, 2026-07-20). Toàn bộ state nằm ở CALLER qua variables/onChange — component này
 * không tự giữ state, không biết gì về nơi persist.
 *
 * Giai đoạn "bỏ Student" (2026-07-22): `rule.attr` là tên field TỰ DO (gõ tay hoặc chọn từ
 * `attrSuggestions` qua datalist, đúng pattern RuleBuilder.tsx đã dùng từ Giai đoạn 4b) — KHÔNG
 * còn 8 nhãn tiếng Việt cố định (ATTR_FIELD_MAP đã xoá). */
export function CustomVariableEditor({ variables: customVariables, onChange: save, previewRecord, records, attrSuggestions }: CustomVariableEditorProps) {
  const { t } = useTranslation();
  const datalistId = `custom-variable-attrs-${Math.random().toString(36).slice(2)}`;

  // Gợi ý giá trị có sẵn trong tập dữ liệu cho 1 field — đọc trực tiếp field core+extra đã merge.
  const getUniqueValuesForAttr = (attr: string): string[] => {
    if (!attr) return [];
    const vals = records.map((r) => flattenCanonicalRecord(r)[attr]?.trim() || '').filter(Boolean);
    return Array.from(new Set(vals)).sort();
  };

  // --- CRUD biến ---
  const handleAddVariable = () => {
    const newVar: CustomVariable = { id: newId(), key: '', label: '', rules: [], default: '' };
    save([...customVariables, newVar]);
  };

  const handleRemoveVariable = (id: string | number) => {
    save(customVariables.filter((v) => v.id !== id));
  };

  const handleUpdateVariable = (id: string | number, patch: Partial<CustomVariable>) => {
    save(customVariables.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  // --- CRUD rule bên trong 1 biến ---
  const handleAddRule = (varId: string | number) => {
    const v = customVariables.find((v) => v.id === varId);
    if (!v) return;
    const newRule: CustomVariableRule = { id: newId(), attr: attrSuggestions[0] ?? '', op: 'contains', val: '', result: '' };
    handleUpdateVariable(varId, { rules: [...v.rules, newRule] });
  };

  const handleRemoveRule = (varId: string | number, ruleId: string | number) => {
    const v = customVariables.find((v) => v.id === varId);
    if (!v) return;
    handleUpdateVariable(varId, { rules: v.rules.filter((r) => r.id !== ruleId) });
  };

  const handleUpdateRule = (varId: string | number, ruleId: string | number, patch: Partial<CustomVariableRule>) => {
    const v = customVariables.find((v) => v.id === varId);
    if (!v) return;
    const rules = v.rules.map((r) => {
      if (r.id !== ruleId) return r;
      const next = { ...r, ...patch };
      // Đổi thuộc tính → reset giá trị so khớp (chỉ khi op cần chọn từ danh sách)
      if (patch.attr && (next.op === 'equals' || next.op === 'in')) {
        const vals = getUniqueValuesForAttr(patch.attr);
        next.val = vals[0] || '';
      }
      return next;
    });
    handleUpdateVariable(varId, { rules });
  };

  const moveRule = (varId: string | number, index: number, direction: 'up' | 'down') => {
    const v = customVariables.find((v) => v.id === varId);
    if (!v) return;
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= v.rules.length) return;
    const rules = [...v.rules];
    const tmp = rules[index];
    rules[index] = rules[nextIndex];
    rules[nextIndex] = tmp;
    handleUpdateVariable(varId, { rules });
  };

  // --- Import / Export JSON ---
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(customVariables, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `tts-variable-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Chuẩn hóa 1 phần tử import về đúng shape CustomVariable (cấp id mới để tránh trùng)
  const normalizeVariable = (raw: unknown, idx: number): CustomVariable | null => {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    if (typeof o.key !== 'string') return null;
    const rules: CustomVariableRule[] = Array.isArray(o.rules)
      ? o.rules
          .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
          .map((r) => ({
            id: newId(),
            attr: typeof r.attr === 'string' ? r.attr : '',
            op: (typeof r.op === 'string' ? r.op : 'contains') as VarRuleOp,
            val: typeof r.val === 'string' ? r.val : '',
            result: typeof r.result === 'string' ? r.result : '',
          }))
      : [];
    return {
      id: newId(),
      key: o.key,
      label: typeof o.label === 'string' ? o.label : '',
      rules,
      default: typeof o.default === 'string' ? o.default : '',
    };
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset để import lại cùng file được
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const imported = arr
        .map((raw, i) => normalizeVariable(raw, i))
        .filter((v): v is CustomVariable => v !== null);
      if (imported.length === 0) {
        alert(t('customVariables.import.noValidVariables'));
        return;
      }
      // Gộp: import nối vào danh sách hiện tại (hoặc thay thế nếu user muốn)
      const replace = customVariables.length > 0
        ? window.confirm(t('customVariables.import.confirmReplace', { count: imported.length }))
        : true;
      save(replace ? imported : [...customVariables, ...imported]);
    } catch (err) {
      alert(t('customVariables.import.readError', { message: err instanceof Error ? err.message : String(err) }));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {attrSuggestions.length > 0 && (
        <datalist id={datalistId}>
          {attrSuggestions.map((attr) => (
            <option key={attr} value={attr} />
          ))}
        </datalist>
      )}
      {/* Header actions */}
      <div className="flex items-center justify-end flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            title={t('customVariables.importTitle')}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <Upload size={13} />
            {t('customVariables.import.button')}
          </button>
          <button
            onClick={handleExport}
            disabled={customVariables.length === 0}
            title={t('customVariables.exportTitle')}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-card transition-colors"
          >
            <Download size={13} />
            {t('customVariables.export.button')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>
      </div>

      {/* Body */}
      {customVariables.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          {t('customVariables.emptyState.before')} <b className="text-accent-foreground">{t('customVariables.addVariable')}</b> {t('customVariables.emptyState.after')}
        </div>
      )}

      {customVariables.map((cv) => {
        const keyInvalid = cv.key !== '' && !/^[a-zA-Z_]+$/.test(cv.key);
        const keyReserved = RESERVED_VARIABLE_KEYS.has(cv.key);
        const keyDuplicate = cv.key !== '' && customVariables.some((o) => o.id !== cv.id && o.key === cv.key);
        // Preview giá trị biến này cho record đầu tiên
        const previewVal = previewRecord && cv.key
          ? renderTemplate(`@${cv.key}`, previewRecord, [cv])
          : null;
        return (
          <div key={cv.id} className="flex flex-col gap-2 p-3.5 border border-accent rounded-xl bg-accent/30 shadow-sm">
            {/* Hàng đầu: key + label + preview + xóa biến */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-accent-foreground">@</span>
              <input
                type="text"
                value={cv.key}
                onChange={(e) => handleUpdateVariable(cv.id, { key: e.target.value.replace(/\s/g, '') })}
                placeholder={t('customVariables.keyPlaceholder')}
                className={`bg-card text-foreground text-xs font-bold rounded-lg px-2.5 py-1.5 focus:outline-none transition-colors border w-36 placeholder-muted-foreground ${
                  keyInvalid || keyDuplicate || keyReserved ? 'border-destructive/40 focus:border-destructive' : 'border-border focus:border-accent'
                }`}
              />
              <input
                type="text"
                value={cv.label}
                onChange={(e) => handleUpdateVariable(cv.id, { label: e.target.value })}
                placeholder={t('customVariables.labelPlaceholder')}
                className="bg-card text-foreground text-xs rounded-lg px-2.5 py-1.5 focus:outline-none transition-colors border border-border focus:border-accent flex-1 min-w-[140px] placeholder-muted-foreground"
              />
              {previewVal !== null && (
                <span className="text-[11px] text-accent-foreground bg-accent rounded-full px-2.5 py-1 font-semibold whitespace-nowrap">
                  {previewRecord?.full_name?.split(' ').slice(-1)[0] || t('customVariables.studentFallback')} → {previewVal || <span className="italic text-muted-foreground">{t('customVariables.empty')}</span>}
                </span>
              )}
              <button
                onClick={() => handleRemoveVariable(cv.id)}
                title={t('customVariables.deleteVariable')}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all ml-auto"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {(keyInvalid || keyDuplicate || keyReserved) && (
              <p className="text-[10px] text-destructive -mt-1">
                {keyInvalid
                  ? t('customVariables.error.invalidKey')
                  : keyDuplicate
                    ? t('customVariables.error.duplicateKey')
                    : t('customVariables.error.reservedKey')}
              </p>
            )}

            {/* Danh sách rule */}
            <div className="flex flex-col gap-1.5">
              {cv.rules.map((rule, rIdx) => (
                <div key={rule.id} className="flex items-center gap-1.5 flex-wrap bg-card/70 rounded-lg px-2.5 py-2 border border-border">
                  <span className="text-[11px] font-bold text-muted-foreground">{t('customVariables.ifWord')}</span>
                  <input
                    type="text"
                    value={rule.attr}
                    onChange={(e) => handleUpdateRule(cv.id, rule.id, { attr: e.target.value })}
                    list={attrSuggestions.length > 0 ? datalistId : undefined}
                    placeholder={t('customVariables.attrPlaceholder', 'Tên field')}
                    className="bg-muted hover:bg-muted text-foreground text-[11px] font-bold rounded px-1.5 py-1 focus:outline-none transition-colors border-none cursor-text w-28"
                  />
                  <select
                    value={rule.op}
                    onChange={(e) => handleUpdateRule(cv.id, rule.id, { op: e.target.value as VarRuleOp })}
                    className="bg-muted hover:bg-muted text-foreground text-[11px] font-bold rounded px-1.5 py-1 focus:outline-none transition-colors border-none cursor-pointer"
                  >
                    {VAR_OP_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{t(o.labelKey)}</option>))}
                  </select>
                  {rule.op === 'equals' && getUniqueValuesForAttr(rule.attr).length > 0 ? (
                    <select
                      value={rule.val}
                      onChange={(e) => handleUpdateRule(cv.id, rule.id, { val: e.target.value })}
                      className="bg-muted hover:bg-muted text-foreground text-[11px] font-bold rounded px-1.5 py-1 focus:outline-none transition-colors border-none cursor-pointer max-w-44 truncate"
                    >
                      {getUniqueValuesForAttr(rule.attr).map((val) => (<option key={val} value={val}>{val}</option>))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={rule.val}
                      onChange={(e) => handleUpdateRule(cv.id, rule.id, { val: e.target.value })}
                      placeholder={rule.op === 'in' ? t('customVariables.valuePlaceholder.list') : t('customVariables.valuePlaceholder.default')}
                      className="bg-muted hover:bg-muted focus:bg-card text-foreground text-[11px] font-bold rounded px-1.5 py-1 focus:outline-none transition-colors border border-transparent focus:border-border w-40 placeholder-muted-foreground"
                    />
                  )}
                  <span className="text-[11px] text-muted-foreground">→</span>
                  <input
                    type="text"
                    value={rule.result}
                    onChange={(e) => handleUpdateRule(cv.id, rule.id, { result: e.target.value })}
                    placeholder={t('customVariables.resultPlaceholder')}
                    className="bg-accent focus:bg-card text-accent-foreground text-[11px] font-bold rounded px-1.5 py-1 focus:outline-none transition-colors border border-accent focus:border-accent w-32 placeholder-accent-foreground"
                  />
                  <div className="ml-auto flex items-center gap-0.5">
                    <button
                      disabled={rIdx === 0}
                      onClick={() => moveRule(cv.id, rIdx, 'up')}
                      title={t('customVariables.moveUp')}
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      disabled={rIdx === cv.rules.length - 1}
                      onClick={() => moveRule(cv.id, rIdx, 'down')}
                      title={t('customVariables.moveDown')}
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      onClick={() => handleRemoveRule(cv.id, rule.id)}
                      title={t('customVariables.deleteRule')}
                      className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Thêm rule + Mặc định */}
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <button
                  onClick={() => handleAddRule(cv.id)}
                  className="inline-flex items-center gap-1 px-2 py-1 border border-accent bg-accent text-accent-foreground rounded-lg text-[11px] font-semibold hover:bg-accent transition-all cursor-pointer"
                >
                  <Plus size={11} />
                  {t('customVariables.addRule')}
                </button>
                <span className="text-[11px] text-muted-foreground ml-1">{t('customVariables.defaultElse')}</span>
                <input
                  type="text"
                  value={cv.default}
                  onChange={(e) => handleUpdateVariable(cv.id, { default: e.target.value })}
                  placeholder={t('customVariables.defaultPlaceholder')}
                  className="bg-muted focus:bg-card text-foreground text-[11px] font-bold rounded px-1.5 py-1 focus:outline-none transition-colors border border-transparent focus:border-border w-32 placeholder-muted-foreground"
                />
              </div>
            </div>
          </div>
        );
      })}

      <div>
        <button
          onClick={handleAddVariable}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-accent bg-accent text-accent-foreground rounded-xl text-xs font-semibold hover:bg-accent transition-all cursor-pointer"
        >
          <Plus size={14} />
          {t('customVariables.addVariable')}
        </button>
      </div>

      <p className="text-xs text-muted-foreground mt-1">
        {t('customVariables.footerNote')}
      </p>
    </div>
  );
}
