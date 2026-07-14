import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Play, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { useControlStore } from '../store';
import { translateStyle, useVoiceCatalog } from './VoicePickerPopover';
import { playPcm } from '../../lib/audio';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface Props {
  open: boolean;
  onClose: () => void;
}

const PREVIEW_TEXT = 'Xin chúc mừng tân cử nhân đã tốt nghiệp.';

export function VoiceCloneModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const catalog = useVoiceCatalog();
  const refreshCatalog = useControlStore((s) => s.refreshVoiceCatalog);

  const [filePath, setFilePath] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [gender, setGender] = useState('female');
  const [region, setRegion] = useState('Bắc');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState<string | null>(null);

  // Giọng clone = type 'cloned' và không phải 6 giọng mặc định (id ngắn NF/SF/...).
  // Server trả type; ở đây lọc theo id bắt đầu bằng 'vieneu-clone-'.
  const clonedVoices = catalog.filter((v) => v.id.startsWith('vieneu-clone-'));

  const pickFile = async () => {
    setError(null);
    const res = await window.slide?.pickAudioFile?.();
    if (res?.ok && res.filePath) {
      setFilePath(res.filePath);
      // Gợi ý label từ tên file nếu chưa nhập.
      if (!label) {
        const base = res.filePath.split(/[\\/]/).pop()?.replace(/\.wav$/i, '') ?? '';
        setLabel(base);
      }
    }
  };

  const doClone = async () => {
    if (!filePath || !label.trim()) {
      setError(t('voiceClone.errors.fileAndLabelRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    setWarnings([]);
    try {
      const res = await window.slide?.cloneVoice?.({ filePath, label: label.trim(), gender, region });
      if (!res?.ok) {
        setError(res?.error ?? t('voiceClone.errors.cloneFailed'));
        return;
      }
      setWarnings(res.voice?.warnings ?? []);
      refreshCatalog();
      // Reset form (giữ warnings hiển thị).
      setFilePath(null);
      setLabel('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const previewVoice = async (voiceId: string) => {
    setPreviewing(voiceId);
    try {
      const res = await window.slide?.speak?.(PREVIEW_TEXT, voiceId, 1.0);
      if (res?.ok && res.buffer) await playPcm(res.buffer, res.sampleRate ?? 48000);
    } finally {
      setPreviewing(null);
    }
  };

  const deleteVoice = async (voiceId: string, voiceLabel: string) => {
    if (!confirm(t('voiceClone.confirms.deleteVoice', { label: voiceLabel }))) return;
    const rawId = voiceId.replace(/^vieneu-/, '');
    const res = await window.slide?.deleteVoice?.(rawId);
    if (res?.ok) refreshCatalog();
    else setError(res?.error ?? t('voiceClone.errors.deleteFailed'));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={<span className="text-base font-bold text-foreground">{t('voiceClone.title')}</span>}
      contentClassName="max-h-[85vh] overflow-y-auto p-5"
    >
        <div className="flex flex-col gap-4">
          {/* Form clone */}
          <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <div className="flex items-center gap-2">
              <Button variant="secondary-outline" icon={<Upload size={14} />} onClick={pickFile}>
                {t('voiceClone.chooseWavFile')}
              </Button>
              <span className="text-xs text-muted-foreground truncate flex-1">
                {filePath ? filePath.split(/[\\/]/).pop() : t('voiceClone.noFileChosen')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-foreground">{t('voiceClone.voiceName')}</span>
                <input
                  value={label} onChange={(e) => setLabel(e.target.value)}
                  placeholder={t('voiceClone.voiceNamePlaceholder') as string}
                  className="text-sm px-2.5 py-1.5 rounded-lg border border-border focus:border-primary/40 outline-none"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-foreground">{t('voiceClone.gender')}</span>
                  <select value={gender} onChange={(e) => setGender(e.target.value)}
                    className="text-sm px-2 py-1.5 rounded-lg border border-border outline-none">
                    <option value="female">{t('voiceClone.female')}</option>
                    <option value="male">{t('voiceClone.male')}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-foreground">{t('voiceClone.region')}</span>
                  <select value={region} onChange={(e) => setRegion(e.target.value)}
                    className="text-sm px-2 py-1.5 rounded-lg border border-border outline-none">
                    <option value="Bắc">{t('voiceClone.regionNorth')}</option>
                    <option value="Nam">{t('voiceClone.regionSouth')}</option>
                  </select>
                </label>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-1.5 text-xs text-destructive bg-destructive/10 rounded-lg p-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> <span>{error}</span>
              </div>
            )}
            {warnings.length > 0 && (
              <div className="flex flex-col gap-1 text-xs text-warning-foreground bg-warning/10 rounded-lg p-2">
                {warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" /> <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            <Button
              variant="primary"
              size="md"
              fullWidth
              disabled={busy || !filePath || !label.trim()}
              loading={busy}
              onClick={doClone}
            >
              {busy ? t('voiceClone.creating') : t('voiceClone.createVoice')}
            </Button>
            <p className="text-2xs italic text-muted-foreground">
              {t('voiceClone.recordingTip')}
            </p>
          </div>

          {/* Danh sách giọng clone */}
          <div className="flex flex-col gap-2">
            <span className="text-sm-13 font-semibold text-foreground">
              {t('voiceClone.clonedVoicesCount', { count: clonedVoices.length })}
            </span>
            {clonedVoices.length === 0 && (
              <p className="text-xs text-muted-foreground">{t('voiceClone.noClonedVoices')}</p>
            )}
            {clonedVoices.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div className="flex flex-col">
                  <span className="text-sm text-foreground">{v.label}</span>
                  <span className="text-2xs text-muted-foreground">{v.region} · {translateStyle(t, v.style)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => previewVoice(v.id)}
                    disabled={previewing === v.id}
                    title={t('voiceClone.tryListen')}
                    className="hover:bg-primary/10 hover:text-primary"
                  >
                    {previewing === v.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  </Button>
                  <Button
                    variant="danger-ghost"
                    size="xs"
                    onClick={() => deleteVoice(v.id, v.label)}
                    title={t('voiceClone.deleteVoice')}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
    </Modal>
  );
}
