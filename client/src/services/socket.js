import { io } from 'socket.io-client';

let socketInstance = null;

export const connectSocket = (token) => {
  if (!token) return null;
  if (socketInstance) {
    socketInstance.auth = { token };
    if (!socketInstance.connected) {
      socketInstance.connect();
    }
    return socketInstance;
  }

  socketInstance = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
    transports: ['websocket', 'polling'],
    auth: {
      token,
    },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 50,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 10000,
    ackTimeout: 10000,
  });

  return socketInstance;
};

export const getSocket = () => socketInstance;

export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};
