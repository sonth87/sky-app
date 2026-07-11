import express from 'express';
import type { Server } from 'node:http';
import { handleScan } from './socket-server';

let server: Server | null = null;

/**
 * HTTP server nhận lệnh quét QR từ app quét riêng (AD-7).
 * POST /scan { msv } → đẩy vào logic socket-server theo mode hiện tại.
 */
export function startHttpServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const appHttp = express();
    appHttp.use(express.json());

    appHttp.get('/health', (_req, res) => {
      res.json({ ok: true });
    });

    appHttp.post('/scan', (req, res) => {
      const msv = String(req.body?.msv ?? '').trim();
      if (!msv) {
        res.status(400).json({ ok: false, code: 'BAD_REQUEST', message: 'Thiếu msv' });
        return;
      }
      const result = handleScan(msv);
      if (!result.ok) {
        res.status(404).json({ ok: false, code: result.code });
        return;
      }
      res.json({ ok: true, student: result.student });
    });

    server = appHttp.listen(port, () => resolve());
    server.on('error', reject);
  });
}

export function stopHttpServer() {
  server?.close();
  server = null;
}
