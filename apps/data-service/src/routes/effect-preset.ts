import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  createEffectPreset, deleteEffectPreset, listEffectPresets, updateEffectPreset,
  type EffectConfig,
} from '@sky-app/app-db/node';
import { getExecutor } from '../store.js';

/**
 * EffectPresetPort (packages/service-contracts/src/effect-preset.ts) — Web adapter.
 * Preset hiệu ứng hậu kỳ audio TTS. Dùng CHUNG executor với các route khác (getExecutor()
 * từ store.ts, cùng 1 file sky-app.db).
 *
 * Query bên dưới ném Error cho các vi phạm quy tắc nghiệp vụ (trùng tên, sửa/xoá preset
 * dựng sẵn) — map sang 400 kèm nguyên thông báo, vì chúng viết sẵn cho người dùng đọc.
 */
export async function effectPresetRoutes(app: FastifyInstance) {
  app.get('/api/effect-presets', async () => listEffectPresets(getExecutor()));

  app.post<{ Body: { name: string; effectsChain: EffectConfig[]; description?: string } }>(
    '/api/effect-presets',
    async (req, reply) => {
      const { name, effectsChain, description } = req.body;
      try {
        return createEffectPreset(getExecutor(), randomUUID(), name, effectsChain, description);
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  app.patch<{
    Params: { id: string };
    Body: { name?: string; description?: string; effectsChain?: EffectConfig[] };
  }>('/api/effect-presets/:id', async (req, reply) => {
    try {
      const updated = updateEffectPreset(getExecutor(), req.params.id, req.body);
      if (!updated) return reply.code(404).send({ error: 'not_found' });
      return updated;
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/effect-presets/:id', async (req, reply) => {
    try {
      if (!deleteEffectPreset(getExecutor(), req.params.id)) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
