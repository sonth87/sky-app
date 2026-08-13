import type { FastifyInstance } from 'fastify';
import { readBundle, resetAll, writeBundle } from '../store.js';

export async function dataRoutes(app: FastifyInstance) {
  app.get('/api/data/meta', async () => {
    const bundle = readBundle();
    return {
      ceremony: bundle.ceremony,
      config: bundle.config,
      records: bundle.records,
      syncedAt: bundle.syncedAt,
      hasData: bundle.records.length > 0,
      apiEnvironment: 'prod',
    };
  });

  app.get('/api/data/export', async () => {
    const bundle = readBundle();
    return bundle.records;
  });

  app.post('/api/data/reset', async () => {
    resetAll();
    return { ok: true };
  });

  app.post('/api/data/clear-cache', async () => {
    // Không có cache riêng ở backend đơn giản này (không pregen/tts trong scope) — no-op.
    return { ok: true };
  });
}
