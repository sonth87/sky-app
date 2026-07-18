import type { FastifyInstance } from 'fastify';
import type { LayoutContent } from '@sky-app/slide-shared';
import {
  createLayoutDocument,
  getLayoutDocument,
  getVersion,
  listLayoutDocuments,
  listTopVariables,
  listVersions,
  publish,
  recordTokenUsage,
  restoreVersion,
  saveDraft,
} from '@sky-app/ceremony-db/node';
import { getExecutor } from '../store.js';

/** LayoutPort (packages/service-contracts/src/layout.ts) — adapter Web gọi các route này qua HTTP. */
export async function layoutRoutes(app: FastifyInstance) {
  app.get('/api/layout', async () => {
    return listLayoutDocuments(getExecutor());
  });

  app.get<{ Params: { id: string } }>('/api/layout/:id', async (req, reply) => {
    const doc = getLayoutDocument(getExecutor(), req.params.id);
    if (!doc) return reply.code(404).send({ error: 'not_found' });
    return doc;
  });

  app.post<{ Params: { id: string }; Body: { name: string; initialContent: LayoutContent; description?: string } }>(
    '/api/layout/:id',
    async (req) => {
      createLayoutDocument(getExecutor(), req.params.id, req.body.name, req.body.initialContent, req.body.description);
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string }; Body: { content: LayoutContent } }>('/api/layout/:id/draft', async (req) => {
    saveDraft(getExecutor(), req.params.id, req.body.content);
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { note?: string } }>('/api/layout/:id/publish', async (req) => {
    return publish(getExecutor(), req.params.id, req.body?.note);
  });

  app.get<{ Params: { id: string } }>('/api/layout/:id/versions', async (req) => {
    return listVersions(getExecutor(), req.params.id);
  });

  app.get<{ Params: { id: string; version: string } }>('/api/layout/:id/versions/:version', async (req, reply) => {
    const version = getVersion(getExecutor(), req.params.id, Number(req.params.version));
    if (!version) return reply.code(404).send({ error: 'not_found' });
    return version;
  });

  app.post<{ Params: { id: string; version: string } }>('/api/layout/:id/versions/:version/restore', async (req) => {
    restoreVersion(getExecutor(), req.params.id, Number(req.params.version));
    return { ok: true };
  });

  // variable_registry (09-quy-dinh-variable.md §2.6) — toàn cục, không thuộc route /:id.
  app.post<{ Body: { key: string } }>('/api/layout-variables/record', async (req) => {
    recordTokenUsage(getExecutor(), req.body.key);
    return { ok: true };
  });

  app.get<{ Querystring: { limit?: string } }>('/api/layout-variables/top', async (req) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    return listTopVariables(getExecutor(), limit);
  });
}
