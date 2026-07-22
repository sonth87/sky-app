import { Trans, useTranslation } from 'react-i18next';
import { CheckSquare, Square, MinusSquare, RefreshCw, Plus, AlertTriangle } from 'lucide-react';
import { type CanonicalRecord, type TtsCondition, flattenCanonicalRecord } from '@sky-app/slide-shared';
import { translateStyle, type VoiceInfo } from '../VoicePickerPopover';
import type { PreGenStatus } from '../../store';
import { VoiceConditionRules } from './VoiceConditionRules';
import { Button } from '../ui/Button';
import { useSlide } from '../../lib/slide';

interface DistributionEntry {
  id: string;
  label: string;
  count: number;
}

interface PregenColumnProps {
  voiceCatalog: VoiceInfo[];
  localVoicePool: string[];
  remainingVoices: VoiceInfo[];
  showAddVoiceMenu: boolean;
  onToggleAddVoiceMenu: () => void;
  addVoiceBtnRef: React.RefObject<HTMLButtonElement | null>;
  onAddVoiceToPool: (voiceId: string) => void;
  onRemoveVoiceFromPool: (voiceId: string) => void;

  localConditions: TtsCondition[];
  records: CanonicalRecord[];
  onUpdateCondition: (id: string | number, patch: Partial<TtsCondition>) => void;
  onRemoveCondition: (id: string | number) => void;
  onMoveCondition: (index: number, direction: 'up' | 'down') => void;
  onAddCondition: () => void;

  localModel: string;
  onChangeModel: (val: string) => void;

  distribution: DistributionEntry[];

  isStale: boolean;
  pregenRunning: boolean;
  onStartPregen: (regenerate?: boolean) => void;

  pgDone: number;
  pgTotal: number;
  pgFailed: number;
  pregenStatus: PreGenStatus | null;
  onCancelPregen: () => void;

  selectedCodes: Set<string>;
  setSelectedCodes: React.Dispatch<React.SetStateAction<Set<string>>>;
  onRequeueSelected: () => void;
  getVoiceForStudent: (record: CanonicalRecord, conditions: TtsCondition[], fallbackVoice: string) => string;
}

export function PregenColumn({
  voiceCatalog,
  localVoicePool,
  remainingVoices,
  showAddVoiceMenu,
  onToggleAddVoiceMenu,
  addVoiceBtnRef,
  onAddVoiceToPool,
  onRemoveVoiceFromPool,
  localConditions,
  records,
  onUpdateCondition,
  onRemoveCondition,
  onMoveCondition,
  onAddCondition,
  localModel,
  onChangeModel,
  distribution,
  isStale,
  pregenRunning,
  onStartPregen,
  pgDone,
  pgTotal,
  pgFailed,
  pregenStatus,
  onCancelPregen,
  selectedCodes,
  setSelectedCodes,
  onRequeueSelected,
  getVoiceForStudent,
}: PregenColumnProps) {
  const { t } = useTranslation();
  const slide = useSlide('pregen');
  const renderStudentVoiceTag = (record: CanonicalRecord) => {
    const vId = getVoiceForStudent(record, localConditions, localModel);
    const voiceInfo = voiceCatalog.find((v) => v.id === vId);
    const isFemale = voiceInfo?.gender === 'female';
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xxs font-semibold border ${
        isFemale
          ? 'bg-pink-50 text-pink-700 border-pink-100'
          : 'bg-info/10 text-info-foreground border-info/20'
      }`}>
        <span className={`w-1 h-1 rounded-full ${isFemale ? 'bg-pink-400' : 'bg-blue-400'}`} />
        {voiceInfo?.label || vId}
      </span>
    );
  };

  const getStudentStatusBadge = (code: string) => {
    const st = pregenStatus?.records[code] || 'pending';
    if (isStale && st === 'done') {
      return (
        <span className="bg-warning/10 text-warning-foreground border border-warning/30 font-semibold text-2xs px-1.5 py-0.5 rounded">
          {t('ttsModal.pregen.statusNeedsRegenerate')}
        </span>
      );
    }

    const badgeMap: Record<string, string> = {
      pending:    'bg-muted text-muted-foreground border border-border',
      processing: 'bg-primary/10 text-primary border border-primary/30 animate-pulse',
      done:       'bg-success/10 text-success border border-success/30',
      failed:     'bg-destructive/10 text-destructive border border-destructive/30',
    };
    const labelKeyMap: Record<string, string> = {
      pending: 'statusPending', processing: 'statusProcessing', done: 'statusDone', failed: 'statusFailed',
    };
    return (
      <span className={`font-semibold text-2xs px-1.5 py-0.5 rounded ${badgeMap[st] ?? badgeMap.pending}`}>
        {t(`ttsModal.pregen.${labelKeyMap[st] ?? 'statusPending'}`)}
      </span>
    );
  };

  return (
    <div className="w-[62%] p-6 bg-muted/40 overflow-y-auto flex flex-col gap-5 min-w-0">
      <div className="text-xs font-bold text-success tracking-wider uppercase">{t('ttsModal.pregen.sectionTitle')}</div>

      {/* Nhóm giọng dùng (Voice Pool) */}
      <div className="flex flex-col gap-2">
        <span className="text-sm-13 font-semibold text-foreground">{t('ttsModal.pregen.voicePoolLabel')}</span>
        <div className="flex flex-wrap gap-2 items-center">
          {localVoicePool.map((vId) => {
            const voice = voiceCatalog.find((v) => v.id === vId);
            if (!voice) return null;
            const isFemale = voice.gender === 'female';
            return (
              <span
                key={vId}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  isFemale
                    ? 'bg-pink-100 text-pink-700 border-pink-200'
                    : 'bg-info/15 text-info-foreground border-info/30'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isFemale ? 'bg-pink-500' : 'bg-info'}`} />
                {voice.label}
                <button
                  disabled={localVoicePool.length <= 1}
                  onClick={() => onRemoveVoiceFromPool(vId)}
                  className="text-muted-foreground hover:text-foreground font-bold ml-1 rounded-full w-3.5 h-3.5 flex items-center justify-center hover:bg-muted/50 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  ×
                </button>
              </span>
            );
          })}

          {/* Thêm giọng popover */}
          {remainingVoices.length > 0 && (
            <div className="relative">
              <button
                ref={addVoiceBtnRef}
                onClick={onToggleAddVoiceMenu}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-dashed border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-all cursor-pointer"
              >
                <Plus size={12} />
                {t('ttsModal.pregen.addVoice')}
              </button>
              {showAddVoiceMenu && (
                <div className="absolute left-0 mt-1 z-20 w-44 rounded-xl border border-border bg-card shadow-xl py-1 divide-y divide-border">
                  {remainingVoices.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => onAddVoiceToPool(v.id)}
                      className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-primary/10 flex items-center gap-2"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${v.gender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`} />
                      {v.label} ({translateStyle(t, v.style)})
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bộ điều kiện phân giọng */}
      <VoiceConditionRules
        conditions={localConditions}
        voicePool={localVoicePool}
        voiceCatalog={voiceCatalog}
        records={records}
        attrSuggestions={[]}
        onUpdateCondition={onUpdateCondition}
        onRemoveCondition={onRemoveCondition}
        onMoveCondition={onMoveCondition}
        onAddCondition={onAddCondition}
      />

      {/* Fallback (Mặc định còn lại) */}
      <div className="flex items-center gap-2.5 p-3 border border-dashed border-border rounded-xl bg-muted/50">
        <span className="text-xs font-semibold text-muted-foreground">{t('ttsModal.pregen.defaultFallback')}</span>
        <span className="text-muted-foreground">→</span>
        <select
          value={localModel}
          onChange={(e) => onChangeModel(e.target.value)}
          className={`text-xs font-bold rounded-lg px-3 py-1 focus:outline-none transition-colors border-none cursor-pointer ${
            voiceCatalog.find((v) => v.id === localModel)?.gender === 'female'
              ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
              : 'bg-info/15 text-info-foreground hover:bg-info/25'
          }`}
        >
          {localVoicePool.map((vId) => {
            const voiceInfo = voiceCatalog.find((v) => v.id === vId);
            return (
              <option key={vId} value={vId}>
                {voiceInfo?.label || vId}
              </option>
            );
          })}
        </select>
      </div>

      {/* Phân bổ tỷ lệ giọng (Distribution) */}
      <div className="flex flex-wrap items-center gap-1.5 bg-muted/50 rounded-xl p-3 border border-border/40">
        <span className="text-xs font-bold text-muted-foreground mr-1.5">{t('ttsModal.pregen.distributionLabel')}</span>
        {distribution.map((d) => (
          <span
            key={d.id}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border bg-card shadow-sm"
          >
            <span className="text-foreground font-semibold">{d.label}</span>
            <span className="text-muted-foreground font-normal">|</span>
            <span className="text-primary font-extrabold">{d.count}</span>
          </span>
        ))}
      </div>

      {/* Cảnh báo cấu hình lệch */}
      {isStale && (
        <div className="flex gap-2.5 bg-warning/10 border border-warning/30 rounded-xl p-3.5 text-xs text-warning-foreground leading-relaxed items-start animate-fade-in">
          <AlertTriangle size={15} className="text-warning mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <Trans
              i18nKey="ttsModal.pregen.staleWarning"
              values={{ count: records.length }}
              components={{ b: <b className="font-bold" /> }}
            />
          </div>
          <button
            onClick={() => onStartPregen(true)}
            disabled={pregenRunning}
            className="flex-shrink-0 text-warning-foreground font-bold hover:underline"
          >
            {t('ttsModal.pregen.regenerateAll')}
          </button>
        </div>
      )}

      {/* Tiến trình và Nút điều khiển */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-foreground">
            {t('ttsModal.pregen.createdCount', { done: pgDone, total: pgTotal })}
            {pgFailed > 0 && <span className="text-destructive font-bold ml-1.5">{t('ttsModal.pregen.failedCount', { count: pgFailed })}</span>}
          </span>

          {pregenStatus?.running && (
            <span className="text-xxs font-bold text-primary bg-primary/10 rounded px-2 py-0.5 animate-pulse">
              {pregenStatus.paused ? t('ttsModal.pregen.paused') : t('ttsModal.pregen.generatingAudio')}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${isStale ? 'bg-warning' : 'bg-success'}`}
            style={{ width: `${pgTotal > 0 ? (pgDone / pgTotal) * 100 : 0}%` }}
          />
        </div>

        {/* Pregen Controls */}
        {(!pregenStatus || !pregenStatus.running) ? (
          <div className="flex gap-2 mt-1">
            <Button
              variant="primary"
              size="md"
              fullWidth
              className="rounded-xl"
              disabled={pregenRunning || records.length === 0}
              onClick={() => onStartPregen(false)}
            >
              {pregenStatus ? t('ttsModal.pregen.continueGenerate') : t('ttsModal.pregen.generateAll')}
            </Button>
            {pregenStatus && (
              <button
                disabled={pregenRunning}
                onClick={() => onStartPregen(true)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-warning text-warning-foreground font-bold text-xs py-2.5 px-4 hover:bg-warning/90 transition-all disabled:opacity-50"
              >
                {t('ttsModal.pregen.regenerateAll')}
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-2 mt-1">
            {pregenStatus.paused ? (
              <Button variant="primary" size="md" fullWidth className="rounded-xl" onClick={() => slide?.pregenResume()}>
                {t('ttsModal.pregen.resume')}
              </Button>
            ) : (
              <Button variant="secondary" size="md" fullWidth className="rounded-xl" onClick={() => slide?.pregenPause()}>
                {t('ttsModal.pregen.pause')}
              </Button>
            )}
            <Button variant="danger-soft" size="md" fullWidth className="rounded-xl" onClick={onCancelPregen}>
              {t('ttsModal.pregen.cancel')}
            </Button>
          </div>
        )}
      </div>

      {/* Danh sách sinh viên */}
      <div className="border border-border rounded-xl bg-card overflow-hidden flex flex-col flex-1 min-h-[220px]">

        {/* Header danh sách */}
        <div className="flex items-center justify-between bg-muted border-b border-border px-4 py-2">
          <span className="text-xs font-bold text-muted-foreground">
            {t('ttsModal.pregen.perStudentVoiceLabel')}
          </span>
          {selectedCodes.size > 0 && (
            <button
              onClick={onRequeueSelected}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xxs font-bold text-primary hover:bg-primary/10 transition-all"
            >
              <RefreshCw size={11} />
              {t('ttsModal.pregen.regenerateSelected', { count: selectedCodes.size })}
            </button>
          )}
        </div>

        {/* Table Body */}
        <div className="overflow-y-auto flex-1 max-h-[260px]">
          {records.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-8">
              {t('ttsModal.pregen.noStudentData')}
            </p>
          ) : (
            (() => {
              const selectableCodes = records
                .filter((sv) => {
                  const st = pregenStatus?.records[sv.id] || 'pending';
                  return st === 'done' || st === 'failed' || st === 'pending';
                })
                .map((sv) => sv.id);
              const allChecked = selectableCodes.length > 0 && selectableCodes.every((code) => selectedCodes.has(code));
              const someChecked = selectableCodes.some((code) => selectedCodes.has(code));

              const toggleAll = () => {
                if (allChecked) {
                  setSelectedCodes(new Set());
                } else {
                  setSelectedCodes(new Set(selectableCodes));
                }
              };

              return (
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-border bg-muted text-2xs font-bold text-muted-foreground tracking-wider sticky top-0 z-10">
                      <th className="py-2 pl-4 pr-1 w-8">
                        <button onClick={toggleAll} className="flex items-center text-muted-foreground hover:text-foreground transition-colors">
                          {allChecked
                            ? <CheckSquare size={13} className="text-primary" />
                            : someChecked
                              ? <MinusSquare size={13} className="text-primary" />
                              : <Square size={13} />
                          }
                        </button>
                      </th>
                      <th className="py-2 pr-2">{t('ttsModal.pregen.columnStudent')}</th>
                      <th className="py-2 pr-2">{t('ttsModal.pregen.columnVoice')}</th>
                      <th className="py-2 pr-4 text-right">{t('ttsModal.pregen.columnStatus')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {records.map((sv) => {
                      const code = sv.id;
                      const isChecked = selectedCodes.has(code);
                      const st = pregenStatus?.records[code] || 'pending';
                      const canSelect = st === 'done' || st === 'failed' || st === 'pending';

                      return (
                        <tr
                          key={code}
                          className={`group hover:bg-muted/50 transition-colors ${isChecked ? 'bg-primary/40' : ''}`}
                        >
                          <td className="py-2 pl-4 pr-1">
                            {canSelect && (
                              <button
                                onClick={() => setSelectedCodes((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(code)) next.delete(code); else next.add(code);
                                  return next;
                                })}
                                className="flex items-center text-muted-foreground hover:text-primary group-hover:text-muted-foreground transition-colors"
                              >
                                {isChecked ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
                              </button>
                            )}
                          </td>
                          <td className="py-2 pr-2">
                            <div className="font-bold text-foreground leading-snug">{sv.full_name}</div>
                            <div className="text-2xs text-muted-foreground mt-0.5">
                              {code} · {flattenCanonicalRecord(sv).classification} · {flattenCanonicalRecord(sv).major_name}
                            </div>
                          </td>
                          <td className="py-2 pr-2">
                            {renderStudentVoiceTag(sv)}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            {getStudentStatusBadge(code)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}
