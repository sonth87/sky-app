import type { LayoutComponentPort, LayoutComponentMeta } from '@sky-app/service-contracts';
import type { LayoutItem } from '@sky-app/slide-shared';

/**
 * Web LayoutComponentPort — routes to data-service REST API (apps/data-service/src/routes/
 * layout-component.ts). Personal templates lưu trong DB server qua HTTP.
 */
export function createWebLayoutComponentPort(): LayoutComponentPort {
  const baseUrl = '/api/layout-components';

  return {
    async list() {
      const res = await fetch(`${baseUrl}`, { method: 'GET' });
      if (!res.ok) throw new Error(`Failed to list templates: ${res.statusText}`);
      return res.json() as Promise<LayoutComponentMeta[]>;
    },
    async save(name, items) {
      const res = await fetch(`${baseUrl}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, items }),
      });
      if (!res.ok) throw new Error(`Failed to save template: ${res.statusText}`);
      return res.json() as Promise<{ id: string }>;
    },
    async delete(id) {
      const res = await fetch(`${baseUrl}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed to delete template: ${res.statusText}`);
    },
  };
}
