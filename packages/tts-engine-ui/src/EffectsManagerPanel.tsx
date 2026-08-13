import { useEffect, useMemo, useState } from 'react';
import { Loader2, Play, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import type { EffectPreset, EffectPresetPort, EffectTypeInfo, TtsPort, Voice } from '@sky-app/service-contracts';
import { VoicePickerCombobox, voiceToListItem, getVoiceCoverPath, enrichVoicesFromCatalog, type PreviewState } from '@sky-app/voice-catalog-ui';
import { EffectsChainEditor, fromEffectsChain, toEffectsChain, type WorkingEffect } from './EffectsChainEditor.js';

/** 1 dòng preset trong danh sách trái — icon + tên + badge dựng sẵn + mô tả + tóm tắt chain,
 * tham khảo bố cục card của voicebox's EffectsList (khác bản cũ chỉ có tên trần). */
function PresetCard({ preset, selected, onClick }: { preset: EffectPreset; selected: boolean; onClick: () => void }) {
  const chainSummary = preset.effectsChain.map((e) => e.type).join(' · ');
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        selected
          ? 'flex flex-col gap-1 rounded-xl border border-primary/40 bg-primary/10 p-2.5 text-left'
          : 'flex flex-col gap-1 rounded-xl border border-transparent p-2.5 text-left hover:bg-muted/50'
      }
    >
      <div className="flex items-center gap-1.5">
        <Sparkles size={12} className={selected ? 'shrink-0 text-primary' : 'shrink-0 text-muted-foreground'} />
        <span className={`truncate text-xs font-semibold ${selected ? 'text-primary' : 'text-foreground'}`}>{preset.name}</span>
        {preset.isBuiltin && (
          <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-3xs font-medium uppercase tracking-wide text-muted-foreground">
            Dựng sẵn
          </span>
        )}
      </div>
      {preset.description && (
        <p className="line-clamp-2 pl-[18px] text-2xs text-muted-foreground">{preset.description}</p>
      )}
      <p className="truncate pl-[18px] text-3xs text-muted-foreground/70">
        {preset.effectsChain.length} hiệu ứng{chainSummary ? ` · ${chainSummary}` : ''}
      </p>
    </button>
  );
}

export interface EffectsManagerPanelProps {
  /** Port quản lý preset (app-db). Vắng mặt = môi trường không có kho preset (vd web chưa
   *  chạy data-service) → hiện thông báo thay vì bộ chỉnh không lưu được. */
  effectPresetPort?: EffectPresetPort;
  /** Port tổng hợp giọng nói — cần cho danh sách hiệu ứng khả dụng (`listEffectTypes`) và
   *  Preview (`listVoices`/`speak`). */
  ttsPort?: TtsPort;
  /** Resolve path tương đối (vd voice-covers/cover-01.webp) thành URL đúng môi trường —
   *  truyền vào `VoicePickerCombobox` cho ảnh minh hoạ giọng ở picker Preview. Bỏ trống =
   *  dùng nguyên path (chỉ đúng nếu môi trường phục vụ static asset tại gốc). */
  assetUrl?: (path: string) => string;
}

const PREVIEW_TEXT = 'Xin chúc mừng tân cử nhân đã tốt nghiệp.';

/**
 * Tab "Hiệu ứng" — quản lý preset hiệu ứng hậu kỳ TOÀN CỤC (khác `EffectsPanel` cũ trong
 * TTS Studio, vốn chỉ chọn/chỉnh nhanh preset lúc soạn audio, gắn chặt store của app đó).
 * Panel này KHÔNG phụ thuộc bất kỳ store app nào — tự quản lý state cục bộ, dùng được ở cả
 * `ConfigWindow` (device-shell, toàn app) lẫn nơi khác cần sau này.
 *
 * Tham khảo bố cục voicebox's EffectsTab (2 cột: danh sách preset trái, chain editor phải)
 * nhưng preview khác cơ chế: voicebox hậu xử lý 1 generation audio ĐÃ LƯU
 * (`/effects/preview/{generation_id}`), sky-app áp effect NGAY LÚC synthesize qua
 * `SpeakOptions.effectsChain` — nên Preview ở đây là synthesize 1 câu mẫu với effectsChain
 * đang sửa, không phải hậu xử lý.
 */
export function EffectsManagerPanel({ effectPresetPort, ttsPort, assetUrl }: EffectsManagerPanelProps) {
  const [types, setTypes] = useState<Record<string, EffectTypeInfo> | null>(null);
  const [presets, setPresets] = useState<EffectPreset[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [previewVoiceId, setPreviewVoiceId] = useState('');
  // Preview NGAY trong picker (nghe thử giọng THÔ, không effect) — tách khỏi `previewing`
  // (nghe thử CẢ CHAIN effect đang sửa, nút riêng bên dưới), key = voice id đang phát.
  const [rowPreviewingId, setRowPreviewingId] = useState<string | null>(null);

  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [workingName, setWorkingName] = useState('');
  const [workingDescription, setWorkingDescription] = useState('');
  const [workingChain, setWorkingChain] = useState<WorkingEffect[]>([]);

  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ttsPort?.listEffectTypes) return;
    let alive = true;
    ttsPort.listEffectTypes()
      .then((list) => { if (alive) setTypes(Object.fromEntries(list.map((e) => [e.type, e]))); })
      .catch(() => { if (alive) setTypes(null); });
    return () => { alive = false; };
  }, [ttsPort]);

  useEffect(() => {
    if (!ttsPort) return;
    let alive = true;
    // Một số voice mặc định (Hoài My/Nam Minh) không copy tagline/description vào registry
    // entry lúc import — chỉ có ở catalog gốc. Bù lại qua enrichVoicesFromCatalog, khớp
    // sourceCatalogId (giống TtsStudioApp.tsx's refreshVoices() đang làm cho TTS Studio).
    Promise.all([ttsPort.listVoices(), ttsPort.listVoiceCatalog?.() ?? Promise.resolve([])])
      .then(([list, catalog]) => {
        if (!alive) return;
        const enriched = enrichVoicesFromCatalog(list, catalog);
        setVoices(enriched);
        if (enriched.length > 0) setPreviewVoiceId((v) => v || enriched[0]!.id);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [ttsPort]);

  const reloadPresets = () => {
    effectPresetPort?.list().then(setPresets).catch((e) => setError(String(e)));
  };
  useEffect(reloadPresets, [effectPresetPort]);

  // Phải đứng TRƯỚC 2 early return bên dưới (Rules of Hooks) — đừng dời xuống gần chỗ dùng.
  const voiceItems = useMemo(() => voices.map((v) => voiceToListItem(v)), [voices]);
  const rowPreviewStates = useMemo<Record<string, PreviewState>>(
    () => (rowPreviewingId ? { [rowPreviewingId]: 'loading' } : {}),
    [rowPreviewingId],
  );

  const selectPreset = (preset: EffectPreset) => {
    setSelectedPresetId(preset.id);
    setIsCreatingNew(false);
    setWorkingName(preset.name);
    setWorkingDescription(preset.description ?? '');
    setWorkingChain(fromEffectsChain(preset.effectsChain));
    setError(null);
  };

  const startNew = () => {
    setSelectedPresetId(null);
    setIsCreatingNew(true);
    setWorkingName('');
    setWorkingDescription('');
    setWorkingChain([]);
    setError(null);
  };

  if (!effectPresetPort) {
    return <p className="p-5 text-xs text-muted-foreground">Không có kho preset hiệu ứng ở môi trường này.</p>;
  }
  if (!types) {
    return <p className="p-5 text-xs text-muted-foreground">Service TTS không hỗ trợ hiệu ứng (thiếu pedalboard) hoặc đang tải…</p>;
  }

  const selected = presets.find((p) => p.id === selectedPresetId) ?? null;
  const readOnly = selected?.isBuiltin ?? false;
  const builtinPresets = presets.filter((p) => p.isBuiltin);
  const customPresets = presets.filter((p) => !p.isBuiltin);

  const save = async () => {
    if (!workingName.trim()) { setError('Nhập tên preset trước khi lưu.'); return; }
    setBusy(true);
    setError(null);
    try {
      const chain = toEffectsChain(workingChain);
      if (selected && !readOnly) {
        await effectPresetPort.update(selected.id, { name: workingName.trim(), description: workingDescription.trim(), effectsChain: chain });
      } else {
        const created = await effectPresetPort.create(workingName.trim(), chain, workingDescription.trim());
        setSelectedPresetId(created.id);
        setIsCreatingNew(false);
      }
      reloadPresets();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveAsNew = async () => {
    if (!workingName.trim()) { setError('Nhập tên preset trước khi lưu.'); return; }
    setBusy(true);
    setError(null);
    try {
      const created = await effectPresetPort.create(
        readOnly ? `${workingName.trim()} (bản sao)` : workingName.trim(),
        toEffectsChain(workingChain),
        workingDescription.trim(),
      );
      setSelectedPresetId(created.id);
      setIsCreatingNew(false);
      reloadPresets();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeSelected = async () => {
    if (!selected || selected.isBuiltin) return;
    if (!window.confirm(`Xoá preset "${selected.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await effectPresetPort.delete(selected.id);
      startNew();
      reloadPresets();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    if (!ttsPort || !previewVoiceId) return;
    setPreviewing(true);
    setError(null);
    try {
      await ttsPort.speak(PREVIEW_TEXT, { voiceId: previewVoiceId, effectsChain: toEffectsChain(workingChain) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewing(false);
    }
  };

  // Nghe thử giọng THÔ (không effect) ngay trong picker — nút play nhỏ ở mỗi dòng, khác nút
  // "Nghe thử" chính bên dưới (áp CẢ chain effect đang sửa). Cùng 1 API `ttsPort.speak`, chỉ
  // khác có truyền `effectsChain` hay không.
  const previewRow = async (voiceId: string) => {
    if (!ttsPort) return;
    setRowPreviewingId(voiceId);
    try {
      await ttsPort.speak(PREVIEW_TEXT, { voiceId });
    } catch {
      // Lỗi nghe thử 1 dòng trong picker không đáng chặn UI bằng banner lỗi — im lặng bỏ qua,
      // khác nút "Nghe thử" chính (preview()) vẫn báo lỗi rõ vì đó là hành động có chủ đích hơn.
    } finally {
      setRowPreviewingId(null);
    }
  };

  const resolveAssetUrl = assetUrl ?? ((path: string) => path);

  const dirty = selected
    ? workingName !== selected.name
      || workingDescription !== (selected.description ?? '')
      || JSON.stringify(toEffectsChain(workingChain)) !== JSON.stringify(selected.effectsChain)
    : workingChain.length > 0 || workingName.trim().length > 0;

  // Nhãn + hành động nút chính ở đầu cột phải — 1 nút CONTEXT-AWARE thay vì nhiều nút rời:
  // preset dựng sẵn đang chọn → luôn tạo bản sao (không sửa được bản gốc); còn lại → lưu
  // thẳng (tạo mới nếu đang ở chế độ tạo, cập nhật nếu đang sửa preset tuỳ chỉnh có sẵn).
  const rightTitle = isCreatingNew ? 'Preset mới' : (selected?.name ?? 'Preset mới');
  const primaryLabel = readOnly ? 'Lưu bản sao' : (selected ? 'Lưu preset' : 'Tạo preset');
  const primaryAction = readOnly ? saveAsNew : save;

  return (
    // min-h-0 trên grid + từng cột: mặc định flex/grid item không co dưới chiều cao nội dung,
    // thiếu nó thì cột phải (form dài) đẩy tràn xuống dưới cửa sổ thay vì tự cuộn nội bộ.
    <div className="grid h-full min-h-0 grid-cols-[240px_1fr] divide-x divide-border">
      {/* Cột trái: tiêu đề trang + nút hành động chính, RỒI danh sách preset — khớp bố cục
          header của voicebox's EffectsList (tiêu đề to bên trái, nút tròn màu nhấn bên phải,
          CÙNG 1 hàng, KHÔNG phải nút dashed nằm lẫn trong danh sách như bản trước). */}
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-foreground">Hiệu ứng</h2>
          <button
            type="button"
            onClick={startNew}
            className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-2xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus size={12} /> Preset mới
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <span className="px-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Dựng sẵn</span>
          {builtinPresets.map((p) => (
            <PresetCard key={p.id} preset={p} selected={selectedPresetId === p.id} onClick={() => selectPreset(p)} />
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <span className="px-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Tuỳ chỉnh</span>
          {customPresets.length === 0 && <p className="px-2 text-2xs italic text-muted-foreground">Chưa có preset nào.</p>}
          {customPresets.map((p) => (
            <PresetCard key={p.id} preset={p} selected={selectedPresetId === p.id} onClick={() => selectPreset(p)} />
          ))}
          {isCreatingNew && (
            <div className="flex flex-col gap-1 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-2.5">
              <div className="flex items-center gap-1.5">
                <Sparkles size={12} className="shrink-0 text-primary" />
                <span className="truncate text-xs font-semibold text-primary">{workingName || 'Preset chưa lưu'}</span>
              </div>
              <p className="pl-[18px] text-2xs text-muted-foreground">Chỉnh ở panel bên phải.</p>
            </div>
          )}
        </div>
      </div>

      {/* Cột phải: tiêu đề + nút Lưu (chính), RỒI form — khớp header của voicebox's
          EffectsDetail. Nhãn tường minh phía trên mỗi ô thay vì chỉ placeholder trần. */}
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
        {!selected && !isCreatingNew ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
            <Sparkles size={20} className="text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">Chọn 1 preset bên trái, hoặc bấm "Preset mới".</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <h2 className="truncate text-lg font-bold text-foreground">{rightTitle}</h2>
              <button
                type="button"
                onClick={primaryAction}
                disabled={busy || (!readOnly && !dirty) || (readOnly && workingChain.length === 0)}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-2xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {primaryLabel}
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Tên preset</span>
                <input
                  value={workingName}
                  onChange={(e) => setWorkingName(e.target.value)}
                  disabled={readOnly}
                  placeholder="Tên preset…"
                  className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-semibold disabled:opacity-60"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Mô tả</span>
                <input
                  value={workingDescription}
                  onChange={(e) => setWorkingDescription(e.target.value)}
                  disabled={readOnly}
                  placeholder="Mô tả ngắn (tuỳ chọn)…"
                  className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs disabled:opacity-60"
                />
              </label>
              {readOnly && (
                <p className="text-2xs italic text-muted-foreground">
                  Preset dựng sẵn không sửa/xoá được — chỉnh rồi bấm "Lưu thành preset mới".
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Chuỗi hiệu ứng</span>
              <EffectsChainEditor
                chain={workingChain}
                onChange={setWorkingChain}
                types={types}
              />
            </div>

            {/* Preview — synthesize 1 câu mẫu với chain đang sửa, không lưu gì. Nút viền
                (không tô đặc) — khớp voicebox's Preview button, khác nút Lưu chính (tô đặc)
                ở tiêu đề để phân cấp rõ hành động chính/phụ. */}
            {ttsPort && voices.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Nghe thử</span>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <VoicePickerCombobox
                      items={voiceItems}
                      value={previewVoiceId || null}
                      onChange={setPreviewVoiceId}
                      previewStates={rowPreviewStates}
                      onPreview={(item, e) => { e.stopPropagation(); void previewRow(item.id); }}
                      getCoverUrl={(item) => resolveAssetUrl(getVoiceCoverPath(item.id))}
                      defaultLanguage="Vietnamese"
                      placeholder="Chọn giọng nghe thử"
                      searchPlaceholder="Tìm giọng đọc..."
                      compact
                    />
                  </div>
                  <button
                    type="button"
                    onClick={preview}
                    disabled={previewing || workingChain.length === 0}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40"
                  >
                    {previewing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Nghe thử
                  </button>
                </div>
                <p className="text-3xs italic text-muted-foreground">
                  Nghe thử áp hiệu ứng lên câu mẫu, không lưu gì.
                </p>
              </div>
            )}

            {error && <p className="text-2xs text-destructive">{error}</p>}

            {/* Nút Lưu chính đã chuyển lên tiêu đề đầu cột (context-aware: tạo mới/cập nhật/
                lưu bản sao) — ở đây chỉ còn hành động phụ: xoá preset tuỳ chỉnh đang sửa. */}
            {selected && !readOnly && (
              <button
                type="button"
                onClick={removeSelected}
                disabled={busy}
                className="flex w-fit items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-40"
              >
                <Trash2 size={13} /> Xoá preset
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
