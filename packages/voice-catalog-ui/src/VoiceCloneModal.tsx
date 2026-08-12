import { useEffect, useState } from 'react';
import { Upload, Play, Trash2, Loader2, AlertTriangle, X } from 'lucide-react';
import type { TtsPort, Voice } from '@sky-app/service-contracts';

export interface VoiceCloneModalProps {
  open: boolean;
  onClose: () => void;
  ttsPort: TtsPort | undefined;
  onRefresh: () => void;
  clonedVoices: Voice[];
}

/** 1 file mẫu đang chờ gửi — chưa phải sample thật trong registry (đó chỉ có sau khi
 * `cloneVoice()` thành công). `filePath` là string (Electron) hoặc `File` (Web), khớp
 * `TtsPort.cloneVoice`'s `samples[].filePath: string | any`. */
interface DraftSample {
  filePath: string | File;
  fileName: string;
  refText: string;
}

const PREVIEW_TEXT = 'Xin chúc mừng tân cử nhân đã tốt nghiệp.';

export function VoiceCloneModal({ open, onClose, ttsPort, onRefresh, clonedVoices }: VoiceCloneModalProps) {
  // Nhiều mẫu cho 1 giọng — ghép lại lúc synthesize cho model nhiều ngữ cảnh về giọng hơn
  // (port từ voicebox's combine_voice_prompts, xem audio_dsp.py's combine_voice_samples).
  const [samples, setSamples] = useState<DraftSample[]>([]);
  const [label, setLabel] = useState('');
  const [gender, setGender] = useState('female');
  const [region, setRegion] = useState('Bắc');
  const [age, setAge] = useState('young adult');
  const [language, setLanguage] = useState('vi-VN');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState<string | null>(null);
  // Engine clone kiểu in-context (Qwen) BẮT BUỘC có bản chép lời cho MẪU ĐẦU TIÊN — thiếu
  // là audio hỏng hoàn toàn chứ không phải kém đi (các mẫu sau không bắt buộc). Hỏi engine
  // đang chạy thay vì hard-code danh sách engine ở đây: engine mới thêm sau chỉ cần khai
  // `requires_ref_text` là UI tự đúng.
  const [refTextRequired, setRefTextRequired] = useState(false);

  useEffect(() => {
    if (!open || !ttsPort?.getEngineCapabilities) return;
    let alive = true;
    ttsPort
      .getEngineCapabilities()
      .then((caps) => {
        if (alive) setRefTextRequired(Boolean(caps?.requires_ref_text));
      })
      .catch(() => {
        // Không hỏi được thì để mặc không bắt buộc — server vẫn chặn bằng lỗi 400 có
        // thông báo đọc được. Thà để người dùng thử và nhận lỗi rõ còn hơn chặn nhầm
        // khi engine đang chạy vốn không cần transcript.
      });
    return () => {
      alive = false;
    };
  }, [open, ttsPort]);

  if (!open) return null;

  const addDraftSamples = (added: DraftSample[]) => {
    if (added.length === 0) return;
    setSamples((prev) => [...prev, ...added]);
    if (!label) {
      setLabel(added[0]!.fileName.replace(/\.(wav|mp3)$/i, ''));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = Array.from(e.target.files ?? []);
    addDraftSamples(files.map((f) => ({ filePath: f, fileName: f.name, refText: '' })));
    e.target.value = ''; // cho phép chọn lại đúng file đó lần nữa nếu cần
  };

  const pickFile = async () => {
    setError(null);
    if (!ttsPort?.pickAudioFile) {
      // Nếu không có pickAudioFile (môi trường Web), ta dùng HTML file input
      const fileInput = document.getElementById('voice-file-input');
      fileInput?.click();
      return;
    }
    const res = await ttsPort.pickAudioFile();
    if (res?.ok && res.filePaths?.length) {
      addDraftSamples(
        res.filePaths.map((p) => ({ filePath: p, fileName: p.split(/[\\/]/).pop() ?? p, refText: '' })),
      );
    }
  };

  const removeSample = (index: number) => {
    setSamples((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSampleRefText = (index: number, text: string) => {
    setSamples((prev) => prev.map((s, i) => (i === index ? { ...s, refText: text } : s)));
  };

  const doClone = async () => {
    if (samples.length === 0 || !label.trim()) {
      setError('Vui lòng chọn ít nhất 1 file và nhập tên giọng đọc.');
      return;
    }
    if (refTextRequired && !samples[0]!.refText.trim()) {
      setError('Engine đang dùng cần bản chép lời cho MẪU ĐẦU TIÊN — hãy nhập nội dung audio mẫu đó đang nói.');
      return;
    }
    setBusy(true);
    setError(null);
    setWarnings([]);
    try {
      if (!ttsPort?.cloneVoice) throw new Error('TTS clone is not supported on this platform');

      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await ttsPort.cloneVoice({
        samples: samples.map((s) => ({ filePath: s.filePath, refText: s.refText.trim() || undefined })),
        label: label.trim(),
        gender,
        region,
        age,
        language,
        tagline: tagline.trim(),
        description: description.trim(),
        tags,
      });

      if (!res?.ok) {
        setError(res?.error ?? 'Clone giọng thất bại');
        return;
      }
      setWarnings(res.voice?.warnings ?? []);
      onRefresh();

      // Reset form
      setSamples([]);
      setLabel('');
      setTagline('');
      setDescription('');
      setTagsInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const previewVoice = async (voiceId: string) => {
    setPreviewing(voiceId);
    try {
      if (!ttsPort) return;
      await ttsPort.speak(PREVIEW_TEXT, { voiceId });
    } catch (err) {
      console.error(err);
    } finally {
      setPreviewing(null);
    }
  };

  const deleteVoice = async (voiceId: string, voiceLabel: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa giọng đọc "${voiceLabel}"?`)) return;
    if (!ttsPort?.deleteVoice) return;
    const res = await ttsPort.deleteVoice(voiceId);
    if (res?.ok) onRefresh();
    else setError(res?.error ?? 'Xóa giọng thất bại');
  };

  return (
    // absolute (không phải fixed) — modal này nằm ngay trong DOM tree của app, không portal
    // ra ngoài. `fixed` lấy containing block là toàn màn hình Electron (viewport thật) khi
    // không có ancestor transform nào chặn giữa đường — bug thật phát hiện qua test thực tế:
    // resize cửa sổ TTS Studio nhỏ lại, modal vẫn theo kích thước MÀN HÌNH chứ không theo
    // đúng khung cửa sổ. `absolute inset-0` neo chắc chắn vào ancestor `position: relative`
    // GẦN NHẤT — ở đây là chính root của app (xem `rootRef` trong TtsStudioApp.tsx, tương tự
    // cho Ceremony), không phụ thuộc suy đoán về hành vi transform của Window.tsx.
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      {/* Hidden file input for web fallback — multiple: 1 giọng clone được từ nhiều mẫu */}
      <input
        type="file"
        id="voice-file-input"
        accept=".wav,.mp3"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <div
        // min-w-0 — BẮT BUỘC: đây là flex item của backdrop (flex items-center), mặc định
        // min-width:auto khiến item không co xuống dưới kích thước nội dung dù đã có
        // max-w-full, nên khi cửa sổ chứa (Window.tsx) nhỏ hơn 960px, khung này tràn ra
        // ngoài viền cửa sổ thay vì co lại — cùng kiểu lỗi mà dòng 326 (bên dưới) đã tự vá.
        className="flex min-w-0 flex-col w-[960px] max-w-full rounded-xl bg-card border border-border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <span className="text-lg font-bold text-foreground">Sao chép giọng đọc (Clone Voice)</span>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content - Bố cục 2 cột */}
        <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] divide-y md:divide-y-0 md:divide-x divide-border">
          {/* Cột Trái: Form nhập thông tin */}
          <div className="p-6 flex min-w-0 flex-col gap-4 max-h-[75vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Thông tin giọng đọc mới</h3>

            <div className="flex flex-col gap-3.5">
              {/* Nút thêm file — bấm được nhiều lần, mỗi lần cộng dồn vào danh sách mẫu
                  bên dưới thay vì thay thế, để gộp dần nhiều lượt chọn khác nhau. */}
              <button
                type="button"
                onClick={pickFile}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3.5 py-2.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
              >
                <Upload size={14} /> Thêm file WAV mẫu
              </button>

              {/* Danh sách mẫu đã chọn — mỗi mẫu 1 ô transcript riêng (khác giọng đơn-mẫu
                  cũ chỉ có 1 ô transcript cho cả voice). Mẫu ĐẦU là mẫu chính. */}
              {samples.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Chưa có file mẫu nào được chọn.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {samples.map((s, i) => (
                    <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-foreground">
                          {i === 0 && (
                            <span className="mr-1.5 rounded bg-primary/15 px-1.5 py-0.5 text-2xs text-primary">
                              Mẫu chính
                            </span>
                          )}
                          {s.fileName}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSample(i)}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Bỏ mẫu này"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <textarea
                        value={s.refText}
                        onChange={(e) => updateSampleRefText(i, e.target.value)}
                        placeholder="Gõ đúng từng chữ mà file audio đang đọc..."
                        rows={1}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-card focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none transition-all"
                      />
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                {refTextRequired
                  ? 'Engine đang dùng cần biết audio mẫu CHÍNH nói gì để học cách phát âm — bắt buộc với mẫu chính, tuỳ chọn với mẫu bổ sung.'
                  : 'Không bắt buộc, nhưng gõ vào sẽ giúp clone giống giọng gốc hơn.'}
              </p>

              {/* Form fields */}
              <div className="grid grid-cols-2 gap-3.5">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-foreground">Tên giọng đọc</span>
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Nhập tên giọng..."
                    className="text-sm px-3 py-2 rounded-lg border border-border bg-card focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-foreground">Giới tính</span>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="text-sm px-2.5 py-2 rounded-lg border border-border bg-card focus:border-primary outline-none transition-all"
                  >
                    <option value="female">Nữ</option>
                    <option value="male">Nam</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-foreground">Ngôn ngữ</span>
                  <select
                    value={language}
                    onChange={(e) => {
                      const newLang = e.target.value;
                      setLanguage(newLang);
                      if (newLang === 'vi-VN' && !region) {
                        setRegion('Bắc');
                      } else if (newLang !== 'vi-VN') {
                        setRegion('');
                      }
                    }}
                    className="text-sm px-2.5 py-2 rounded-lg border border-border bg-card focus:border-primary outline-none transition-all"
                  >
                    <option value="vi-VN">Tiếng Việt (vi-VN)</option>
                    <option value="en-US">Tiếng Anh (en-US)</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-foreground">Độ tuổi (Age)</span>
                  <select
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="text-sm px-2.5 py-2 rounded-lg border border-border bg-card focus:border-primary outline-none transition-all"
                  >
                    <option value="child">Trẻ em</option>
                    <option value="young adult">Thanh niên</option>
                    <option value="adult">Trưởng thành</option>
                    <option value="senior">Cao tuổi</option>
                  </select>
                </label>
              </div>

              {language === 'vi-VN' && (
                <div>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-foreground">Vùng miền (Accent)</span>
                    <select
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      className="text-sm px-2.5 py-2 rounded-lg border border-border bg-card focus:border-primary outline-none transition-all"
                    >
                      <option value="">-- Chọn vùng miền --</option>
                      <option value="Bắc">Miền Bắc</option>
                      <option value="Trung">Miền Trung</option>
                      <option value="Nam">Miền Nam</option>
                    </select>
                  </label>
                </div>
              )}

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-foreground">Tagline (Mô tả ngắn)</span>
                <input
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="Ví dụ: Giọng trầm ấm, truyền cảm..."
                  className="text-sm px-3 py-2 rounded-lg border border-border bg-card focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-foreground">Tags (Chất giọng - phân tách bằng dấu phẩy)</span>
                <input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="Ví dụ: calm, gentle, deep"
                  className="text-sm px-3 py-2 rounded-lg border border-border bg-card focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-foreground">Mô tả chi tiết</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Nhập mô tả về mục đích sử dụng giọng nói..."
                  rows={2}
                  className="text-sm px-3 py-2 rounded-lg border border-border bg-card focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none transition-all"
                />
              </label>
            </div>

            {error && (
              <div className="flex items-start gap-1.5 text-xs text-destructive bg-destructive/10 rounded-lg p-2.5">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" /> <span>{error}</span>
              </div>
            )}
            {warnings.length > 0 && (
              <div className="flex flex-col gap-1 text-xs text-warning-foreground bg-warning/10 rounded-lg p-2.5">
                {warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" /> <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={busy || samples.length === 0 || !label.trim()}
              onClick={doClone}
              className={`flex w-full items-center justify-center rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50`}
            >
              {busy ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 size={16} className="animate-spin" /> Đang tạo giọng đọc...
                </span>
              ) : (
                `Tạo giọng đọc${samples.length > 1 ? ` (${samples.length} mẫu)` : ''}`
              )}
            </button>
            <p className="text-[10px] italic text-muted-foreground">
              Mẹo: Chọn âm thanh chất lượng cao, không tạp âm, giọng chuẩn rõ ràng từ 5 - 15 giây. Thêm
              nhiều mẫu giúp model nắm giọng tốt hơn.
            </p>
          </div>

          {/* Cột Phải: Danh sách giọng cá nhân */}
          <div className="p-6 flex min-w-0 flex-col gap-4">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Danh sách giọng cá nhân ({clonedVoices.length})
            </h3>

            <div className="flex-1 min-w-0 max-h-[60vh] overflow-y-auto pr-1 flex flex-col gap-2.5">
              {clonedVoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-xl bg-muted/10">
                  <p className="text-xs text-muted-foreground">Chưa có giọng cá nhân nào được tạo.</p>
                </div>
              ) : (
                clonedVoices.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5 bg-muted/20 hover:bg-muted/30 transition-colors">
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-sm font-semibold text-foreground truncate">{v.name}</span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {[v.accent, v.language, v.tagline].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => previewVoice(v.id)}
                        disabled={previewing === v.id}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors animate-all"
                        title="Nghe thử"
                      >
                        {previewing === v.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteVoice(v.id, v.name)}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors animate-all"
                        title="Xóa giọng"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
