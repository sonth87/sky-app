import { useTranslation } from 'react-i18next';
import { useControlStore } from '../store';
import { ToolbarGroup } from './ToolbarGroup';

export function OptionsToggle() {
  const { t } = useTranslation();
  const showAll = useControlStore((s) => s.showAllStudents);
  const setShowAll = useControlStore((s) => s.setShowAllStudents);
  const delaySeconds = useControlStore((s) => s.delaySeconds);
  const setDelaySeconds = useControlStore((s) => s.setDelaySeconds);
  const idleTimeoutEnabled = useControlStore((s) => s.idleTimeoutEnabled);
  const setIdleTimeoutEnabled = useControlStore((s) => s.setIdleTimeoutEnabled);
  const idleTimeoutSeconds = useControlStore((s) => s.idleTimeoutSeconds);
  const setIdleTimeoutSeconds = useControlStore((s) => s.setIdleTimeoutSeconds);

  const handleDelayChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const cleanVal = isNaN(val) ? 0 : Math.max(0, val);
    setDelaySeconds(cleanVal);
    try {
      await window.slide.updateConfig({ delay_seconds: cleanVal });
    } catch (err) {
      console.error('[OptionsToggle] Failed to update delay seconds:', err);
    }
  };

  const handleIdleTimeoutToggle = async (checked: boolean) => {
    setIdleTimeoutEnabled(checked);
    try {
      await window.slide.updateConfig({ idle_timeout_enabled: checked });
    } catch (err) {
      console.error('[OptionsToggle] Failed to update idle timeout enabled:', err);
    }
  };

  const handleIdleTimeoutSecondsChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    const cleanVal = isNaN(val) ? 1 : Math.max(1, val);
    setIdleTimeoutSeconds(cleanVal);
    try {
      await window.slide.updateConfig({ idle_timeout_seconds: cleanVal });
    } catch (err) {
      console.error('[OptionsToggle] Failed to update idle timeout seconds:', err);
    }
  };

  return (
    <ToolbarGroup icon="⚙️" label={t('optionsToggle.label')} active={delaySeconds > 0}>
      {() => (
        <div className="flex w-64 flex-col gap-4 p-4 text-foreground">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('optionsToggle.display')}</span>
            <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm font-medium">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-indigo-500 accent-indigo-600"
              />
              {t('optionsToggle.showAllStudentsPanel')}
            </label>
          </div>

          <hr className="border-border" />

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('optionsToggle.slideOperation')}</span>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">
                  {t('optionsToggle.slideDelay')}
                </label>
                <span className="text-xs font-semibold text-primary">
                  {delaySeconds === 0 ? t('optionsToggle.instant') : t('optionsToggle.seconds', { seconds: delaySeconds.toFixed(1) })}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={delaySeconds}
                onChange={handleDelayChange}
                className="h-1.5 w-full cursor-pointer appearance-none rounded bg-muted accent-indigo-600"
              />
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                {t('optionsToggle.slideDelayHint')}
              </p>
            </div>
          </div>

          <hr className="border-border" />

          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={idleTimeoutEnabled}
                onChange={(e) => handleIdleTimeoutToggle(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-indigo-500 accent-indigo-600"
              />
              {t('optionsToggle.autoIdleReturn')}
            </label>
            {idleTimeoutEnabled && (
              <div className="flex flex-col gap-1.5 pl-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t('optionsToggle.afterHowLong')}</span>
                  <input
                    type="number"
                    min={1}
                    value={idleTimeoutSeconds}
                    onChange={handleIdleTimeoutSecondsChange}
                    className="w-16 rounded border border-border px-1.5 py-0.5 text-right text-xs font-semibold text-primary"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {t('optionsToggle.idleTimeoutHint')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </ToolbarGroup>
  );
}
