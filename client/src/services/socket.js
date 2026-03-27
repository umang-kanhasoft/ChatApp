import { io } from 'socket.io-client';

let socketInstance = null;

const toAckError = (value) => {
  if (!value) return null;
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  if (typeof value?.message === 'string' && value.message) {
    return new Error(value.message);
  }
  return null;
};

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

export const emitSocketAck = (event, payload, socket = socketInstance) =>
  new Promise((resolve, reject) => {
    if (!socket) {
      resolve(null);
      return;
    }

    socket.emit(event, payload, (firstArg, secondArg) => {
      if (secondArg !== undefined) {
        const error = toAckError(firstArg);
        if (error) {
          reject(error);
          return;
        }

        resolve(secondArg ?? null);
        return;
      }

      resolve(firstArg ?? null);
    });
  });

export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};
