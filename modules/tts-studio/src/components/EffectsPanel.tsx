import { useEffect, useState } from 'react';
import type { EffectPresetPort, EffectTypeInfo, TtsPort } from '@sky-app/service-contracts';
import { EffectsSelect, useEffectPresets } from '@sky-app/tts-generation-ui';
import { useTtsStudioStore } from '../store';
import { PromptDialog } from './PromptDialog';

export interface EffectsPanelProps {
  /** Port quản lý preset (app-db). Vắng mặt = môi trường không có kho preset
   *  (vd web chưa chạy data-service) → ẩn hẳn panel thay vì hiện bộ chỉnh không lưu được. */
  effectPresetPort?: EffectPresetPort;
  /** Bảng hiệu ứng + định nghĩa tham số do SERVICE khai, hỏi qua port (không fetch thẳng
   *  — quy tắc Ports & Adapters, và port Python là động nên renderer không biết URL). */
  ttsPort?: TtsPort;
}

export function EffectsPanel({ effectPresetPort, ttsPort }: EffectsPanelProps) {
  const [types, setTypes] = useState<Record<string, EffectTypeInfo> | null>(null);
  const [presets, reloadPresets] = useEffectPresets(effectPresetPort);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);

  const effectsChain = useTtsStudioStore((s) => s.effectsChain);
  const selectedPresetId = useTtsStudioStore((s) => s.selectedPresetId);
  const setEffectsChain = useTtsStudioStore((s) => s.setEffectsChain);
  const updateEffectParam = useTtsStudioStore((s) => s.updateEffectParam);
  const toggleEffect = useTtsStudioStore((s) => s.toggleEffect);

  // Bảng hiệu ứng từ server. `available: false` khi thiếu pedalboard — khi đó panel ẩn
  // hẳn, vì mọi thao tác đều sẽ không có tác dụng gì.
  useEffect(() => {
    if (!ttsPort?.listEffectTypes) return;
    let alive = true;
    ttsPort.listEffectTypes()
      .then((list: EffectTypeInfo[]) => {
        if (!alive) return;
        // Mảng rỗng = service không hỗ trợ hiệu ứng (thiếu pedalboard) → ẩn hẳn panel,
        // vì mọi thao tác đều sẽ không có tác dụng gì.
        setTypes(list.length > 0 ? Object.fromEntries(list.map((e) => [e.type, e])) : null);
      })
      .catch(() => { if (alive) setTypes(null); });
    return () => { alive = false; };
  }, [ttsPort]);

  if (!types || !effectPresetPort) return null;

  const applyPreset = (id: string) => {
    if (!id) return setEffectsChain([], null);
    const preset = presets.find((p) => p.id === id);
    if (preset) {
      // Sao chép sâu: sửa slider sau đó KHÔNG được đụng vào preset đã lưu.
      setEffectsChain(preset.effectsChain.map((e) => ({ ...e, params: { ...e.params } })), id);
    }
  };

  // Bấm nút mở PromptDialog (Electron KHÔNG hỗ trợ window.prompt() — trả null ngay lập tức,
  // không hiện UI gì, xem PromptDialog.tsx's docstring). Việc tạo thật nằm ở
  // handleSaveAsNewSubmit, gọi khi dialog xác nhận.
  const saveAsNew = () => setShowSavePrompt(true);

  const handleSaveAsNewSubmit = async (name: string) => {
    setShowSavePrompt(false);
    setSaving(true);
    setError(null);
    try {
      const created = await effectPresetPort.create(name, effectsChain);
      setEffectsChain(effectsChain, created.id);
      reloadPresets();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const removePreset = async () => {
    if (!selectedPresetId) return;
    const preset = presets.find((p) => p.id === selectedPresetId);
    if (!preset || preset.isBuiltin) return;
    if (!window.confirm(`Xoá preset "${preset.name}"?`)) return;
    try {
      await effectPresetPort.delete(selectedPresetId);
      setEffectsChain([], null);
      reloadPresets();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const selected = presets.find((p) => p.id === selectedPresetId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-secondary">Hiệu ứng âm thanh</div>
        {effectsChain.length > 0 && (
          <button
            type="button"
            onClick={() => setEffectsChain([], null)}
            className="text-2xs text-muted-foreground hover:text-foreground"
          >
            Bỏ hiệu ứng
          </button>
        )}
      </div>

      <EffectsSelect presets={presets} value={selectedPresetId ?? ''} onChange={applyPreset} showLabel={true} />

      {/* Chỉ hiện tham số của hiệu ứng mà server CÓ khai — preset lưu từ bản cũ có thể
          chứa loại hiệu ứng đã bị gỡ; bỏ qua lặng lẽ thay vì crash cả panel. */}
      {effectsChain.map((effect, index) => {
        const info = types[effect.type];
        if (!info) return null;
        return (
          <div key={`${effect.type}-${index}`} className="space-y-1.5 rounded-lg border border-border p-2">
            <label className="flex items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={effect.enabled !== false}
                onChange={(e) => toggleEffect(index, e.target.checked)}
              />
              {info.label}
            </label>
            {effect.enabled !== false && Object.entries(info.params).map(([name, def]) => {
              const value = effect.params?.[name] ?? def.default;
              return (
                <div key={name} className="flex items-center justify-between gap-2">
                  <label htmlFor={`fx-${index}-${name}`} className="truncate text-2xs text-muted-foreground" title={def.description}>
                    {def.description}
                  </label>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <input
                      id={`fx-${index}-${name}`}
                      type="range"
                      min={def.min}
                      max={def.max}
                      step={def.step}
                      value={value}
                      onChange={(e) => updateEffectParam(index, name, Number(e.target.value))}
                      className="w-24"
                    />
                    <span className="w-10 text-right text-2xs tabular-nums">{value}</span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {effectsChain.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={saveAsNew}
            disabled={saving}
            className="rounded-lg border border-border px-2 py-1 text-2xs hover:bg-muted/50 disabled:opacity-50"
          >
            Lưu thành preset mới
          </button>
          {selected && !selected.isBuiltin && (
            <button
              type="button"
              onClick={removePreset}
              className="rounded-lg border border-border px-2 py-1 text-2xs text-destructive hover:bg-destructive/10"
            >
              Xoá preset
            </button>
          )}
        </div>
      )}

      {selected?.isBuiltin && (
        <p className="text-2xs text-muted-foreground">
          Preset dựng sẵn không sửa được — kéo slider rồi bấm “Lưu thành preset mới”.
        </p>
      )}
      {error && <p className="text-2xs text-destructive">{error}</p>}

      <PromptDialog
        open={showSavePrompt}
        title="Tên preset mới"
        placeholder="Vd: Giọng vang hội trường"
        onSubmit={handleSaveAsNewSubmit}
        onCancel={() => setShowSavePrompt(false)}
      />
    </div>
  );
}
