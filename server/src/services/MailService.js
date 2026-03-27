import fs from 'fs/promises';
import handlebars from 'handlebars';
import transporter from '../config/mailTransporter.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Mail Service for handling email templates and sending.
 * Follows the class-based standard provided by the user.
 */
export class MailService {
  async loadTemplate(templateName, context) {
    // Try multiple possible paths to handle both source and bundled (dist) environments
    const possiblePaths = [
      join(__dirname, 'template', `${templateName}.hbs`), // Bundled: dist/template/xxx.hbs
      join(__dirname, '..', 'template', `${templateName}.hbs`), // Source: src/services/../template/xxx.hbs (if run from src)
      join(process.cwd(), 'src', 'template', `${templateName}.hbs`), // Fallback: <CWD>/src/template/xxx.hbs
      join(process.cwd(), 'dist', 'template', `${templateName}.hbs`), // Fallback: <CWD>/dist/template/xxx.hbs
    ];

    let templateContent = null;
    let lastError = null;

    for (const templatePath of possiblePaths) {
      try {
        templateContent = await fs.readFile(templatePath, 'utf-8');
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!templateContent) {
      logger.error('failed to load mail template', {
        templateName,
        possiblePaths,
        error: lastError,
      });
      throw new Error(`Failed to load mail template "${templateName}": ${lastError?.message}`);
    }

    const compiledTemplate = handlebars.compile(templateContent);
    return compiledTemplate(context);
  }

  /**
   * Send an email using a template
   * @param {Object} data - Email data (name, email, link, subject, template)
   * @returns {Promise<string>} Message ID
   */
  async sendMail(data) {
    const { name, email, link, subject, template, ...extraContext } = data;

    try {
      const html = await this.loadTemplate(template, {
        name,
        link: link || env.CLIENT_URL,
        year: new Date().getFullYear(),
        ...extraContext,
      });

      const mailOptions = {
        from: env.SMTP_FROM || env.NODEMAILER_GMAIL_ID || 'no-reply@chatapp.com',
        to: email,
        subject,
        html,
      };

      const info = await transporter.sendMail(mailOptions);
      logger.info('email sent successfully', {
        template,
        email,
        messageId: info.messageId,
      });
      return info.messageId;
    } catch (error) {
      logger.error('failed to send email', {
        template,
        email,
        error,
      });
      throw new Error(`Email delivery failed [${template}]: ${error.message}`, {
        cause: error,
      });
    }
  }
}

export default MailService;
