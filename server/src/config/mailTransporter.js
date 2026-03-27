import nodemailer from 'nodemailer';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * Mail Transporter configuration.
 * Supports generic SMTP and Gmail.
 */
const normalizeValue = (value) => String(value ?? '').trim();

const PLACEHOLDER_PATTERNS = [
  /your-/i,
  /example\.com/i,
  /replace/i,
  /admin@example\.com/i,
];

const isPlaceholderValue = (value) => {
  const normalized = normalizeValue(value).toLowerCase();
  if (!normalized) {
    return false;
  }

  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const classifyMailCapability = (config = env) => {
  const smtpHost = normalizeValue(config.SMTP_HOST);
  const smtpUser = normalizeValue(config.SMTP_USER);
  const smtpPass = normalizeValue(config.SMTP_PASS);
  const gmailUser = normalizeValue(config.NODEMAILER_GMAIL_ID);
  const gmailPass = normalizeValue(config.NODEMAILER_GMAIL_PASSWORD);

  const hasSmtpConfig = [smtpHost, smtpUser, smtpPass].some(Boolean);
  if (hasSmtpConfig) {
    if ([smtpHost, smtpUser, smtpPass].some(isPlaceholderValue)) {
      return {
        available: false,
        provider: 'smtp',
        status: 'placeholder',
      };
    }

    if (smtpHost && smtpUser && smtpPass) {
      return {
        available: true,
        provider: 'smtp',
        status: 'available',
      };
    }

    return {
      available: false,
      provider: 'smtp',
      status: 'missing',
    };
  }

  const hasGmailConfig = [gmailUser, gmailPass].some(Boolean);
  if (hasGmailConfig) {
    if ([gmailUser, gmailPass].some(isPlaceholderValue)) {
      return {
        available: false,
        provider: 'gmail',
        status: 'placeholder',
      };
    }

    if (gmailUser && gmailPass) {
      return {
        available: true,
        provider: 'gmail',
        status: 'available',
      };
    }

    return {
      available: false,
      provider: 'gmail',
      status: 'missing',
    };
  }

  return {
    available: false,
    provider: 'none',
    status: 'missing',
  };
};

export const getMailCapability = () => classifyMailCapability(env);

export const mailCapability = getMailCapability();

let transporterConfig;
let activeService;

if (mailCapability.available && mailCapability.provider === 'smtp') {
  // Generic SMTP configuration
  activeService = `SMTP (${env.SMTP_HOST}:${env.SMTP_PORT || 587})`;
  transporterConfig = {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT || 587,
    secure: env.SMTP_PORT === 465, // SSL for 465, STARTTLS for others
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    connectionTimeout: 30000, // 30s for production reliability
    greetingTimeout: 30000,
    socketTimeout: 30000,
    pool: true,
    family: 4, // Force IPv4 to avoid handshake issues in some cloud environments
  };
} else if (mailCapability.available && mailCapability.provider === 'gmail') {
  // Explicit Gmail SMTP configuration (more reliable than 'service' shortcut in some cloud envs)
  activeService = 'Gmail (smtp.gmail.com)';
  transporterConfig = {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // 587 uses STARTTLS
    auth: {
      user: env.NODEMAILER_GMAIL_ID,
      pass: env.NODEMAILER_GMAIL_PASSWORD,
    },
    connectionTimeout: 30000, // 30s
    greetingTimeout: 30000,
    socketTimeout: 30000,
    pool: true,
    family: 4, // Force IPv4
  };
} else {
  // Placeholder/Log-only transporter (fallback)
  activeService = 'Log-only (JSON)';
  logger.warn('mail delivery disabled; using log-only transport', {
    provider: mailCapability.provider,
    status: mailCapability.status,
  });
  transporterConfig = {
    jsonTransport: true,
  };
}

logger.info('initializing mail transporter', {
  activeService,
  provider: mailCapability.provider,
  status: mailCapability.status,
});

export const transporter = nodemailer.createTransport(transporterConfig);

// Verify connection on startup to catch configuration errors early
if (env.NODE_ENV !== 'test' && mailCapability.available) {
  transporter.verify((error) => {
    if (error) {
      logger.error('mail transporter verification failed', { error });
    } else {
      logger.info('mail transporter connection verified');
    }
  });
}

export default transporter;
