import type { DataSourcePort } from '@sky-app/service-contracts';

/**
 * Web DataSourcePort — gọi apps/data-service's REST backend. Giai đoạn 3: đọc. Giai đoạn 4a:
 * ghi (create/importRecords/FieldMappingProfile).
 */
export function createWebDataSourcePort(baseUrl = 'http://localhost:8094'): DataSourcePort {
  return {
    async list() {
      const res = await fetch(`${baseUrl}/api/data-sources`);
      if (!res.ok) throw new Error(`DataSourcePort list failed: ${res.status}`);
      return res.json();
    },

    async get(id) {
      const res = await fetch(`${baseUrl}/api/data-sources/${id}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`DataSourcePort get failed: ${res.status}`);
      return res.json();
    },

    async getRecords(id, opts) {
      const query = opts?.excludeConsumedForEvent ? `?excludeConsumedForEvent=${opts.excludeConsumedForEvent}` : '';
      const res = await fetch(`${baseUrl}/api/data-sources/${id}/records${query}`);
      if (!res.ok) throw new Error(`DataSourcePort getRecords failed: ${res.status}`);
      return res.json();
    },

    async create(doc) {
      const res = await fetch(`${baseUrl}/api/data-sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      });
      if (!res.ok) throw new Error(`DataSourcePort create failed: ${res.status}`);
    },

    async importRecords(dataSourceId, records) {
      const res = await fetch(`${baseUrl}/api/data-sources/${dataSourceId}/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(records),
      });
      if (!res.ok) throw new Error(`DataSourcePort importRecords failed: ${res.status}`);
      return res.json();
    },

    async listFieldMappingProfiles() {
      const res = await fetch(`${baseUrl}/api/field-mapping-profiles`);
      if (!res.ok) throw new Error(`DataSourcePort listFieldMappingProfiles failed: ${res.status}`);
      return res.json();
    },

    async saveFieldMappingProfile(profile) {
      const res = await fetch(`${baseUrl}/api/field-mapping-profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error(`DataSourcePort saveFieldMappingProfile failed: ${res.status}`);
    },
  };
}
