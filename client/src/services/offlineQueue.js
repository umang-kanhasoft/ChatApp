const OFFLINE_QUEUE_STORAGE_KEY = 'chatapp-offline-queue-v1';
export const OFFLINE_QUEUE_CHANGE_EVENT = 'chatapp-offline-queue:changed';

const canUseBrowserStorage = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const isValidOfflineAction = (value) =>
  Boolean(
    value &&
      typeof value === 'object' &&
      typeof value.id === 'string' &&
      value.id &&
      typeof value.type === 'string' &&
      value.type &&
      typeof value.conversationId === 'string' &&
      value.conversationId &&
      value.payload &&
      typeof value.payload === 'object',
  );

const emitQueueChanged = (actions) => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }

  if (typeof CustomEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent(OFFLINE_QUEUE_CHANGE_EVENT, {
        detail: actions,
      }),
    );
    return;
  }

  window.dispatchEvent(new Event(OFFLINE_QUEUE_CHANGE_EVENT));
};

const readQueue = () => {
  if (!canUseBrowserStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidOfflineAction);
  } catch {
    return [];
  }
};

const writeQueue = (actions) => {
  if (!canUseBrowserStorage()) {
    return actions;
  }

  window.localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(actions));
  emitQueueChanged(actions);
  return actions;
};

export const listOfflineQueueActions = () => readQueue();

export const queueOfflineAction = (action) => {
  const nextAction = {
    id: action?.id || createId(),
    createdAt: action?.createdAt || new Date().toISOString(),
    attempts: Number.isInteger(action?.attempts) ? action.attempts : 0,
    lastAttemptAt: action?.lastAttemptAt || null,
    ...action,
  };

  if (!isValidOfflineAction(nextAction)) {
    throw new Error('Invalid offline queue action');
  }

  const queue = readQueue();
  writeQueue([...queue, nextAction]);
  return nextAction;
};

export const removeOfflineAction = (actionId) => {
  const queue = readQueue();
  const nextQueue = queue.filter((action) => action.id !== actionId);
  writeQueue(nextQueue);
  return nextQueue;
};

export const updateOfflineAction = (actionId, updater) => {
  const queue = readQueue();
  let updatedAction = null;

  const nextQueue = queue.map((action) => {
    if (action.id !== actionId) {
      return action;
    }

    const nextAction = updater(action);
    updatedAction = nextAction;
    return nextAction;
  });

  writeQueue(nextQueue);
  return updatedAction;
};

export const clearOfflineQueue = () => {
  writeQueue([]);
};
