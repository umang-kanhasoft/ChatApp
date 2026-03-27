import webpush from 'web-push';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';

const hasVapidConfig =
  Boolean(env.VAPID_PUBLIC_KEY) && Boolean(env.VAPID_PRIVATE_KEY) && Boolean(env.VAPID_SUBJECT);

if (hasVapidConfig) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

const normalizeSubscription = (subscription) => ({
  endpoint: subscription.endpoint,
  keys: {
    p256dh: subscription.keys?.p256dh,
    auth: subscription.keys?.auth,
  },
});

export const registerPushSubscription = async ({ userId, subscription, userAgent }) => {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return false;
  }

  const normalized = normalizeSubscription(subscription);
  const user = await User.findById(userId).select('+webPushSubscriptions');
  if (!user) return false;

  const existingIndex = user.webPushSubscriptions.findIndex(
    (entry) => entry.endpoint === normalized.endpoint,
  );

  if (existingIndex >= 0) {
    user.webPushSubscriptions[existingIndex] = {
      ...normalized,
      createdAt: user.webPushSubscriptions[existingIndex].createdAt,
      lastUsedAt: new Date(),
      userAgent: userAgent || '',
    };
  } else {
    user.webPushSubscriptions.push({
      ...normalized,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      userAgent: userAgent || '',
    });
  }

  await user.save();
  return true;
};

export const unregisterPushSubscription = async ({ userId, endpoint }) => {
  if (!endpoint) return;

  await User.findByIdAndUpdate(userId, {
    $pull: {
      webPushSubscriptions: {
        endpoint,
      },
    },
  });
};

const removeInvalidEndpoint = async (userId, endpoint) => {
  await User.findByIdAndUpdate(userId, {
    $pull: {
      webPushSubscriptions: { endpoint },
    },
  });
};

const buildPayload = ({ title, body, url, conversationId, senderName }) =>
  JSON.stringify({
    title,
    body,
    url,
    conversationId,
    senderName,
    timestamp: Date.now(),
  });

const chunk = (items, size) => {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
};

export const sendPushToUsers = async ({ userIds, title, body, url = '/chat', conversationId, senderName }) => {
  if (!hasVapidConfig || !Array.isArray(userIds) || userIds.length === 0) {
    return;
  }

  const users = await User.find({ _id: { $in: userIds } })
    .select('_id webPushSubscriptions')
    .lean();

  const payload = buildPayload({ title, body, url, conversationId, senderName });
  const deliveries = users.flatMap((user) =>
    (user.webPushSubscriptions || []).map((subscription) => ({
      userId: user._id,
      subscription,
    })),
  );

  for (const batch of chunk(deliveries, 100)) {
    await Promise.all(
      batch.map(async ({ userId, subscription }) => {
        try {
          await webpush.sendNotification(subscription, payload);
        } catch (error) {
          if (error?.statusCode === 404 || error?.statusCode === 410) {
            await removeInvalidEndpoint(userId, subscription.endpoint);
            return;
          }

          logger.warn('push notification delivery failed', {
            userId,
            endpoint: subscription.endpoint,
            statusCode: error?.statusCode,
            error,
          });
        }
      }),
    );
  }
};

export const canUsePush = () => hasVapidConfig;
