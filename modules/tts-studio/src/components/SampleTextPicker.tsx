import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sky-app/ui';
import { useTtsStudioStore } from '../store';
import { usePortalContainer } from '../PortalContainerContext';
import { SAMPLE_TEXTS } from '../data/sampleTexts';

/**
 * "Chọn template câu" — dropdown câu mẫu (SAMPLE_TEXTS), chọn 1 câu thì fill NGUYÊN VĂN vào
 * trình soạn thảo (ghi đè, giống hành vi EmotionInsert nhưng thay vì chèn tại con trỏ thì thay
 * toàn bộ — đây là chọn 1 CÂU MẪU hoàn chỉnh, không phải chèn từng đoạn).
 *
 * `value` luôn để rỗng (không set lại theo lựa chọn) — đây là nút HÀNH ĐỘNG "điền mẫu" chứ
 * không phải lựa chọn ghi nhớ, nên trigger luôn hiện lại placeholder sau khi chọn.
 */
export function SampleTextPicker() {
  const setText = useTtsStudioStore((s) => s.setText);
  const container = usePortalContainer();

  return (
    <Select
      value=""
      onValueChange={(v) => {
        const sample = SAMPLE_TEXTS[Number(v)];
        if (sample) setText(sample.text);
      }}
    >
      <SelectTrigger size="sm" className="h-7 gap-1 px-2 text-2xs">
        <SelectValue placeholder="Chọn mẫu câu..." />
      </SelectTrigger>
      {/*
        2 vấn đề riêng biệt, cùng gốc "Radix không biết .tts-studio-root nhỏ hơn viewport":
        1. max-h-(--radix-select-content-available-height) gốc tính theo khoảng trống tới
           VIEWPORT (cả cửa sổ Electron) chứ không phải khung app thực — 11 câu dài tràn ra
           ngoài vùng hiển thị thay vì cuộn. Ép max-height CỐ ĐỊNH qua `style` (thắng mọi
           class nhờ specificity cao hơn) để LUÔN cuộn được.
        2. `avoidCollisions` (bật mặc định) tự né mép, nhưng floating-ui chỉ nhận diện
           "clipping ancestor" qua CSS `overflow`, KHÔNG nhận diện `contain: paint` (thứ
           .tts-studio-root dùng làm containing block theo Rule 3) — nên nó né mép VIEWPORT
           thay vì mép cửa sổ TTS Studio thật, khiến dropdown "bay" ra ngoài cửa sổ dù vẫn
           nằm trong viewport. Truyền thẳng `collisionBoundary={container}` để nó né đúng
           mép thật (bug thật 2026-08-04).
      */}
      <SelectContent
        container={container}
        collisionBoundary={container}
        collisionPadding={8}
        className="w-72"
        style={{ maxHeight: '18rem' }}
      >
        {SAMPLE_TEXTS.map((sample, i) => (
          <SelectItem key={i} value={String(i)}>
            <span className="flex flex-col gap-0.5 py-0.5">
              <span className="line-clamp-2 text-xs text-foreground">{sample.text}</span>
              <span className="text-2xs text-muted-foreground">{sample.source}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
