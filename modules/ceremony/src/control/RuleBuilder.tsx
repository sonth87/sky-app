// RuleBuilder — Giai đoạn 4b kế hoạch Event (wizard Bước 3: điều kiện chọn layout). Cấu trúc
// AND trong 1 khối (SelectorRuleGroup.rules), OR giữa các khối (LayoutSelector.groups[]) — theo
// 06-luu-tru-va-giao-tiep.md. Dropdown "attr" gợi ý từ FieldMappingProfile.map khi Event có
// DataSource gắn profile, cho gõ tự do (datalist) khi chưa có gì để suy ra (đã chốt qua
// AskUserQuestion 2026-07-19 — không chặn cấu hình khi Event chưa gắn DataSource/profile nào).

import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { LayoutSelector, SelectorRuleGroup, SelectorRule } from '@sky-app/slide-shared';
import type { VarRuleOp } from '@sky-app/slide-shared';
import { Button } from './components/ui/Button.js';

const OP_OPTIONS: Array<{ value: VarRuleOp; labelKey: string }> = [
  { value: 'equals', labelKey: 'ruleBuilder.opEquals' },
  { value: 'contains', labelKey: 'ruleBuilder.opContains' },
  { value: 'in', labelKey: 'ruleBuilder.opIn' },
  { value: 'gt', labelKey: 'ruleBuilder.opGt' },
  { value: 'lt', labelKey: 'ruleBuilder.opLt' },
  { value: 'gte', labelKey: 'ruleBuilder.opGte' },
  { value: 'lte', labelKey: 'ruleBuilder.opLte' },
];

const NUMERIC_OPS: VarRuleOp[] = ['gt', 'lt', 'gte', 'lte'];

interface RuleBuilderProps {
  selector: LayoutSelector;
  onChange: (selector: LayoutSelector) => void;
  attrSuggestions: string[];
}

export function RuleBuilder({ selector, onChange, attrSuggestions }: RuleBuilderProps) {
  const { t } = useTranslation();
  const datalistId = `rule-builder-attrs-${Math.random().toString(36).slice(2)}`;

  const updateGroup = (groupIndex: number, group: SelectorRuleGroup) => {
    const groups = [...selector.groups];
    groups[groupIndex] = group;
    onChange({ ...selector, groups });
  };

  const addGroup = () => {
    onChange({ ...selector, groups: [...selector.groups, { rules: [{ attr: '', op: 'equals', val: '' }] }] });
  };

  const removeGroup = (groupIndex: number) => {
    onChange({ ...selector, groups: selector.groups.filter((_, i) => i !== groupIndex) });
  };

  const addRule = (groupIndex: number) => {
    const group = selector.groups[groupIndex];
    updateGroup(groupIndex, { rules: [...group.rules, { attr: '', op: 'equals', val: '' }] });
  };

  const updateRule = (groupIndex: number, ruleIndex: number, rule: SelectorRule) => {
    const group = selector.groups[groupIndex];
    const rules = [...group.rules];
    rules[ruleIndex] = rule;
    updateGroup(groupIndex, { rules });
  };

  const removeRule = (groupIndex: number, ruleIndex: number) => {
    const group = selector.groups[groupIndex];
    updateGroup(groupIndex, { rules: group.rules.filter((_, i) => i !== ruleIndex) });
  };

  return (
    <div className="flex flex-col gap-2">
      {attrSuggestions.length > 0 && (
        <datalist id={datalistId}>
          {attrSuggestions.map((attr) => (
            <option key={attr} value={attr} />
          ))}
        </datalist>
      )}
      {selector.groups.map((group, groupIndex) => (
        <div key={groupIndex} className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-2">
          {group.rules.map((rule, ruleIndex) => (
            <div key={ruleIndex} className="flex items-center gap-1.5">
              {ruleIndex > 0 && <span className="w-8 shrink-0 text-center text-xs text-muted-foreground">{t('ruleBuilder.and')}</span>}
              {ruleIndex === 0 && <span className="w-8 shrink-0" />}
              <input
                className="w-32 rounded-md border border-input bg-background px-2 py-1 text-xs"
                value={rule.attr}
                onChange={(e) => updateRule(groupIndex, ruleIndex, { ...rule, attr: e.target.value })}
                placeholder={t('ruleBuilder.attrPlaceholder') as string}
                list={attrSuggestions.length > 0 ? datalistId : undefined}
              />
              <select
                className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                value={rule.op}
                onChange={(e) => updateRule(groupIndex, ruleIndex, { ...rule, op: e.target.value as VarRuleOp })}
              >
                {OP_OPTIONS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {t(op.labelKey)}
                  </option>
                ))}
              </select>
              <input
                type={NUMERIC_OPS.includes(rule.op) ? 'number' : 'text'}
                className="w-28 rounded-md border border-input bg-background px-2 py-1 text-xs"
                value={rule.val}
                onChange={(e) => updateRule(groupIndex, ruleIndex, { ...rule, val: e.target.value })}
                placeholder={rule.op === 'in' ? (t('ruleBuilder.valInPlaceholder') as string) : undefined}
              />
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                onClick={() => removeRule(groupIndex, ruleIndex)}
                aria-label={t('ruleBuilder.removeRule') as string}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button type="button" className="text-xs text-primary underline" onClick={() => addRule(groupIndex)}>
              {t('ruleBuilder.addRule')}
            </button>
            {selector.groups.length > 1 && (
              <button type="button" className="text-xs text-destructive underline" onClick={() => removeGroup(groupIndex)}>
                {t('ruleBuilder.removeGroup')}
              </button>
            )}
          </div>
          {groupIndex < selector.groups.length - 1 && (
            <div className="text-center text-xs font-medium text-muted-foreground">{t('ruleBuilder.or')}</div>
          )}
        </div>
      ))}
      <Button variant="secondary-outline" size="sm" icon={<Plus size={13} />} onClick={addGroup}>
        {t('ruleBuilder.addGroup')}
      </Button>
    </div>
  );
}
