import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ASSETS_DIR = join(__dirname, '..', '..', 'data', 'layout-assets');

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/**
 * AssetPort (packages/service-contracts/src/asset.ts) — Web adapter Local-dev upload qua JSON
 * base64 (không thêm dependency @fastify/multipart cho 1 route nhỏ) — chấp nhận overhead ~33%
 * kích thước cho phạm vi local-dev hiện tại của data-service.
 */
export async function assetRoutes(app: FastifyInstance) {
  app.post<{ Body: { filename: string; dataBase64: string } }>('/api/layout-assets', async (req, reply) => {
    const { filename, dataBase64 } = req.body;
    const ext = extname(filename).toLowerCase();
    if (!EXT_TO_MIME[ext]) return reply.code(400).send({ error: 'unsupported_extension' });

    mkdirSync(ASSETS_DIR, { recursive: true });
    const destName = `${randomUUID()}${ext}`;
    writeFileSync(join(ASSETS_DIR, destName), Buffer.from(dataBase64, 'base64'));

    return { relativePath: `layout-assets/${destName}` };
  });

  app.get<{ Params: { filename: string } }>('/api/layout-assets/:filename', async (req, reply) => {
    // Chặn path traversal — filename PHẢI khớp đúng định dạng UUID+extension đã tự sinh ở
    // POST trên (không chứa "/", "..", hay ký tự path đặc biệt nào khác).
    if (!/^[a-zA-Z0-9-]+\.[a-zA-Z0-9]+$/.test(req.params.filename)) {
      return reply.code(400).send({ error: 'invalid_filename' });
    }
    const filePath = join(ASSETS_DIR, req.params.filename);
    if (!existsSync(filePath)) return reply.code(404).send({ error: 'not_found' });
    const ext = extname(filePath).toLowerCase();
    reply.type(EXT_TO_MIME[ext] ?? 'application/octet-stream');
    return reply.send(readFileSync(filePath));
  });
}
