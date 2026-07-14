import Fastify from 'fastify';
import cors from '@fastify/cors';
import { dataRoutes } from './routes/data.js';

const PORT = Number(process.env.DATA_SERVICE_PORT ?? 8094);

async function main() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(dataRoutes);

  app.get('/health', async () => ({ ok: true }));

  await app.listen({ port: PORT, host: '127.0.0.1' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
