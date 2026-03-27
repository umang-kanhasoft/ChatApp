import { getRedis } from '../config/redis.js';

const CONVERSATION_LIST_CACHE_TTL_SECONDS = 15;
const versionKey = (userId) => `cache:conversations:version:${String(userId)}`;
const listKey = ({ userId, limit, cursor, version }) =>
  `cache:conversations:list:${String(userId)}:${version}:${String(limit)}:${cursor || 'first'}`;

const getCurrentVersion = async (redis, userId) => {
  const current = await redis.get(versionKey(userId));
  return current || '0';
};

export const readConversationListCache = async ({ userId, limit, cursor }) => {
  const redis = getRedis();
  if (!redis) {
    return null;
  }

  const version = await getCurrentVersion(redis, userId);
  const cached = await redis.get(
    listKey({
      userId,
      limit,
      cursor,
      version,
    }),
  );

  if (!cached) {
    return null;
  }

  try {
    return JSON.parse(cached);
  } catch {
    return null;
  }
};

export const writeConversationListCache = async ({ userId, limit, cursor, data }) => {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  const version = await getCurrentVersion(redis, userId);
  await redis.set(
    listKey({
      userId,
      limit,
      cursor,
      version,
    }),
    JSON.stringify(data),
    'EX',
    CONVERSATION_LIST_CACHE_TTL_SECONDS,
  );
};

export const bumpConversationListVersions = async ({ userIds }) => {
  const redis = getRedis();
  const uniqueIds = [...new Set((userIds || []).map((entry) => String(entry)).filter(Boolean))];

  if (!redis || uniqueIds.length === 0) {
    return;
  }

  const pipeline = redis.multi();
  for (const userId of uniqueIds) {
    pipeline.incr(versionKey(userId));
  }
  await pipeline.exec();
};
