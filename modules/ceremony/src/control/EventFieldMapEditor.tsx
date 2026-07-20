// EventFieldMapEditor — Giai đoạn 4c kế hoạch Event (wizard Bước 4: Ghép biến). Với MỖI layout
// đã dùng ở Bước 3 (1 tab = 1 EventLayoutRef, đã chốt qua AskUserQuestion 2026-07-19), map từng
// token layout khai báo sang 1 trong 2 nguồn: cột dữ liệu thô (FieldMapSource{kind:'raw'}) hoặc
// CustomVariable tính theo điều kiện (FieldMapSource{kind:'computed'}). Auto-suggest theo tên gần
// giống (lowercase exact/includes — không có thư viện fuzzy-match nào sẵn trong repo), KHÔNG tự
// ghi vào fieldMap cho tới khi user xác nhận (13-ceremony-mo-rong.md §"Trách nhiệm 6").

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Sparkles } from 'lucide-react';
import type { LayoutPort } from '@sky-app/service-contracts';
import { extractTokenKeysFromContent, type CustomVariable, type EventLayoutRef, type FieldMapSource } from '@sky-app/slide-shared';
import { Button } from './components/ui/Button.js';
import { CustomVariableEditor } from './components/settings/CustomVariableEditor.js';
import type { LayoutRuleRow } from './LayoutRuleTable.js';

interface FieldMapTarget {
  id: string;
  label: string;
  ref: EventLayoutRef;
}

function targetsFrom(rows: LayoutRuleRow[], defaultRef: EventLayoutRef | undefined, t: (key: string) => string): FieldMapTarget[] {
  const list: FieldMapTarget[] = rows.map((r) => ({ id: r.id, label: r.label || r.ref.layoutId, ref: r.ref }));
  if (defaultRef) list.push({ id: '__default__', label: t('eventFieldMap.defaultTabLabel'), ref: defaultRef });
  return list;
}

/** Trích UNION token (text/ribbon content + image varKey) qua MỌI variant của 1 layout — cùng
 * logic đã dùng ở EventGate.tsx's countMissingTokens (Giai đoạn 3), tránh viết lại. LoopItem's
 * itemTemplate KHÔNG đệ quy vào (giới hạn đã biết, giữ nguyên phạm vi, không mở rộng ở đây). */
async function extractLayoutTokens(layoutPort: LayoutPort, layoutId: string, layoutVersion: number): Promise<string[]> {
  const version = await layoutPort.getVersion(layoutId, layoutVersion);
  if (!version) return [];
  const keys = new Set<string>();
  for (const variant of version.content.variants) {
    for (const item of variant.items) {
      if (item.type === 'text' || item.type === 'ribbon') {
        for (const k of extractTokenKeysFromContent(item.content)) keys.add(k);
      } else if (item.type === 'image' && item.varKey) {
        keys.add(item.varKey);
      }
    }
  }
  return [...keys];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[_\s-]/g, '');
}

/** Gợi ý cột thô gần giống tên token — so khớp lowercase, bỏ dấu _/khoảng trắng/gạch ngang.
 * KHÔNG cần thư viện fuzzy-match (đã xác nhận không có sẵn trong repo) — yêu cầu DoD chỉ cần
 * "giống/gần giống", exact-match sau chuẩn hoá là đủ. */
function suggestRawKey(token: string, attrSuggestions: string[]): string | undefined {
  const normToken = normalize(token);
  return attrSuggestions.find((a) => normalize(a) === normToken);
}

interface EventFieldMapEditorProps {
  rows: LayoutRuleRow[];
  onChangeRows: (rows: LayoutRuleRow[]) => void;
  defaultRef: EventLayoutRef | undefined;
  onChangeDefaultRef: (ref: EventLayoutRef | undefined) => void;
  layoutPort: LayoutPort;
  attrSuggestions: string[];
  customVariables: CustomVariable[];
  onChangeCustomVariables: (variables: CustomVariable[]) => void;
}

export function EventFieldMapEditor({
  rows,
  onChangeRows,
  defaultRef,
  onChangeDefaultRef,
  layoutPort,
  attrSuggestions,
  customVariables,
  onChangeCustomVariables,
}: EventFieldMapEditorProps) {
  const { t } = useTranslation();
  const targets = targetsFrom(rows, defaultRef, t);
  const [activeTargetId, setActiveTargetId] = useState<string>(targets[0]?.id ?? '');
  const [showVariableManager, setShowVariableManager] = useState(false);
  const [tokensByTarget, setTokensByTarget] = useState<Record<string, string[]>>({});

  // targets có thể đổi (rows/defaultRef thay đổi ở Bước 3) — nếu tab đang active không còn tồn
  // tại, tự chuyển về tab đầu tiên còn lại. Tránh render vào target đã bị xoá.
  useEffect(() => {
    if (targets.length > 0 && !targets.some((tg) => tg.id === activeTargetId)) {
      setActiveTargetId(targets[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets.map((tg) => tg.id).join(',')]);

  const activeTarget = targets.find((tg) => tg.id === activeTargetId);

  useEffect(() => {
    if (!activeTarget || tokensByTarget[activeTarget.id]) return;
    let cancelled = false;
    void extractLayoutTokens(layoutPort, activeTarget.ref.layoutId, activeTarget.ref.layoutVersion).then((tokens) => {
      if (!cancelled) setTokensByTarget((prev) => ({ ...prev, [activeTarget.id]: tokens }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTarget?.id, activeTarget?.ref.layoutId, activeTarget?.ref.layoutVersion]);

  const updateFieldMap = (targetId: string, token: string, source: FieldMapSource) => {
    if (targetId === '__default__') {
      if (!defaultRef) return;
      onChangeDefaultRef({ ...defaultRef, fieldMap: { ...defaultRef.fieldMap, [token]: source } });
      return;
    }
    onChangeRows(rows.map((r) => (r.id === targetId ? { ...r, ref: { ...r.ref, fieldMap: { ...r.ref.fieldMap, [token]: source } } } : r)));
  };

  if (targets.length === 0) {
    return <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t('eventFieldMap.noLayoutYet')}</div>;
  }

  const tokens = activeTarget ? (tokensByTarget[activeTarget.id] ?? []) : [];
  const totalCount = tokens.length;
  const mappedCount = tokens.filter((tk) => activeTarget && activeTarget.ref.fieldMap[tk] && activeTarget.ref.fieldMap[tk]?.kind !== 'unmapped').length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border">
        {targets.map((tg) => (
          <button
            key={tg.id}
            type="button"
            className={`shrink-0 border-b-2 px-3 py-1.5 text-sm ${activeTargetId === tg.id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTargetId(tg.id)}
          >
            {tg.label}
          </button>
        ))}
      </div>

      {activeTarget && (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('eventFieldMap.summary', { mapped: mappedCount, total: totalCount })}</span>
            <Button variant="secondary-outline" size="sm" icon={<Sparkles size={12} />} onClick={() => setShowVariableManager((v) => !v)}>
              {t('eventFieldMap.manageVariablesButton')}
            </Button>
          </div>

          {showVariableManager && (
            <div className="rounded-lg border border-border bg-card p-3">
              <CustomVariableEditor variables={customVariables} onChange={onChangeCustomVariables} previewStudent={null} students={[]} />
            </div>
          )}

          {tokens.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t('eventFieldMap.noTokenInLayout')}</div>
          ) : (
            <div className="rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-card">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">{t('eventFieldMap.tokenHeader')}</th>
                    <th className="px-2 py-1.5 text-left font-medium">{t('eventFieldMap.sourceHeader')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => {
                    const current = activeTarget.ref.fieldMap[token];
                    const suggestion = current ? undefined : suggestRawKey(token, attrSuggestions);
                    return (
                      <tr key={token} className="border-t border-border">
                        <td className="px-2 py-1.5 font-mono text-primary">@{token}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <select
                              className="rounded-md border border-input bg-background px-1.5 py-1 text-xs"
                              value={current?.kind === 'raw' ? 'raw' : current?.kind === 'computed' ? 'computed' : ''}
                              onChange={(e) => {
                                const kind = e.target.value;
                                if (kind === 'raw') updateFieldMap(activeTarget.id, token, { kind: 'raw', sourceKey: attrSuggestions[0] ?? '' });
                                else if (kind === 'computed') updateFieldMap(activeTarget.id, token, { kind: 'computed', variableKey: customVariables[0]?.key ?? '' });
                                else updateFieldMap(activeTarget.id, token, { kind: 'unmapped' });
                              }}
                            >
                              <option value="">{t('eventFieldMap.sourceUnmapped')}</option>
                              <option value="raw">{t('eventFieldMap.sourceRaw')}</option>
                              <option value="computed">{t('eventFieldMap.sourceComputed')}</option>
                            </select>

                            {current?.kind === 'raw' && (
                              <input
                                list={`attr-suggestions-${activeTarget.id}`}
                                className="w-40 rounded-md border border-input bg-background px-1.5 py-1 text-xs"
                                value={current.sourceKey}
                                onChange={(e) => updateFieldMap(activeTarget.id, token, { kind: 'raw', sourceKey: e.target.value })}
                              />
                            )}
                            {attrSuggestions.length > 0 && (
                              <datalist id={`attr-suggestions-${activeTarget.id}`}>
                                {attrSuggestions.map((a) => (
                                  <option key={a} value={a} />
                                ))}
                              </datalist>
                            )}

                            {current?.kind === 'computed' && (
                              <select
                                className="w-40 rounded-md border border-input bg-background px-1.5 py-1 text-xs"
                                value={current.variableKey}
                                onChange={(e) => updateFieldMap(activeTarget.id, token, { kind: 'computed', variableKey: e.target.value })}
                              >
                                {customVariables.length === 0 && <option value="">{t('eventFieldMap.noVariableYet')}</option>}
                                {customVariables.map((cv) => (
                                  <option key={cv.id} value={cv.key}>
                                    @{cv.key} {cv.label ? `— ${cv.label}` : ''}
                                  </option>
                                ))}
                              </select>
                            )}

                            {/* Auto-suggest — CHỈ gợi ý qua nút xác nhận, KHÔNG tự ghi vào fieldMap
                               (13-ceremony-mo-rong.md §"Trách nhiệm 6" — không âm thầm ghi đè). */}
                            {suggestion && (
                              <button
                                type="button"
                                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-1 text-[11px] text-primary hover:bg-primary/20"
                                onClick={() => updateFieldMap(activeTarget.id, token, { kind: 'raw', sourceKey: suggestion })}
                                title={t('eventFieldMap.suggestionTooltip', { column: suggestion })}
                              >
                                <Check size={11} />
                                {suggestion}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
