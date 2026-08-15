import { useState } from 'react';
import { Upload } from 'lucide-react';
import type { SttPort } from '@sky-app/service-contracts';

export interface FilePickerProps {
  sttPort?: SttPort;
  selectedFileName: string | null;
  onFileSelected: (file: string | File, fileName: string) => void;
  disabled?: boolean;
}

/**
 * Chọn/kéo-thả 1 file audio. Mirror `pickFile`/`handleFileChange` trong
 * packages/voice-catalog-ui/src/VoiceCloneModal.tsx (thử `sttPort.pickAudioFile?.()` trước,
 * fallback `<input type="file">` ẩn cho Web).
 *
 * Kéo-thả: hoạt động ĐẦY ĐỦ trên Web (`File` object dùng thẳng được với
 * `SttPort.transcribe()`). Trên Electron, `transcribe()` đòi filePath dạng string (đọc file
 * qua Node `fs`, xem platform-electron's adapters/stt.ts) — 1 `File` object kéo-thả KHÔNG tự
 * có sẵn path đó (Electron ≥32's `webUtils.getPathForFile()` có thể giải quyết, nhưng cần
 * thêm 1 kênh preload mới chưa có tiền lệ trong repo và chưa kiểm chứng được trong phiên
 * này) — nên trên Electron, thả file vẫn gọi `onFileSelected` với `File`, và tầng gọi
 * (SpeechToTextApp) tự bắt lỗi `transcribe()` ném ra để báo người dùng dùng nút Chọn file
 * thay vì kéo-thả, KHÔNG giả vờ kéo-thả hoạt động đầy đủ trên Electron.
 */
export function FilePicker({ sttPort, selectedFileName, onFileSelected, disabled }: FilePickerProps) {
  const [dragOver, setDragOver] = useState(false);

  const pickFile = async () => {
    if (disabled) return;
    if (!sttPort?.pickAudioFile) {
      document.getElementById('stt-file-input')?.click();
      return;
    }
    const res = await sttPort.pickAudioFile();
    if (res?.ok && res.filePaths?.length) {
      const p = res.filePaths[0]!;
      onFileSelected(p, p.split(/[\\/]/).pop() ?? p);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại đúng file đó lần nữa nếu cần
    if (file) onFileSelected(file, file.name);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFileSelected(file, file.name);
  };

  return (
    <div
      onClick={pickFile}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
        dragOver ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
      } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      <input
        type="file"
        id="stt-file-input"
        accept=".wav,.mp3"
        className="hidden"
        onChange={handleFileChange}
      />
      <Upload size={20} className="text-muted-foreground" />
      {selectedFileName ? (
        <span className="max-w-full truncate text-sm font-medium text-foreground">{selectedFileName}</span>
      ) : (
        <>
          <span className="text-sm text-foreground">Chọn hoặc kéo-thả file audio vào đây</span>
          <span className="text-xs text-muted-foreground">WAV hoặc MP3</span>
        </>
      )}
    </div>
  );
}
