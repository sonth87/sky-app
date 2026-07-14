import { FileText } from 'lucide-react';
import { useTtsStudioStore } from '../store';

export function TextInputPanel() {
  const text = useTtsStudioStore((s) => s.text);
  const setText = useTtsStudioStore((s) => s.setText);

  return (
    <div className="flex flex-1 flex-col gap-2 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <FileText size={14} /> Trình soạn thảo văn bản
        </div>
        <span className="text-2xs text-muted-foreground">{text.length} ký tự</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Nhập nội dung cần chuyển thành giọng nói..."
        className="min-h-[240px] flex-1 resize-none bg-transparent px-3 pb-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
