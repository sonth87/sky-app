import type { FastifyInstance } from 'fastify';
import type { CanonicalGroup, CanonicalSubject, DataSource, FieldMappingProfile } from '@sky-app/slide-shared';
import {
  getDataSource,
  getDataSourceRecords,
  insertDataSource,
  insertDataSourceRecords,
  listDataSources,
  listFieldMappingProfiles,
  saveFieldMappingProfile,
} from '@sky-app/ceremony-db/node';
import { getExecutor } from '../store.js';

/**
 * DataSourcePort (packages/service-contracts/src/data-source.ts) — Web adapter. Giai đoạn 3:
 * đọc (list/get/getRecords). Giai đoạn 4a: ghi (create/importRecords/FieldMappingProfile) cho
 * luồng import lần đầu tạo DataSource mới.
 */
export async function dataSourceRoutes(app: FastifyInstance) {
  app.get('/api/data-sources', async () => listDataSources(getExecutor()));

  app.get<{ Params: { id: string } }>('/api/data-sources/:id', async (req, reply) => {
    const ds = getDataSource(getExecutor(), req.params.id);
    if (!ds) return reply.code(404).send({ error: 'not_found' });
    return ds;
  });

  app.get<{ Params: { id: string }; Querystring: { excludeConsumedForEvent?: string } }>(
    '/api/data-sources/:id/records',
    async (req) => getDataSourceRecords(getExecutor(), req.params.id, { excludeConsumedForEvent: req.query.excludeConsumedForEvent }),
  );

  app.post<{ Body: Omit<DataSource, 'records'> }>('/api/data-sources', async (req) => {
    insertDataSource(getExecutor(), req.body);
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: Array<CanonicalSubject | CanonicalGroup> }>(
    '/api/data-sources/:id/records',
    async (req) => insertDataSourceRecords(getExecutor(), req.params.id, req.body),
  );

  app.get('/api/field-mapping-profiles', async () => listFieldMappingProfiles(getExecutor()));

  app.post<{ Body: FieldMappingProfile }>('/api/field-mapping-profiles', async (req) => {
    saveFieldMappingProfile(getExecutor(), req.body);
    return { ok: true };
  });
}
