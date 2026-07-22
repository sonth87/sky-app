import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { type CanonicalRecord, type TtsCondition, flattenCanonicalRecord } from '@sky-app/slide-shared';
import type { VoiceInfo } from '../VoicePickerPopover';

interface VoiceConditionRulesProps {
  conditions: TtsCondition[];
  voicePool: string[];
  voiceCatalog: VoiceInfo[];
  records: CanonicalRecord[];
  /** Gợi ý tên field (TỰ DO — giai đoạn "bỏ Student", 2026-07-22), thường lấy từ
   * FieldMappingProfile.map's keys. Rỗng → input gõ tự do hoàn toàn. */
  attrSuggestions: string[];
  onUpdateCondition: (id: string | number, patch: Partial<TtsCondition>) => void;
  onRemoveCondition: (id: string | number) => void;
  onMoveCondition: (index: number, direction: 'up' | 'down') => void;
  onAddCondition: () => void;
}

function getUniqueValuesForAttrFactory(records: CanonicalRecord[]) {
  return (attr: string): string[] => {
    if (!attr) return [];
    const vals = records.map((r) => flattenCanonicalRecord(r)[attr]?.trim() || '').filter(Boolean);
    return Array.from(new Set(vals)).sort();
  };
}

export function VoiceConditionRules({
  conditions,
  voicePool,
  voiceCatalog,
  records,
  attrSuggestions,
  onUpdateCondition,
  onRemoveCondition,
  onMoveCondition,
  onAddCondition,
}: VoiceConditionRulesProps) {
  const { t } = useTranslation();
  const getUniqueValuesForAttr = getUniqueValuesForAttrFactory(records);
  const datalistId = 'voice-condition-attrs';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className="text-sm-13 font-semibold text-foreground">{t('voiceConditionRules.title')}</span>
        <span className="text-2xs text-muted-foreground italic">{t('voiceConditionRules.priorityHint')}</span>
      </div>

      {attrSuggestions.length > 0 && (
        <datalist id={datalistId}>
          {attrSuggestions.map((attr) => (
            <option key={attr} value={attr} />
          ))}
        </datalist>
      )}

      <div className="flex flex-col gap-2">
        {conditions.map((cond, idx) => (
          <div
            key={cond.id}
            className="flex items-center gap-2 p-2.5 border border-border rounded-xl bg-card shadow-sm hover:border-border transition-all"
          >
            <span className="text-xs font-bold text-muted-foreground">{t('voiceConditionRules.if')}</span>

            {/* Thuộc tính — TỰ DO (giai đoạn "bỏ Student") */}
            <input
              type="text"
              value={cond.attr}
              onChange={(e) => onUpdateCondition(cond.id, { attr: e.target.value })}
              list={attrSuggestions.length > 0 ? datalistId : undefined}
              placeholder={t('voiceConditionRules.attrPlaceholder', 'Tên field')}
              className="bg-muted hover:bg-muted text-foreground text-xs font-bold rounded-lg px-2.5 py-1 focus:outline-none transition-colors border-none cursor-text w-28"
            />

            <span className="text-xs text-muted-foreground">{t('voiceConditionRules.is')}</span>

            {/* Giá trị */}
            {getUniqueValuesForAttr(cond.attr).length > 0 ? (
              <select
                value={cond.val}
                onChange={(e) => onUpdateCondition(cond.id, { val: e.target.value })}
                className="bg-muted hover:bg-muted text-foreground text-xs font-bold rounded-lg px-2.5 py-1 focus:outline-none transition-colors border-none cursor-pointer max-w-44 truncate"
              >
                {getUniqueValuesForAttr(cond.attr).map((val) => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={cond.val}
                onChange={(e) => onUpdateCondition(cond.id, { val: e.target.value })}
                placeholder={t('voiceConditionRules.fullNamePlaceholder') as string}
                className="bg-muted hover:bg-muted focus:bg-card text-foreground text-xs font-bold rounded-lg px-2.5 py-1 focus:outline-none transition-colors border border-transparent focus:border-border w-32 placeholder-muted-foreground"
              />
            )}

            <span className="text-xs text-muted-foreground">→</span>

            {/* Giọng chọn */}
            <select
              value={cond.voice}
              onChange={(e) => onUpdateCondition(cond.id, { voice: e.target.value })}
              className={`text-xs font-bold rounded-lg px-3 py-1 focus:outline-none transition-colors border-none cursor-pointer ${
                voiceCatalog.find((v) => v.id === cond.voice)?.gender === 'female'
                  ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                  : 'bg-info/15 text-info-foreground hover:bg-info/25'
              }`}
            >
              {voicePool.map((vId) => {
                const voiceInfo = voiceCatalog.find((v) => v.id === vId);
                return (
                  <option key={vId} value={vId}>
                    {voiceInfo?.label || vId}
                  </option>
                );
              })}
            </select>

            {/* Sắp xếp thứ tự & Xóa */}
            <div className="ml-auto flex items-center gap-1.5">
              <button
                disabled={idx === 0}
                onClick={() => onMoveCondition(idx, 'up')}
                title={t('voiceConditionRules.moveUp')}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              >
                <ArrowUp size={14} />
              </button>
              <button
                disabled={idx === conditions.length - 1}
                onClick={() => onMoveCondition(idx, 'down')}
                title={t('voiceConditionRules.moveDown')}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              >
                <ArrowDown size={14} />
              </button>
              <button
                onClick={() => onRemoveCondition(cond.id)}
                title={t('voiceConditionRules.removeCondition')}
                className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div>
        <button
          disabled={voicePool.length === 0}
          onClick={onAddCondition}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-success/30 bg-success/10 text-success rounded-xl text-xs font-semibold hover:bg-success/15 transition-all cursor-pointer"
        >
          <Plus size={13} />
          {t('voiceConditionRules.addCondition')}
        </button>
      </div>
    </div>
  );
}
