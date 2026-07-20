import type { FastifyInstance } from 'fastify';
import type { EventDocument } from '@sky-app/slide-shared';
import { createEvent, getCurrentActiveEvent, getEvent, listEvents, saveEvent, setActiveEvent } from '@sky-app/ceremony-db/node';
import { getExecutor } from '../store.js';

/**
 * EventPort (packages/service-contracts/src/event.ts) — Web adapter, Giai đoạn 3 kế hoạch Event
 * (docs/roadmap/plans/layout-designer/10-quan-ly-dot-le-event.md). Dùng chung getExecutor() với
 * layoutRoutes/assetRoutes (cùng 1 file ceremony.db).
 */
export async function eventRoutes(app: FastifyInstance) {
  app.get('/api/events', async () => listEvents(getExecutor()));

  app.get<{ Params: { id: string } }>('/api/events/:id', async (req, reply) => {
    const doc = getEvent(getExecutor(), req.params.id);
    if (!doc) return reply.code(404).send({ error: 'not_found' });
    return doc;
  });

  app.post<{ Body: Omit<EventDocument, 'createdAt' | 'updatedAt'> }>('/api/events', async (req) => {
    createEvent(getExecutor(), req.body);
    return { ok: true };
  });

  app.put<{ Params: { id: string }; Body: EventDocument }>('/api/events/:id', async (req) => {
    saveEvent(getExecutor(), req.body);
    return { ok: true };
  });

  app.get('/api/events/active/current', async () => getCurrentActiveEvent(getExecutor()));

  app.post<{ Params: { id: string } }>('/api/events/:id/activate', async (req) => {
    setActiveEvent(getExecutor(), req.params.id);
    return { ok: true };
  });
}
