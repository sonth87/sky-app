import { useState, type ReactNode } from 'react';
import { Cpu, Wand2, ScrollText, Settings as SettingsIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FloatingWindow } from '@sonth87/device-layout';
import type { TtsEnginePort, EffectPresetPort, TtsPort } from '@sky-app/service-contracts';
import { EngineManagerContent } from './EngineManager.js';
import { DeviceConfig } from './DeviceConfig.js';
import { TtsLogPanel } from './TtsLogPanel.js';
import { EffectsManagerPanel } from './EffectsManagerPanel.js';

export type ConfigTab = 'engine' | 'effects' | 'logs' | 'settings';

export interface ConfigWindowProps {
  open: boolean;
  onClose: () => void;
  /** Port quản lý engine — lấy qua platform.services.get('tts-engine'). */
  port: TtsEnginePort;
  /** Port quản lý preset hiệu ứng — thiếu = tab Effects ẩn hẳn (giống cách EffectsPanel cũ
   *  ẩn khi thiếu, xem modules/tts-studio's EffectsPanel.tsx). */
  effectPresetPort?: EffectPresetPort;
  /** Port tổng hợp giọng nói — cần cho danh sách hiệu ứng khả dụng + preview trong tab
   *  Effects (`listEffectTypes`/`listVoices`/`speak`). */
  ttsPort?: TtsPort;
  /** True khi nền tảng cài đặt được engine/gói tăng tốc về máy (capability 'tts-local'). */
  canInstall?: boolean;
  /** Ghi chú riêng của app nhúng, hiện trong tab Models/Engine (vd nhắc tải tự tạm dừng
   *  lúc đang hành lễ — Ceremony dùng, không liên quan gì tới TTS Studio). */
  notice?: ReactNode;
  /** Root DOM của app gọi — truyền vào FloatingWindow để portal đúng subtree theme, xem
   *  giải thích đầy đủ ở EngineManagerProps.portalContainer. */
  portalContainer?: HTMLElement | null;
  /** Tab mở sẵn khi cửa sổ hiện ra. Mặc định 'engine'. */
  initialTab?: ConfigTab;
  /** Resolve path tương đối thành URL đúng môi trường (Web public/ vs Electron resources) —
   *  truyền xuống tab Effects cho ảnh minh hoạ giọng ở picker Preview. */
  assetUrl?: (path: string) => string;
}

const TABS: Array<{ id: ConfigTab; icon: typeof Cpu; labelKey: string }> = [
  { id: 'engine', icon: Cpu, labelKey: 'configWindow.tabs.engine' },
  { id: 'effects', icon: Wand2, labelKey: 'configWindow.tabs.effects' },
  { id: 'logs', icon: ScrollText, labelKey: 'configWindow.tabs.logs' },
  { id: 'settings', icon: SettingsIcon, labelKey: 'configWindow.tabs.settings' },
];

/**
 * Cửa sổ "Cấu hình" gộp — thay 3 mục menu tách rời cũ (Quản lý engine / Thiết bị xử lý /
 * Xem log) bằng 1 cửa sổ có sidebar tab dọc (Models/Engine, Effects, Logs, Settings).
 *
 * Mỗi tab chỉ MOUNT nội dung khi đang active (không giữ cả 4 trong DOM ẩn/hiện bằng CSS) —
 * khớp đúng cách `EngineManagerContent` quản lý lifecycle của nó (subscribe tiến độ cài đặt
 * lúc mount, huỷ lúc unmount, coi mount = "đang mở"). Chuyển tab đi thì huỷ subscribe của
 * tab cũ, quay lại thì subscribe lại — đánh đổi hợp lý cho việc không phải giữ 4 bộ state
 * sống cùng lúc.
 */
export function ConfigWindow({
  open,
  onClose,
  port,
  effectPresetPort,
  ttsPort,
  canInstall = false,
  notice,
  portalContainer,
  initialTab = 'engine',
  assetUrl,
}: ConfigWindowProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ConfigTab>(initialTab);

  if (!open) return null;

  return (
    <FloatingWindow
      onClose={onClose}
      title={t('configWindow.title')}
      width={760}
      height={560}
      blocking={false}
      resizable
      minWidth={640}
      minHeight={440}
      // min-h-0 BẮT BUỘC (xem comment ở FloatingWindow.tsx's contentClassName): thiếu nó,
      // div này không co được xuống chiều cao còn lại (window - titlebar), tràn ra ngoài
      // rồi bị chính overflow-hidden của khung cửa sổ cắt mất — không phải lỗi cuộn bên
      // trong (Effects tab), mà nội dung đã bị cắt trước khi tới được vùng cuộn đó.
      contentClassName="flex min-h-0 flex-1 w-full"
      container={portalContainer}
    >
      {/* Rail icon-only, không nhãn chữ — tham khảo thanh điều hướng dọc bên trái của
          voicebox. `title` bù lại phần mô tả bằng tooltip native, không cần component
          tooltip riêng cho 4 mục cố định này. */}
      <nav className="flex w-14 shrink-0 flex-col items-center gap-1.5 border-r border-border bg-muted/20 py-3">
        {TABS.map(({ id, icon: Icon, labelKey }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            title={t(labelKey)}
            className={
              activeTab === id
                ? 'flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary'
                : 'flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            }
          >
            <Icon size={19} className="shrink-0" />
          </button>
        ))}
      </nav>

      {/* min-h-0: flex item mặc định không co dưới chiều cao nội dung — thiếu nó, tab dài
          (vd Effects) đẩy tràn FloatingWindow thay vì bị overflow-y-auto ở đây cắt/cuộn. */}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">
        {activeTab === 'engine' && (
          <EngineManagerContent port={port} canInstall={canInstall} notice={notice} />
        )}
        {activeTab === 'effects' && (
          <EffectsManagerPanel effectPresetPort={effectPresetPort} ttsPort={ttsPort} assetUrl={assetUrl} />
        )}
        {activeTab === 'logs' && <TtsLogPanel port={port} />}
        {activeTab === 'settings' && (
          <DeviceConfig
            port={port}
            canInstall={canInstall}
            engineManagerNotice={notice}
            collapsible={false}
            onOpenEngineManager={() => setActiveTab('engine')}
          />
        )}
      </div>
    </FloatingWindow>
  );
}
