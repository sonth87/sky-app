import type { DataSourcePort } from '@sky-app/service-contracts';
import '../bridge-types.js';

/**
 * Electron DataSourcePort — routes to main process (apps/shell-electron/electron/ipc.ts's
 * kernel:dataSource:* channels). Giai đoạn 3: đọc (list/get/getRecords). Giai đoạn 4a: ghi
 * (create/importRecords/FieldMappingProfile) cho luồng import lần đầu tạo DataSource mới.
 */
export function createElectronDataSourcePort(): DataSourcePort {
  return {
    async list() {
      return (await window.sky.invoke('kernel:dataSource:list')) as Awaited<ReturnType<DataSourcePort['list']>>;
    },
    async get(id) {
      return (await window.sky.invoke('kernel:dataSource:get', id)) as Awaited<ReturnType<DataSourcePort['get']>>;
    },
    async getRecords(id, opts) {
      return (await window.sky.invoke('kernel:dataSource:getRecords', id, opts)) as Awaited<ReturnType<DataSourcePort['getRecords']>>;
    },
    async create(doc) {
      await window.sky.invoke('kernel:dataSource:create', doc);
    },
    async importRecords(dataSourceId, records) {
      return (await window.sky.invoke('kernel:dataSource:importRecords', dataSourceId, records)) as Awaited<
        ReturnType<DataSourcePort['importRecords']>
      >;
    },
    async listFieldMappingProfiles() {
      return (await window.sky.invoke('kernel:dataSource:listFieldMappingProfiles')) as Awaited<
        ReturnType<DataSourcePort['listFieldMappingProfiles']>
      >;
    },
    async saveFieldMappingProfile(profile) {
      await window.sky.invoke('kernel:dataSource:saveFieldMappingProfile', profile);
    },
  };
}
