import { ipcMain, app, dialog, type BrowserWindow } from 'electron';
import { readFile, writeFile, mkdir, copyFile, stat, rm, readdir } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, extname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import { isUpdateReadyToInstall, getPendingNativeUpdateInfo } from './update-checker';
import { layoutAssetsDir, ceremonyDataDir, ttsPregenDir, ttsPregenManifestPath, ttsPregenWavPath } from './slide/data/paths';
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
  updateLayoutDocumentMeta,
} from '@sky-app/ceremony-db/node';
import { ceremonyStore } from './slide/data/store';
import { resetSessionForNewEvent, setCustomVariablesFromEvent } from './slide/socket-server';

/**
 * Đồng bộ ceremonyStore (server-side, dùng bởi cmd:show/cmd:next/cmd:prev/quét QR qua
 * socket-server.ts's findById/patchRuntimeState/neighborByDisplayOrder) với danh sách người
 * tham dự THẬT của Event vừa active — bug chặn đường phát hiện 2026-07-21 (dùng thật: Kích hoạt
 * Event, bấm hiện 1 người lên sân khấu, không hiện ai). Trước đây `loadStudentsForEvent`
 * (control/eventStore.ts) chỉ đổ CanonicalSubject[] → Student[] vào useControlStore
 * (CLIENT-SIDE, chỉ để hiển thị dashboard) — ceremonyStore server-side hoàn toàn không biết
 * Event/DataSource nào đang active.
 *
 * Giai đoạn "bỏ Student" (2026-07-22) — CeremonyStore giờ lưu thẳng CanonicalRecord[], không
 * cần convert qua canonicalRecordsToStudents nữa (đã xoá cùng Student).
 *
 * Event không có dataSourceId (data để sau) → danh sách RỖNG (không giữ sót data Event trước —
 * quyết định của user: "vào Event nào thì chỉ hiện data của Event đó, chưa có data thì không
 * hiển thị data").
 */
export function syncCeremonyStoreForEvent(event: EventDocument | null): void {
  if (!event?.dataSourceId) {
    ceremonyStore.setRecords([]);
    return;
  }
  const records = getDataSourceRecords(ceremonyStore.getExecutor(), event.dataSourceId, {
    excludeConsumedForEvent: event.id,
  });
  ceremonyStore.setRecords(records);
}

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
/** Parser CSV tối giản cho main process (đọc `records.csv` bên trong ZIP import — PHỤ LỤC
 * "Event Hub" 2026-07-22). KHÔNG dùng `xlsx` (đó là dependency của renderer/parseSpreadsheet.ts,
 * main process không cần Excel binary — ZIP CHỈ chấp nhận CSV/JSON cho records, không phải xlsx
 * trực tiếp). Chỉ hỗ trợ CSV chuẩn RFC4180 cơ bản (dấu phẩy, ngoặc kép bao field chứa phẩy/xuống
 * dòng, "" là escape của "). Dòng đầu = header. */
function parseCsvBuffer(text: string): { columns: string[]; rows: Array<Record<string, string>> } {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^﻿/, ''); // bỏ BOM UTF-8 nếu có
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return { columns: [], rows: [] };
  const columns = rows[0]!;
  const dataRows = rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    columns.forEach((col, idx) => { obj[col] = r[idx] ?? ''; });
    return obj;
  });
  return { columns, rows: dataRows };
}

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

  ipcMain.handle('kernel:layout:updateDocumentMeta', async (_event, id: string, patch: { color?: string }) => {
    updateLayoutDocumentMeta(ceremonyStore.getExecutor(), id, patch);
  });

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
    if (doc.status === 'active') {
      setCustomVariablesFromEvent(doc.customVariables);
      // Bug chặn đường (2026-07-21) — Sửa Event đang active cũng phải đồng bộ lại ceremonyStore
      // (cmd:show tra cứu qua đây, KHÔNG qua useControlStore) — xem syncCeremonyStoreForEvent.
      syncCeremonyStoreForEvent(doc);
    }
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
    // Bug chặn đường (2026-07-21) — cmd:show/cmd:next/cmd:prev/quét QR tra cứu ceremonyStore
    // (server-side), KHÔNG phải useControlStore (client-side, chỉ để hiển thị dashboard) — nếu
    // không đồng bộ ở đây, mọi thao tác "hiện lên sân khấu" âm thầm thất bại với Event mới.
    syncCeremonyStoreForEvent(active);
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

  // Import ZIP cho DataSource (PHỤ LỤC "Event Hub", 2026-07-22) — cấu trúc ZIP: records.json/
  // records.csv (mảng phẳng THÔ, đi qua field-mapping giống CSV rời — KHÔNG map sẵn) + image/
  // (tuỳ chọn) + voice/ (tuỳ chọn), file đặt tên theo giá trị naturalKeyField. Giải nén ở main
  // process (adm-zip đã cài sẵn), KHÔNG giải nén ở renderer — tránh thêm dependency ZIP-in-
  // browser + tránh phải chuyển buffer lớn qua IPC.
  //
  // 2 bước: pickZipFile (mở dialog, giải nén vào thư mục TẠM, đọc records → trả về giống
  // ParsedSpreadsheet để renderer tái dùng NGUYÊN VẸN luồng field-mapping đã có) rồi
  // confirmZipImport (SAU KHI renderer đã map cột xong, copy ảnh/voice theo đúng id đã chọn làm
  // khoá tự nhiên, dọn thư mục tạm). Tách 2 bước vì lúc pickZipFile CHƯA biết naturalKeyField
  // nào — renderer cần thấy trước danh sách cột để user tự chọn.
  ipcMain.handle('kernel:dataSource:pickZipFile', async () => {
    const win = getMainWindow();
    if (!win) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Chọn file ZIP',
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;

    const zipPath = filePaths[0]!;
    const stagingDir = join(tmpdir(), `sky-app-import-${randomUUID()}`);
    try {
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(stagingDir, true);
    } catch (err) {
      return { error: `File ZIP hỏng hoặc không đúng định dạng: ${err instanceof Error ? err.message : String(err)}` };
    }

    const recordsJsonPath = join(stagingDir, 'records.json');
    const recordsCsvPath = join(stagingDir, 'records.csv');
    let parsed: { columns: string[]; rows: Array<Record<string, string>> };
    if (existsSync(recordsJsonPath)) {
      try {
        const raw = JSON.parse(readFileSync(recordsJsonPath, 'utf-8'));
        if (!Array.isArray(raw)) throw new Error('records.json phải là mảng');
        const rows: Array<Record<string, string>> = raw.map((r) => {
          const obj: Record<string, string> = {};
          for (const [k, v] of Object.entries(r ?? {})) obj[k] = v == null ? '' : String(v);
          return obj;
        });
        const columnSet = new Set<string>();
        for (const row of rows) for (const k of Object.keys(row)) columnSet.add(k);
        parsed = { columns: [...columnSet], rows };
      } catch (err) {
        await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
        return { error: `records.json không hợp lệ: ${err instanceof Error ? err.message : String(err)}` };
      }
    } else if (existsSync(recordsCsvPath)) {
      parsed = parseCsvBuffer(readFileSync(recordsCsvPath, 'utf-8'));
    } else {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
      return { error: 'ZIP thiếu file records.json hoặc records.csv ở thư mục gốc.' };
    }

    const hasImageDir = existsSync(join(stagingDir, 'image'));
    const hasVoiceDir = existsSync(join(stagingDir, 'voice'));
    return { stagingDir, columns: parsed.columns, rows: parsed.rows, hasImageDir, hasVoiceDir };
  });

  ipcMain.handle(
    'kernel:dataSource:confirmZipImport',
    async (
      _event,
      opts: { stagingDir: string; naturalKeyField: string; eventId: string; rows: Array<Record<string, string>> },
    ) => {
      const { stagingDir, naturalKeyField, eventId, rows } = opts;
      let imagesCopied = 0;
      let voicesCopied = 0;
      const imageByKey: Record<string, string> = {};

      const imageDir = join(stagingDir, 'image');
      const voiceDir = join(stagingDir, 'voice');
      const destImageDir = join(ceremonyDataDir(), 'image');

      if (existsSync(imageDir)) {
        await mkdir(destImageDir, { recursive: true });
        const files = await readdir(imageDir);
        const filesByBase = new Map(files.map((f) => [basename(f, extname(f)), f] as const));
        for (const row of rows) {
          const key = row[naturalKeyField];
          if (!key) continue;
          const file = filesByBase.get(key);
          if (!file) continue;
          await copyFile(join(imageDir, file), join(destImageDir, file));
          imageByKey[key] = `image/${file}`;
          imagesCopied += 1;
        }
      }

      if (existsSync(voiceDir)) {
        const batchDir = ttsPregenDir(eventId);
        mkdirSync(batchDir, { recursive: true });
        const manifestPath = ttsPregenManifestPath(eventId);
        const manifest: { batch_id: string; config_hash: string; students: Record<string, unknown> } = existsSync(manifestPath)
          ? JSON.parse(readFileSync(manifestPath, 'utf-8'))
          : { batch_id: eventId, config_hash: '', students: {} };
        const files = await readdir(voiceDir);
        const filesByBase = new Map(files.map((f) => [basename(f, extname(f)), f] as const));
        for (const row of rows) {
          const key = row[naturalKeyField];
          if (!key) continue;
          const file = filesByBase.get(key);
          if (!file) continue;
          await copyFile(join(voiceDir, file), ttsPregenWavPath(eventId, key));
          // Chỉ set đủ field để PreGenChip/PreGenPopover nhận diện "đã có sẵn, không cần tạo lại"
          // (status='done') — các field khác (text/voice/duration_ms...) để trống vì file này
          // KHÔNG qua TTS thật của app, không có thông tin đó.
          manifest.students[key] = { status: 'done' };
          voicesCopied += 1;
        }
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
      }

      await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
      return { imagesCopied, voicesCopied, imageByKey };
    },
  );

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
