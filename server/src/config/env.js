import 'dotenv/config';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

const DEFAULT_ACCESS_SECRET = 'replace-me-with-a-long-dev-access-secret-0123456789';
const DEFAULT_REFRESH_SECRET = 'replace-me-with-a-long-dev-refresh-secret-9876543210';
const PLACEHOLDER_PATTERNS = [/replace/i, /example/i, /your-/i];

const isPlaceholderSecret = (value) =>
  PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(String(value || '').trim()));

// Keep deployment-specific values in `.env` and leave stable operational defaults here.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(5000),
  INSTANCE_ID: z.string().trim().min(1).optional().default('chatapp-local-1'),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  CLIENT_URLS: z.string().optional().default(''),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/chatapp'),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(5).max(500).default(100),
  MONGODB_MIN_POOL_SIZE: z.coerce.number().int().min(0).max(100).default(10),
  MONGODB_SOCKET_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(10000),
  MONGODB_FALLBACK_TO_MEMORY: z
    .string()
    .optional()
    .transform((value) => {
      if (value == null) return true;
      return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    }),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  REDIS_REQUIRED: z
    .string()
    .optional()
    .transform((value) => {
      if (value == null) return false;
      return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    }),
  JWT_ACCESS_SECRET: z.string().min(32).default(DEFAULT_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z.string().min(32).default(DEFAULT_REFRESH_SECRET),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().trim().min(1).default('never'),
  JWT_ISSUER: z.string().min(2).default('chatapp'),
  AUTH_SESSION_MAX_ACTIVE: z.coerce.number().int().min(1).max(20).default(5),
  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(16).default(10),
  WEBRTC_ICE_SERVERS: z.string().optional(),
  CALL_RING_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(180).default(45),
  TEST_OTP_CODE: z.string().trim().min(4).max(8).optional(),
  SOCKET_CONNECTION_RECOVERY_MS: z.coerce.number().int().min(10000).max(300000).default(120000),
  SOCKET_PRESENCE_TTL_SECONDS: z.coerce.number().int().min(30).max(300).default(75),
  SOCKET_PRESENCE_HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().int().min(10).max(120).default(25),
  PRESENCE_ROOM_CACHE_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  SOCKET_JOIN_ALL_BATCH_SIZE: z.coerce.number().int().min(50).max(5000).default(500),
  SOCKET_MAX_HTTP_BUFFER_SIZE: z.coerce.number().int().min(1024).max(20 * 1024 * 1024).default(1_000_000),
  READ_RECEIPT_BATCH_SIZE: z.coerce.number().int().min(50).max(5000).default(500),
  READ_RECEIPT_EMIT_MAX_IDS: z.coerce.number().int().min(50).max(2000).default(500),
  SCHEDULED_MESSAGE_POLL_INTERVAL_MS: z.coerce.number().int().min(500).max(60000).default(2000),
  SCHEDULED_MESSAGE_MAX_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(20),
  SCHEDULED_MESSAGE_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  SCHEDULED_MESSAGE_LEADER_TTL_MS: z.coerce.number().int().min(5000).max(120000).default(15000),
  PUSH_QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(500).default(50),
  PUSH_QUEUE_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  PUSH_QUEUE_BACKOFF_MS: z.coerce.number().int().min(100).max(60000).default(1000),
  METRICS_ENABLED: z
    .string()
    .optional()
    .transform((value) => {
      if (value == null) return true;
      return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    }),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  NODEMAILER_GMAIL_ID: z.string().optional(),
  NODEMAILER_GMAIL_PASSWORD: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    if (data.MONGODB_FALLBACK_TO_MEMORY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'MONGODB_FALLBACK_TO_MEMORY must be disabled in production',
        path: ['MONGODB_FALLBACK_TO_MEMORY'],
      });
    }

    if (!data.REDIS_REQUIRED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'REDIS_REQUIRED must be enabled in production for distributed sockets, caches, and queues',
        path: ['REDIS_REQUIRED'],
      });
    }

    if (data.JWT_ACCESS_SECRET === DEFAULT_ACCESS_SECRET || isPlaceholderSecret(data.JWT_ACCESS_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_ACCESS_SECRET must be replaced in production',
        path: ['JWT_ACCESS_SECRET'],
      });
    }

    if (
      data.JWT_REFRESH_SECRET === DEFAULT_REFRESH_SECRET ||
      isPlaceholderSecret(data.JWT_REFRESH_SECRET)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_REFRESH_SECRET must be replaced in production',
        path: ['JWT_REFRESH_SECRET'],
      });
    }

    if (data.REDIS_REQUIRED && !data.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'REDIS_URL is required when REDIS_REQUIRED is enabled',
        path: ['REDIS_URL'],
      });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  logger.error('environment validation failed', {
    errors: parsed.error.flatten().fieldErrors,
  });
  process.exit(1);
}

export const env = parsed.data;
