import { useCallback, useEffect, useState } from 'react';
import { Loader2, Mic } from 'lucide-react';
import type { AppContentProps } from '@sky-app/kernel';
import type { SttEnginePort, SttHistoryEntry, SttPort } from '@sky-app/service-contracts';
import { FilePicker } from './components/FilePicker.js';
import { EnginePicker } from './components/EnginePicker.js';
import { ResultPanel } from './components/ResultPanel.js';
import { TranscribeHistoryPanel } from './components/TranscribeHistoryPanel.js';

/** Source gắn cho MỌI lượt phiên âm từ app này (GĐ 3) — lọc lịch sử đúng của app, không
 * lẫn dòng ghi từ nút mic VoiceCloneModal (source: 'voice_clone'/'voice_clone_edit'). */
const HISTORY_SOURCE = 'speech_to_text';

export function SpeechToTextApp({ platform }: AppContentProps) {
  const stt = platform.services.get<SttPort>('stt');
  const sttEngine = platform.services.get<SttEnginePort>('stt-engine');

  const [selectedFile, setSelectedFile] = useState<string | File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [language, setLanguage] = useState('');
  const [resultText, setResultText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SttHistoryEntry[]>([]);

  const refreshHistory = useCallback(async () => {
    if (!stt?.listHistory) return;
    const entries = await stt.listHistory({ source: HISTORY_SOURCE });
    setHistory(entries);
  }, [stt]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  if (!stt) {
    return (
      <div className="speech-to-text-root flex h-full items-center justify-center bg-background p-6">
        <p className="text-sm text-muted-foreground">
          Dịch vụ nhận dạng giọng nói không khả dụng trên môi trường này.
        </p>
      </div>
    );
  }

  const handleFileSelected = (file: string | File, fileName: string) => {
    setSelectedFile(file);
    setSelectedFileName(fileName);
    setResultText('');
    setError(null);
  };

  const handleTranscribe = async () => {
    if (!selectedFile) return;
    setBusy(true);
    setError(null);
    try {
      const res = await stt.transcribe(selectedFile, {
        language: language.trim() || undefined,
        source: HISTORY_SOURCE,
      });
      if (!res?.ok || res.text === undefined) {
        setError(res?.error ?? 'Nhận dạng giọng nói thất bại');
        return;
      }
      setResultText(res.text);
      void refreshHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Kéo-thả 1 File trên Electron không có filePath dạng string — xem FilePicker's
      // docstring cho lý do (webUtils.getPathForFile() cần thêm kênh preload mới, chưa làm).
      setError(
        message.includes('requires a string filePath')
          ? 'Kéo-thả chưa hỗ trợ trên nền tảng này — vui lòng bấm để chọn file qua hộp thoại.'
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!stt.deleteHistoryEntry) return;
    await stt.deleteHistoryEntry(id);
    setHistory((prev) => prev.filter((e) => e.id !== id));
  };

  const handleClearAll = async () => {
    if (!stt.clearHistory) return;
    await stt.clearHistory();
    setHistory([]);
  };

  return (
    <div className="speech-to-text-root relative flex h-full flex-col bg-background">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
        <h3 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-foreground">
          <Mic size={15} /> Speech to Text
        </h3>

        <FilePicker sttPort={stt} selectedFileName={selectedFileName} onFileSelected={handleFileSelected} disabled={busy} />

        <div className="grid grid-cols-2 gap-3">
          <EnginePicker port={sttEngine} disabled={busy} />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-foreground">Ngôn ngữ (tuỳ chọn)</span>
            <input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="vi, en... — bỏ trống để tự nhận diện"
              disabled={busy}
              className="text-sm px-3 py-2 rounded-lg border border-border bg-card focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all disabled:opacity-50"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={handleTranscribe}
          disabled={!selectedFile || busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Đang phiên âm...
            </>
          ) : (
            'Phiên âm'
          )}
        </button>

        {error && (
          <div className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">{error}</div>
        )}

        <ResultPanel text={resultText} onChange={setResultText} busy={busy} />

        <div className="border-t border-border pt-4">
          <TranscribeHistoryPanel
            history={history}
            onDelete={handleDeleteEntry}
            onClearAll={handleClearAll}
            onSelect={(entry) => setResultText(entry.text)}
          />
        </div>
      </div>
    </div>
  );
}
