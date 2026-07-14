import { useTranslation } from 'react-i18next';
import { useControlStore } from '../../store';
import type { Language } from '../../store';
import { cn } from '../../lib/cn';

const LANGUAGE_OPTIONS: { value: Language; flag: string; label: string }[] = [
  { value: 'vi', flag: '🇻🇳', label: 'Tiếng Việt' },
  { value: 'en', flag: '🇬🇧', label: 'English' },
];

/** Tab General của SettingsModal — chỉ chọn ngôn ngữ (theme/appearance đã chuyển sang tab Appearance). */
export function GeneralSettingsContent() {
  const { t } = useTranslation();
  const language = useControlStore((s) => s.language);
  const setLanguage = useControlStore((s) => s.setLanguage);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
          {t('statusBar.switchLanguage')}
        </label>
        <div className="flex gap-2">
          {LANGUAGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setLanguage(opt.value)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors',
                language === opt.value
                  ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                  : 'bg-card border-border text-foreground hover:border-primary/50'
              )}
            >
              <span>{opt.flag}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
