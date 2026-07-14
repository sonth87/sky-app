import type { FastifyInstance } from 'fastify';
import { readBundle, resetAll, resetStudentOperationalFields, syncFromSample, writeBundle } from '../store.js';

export async function dataRoutes(app: FastifyInstance) {
  app.get('/api/data/meta', async () => {
    const bundle = readBundle();
    return {
      ceremony: bundle.ceremony,
      config: bundle.config,
      students: bundle.students,
      syncedAt: bundle.syncedAt,
      hasData: bundle.students.length > 0,
      apiEnvironment: 'prod',
    };
  });

  app.post<{ Body?: { useSample?: boolean } }>('/api/data/sync', async () => {
    // Local-dev scope: chỉ hỗ trợ nạp lại từ sample bundle, không nhận upload
    // zip qua HTTP (nhóm import/export file thật vẫn Electron-only qua window.slide).
    const bundle = syncFromSample();
    return { ok: true, studentCount: bundle.students.length };
  });

  app.get('/api/data/export', async () => {
    const bundle = readBundle();
    return bundle.students;
  });

  app.post('/api/data/reset', async () => {
    resetAll();
    return { ok: true };
  });

  app.post('/api/data/reset-students', async () => {
    resetStudentOperationalFields();
    return { ok: true };
  });

  app.post('/api/data/clear-scans', async () => {
    const bundle = readBundle();
    bundle.students = bundle.students.map((s) =>
      s.status === 'on_stage' || s.status === 'called' ? { ...s, status: 'checked_in' as const } : s,
    );
    writeBundle(bundle);
    return { ok: true };
  });

  app.post('/api/data/clear-cache', async () => {
    // Không có cache riêng ở backend đơn giản này (không pregen/tts trong scope) — no-op.
    return { ok: true };
  });
}
