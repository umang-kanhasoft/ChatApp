import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listOfflineQueueActions,
  OFFLINE_QUEUE_CHANGE_EVENT,
  queueOfflineAction,
  removeOfflineAction,
  updateOfflineAction,
} from '../services/offlineQueue.js';

const getInitialOnlineState = () => {
  if (typeof navigator === 'undefined') {
    return true;
  }

  return navigator.onLine;
};

const normalizeResult = (result) => {
  if (typeof result === 'string') {
    return { status: result };
  }

  if (result && typeof result === 'object' && typeof result.status === 'string') {
    return result;
  }

  return { status: 'retry' };
};

export const useOfflineQueue = ({ enabled = true, ownerId = '', processAction }) => {
  const getScopedActions = useCallback(() => {
    if (!ownerId) {
      return [];
    }

    return listOfflineQueueActions().filter((action) => action.ownerId === ownerId);
  }, [ownerId]);

  const [isOnline, setIsOnline] = useState(getInitialOnlineState);
  const [queuedActions, setQueuedActions] = useState(() => getScopedActions());
  const [isFlushing, setIsFlushing] = useState(false);
  const flushingRef = useRef(false);

  const syncQueuedActions = useCallback(() => {
    setQueuedActions(getScopedActions());
  }, [getScopedActions]);

  const enqueueAction = useCallback(
    (action) => {
      const queuedAction = queueOfflineAction({
        state: 'queued',
        lastError: '',
        ...action,
        ownerId,
      });
      syncQueuedActions();
      return queuedAction;
    },
    [ownerId, syncQueuedActions],
  );

  const applyActionResult = useCallback(
    (actionId, result) => {
      const normalized = normalizeResult(result);
      const now = new Date().toISOString();

      if (normalized.status === 'processed' || normalized.status === 'discard') {
        removeOfflineAction(actionId);
        syncQueuedActions();
        return normalized.status;
      }

      if (normalized.status === 'failed') {
        updateOfflineAction(actionId, (current) => ({
          ...current,
          state: 'failed',
          attempts: (current.attempts || 0) + 1,
          lastAttemptAt: now,
          lastError: normalized.error || 'Action failed',
        }));
        syncQueuedActions();
        return 'failed';
      }

      updateOfflineAction(actionId, (current) => ({
        ...current,
        state: 'queued',
        attempts: (current.attempts || 0) + 1,
        lastAttemptAt: now,
        lastError: normalized.error || '',
      }));
      syncQueuedActions();
      return 'retry';
    },
    [syncQueuedActions],
  );

  const processSingleAction = useCallback(
    async (action) => {
      if (typeof processAction !== 'function') {
        return 'retry';
      }

      try {
        const result = await processAction(action);
        return applyActionResult(action.id, result);
      } catch {
        return applyActionResult(action.id, { status: 'retry' });
      }
    },
    [applyActionResult, processAction],
  );

  const flushQueue = useCallback(async () => {
    if (!enabled || !isOnline || typeof processAction !== 'function' || flushingRef.current) {
      return;
    }

    const snapshot = getScopedActions().filter((action) => action.state !== 'failed');
    if (snapshot.length === 0) {
      return;
    }

    flushingRef.current = true;
    setIsFlushing(true);

    try {
      for (const action of snapshot) {
        const status = await processSingleAction(action);
        if (status === 'processed' || status === 'discard' || status === 'failed') {
          continue;
        }

        break;
      }
    } finally {
      flushingRef.current = false;
      setIsFlushing(false);
    }
  }, [enabled, getScopedActions, isOnline, processAction, processSingleAction]);

  const retryAction = useCallback(
    async (actionId) => {
      if (!enabled || !isOnline || !actionId) {
        return 'retry';
      }

      const action = getScopedActions().find((entry) => entry.id === actionId);
      if (!action) {
        return 'discard';
      }

      updateOfflineAction(actionId, (current) => ({
        ...current,
        state: 'queued',
        lastError: '',
      }));
      syncQueuedActions();

      return processSingleAction({
        ...action,
        state: 'queued',
        lastError: '',
      });
    },
    [enabled, getScopedActions, isOnline, processSingleAction, syncQueuedActions],
  );

  const discardAction = useCallback(
    (actionId) => {
      if (!actionId) return;
      removeOfflineAction(actionId);
      syncQueuedActions();
    },
    [syncQueuedActions],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleQueueChanged = () => syncQueuedActions();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(OFFLINE_QUEUE_CHANGE_EVENT, handleQueueChanged);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(OFFLINE_QUEUE_CHANGE_EVENT, handleQueueChanged);
    };
  }, [syncQueuedActions]);

  useEffect(() => {
    if (!enabled || !isOnline || queuedActions.length === 0) {
      return;
    }

    flushQueue().catch(() => {});
  }, [enabled, flushQueue, isOnline, queuedActions.length]);

  return {
    enqueueAction,
    flushQueue,
    retryAction,
    discardAction,
    isFlushing,
    isOnline,
    queuedActions,
    queuedCount: queuedActions.length,
  };
};
