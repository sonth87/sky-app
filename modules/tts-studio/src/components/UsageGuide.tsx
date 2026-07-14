import { BookOpen, MousePointerClick, SlidersHorizontal, Type, Download } from 'lucide-react';

const STEPS = [
  { icon: MousePointerClick, title: '1. Chọn giọng', desc: 'Chọn giọng đọc trong danh sách, bấm nút loa để nghe thử.' },
  { icon: SlidersHorizontal, title: '2. Chỉnh tốc độ', desc: 'Kéo thanh trượt để tăng/giảm tốc độ đọc từ 0.5x đến 2.0x.' },
  { icon: Type, title: '3. Nhập nội dung', desc: 'Gõ hoặc dán văn bản cần đọc vào ô soạn thảo.' },
  { icon: Download, title: '4. Tạo & tải về', desc: 'Bấm "Tạo giọng nói", chờ vài giây rồi nghe hoặc tải file audio.' },
];

export function UsageGuide() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <BookOpen size={14} /> Hướng dẫn sử dụng
      </div>
      <div className="flex flex-col gap-2.5">
        {STEPS.map((step) => (
          <div key={step.title} className="flex items-start gap-2">
            <step.icon size={14} className="mt-0.5 shrink-0 text-primary" />
            <div className="flex flex-col">
              <span className="text-xs font-medium text-foreground">{step.title}</span>
              <span className="text-2xs text-muted-foreground">{step.desc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
