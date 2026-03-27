import { env } from './env.js';

export const emailEnabled = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

export const emailFrom = env.SMTP_FROM || env.SMTP_USER || 'no-reply@example.com';
