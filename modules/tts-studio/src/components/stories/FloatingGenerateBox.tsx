import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import type { StoryPort, TtsPort } from '@sky-app/service-contracts';
import { useTtsStudioStore } from '../../store';

export interface FloatingGenerateBoxProps {
  storyId: string;
  storyPort: StoryPort;
  ttsPort: TtsPort;
  /** Track cuối cùng đang trống — đoạn mới sinh luôn có chỗ riêng, không đè lên item có sẵn
   *  (đúng quy ước `AddFromHistoryPicker`/"Thêm đoạn" đang dùng). */
  track: number;
  onAdded: () => void;
  /** Panel editor docked (`Timeline.tsx`) có thể đang mở phía dưới — né đè lên nhau, đúng cách
   *  voicebox dùng `storyStore.trackEditorHeight` tính padding tránh đè. */
  bottomOffset: number;
}

/**
 * Ô "sinh giọng nói mới" nổi ngay trong tab Story — port RÚT GỌN từ voicebox's
 * `FloatingGenerateBox.tsx` (~640 dòng). Sky-app đã có sẵn toàn bộ pipeline sinh giọng
 * (`useTtsStudioStore` + `TtsPort.synthesizeBuffer`) dùng chung với tab "Sinh giọng" — component
 * này CHỈ là 1 form gọn (text + chọn giọng) gọi lại đúng path đó rồi tự thêm kết quả thẳng vào
 * Story đang mở, không dựng lại pipeline sinh giọng từ đầu như bản voicebox phải làm (họ không
 * có sẵn 1 tab "Sinh giọng" độc lập để tái dùng).
 *
 * State (text/voice) CỐ Ý cục bộ, KHÔNG dùng chung `text`/`selectedVoiceId` của
 * `useTtsStudioStore` — gõ ở đây không nên làm đổi nội dung đang soạn dở ở tab "Sinh giọng".
 * Chỉ đọc `voices` (danh sách, đã tải sẵn lúc mount `TtsStudioApp`) — không tải lại.
 */
export function FloatingGenerateBox({ storyId, storyPort, ttsPort, track, onAdded, bottomOffset }: FloatingGenerateBoxProps) {
  const voices = useTtsStudioStore((s) => s.voices);
  const [text, setText] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveVoiceId = voiceId || voices.find((v) => v.default)?.id || voices[0]?.id || '';
  const disabled = generating || !text.trim() || !effectiveVoiceId;

  const handleGenerate = async () => {
    if (disabled) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await ttsPort.synthesizeBuffer(text.trim(), { voiceId: effectiveVoiceId });
      if (!result.historyId) {
        setError('Môi trường này chưa hỗ trợ tự thêm vào Story — dùng tab "Sinh giọng" rồi bấm "Thêm đoạn" từ lịch sử.');
        return;
      }
      await storyPort.addItemFromHistory(storyId, result.historyId, track);
      setText('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div
      className="absolute inset-x-2 z-10 flex items-center gap-1.5 rounded-xl border border-border bg-popover/95 p-1.5 shadow-lg backdrop-blur"
      style={{ bottom: bottomOffset + 8 }}
    >
      <select
        value={effectiveVoiceId}
        onChange={(e) => setVoiceId(e.target.value)}
        className="w-28 shrink-0 rounded-lg border border-border bg-card px-1.5 py-1.5 text-2xs"
      >
        {voices.length === 0 && <option value="">Chưa có giọng</option>}
        {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !disabled) void handleGenerate(); }}
        placeholder="Gõ văn bản, sinh xong tự thêm vào Story..."
        className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-2xs outline-none focus:border-primary"
      />
      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={disabled}
        title={error ?? undefined}
        className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-2xs text-primary-foreground hover:opacity-90 disabled:opacity-40"
      >
        {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        Sinh & Thêm
      </button>
      {error && (
        <p className="absolute -top-6 left-0 right-0 truncate text-2xs text-destructive">{error}</p>
      )}
    </div>
  );
}
