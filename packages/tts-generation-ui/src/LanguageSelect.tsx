export interface LanguageSelectProps {
  languages: string[];
  value: string;
  onChange: (language: string) => void;
  /** `true` khi engine hiện tại KHÔNG multilingual (vd VieNeu — ngôn ngữ gắn theo bộ preset
   *  giọng, không cần chọn tách rời) — select vẫn HIỆN (không ẩn hẳn) nhưng disable, kèm
   *  `disabledReason` giải thích khi hover. */
  disabled?: boolean;
  disabledReason?: string;
  /** Nhãn hiện khi `disabled` — NGÔN NGỮ THẬT của giọng đang chọn (vd "Tiếng Việt"), KHÔNG
   *  phải chuỗi tĩnh "Không áp dụng" chung chung — người dùng vẫn muốn biết đang nói ngôn ngữ
   *  gì dù không chọn được ở đây. */
  currentLanguageLabel?: string;
  className?: string;
}

/**
 * Dropdown chọn ngôn ngữ cho engine multilingual (Qwen — 1 giọng clone nói được nhiều ngôn
 * ngữ). Rỗng = để server tự đoán từ văn bản (`_guess_language`, KHÔNG đáng tin cho
 * de/fr/pt/es/it — xem engine_qwen.py's docstring).
 */
export function LanguageSelect({
  languages, value, onChange, disabled, disabledReason, currentLanguageLabel, className,
}: LanguageSelectProps) {
  return (
    <select
      value={disabled ? '__current__' : value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      title={disabled ? disabledReason : 'Engine đa ngôn ngữ — chọn tay tránh đoán nhầm (đặc biệt sai với de/fr/pt/es/it)'}
      className={className ?? 'rounded-lg border border-border bg-card px-1.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40'}
    >
      {disabled ? (
        <option value="__current__">{currentLanguageLabel ?? 'Theo giọng đã chọn'}</option>
      ) : (
        <>
          <option value="">Tự đoán từ văn bản</option>
          {languages.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
        </>
      )}
    </select>
  );
}
