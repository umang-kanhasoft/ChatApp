import { describe, expect, it } from 'vitest';
import { classifyMailCapability } from '../config/mailTransporter.js';

describe('mail transporter capability', () => {
  it('rejects placeholder SMTP configuration', () => {
    const capability = classifyMailCapability({
      SMTP_HOST: 'your-smtp-host',
      SMTP_USER: 'admin@example.com',
      SMTP_PASS: 'replace-this-password',
      NODEMAILER_GMAIL_ID: '',
      NODEMAILER_GMAIL_PASSWORD: '',
    });

    expect(capability).toEqual({
      available: false,
      provider: 'smtp',
      status: 'placeholder',
    });
  });

  it('accepts complete SMTP configuration', () => {
    const capability = classifyMailCapability({
      SMTP_HOST: 'smtp.mailgun.org',
      SMTP_USER: 'mailer',
      SMTP_PASS: 'super-secret-password',
      NODEMAILER_GMAIL_ID: '',
      NODEMAILER_GMAIL_PASSWORD: '',
    });

    expect(capability).toEqual({
      available: true,
      provider: 'smtp',
      status: 'available',
    });
  });

  it('falls back to missing when no mail configuration exists', () => {
    const capability = classifyMailCapability({
      SMTP_HOST: '',
      SMTP_USER: '',
      SMTP_PASS: '',
      NODEMAILER_GMAIL_ID: '',
      NODEMAILER_GMAIL_PASSWORD: '',
    });

    expect(capability).toEqual({
      available: false,
      provider: 'none',
      status: 'missing',
    });
  });
});
