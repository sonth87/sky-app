// event-bundle — Giai đoạn 5.3 (Export/Import Loại 2, docs/roadmap/plans/layout-designer/
// 15-import-export.md). 2 hàm thuần orchestration: buildEventBundle (export) gom Event + layout
// tham chiếu + DataSource + mapping profile + trạng thái đã trao thành 1 manifest; applyEventBundle
// (import) khôi phục lại vào 1 máy khác. KHÔNG đụng gì tới zip/dialog/filesystem — đó là việc của
// Electron main process (apps/shell-electron/electron/ipc.ts), tách riêng để test được bằng
// in-memory SQLite (xem event-bundle.test.ts), đúng convention layout.test.ts/event.test.ts.

import type { SqlExecutor } from '../sql-executor.js';
import type { DataSource, EventBundleManifest } from '@sky-app/slide-shared';
import { getEvent, listEvents, createEvent } from './event.js';
import { getLayoutDocument, getVersion, createLayoutDocument, updateLayoutDocumentMeta, publish } from './layout.js';
import { getDataSource, insertDataSource, insertDataSourceRecords, listConsumedRecordIds, insertConsumedRecords } from './data-source.js';
import { listFieldMappingProfiles, saveFieldMappingProfile } from './field-mapping-profile.js';

/** Gom bundle xuất 1 Event — `includeData=false` bỏ qua DataSource/mappingProfile/consumedIds
 * (chỉ Event + layout, không có thông tin cá nhân người tham dự) theo lựa chọn PII của người dùng
 * lúc xuất. Trả `null` nếu eventId không tồn tại. */
export function buildEventBundle(executor: SqlExecutor, eventId: string, opts: { includeData: boolean }): EventBundleManifest | null {
  const event = getEvent(executor, eventId);
  if (!event) return null;

  const seenLayoutKeys = new Set<string>();
  const referencedLayouts: EventBundleManifest['referencedLayouts'] = [];
  for (const ref of event.layoutRefs) {
    const key = `${ref.layoutId}@${ref.layoutVersion}`;
    if (seenLayoutKeys.has(key)) continue;
    seenLayoutKeys.add(key);
    const doc = getLayoutDocument(executor, ref.layoutId);
    const version = getVersion(executor, ref.layoutId, ref.layoutVersion);
    if (!doc || !version) continue; // dữ liệu không nhất quán (layout đã bị xoá?) — bỏ qua, không chặn export
    referencedLayouts.push({
      layoutId: ref.layoutId,
      layoutVersion: ref.layoutVersion,
      name: doc.name,
      description: doc.description,
      color: doc.color,
      category: doc.category,
      tags: doc.tags,
      content: version.content,
    });
  }

  const assets = new Set<string>();
  for (const layout of referencedLayouts) {
    for (const variant of layout.content.variants) {
      if (variant.background?.kind === 'image' && variant.background.src) assets.add(variant.background.src);
    }
  }

  let dataSource: DataSource | undefined;
  let mappingProfile: EventBundleManifest['mappingProfile'];
  let consumedRecordIds: string[] = [];
  if (opts.includeData && event.dataSourceId) {
    const ds = getDataSource(executor, event.dataSourceId);
    if (ds) {
      dataSource = ds;
      for (const record of ds.records) {
        if (record.image_relative_path) assets.add(record.image_relative_path);
      }
      if (ds.mappingProfileId) {
        mappingProfile = listFieldMappingProfiles(executor).find((p) => p.id === ds.mappingProfileId);
      }
    }
    consumedRecordIds = listConsumedRecordIds(executor, eventId);
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    event,
    referencedLayouts,
    dataSource,
    mappingProfile,
    consumedRecordIds,
    assets: [...assets],
  };
}

export interface ApplyEventBundleResult {
  eventId: string;
  /** Tên THẬT SỰ đã lưu (đã đánh số nếu trùng tên có sẵn) — KHÔNG phải tên gốc trong manifest. */
  eventName: string;
  /** true nếu tên đã bị đổi (đánh số " - N") do trùng tên Event có sẵn ở máy đích — KHÁC id (id
   * trùng luôn tự đổi âm thầm, không phản ánh vào field này, xem `uniqueEventName`). */
  renamed: boolean;
  layoutsCreated: string[];
  dataSourceImported: boolean;
}

/** Tìm tên KHÔNG trùng với bất kỳ Event nào đã có ở máy đích — trùng thì đánh số tăng dần
 * `"{name} - 1"`, `"{name} - 2"`... (giống git khi clone trùng tên thư mục, yêu cầu Sonth
 * 2026-08-03 sau khi thử import trùng tên thật, thấy 2 Event cùng tên không phân biệt được). */
function uniqueEventName(executor: SqlExecutor, desiredName: string): string {
  const existingNames = new Set(listEvents(executor).map((e) => e.name));
  if (!existingNames.has(desiredName)) return desiredName;
  let n = 1;
  while (existingNames.has(`${desiredName} - ${n}`)) n += 1;
  return `${desiredName} - ${n}`;
}

/** Khôi phục 1 bundle vào máy đích — chính sách ĐƠN GIẢN, không diff/merge (đó là phạm vi
 * "re-import DataSource" riêng, chưa làm): layout/DataSource đã tồn tại → GIỮ NGUYÊN, bỏ qua;
 * Event trùng ID → sinh ID MỚI (không ghi đè, để không vỡ PRIMARY KEY); Event trùng TÊN → đánh số
 * tăng dần vào tên (để người dùng phân biệt được trong danh sách) — 2 việc TÁCH BIỆT, độc lập
 * nhau, có thể xảy ra cùng lúc hoặc riêng lẻ (VD import đúng file zip cũ 2 lần → trùng cả 2; đổi
 * tên Event có sẵn rồi import lại → chỉ trùng id, không trùng tên). Luôn import Event ở
 * status='draft' bất kể status gốc — tránh vi phạm bất biến "chỉ 1 Event active tại 1 thời điểm"
 * (setActiveEvent's invariant, createEvent không tự kiểm tra điều này). */
export function applyEventBundle(executor: SqlExecutor, manifest: EventBundleManifest): ApplyEventBundleResult {
  const layoutsCreated: string[] = [];
  const versionRemap = new Map<string, number>(); // `${layoutId}@${oldVersion}` → version mới tạo ở máy đích

  for (const layout of manifest.referencedLayouts) {
    if (getLayoutDocument(executor, layout.layoutId)) continue; // đã có ở máy đích — giữ nguyên
    createLayoutDocument(executor, layout.layoutId, layout.name, layout.content, layout.description);
    updateLayoutDocumentMeta(executor, layout.layoutId, { color: layout.color, category: layout.category, tags: layout.tags });
    const published = publish(executor, layout.layoutId);
    versionRemap.set(`${layout.layoutId}@${layout.layoutVersion}`, published.version);
    layoutsCreated.push(layout.layoutId);
  }

  // layoutRefs gốc ghim version của MÁY NGUỒN — layout mới tạo ở máy đích luôn ra version 1 (chỉ
  // publish 1 lần), nên phải remap lại, KHÔNG copy nguyên layoutVersion từ manifest.
  const remappedLayoutRefs = manifest.event.layoutRefs.map((ref) => {
    const newVersion = versionRemap.get(`${ref.layoutId}@${ref.layoutVersion}`);
    return newVersion === undefined ? ref : { ...ref, layoutVersion: newVersion };
  });

  let dataSourceImported = false;
  if (manifest.dataSource) {
    if (!getDataSource(executor, manifest.dataSource.id)) {
      insertDataSource(executor, {
        id: manifest.dataSource.id,
        label: manifest.dataSource.label,
        mode: manifest.dataSource.mode,
        naturalKeyField: manifest.dataSource.naturalKeyField,
        mappingProfileId: manifest.dataSource.mappingProfileId,
      });
      insertDataSourceRecords(executor, manifest.dataSource.id, manifest.dataSource.records);
      dataSourceImported = true;
    }
  }
  if (manifest.mappingProfile) {
    saveFieldMappingProfile(executor, manifest.mappingProfile); // upsert sẵn, không cần check tồn tại
  }

  const idCollides = getEvent(executor, manifest.event.id) != null;
  const targetId = idCollides ? `event_${crypto.randomUUID()}` : manifest.event.id;
  const targetName = uniqueEventName(executor, manifest.event.name);
  const renamed = targetName !== manifest.event.name;

  createEvent(executor, {
    id: targetId,
    name: targetName,
    status: 'draft',
    scheduledAt: manifest.event.scheduledAt,
    color: manifest.event.color,
    customVariables: manifest.event.customVariables,
    layoutRefs: remappedLayoutRefs,
    // Chỉ gán dataSourceId nếu bundle THỰC SỰ có DataSource (đã đảm bảo tồn tại ở máy đích ngay
    // trên) — nếu export lúc đó chọn "không kèm dữ liệu", Event import xong sẽ KHÔNG trỏ tới
    // DataSource nào (tránh tham chiếu treo tới id không tồn tại cục bộ).
    dataSourceId: manifest.dataSource ? manifest.dataSource.id : undefined,
  });

  if (manifest.dataSource && manifest.consumedRecordIds.length > 0) {
    insertConsumedRecords(executor, targetId, manifest.consumedRecordIds, manifest.exportedAt);
  }

  return {
    eventId: targetId,
    eventName: targetName,
    renamed,
    layoutsCreated,
    dataSourceImported,
  };
}
