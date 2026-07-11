/**
 * AppModule — contract mỗi app con phải implement.
 * Xem docs/reference/contract-reference.md §AppModule, §PlatformContext.
 */
import type { ComponentType } from 'react';
import type { Capability, CapabilitySet } from './capability.js';
import type { EntitlementSet } from './entitlement.js';
import type { EventBus } from './event-bus.js';
import type { ServiceRegistry } from './service-registry.js';

export interface AppWindowConfig {
  defaultSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  hasMenuBar?: boolean;
  hasStatusBar?: boolean;
  /** Trên theme iOS/Android của device-layout, luôn mở fullscreen */
  mobileFullscreen?: boolean;
}

export interface PlatformContext {
  env: 'electron' | 'web';
  capabilities: CapabilitySet;
  services: ServiceRegistry;
  events: EventBus;
  entitlements: EntitlementSet;
  /** Resolve đường dẫn asset theo môi trường (Electron resources vs Web public/CDN) */
  assetUrl(path: string): string;
}

export interface AppContentProps {
  appId: string;
  windowId: string;
  platform: PlatformContext;
}

export interface AppModule {
  id: string;
  name: string;
  /** "lucide:IconName" hoặc "/path/to/icon.svg" */
  icon: string;
  category?: string;
  window?: AppWindowConfig;

  /** Capability môi trường cần có để app hoạt động đầy đủ */
  requiredCapabilities: Capability[];
  /** Service (qua ServiceRegistry) phải sẵn sàng trước khi mở app */
  requiredServices: string[];
  /** Feature key để EntitlementGate kiểm; bỏ qua = miễn phí, luôn mở được */
  entitlement?: string;

  render: ComponentType<AppContentProps>;
  activate?(ctx: PlatformContext): Promise<void>;
  deactivate?(): Promise<void>;
}
