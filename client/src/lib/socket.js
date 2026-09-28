import { io } from 'socket.io-client';
import { getAccessToken } from './api';

/** Stage 3: one shared Socket.IO connection, created lazily only when the server enables realtime. */
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL || undefined, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: getAccessToken() }),
    });
  }
  return socket;
}

export function resetSocket() {
  if (socket) socket.disconnect();
  socket = null;
}
