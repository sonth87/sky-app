import { createContext, useContext } from 'react';
import type { SlideSocket } from '../lib/socket';

export const SocketContext = createContext<{ current: SlideSocket | null }>({ current: null });

export function useSocketRef() {
  return useContext(SocketContext);
}
