import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@sky-app/slide-shared';

export type SlideSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Kết nối tới Socket.IO server trong main process.
 * Cùng máy → localhost. Khi tách 2 máy, đổi host ở đây (hoặc qua config).
 */
export function createSocket(port: number): SlideSocket {
  return io(`http://localhost:${port}`, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 500,
  });
}
