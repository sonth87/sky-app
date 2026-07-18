import type { LayoutPort } from '@sky-app/service-contracts';

/** Web LayoutPort — gọi apps/data-service's REST backend (local-dev-only, đối xứng adapters/data.ts). */
export function createWebLayoutPort(baseUrl = 'http://localhost:8094'): LayoutPort {
  return {
    async listDocuments() {
      const res = await fetch(`${baseUrl}/api/layout`);
      if (!res.ok) throw new Error(`LayoutPort listDocuments failed: ${res.status}`);
      return res.json();
    },

    async getDocument(id) {
      const res = await fetch(`${baseUrl}/api/layout/${id}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`LayoutPort getDocument failed: ${res.status}`);
      return res.json();
    },

    async createDocument(id, name, initialContent, description) {
      const res = await fetch(`${baseUrl}/api/layout/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, initialContent, description }),
      });
      if (!res.ok) throw new Error(`LayoutPort createDocument failed: ${res.status}`);
    },

    async saveDraft(id, content) {
      const res = await fetch(`${baseUrl}/api/layout/${id}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(`LayoutPort saveDraft failed: ${res.status}`);
    },

    async publish(id, note) {
      const res = await fetch(`${baseUrl}/api/layout/${id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error(`LayoutPort publish failed: ${res.status}`);
      return res.json();
    },

    async listVersions(id) {
      const res = await fetch(`${baseUrl}/api/layout/${id}/versions`);
      if (!res.ok) throw new Error(`LayoutPort listVersions failed: ${res.status}`);
      return res.json();
    },

    async getVersion(id, version) {
      const res = await fetch(`${baseUrl}/api/layout/${id}/versions/${version}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`LayoutPort getVersion failed: ${res.status}`);
      return res.json();
    },

    async restoreVersion(id, version) {
      const res = await fetch(`${baseUrl}/api/layout/${id}/versions/${version}/restore`, { method: 'POST' });
      if (!res.ok) throw new Error(`LayoutPort restoreVersion failed: ${res.status}`);
    },

    async recordTokenUsage(key) {
      const res = await fetch(`${baseUrl}/api/layout-variables/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) throw new Error(`LayoutPort recordTokenUsage failed: ${res.status}`);
    },

    async listTopVariables(limit) {
      const query = limit != null ? `?limit=${limit}` : '';
      const res = await fetch(`${baseUrl}/api/layout-variables/top${query}`);
      if (!res.ok) throw new Error(`LayoutPort listTopVariables failed: ${res.status}`);
      return res.json();
    },
  };
}
