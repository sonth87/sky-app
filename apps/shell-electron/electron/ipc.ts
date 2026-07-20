import { ipcMain, app, dialog, type BrowserWindow } from 'electron';
import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { dirname, join, extname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isUpdateReadyToInstall, getPendingNativeUpdateInfo } from './update-checker';
import { layoutAssetsDir } from './slide/data/paths';
import type { CanonicalGroup, CanonicalSubject, EventDocument, FieldMappingProfile, LayoutContent } from '@sky-app/slide-shared';
import type { DataSource } from '@sky-app/slide-shared';
import {
  createEvent,
  createLayoutDocument,
  getCurrentActiveEvent,
  getDataSource,
  getDataSourceRecords,
  getEvent,
  getLayoutDocument,
  getVersion,
  insertAsset,
  insertDataSource,
  insertDataSourceRecords,
  listAssets,
  listDataSources,
  listEvents,
  listFieldMappingProfiles,
  listLayoutDocuments,
  listTopVariables,
  listVersions,
  publish,
  recordTokenUsage,
  restoreVersion,
  saveDraft,
  saveEvent,
  saveFieldMappingProfile,
  setActiveEvent,
} from '@sky-app/ceremony-db/node';
import { ceremonyStore } from './slide/data/store';
import { resetSessionForNewEvent, setCustomVariablesFromEvent } from './slide/socket-server';

/**
 * IPC router — the main-process counterpart to platform-electron's preload
 * bridge (window.sky.invoke). Each channel here corresponds to a method a
 * port adapter in packages/platform-electron/src/adapters/*.ts calls.
 *
 * Channels are prefixed `kernel:` to avoid colliding with electron/slide/ipc.ts's
 * `window.slide` bridge, which uses bare `tts:*`/`display:*` channel names for
 * a completely different (real, Slide-specific) purpose — both bridges are
 * registered in the same ipcMain, so channel names must be globally unique.
 *
 * Display channels are still mock (no secondary BrowserWindow yet). TTS no
 * longer routes through here — platform-electron's TtsPort adapter now
 * calls window.slide directly (the real Slide-specific bridge), see
 * packages/platform-electron/src/adapters/tts.ts.
 */
export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('kernel:display:list', async () => {
    return [];
  });

  ipcMain.handle('kernel:display:open', async () => {
    console.log('[mock display:open] no secondary BrowserWindow yet (GĐ5)');
  });

  ipcMain.handle('kernel:display:close', async () => {});

  ipcMain.handle('kernel:display:isOpen', async () => false);

  ipcMain.handle('kernel:display:setFullscreen', async (_event, fullscreen: boolean) => {
    getMainWindow()?.setFullScreen(fullscreen);
  });

  // Licensing (docs/guides/licensing-entitlement.md) — renderer không có fs
  // trực tiếp (contextIsolation), main lưu license key thô trong userData.
  // packages/licensing verify chữ ký; ở đây chỉ đọc/ghi chuỗi, không parse.
  const licenseFilePath = () => join(app.getPath('userData'), 'license.key');

  ipcMain.handle('kernel:license:read', async () => {
    try {
      return await readFile(licenseFilePath(), 'utf-8');
    } catch {
      return null;
    }
  });

  ipcMain.handle('kernel:license:write', async (_event, licenseKey: string) => {
    const path = licenseFilePath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, licenseKey, 'utf-8');
  });

  // GĐ8 OTA (Loại 2a) — bản native/main-process mới đã tải xong nền, chờ cài
  // khi app thoát (autoUpdater.autoInstallOnAppQuit — xem update-checker.ts).
  ipcMain.handle('kernel:nativeUpdateStatus', async () => {
    return {
      downloaded: isUpdateReadyToInstall(),
      pendingVersion: getPendingNativeUpdateInfo()?.version ?? null,
    };
  });

  // LayoutPort (packages/service-contracts/src/layout.ts) — versioning cho LayoutDocument
  // (docs/roadmap/plans/layout-designer/21-layout-versioning.md). Dùng CHUNG executor với
  // ceremonyStore (ceremonyStore.getExecutor()) — cùng 1 file ceremony.db, tránh mở 2 kết nối
  // SQLite song song tới cùng file (rủi ro lock WAL không cần thiết).
  ipcMain.handle('kernel:layout:listDocuments', async () => {
    return listLayoutDocuments(ceremonyStore.getExecutor());
  });

  ipcMain.handle('kernel:layout:getDocument', async (_event, id: string) => {
    return getLayoutDocument(ceremonyStore.getExecutor(), id);
  });

  ipcMain.handle(
    'kernel:layout:createDocument',
    async (_event, id: string, name: string, initialContent: LayoutContent, description?: string) => {
      createLayoutDocument(ceremonyStore.getExecutor(), id, name, initialContent, description);
    },
  );

  ipcMain.handle('kernel:layout:saveDraft', async (_event, id: string, content: LayoutContent) => {
    saveDraft(ceremonyStore.getExecutor(), id, content);
  });

  ipcMain.handle('kernel:layout:publish', async (_event, id: string, note?: string) => {
    return publish(ceremonyStore.getExecutor(), id, note);
  });

  ipcMain.handle('kernel:layout:listVersions', async (_event, id: string) => {
    return listVersions(ceremonyStore.getExecutor(), id);
  });

  ipcMain.handle('kernel:layout:getVersion', async (_event, id: string, version: number) => {
    return getVersion(ceremonyStore.getExecutor(), id, version);
  });

  ipcMain.handle('kernel:layout:restoreVersion', async (_event, id: string, version: number) => {
    restoreVersion(ceremonyStore.getExecutor(), id, version);
  });

  // variable_registry (09-quy-dinh-variable.md §2.6) — gợi ý autocomplete toàn cục, KHÔNG gắn
  // với 1 layout cụ thể, dùng chung executor với các channel kernel:layout:* ở trên.
  ipcMain.handle('kernel:layout:recordTokenUsage', async (_event, key: string) => {
    recordTokenUsage(ceremonyStore.getExecutor(), key);
  });

  ipcMain.handle('kernel:layout:listTopVariables', async (_event, limit?: number) => {
    return listTopVariables(ceremonyStore.getExecutor(), limit);
  });

  // EventPort/DataSourcePort (packages/service-contracts/src/event.ts, data-source.ts) —
  // Giai đoạn 3 kế hoạch Event (docs/roadmap/plans/layout-designer/10-quan-ly-dot-le-event.md).
  // Dùng chung ceremonyStore.getExecutor() (cùng file ceremony.db).
  ipcMain.handle('kernel:event:list', async () => {
    return listEvents(ceremonyStore.getExecutor());
  });

  ipcMain.handle('kernel:event:get', async (_event, id: string) => {
    return getEvent(ceremonyStore.getExecutor(), id);
  });

  ipcMain.handle('kernel:event:create', async (_event, doc: Omit<EventDocument, 'createdAt' | 'updatedAt'>) => {
    createEvent(ceremonyStore.getExecutor(), doc);
  });

  ipcMain.handle('kernel:event:save', async (_event, doc: EventDocument) => {
    saveEvent(ceremonyStore.getExecutor(), doc);
    // Giai đoạn 4c mở rộng (2026-07-20) — Sửa Event ĐANG active (VD đổi customVariables qua màn
    // Sửa Event) phải cập nhật socket-server NGAY, không chờ setActive() lần sau — backdrop đang
    // chạy thật cần thấy công thức mới lập tức, không phải sau khi thoát/kích hoạt lại.
    if (doc.status === 'active') setCustomVariablesFromEvent(doc.customVariables);
  });

  ipcMain.handle('kernel:event:getCurrentActive', async () => {
    return getCurrentActiveEvent(ceremonyStore.getExecutor());
  });

  // setActive → reset session (SessionState) + backdrop về Idle + báo Control qua socket
  // (13-ceremony-mo-rong.md §"setActive giữa lễ") — id cũ thuộc Event/DataSource khác, tránh
  // backdrop kẹt hiển thị người của đợt trước.
  ipcMain.handle('kernel:event:setActive', async (_event, id: string) => {
    setActiveEvent(ceremonyStore.getExecutor(), id);
    resetSessionForNewEvent(id);
    // Giai đoạn 4c mở rộng (2026-07-20) — đổi nguồn customVariables sang bộ biến của Event vừa
    // active (đọc lại từ DB, không tin dữ liệu client gửi trước đó). Event không có
    // customVariables (mảng rỗng mặc định) → an toàn, resolveCustomVariables trả {} cho mọi field.
    const active = getEvent(ceremonyStore.getExecutor(), id);
    setCustomVariablesFromEvent(active?.customVariables ?? []);
  });

  ipcMain.handle('kernel:dataSource:list', async () => {
    return listDataSources(ceremonyStore.getExecutor());
  });

  ipcMain.handle('kernel:dataSource:get', async (_event, id: string) => {
    return getDataSource(ceremonyStore.getExecutor(), id);
  });

  ipcMain.handle('kernel:dataSource:getRecords', async (_event, id: string, opts?: { excludeConsumedForEvent?: string }) => {
    return getDataSourceRecords(ceremonyStore.getExecutor(), id, opts);
  });

  // Giai đoạn 4a — ghi (create/importRecords/FieldMappingProfile), dùng chung executor.
  ipcMain.handle('kernel:dataSource:create', async (_event, doc: Omit<DataSource, 'records'>) => {
    insertDataSource(ceremonyStore.getExecutor(), doc);
  });

  ipcMain.handle('kernel:dataSource:importRecords', async (_event, dataSourceId: string, records: Array<CanonicalSubject | CanonicalGroup>) => {
    return insertDataSourceRecords(ceremonyStore.getExecutor(), dataSourceId, records);
  });

  ipcMain.handle('kernel:dataSource:listFieldMappingProfiles', async () => {
    return listFieldMappingProfiles(ceremonyStore.getExecutor());
  });

  ipcMain.handle('kernel:dataSource:saveFieldMappingProfile', async (_event, profile: FieldMappingProfile) => {
    saveFieldMappingProfile(ceremonyStore.getExecutor(), profile);
  });

  // AssetPort (packages/service-contracts/src/asset.ts) — chọn ảnh cho layout-designer, lưu
  // trong ceremony-data/assets/layout/ (thư mục con riêng, tránh trộn ảnh sinh viên nhập qua
  // ZIP). Tái dùng protocol "ceremony-asset://" đã đăng ký sẵn (main.ts) — KHÔNG tạo protocol
  // mới, vì resolveLocalAsset() đã tự map "assets/..." đúng vào ceremony-data/assets/.
  ipcMain.handle('kernel:layoutAsset:pick', async () => {
    const win = getMainWindow();
    if (!win) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Chọn ảnh',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;

    const sourcePath = filePaths[0]!;
    const destDir = layoutAssetsDir();
    await mkdir(destDir, { recursive: true });
    const destName = `${randomUUID()}${extname(sourcePath)}`;
    const destPath = join(destDir, destName);
    await copyFile(sourcePath, destPath);

    // resolveLocalAsset() (paths.ts) map "assets/..." → ceremony-data/assets/... — path tương
    // đối lưu vào LayoutItem.src PHẢI khớp đúng định dạng này.
    const relativePath = `assets/layout/${destName}`;
    // Ghi metadata vào ceremony-db (Bước 11 kế hoạch resize/rotate, 2026-07-18 — Media Library) —
    // dùng CHUNG executor với các query khác (ceremonyStore.getExecutor()), cùng 1 file ceremony.db.
    const { size } = await stat(destPath);
    insertAsset(ceremonyStore.getExecutor(), {
      relativePath,
      name: basename(sourcePath),
      sizeBytes: size,
      uploadedAt: new Date().toISOString(),
    });

    return { relativePath };
  });

  ipcMain.handle('kernel:layoutAsset:resolve', async (_event, relativePath: string) => {
    return relativePath ? `ceremony-asset://local/${relativePath}` : '';
  });

  ipcMain.handle('kernel:layoutAsset:list', async () => {
    return listAssets(ceremonyStore.getExecutor());
  });
}
