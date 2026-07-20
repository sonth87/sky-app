import type { EventPort } from '@sky-app/service-contracts';

/** Web EventPort — gọi apps/data-service's REST backend (local-dev-only, đối xứng adapters/layout.ts). */
export function createWebEventPort(baseUrl = 'http://localhost:8094'): EventPort {
  return {
    async list() {
      const res = await fetch(`${baseUrl}/api/events`);
      if (!res.ok) throw new Error(`EventPort list failed: ${res.status}`);
      return res.json();
    },

    async get(id) {
      const res = await fetch(`${baseUrl}/api/events/${id}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`EventPort get failed: ${res.status}`);
      return res.json();
    },

    async create(doc) {
      const res = await fetch(`${baseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      });
      if (!res.ok) throw new Error(`EventPort create failed: ${res.status}`);
    },

    async save(doc) {
      const res = await fetch(`${baseUrl}/api/events/${doc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      });
      if (!res.ok) throw new Error(`EventPort save failed: ${res.status}`);
    },

    async getCurrentActive() {
      const res = await fetch(`${baseUrl}/api/events/active/current`);
      if (!res.ok) throw new Error(`EventPort getCurrentActive failed: ${res.status}`);
      return res.json();
    },

    async setActive(id) {
      const res = await fetch(`${baseUrl}/api/events/${id}/activate`, { method: 'POST' });
      if (!res.ok) throw new Error(`EventPort setActive failed: ${res.status}`);
    },
  };
}
