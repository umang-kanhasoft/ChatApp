import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearOfflineQueue,
  listOfflineQueueActions,
  queueOfflineAction,
  removeOfflineAction,
  updateOfflineAction,
} from '../services/offlineQueue.js';

const createStorageMock = () => {
  const store = new Map();

  return {
    getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn((key, value) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  };
};

describe('offlineQueue', () => {
  beforeEach(() => {
    const localStorage = createStorageMock();

    globalThis.Event = class EventMock {
      constructor(type) {
        this.type = type;
      }
    };

    globalThis.CustomEvent = class CustomEventMock extends globalThis.Event {
      constructor(type, init = {}) {
        super(type);
        this.detail = init.detail;
      }
    };

    globalThis.window = {
      localStorage,
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    clearOfflineQueue();
  });

  it('queues, updates, and removes actions', () => {
    const queued = queueOfflineAction({
      type: 'send-message',
      conversationId: 'conversation-1',
      payload: {
        clientTempId: 'message-1',
        text: 'hello',
      },
    });

    expect(queued.id).toBeTruthy();
    expect(listOfflineQueueActions()).toHaveLength(1);

    const updated = updateOfflineAction(queued.id, (current) => ({
      ...current,
      attempts: current.attempts + 1,
    }));

    expect(updated.attempts).toBe(1);
    expect(listOfflineQueueActions()[0].attempts).toBe(1);

    removeOfflineAction(queued.id);
    expect(listOfflineQueueActions()).toEqual([]);
  });

  it('ignores invalid stored data', () => {
    globalThis.window.localStorage.setItem('chatapp-offline-queue-v1', '{"bad":true}');
    expect(listOfflineQueueActions()).toEqual([]);

    globalThis.window.localStorage.setItem(
      'chatapp-offline-queue-v1',
      JSON.stringify([{ bad: true }]),
    );
    expect(listOfflineQueueActions()).toEqual([]);
  });
});
