import { useState } from 'react';
import { Settings2, Palette, Volume2, Variable, LayoutTemplate, Globe, DatabaseBackup, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useControlStore, type SettingsTab } from '../../store';
import { cn } from '../../lib/cn';
import { Modal } from '../ui/Modal';
import { TooltipSimple as Tooltip } from '../ui/TooltipSimple';
import { GeneralSettingsContent } from './GeneralSettingsContent';
import { AppearanceSettingsContent } from './AppearanceSettingsContent';
import { TtsSettingsContent } from './TtsSettingsContent';
import { CustomVariablesContent } from './CustomVariablesContent';
import { LayoutConfigContent } from './LayoutConfigContent';
import { ApiConfigContent } from './ApiConfigContent';
import { BackupSettingsContent } from './BackupSettingsContent';

const TABS: { id: SettingsTab; labelKey: string; Icon: typeof Settings2 }[] = [
  { id: 'general', labelKey: 'settingsModal.general', Icon: Settings2 },
  { id: 'appearance', labelKey: 'settingsModal.appearance', Icon: Palette },
  { id: 'tts', labelKey: 'debugMenu.tts', Icon: Volume2 },
  { id: 'variable', labelKey: 'debugMenu.manageVariables', Icon: Variable },
  { id: 'layout', labelKey: 'debugMenu.layoutConfig', Icon: LayoutTemplate },
  { id: 'api', labelKey: 'debugMenu.apiConfig', Icon: Globe },
  { id: 'backup', labelKey: 'settingsModal.backup', Icon: DatabaseBackup },
];

/** Modal Settings gộp — sidebar chọn tab (General/TTS/Variable/Layout/Api), thay cho 4 modal rời trước đây. */
export function SettingsModal() {
  const { t } = useTranslation();
  const open = useControlStore((s) => s.settingsModalOpen);
  const setOpen = useControlStore((s) => s.setSettingsModalOpen);
  const tab = useControlStore((s) => s.settingsModalTab);
  const setTab = useControlStore((s) => s.setSettingsModalTab);
  // Mặc định thu gọn (chỉ icon) — user tự bấm mở rộng nếu muốn xem label.
  const [collapsed, setCollapsed] = useState(true);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      size="full"
      backdrop="blur"
      title={<span className="text-lg font-bold text-foreground">{t('settingsModal.title')}</span>}
      contentClassName="flex min-h-0 p-0"
    >
      {/* Sidebar */}
      <div className={cn(
        'flex-shrink-0 border-r border-border bg-muted/50 p-3 flex flex-col gap-1 overflow-y-auto transition-[width]',
        collapsed ? 'w-14' : 'w-52'
      )}>
        {TABS.map(({ id, labelKey, Icon }) => {
          const button = (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-left transition-colors',
                collapsed && 'justify-center px-0',
                tab === id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground hover:bg-muted'
              )}
            >
              <Icon size={16} />
              {!collapsed && t(labelKey)}
            </button>
          );
          return collapsed ? (
            <Tooltip key={id} content={t(labelKey)} side="right">
              {button}
            </Tooltip>
          ) : button;
        })}

        <button
          onClick={() => setCollapsed((v) => !v)}
          className={cn(
            'mt-auto flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
            collapsed && 'justify-center px-0'
          )}
          title={collapsed ? t('settingsModal.expand') : t('settingsModal.collapse')}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-y-auto p-6">
        {tab === 'general' && <GeneralSettingsContent />}
        {tab === 'appearance' && <AppearanceSettingsContent />}
        {tab === 'tts' && <TtsSettingsContent />}
        {tab === 'variable' && <CustomVariablesContent />}
        {tab === 'layout' && <LayoutConfigContent />}
        {tab === 'api' && <ApiConfigContent />}
        {tab === 'backup' && <BackupSettingsContent />}
      </div>
    </Modal>
  );
}
