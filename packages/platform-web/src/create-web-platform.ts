import { createPlatformContext, createAllowAllEntitlementSet, type PlatformContext } from '@sky-app/kernel';
import { resolveEntitlementsFromPort } from '@sky-app/licensing';
import type { AssetPort, DataPort, LayoutPort } from '@sky-app/service-contracts';
import { createWebTtsPort } from './adapters/tts.js';
import { createWebLicensePort } from './adapters/license.js';
import { createWebDataPort } from './adapters/data.js';
import { createSqliteWasmDataPort } from './adapters/sqlite-wasm-data.js';
import { createWebLayoutPort } from './adapters/layout.js';
import { createSqliteWasmLayoutPort } from './adapters/sqlite-wasm-layout.js';
import { createWebAssetPort } from './adapters/asset.js';
import { createWasmAssetPort } from './adapters/wasm-asset.js';

export interface CreateWebPlatformOptions {
  ttsBaseUrl?: string;
  /** apps/data-service base URL — REST backend cho DataPort (local-dev-only). */
  dataBaseUrl?: string;
  /** URL sample students.json — dùng cho SqliteWasmAdapter's sync({useSample:true}) khi
   * data-service không khả dụng (fallback). Bỏ qua = SqliteWasmAdapter chỉ đọc dữ liệu đã có
   * sẵn trong IndexedDB, không tự seed sample. */
  sampleStudentsUrl?: string;
  /** URL public của sql-wasm.wasm cho SqliteWasmAdapter — xem SqlJsExecutor's comment. Bắt
   * buộc truyền đúng trong bundle Vite, VD `import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'`. */
  sqlWasmUrl?: string;
  assetUrl?: (path: string) => string;
  /**
   * Public key Ed25519 (hex) nhúng trong app — xác định entitlements nào
   * được tin (xem docs/guides/licensing-entitlement.md). Bỏ qua = mọi
   * entitlement đều mở (dev/chưa cấu hình licensing) — KHÔNG dùng giá trị
   * này để phát hành thật, chỉ hợp lệ khi chưa cài licensing.
   */
  licensePublicKeyHex?: string;
  deviceId?: string;
}

/** Health-check `data-service` (timeout ngắn) — dùng chung cho cả DataPort lẫn LayoutPort, vì
 * cả 2 đều nằm trên cùng 1 server (apps/data-service) và cùng tiêu chí "khả dụng hay không". */
async function isDataServiceAvailable(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    // data-service không khả dụng (chưa chạy / offline / serverless không có server) —
    // fallback SqliteWasmAdapter, không phải lỗi cần báo người dùng.
    return false;
  }
}

/**
 * "3 tầng ưu tiên" của Web đã chốt (data-service → SqliteWasmAdapter → Supabase GĐ2) — xem
 * docs/roadmap/plans/layout-designer/18-luu-tru-sqlite-supabase.md §1a.
 */
async function resolveDataPort(opts: CreateWebPlatformOptions, baseUrl: string, available: boolean): Promise<DataPort> {
  if (available) return createWebDataPort(baseUrl);
  return createSqliteWasmDataPort({ sampleStudentsUrl: opts.sampleStudentsUrl, wasmUrl: opts.sqlWasmUrl });
}

async function resolveLayoutPort(opts: CreateWebPlatformOptions, baseUrl: string, available: boolean): Promise<LayoutPort> {
  if (available) return createWebLayoutPort(baseUrl);
  return createSqliteWasmLayoutPort({ wasmUrl: opts.sqlWasmUrl });
}

function resolveAssetPort(baseUrl: string, available: boolean): AssetPort {
  if (available) return createWebAssetPort(baseUrl);
  return createWasmAssetPort();
}

/**
 * Builds the PlatformContext for apps/shell-web.
 *
 * Async vì entitlements cần đọc + verify license (localStorage) trước khi
 * dock có thể quyết định app nào bị khóa — cùng lý do createElectronPlatform
 * là async (xem docs/dev/history.md GĐ6), giữ 2 platform nhất quán thay vì
 * entitlements reactive.
 */
export async function createWebPlatform(opts: CreateWebPlatformOptions = {}): Promise<PlatformContext> {
  const entitlements = opts.licensePublicKeyHex
    ? await resolveEntitlementsFromPort(
        createWebLicensePort({ publicKeyHex: opts.licensePublicKeyHex, deviceId: opts.deviceId }),
      )
    : ('all' as const);

  const platform = createPlatformContext({
    env: 'web',
    // Web has no secondary display, no native card reader, no local TTS
    // binary, no OS keystore — those ports stay unregistered and their
    // capability stays off, so apps degrade instead of crashing.
    capabilities: ['network', 'tts'],
    entitlements,
    assetUrl: opts.assetUrl,
  });

  const dataBaseUrl = opts.dataBaseUrl ?? 'http://localhost:8094';
  const dataServiceAvailable = await isDataServiceAvailable(dataBaseUrl);

  platform.services.register('tts', createWebTtsPort(opts.ttsBaseUrl));
  platform.services.register('data', await resolveDataPort(opts, dataBaseUrl, dataServiceAvailable));
  platform.services.register('layout', await resolveLayoutPort(opts, dataBaseUrl, dataServiceAvailable));
  platform.services.register('asset', resolveAssetPort(dataBaseUrl, dataServiceAvailable));

  return platform;
}

export { createAllowAllEntitlementSet };
