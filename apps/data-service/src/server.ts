import Fastify from 'fastify';
import cors from '@fastify/cors';
import { dataRoutes } from './routes/data.js';
import { layoutRoutes } from './routes/layout.js';
import { assetRoutes } from './routes/asset.js';

const PORT = Number(process.env.DATA_SERVICE_PORT ?? 8094);

async function main() {
  // Ảnh layout base64 trong JSON body có thể vượt default bodyLimit (1MB) — nâng lên 10MB
  // (khớp giới hạn "10MB" đã hiện trong UI wallpaper picker Electron, xem main.ts wallpaper import).
  const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });
  await app.register(cors, { origin: true });
  await app.register(dataRoutes);
  await app.register(layoutRoutes);
  await app.register(assetRoutes);

  app.get('/health', async () => ({ ok: true }));

  await app.listen({ port: PORT, host: '127.0.0.1' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
