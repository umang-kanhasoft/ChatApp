import 'dotenv/config';
import MailService from '../src/services/MailService.js';

/**
 * Test script for the new MailService and Handlebars templates.
 * Run with: node scripts/test-email.js from the server directory.
 */
const testEmail = async () => {
  const mailService = new MailService();
  const user = process.env.SMTP_USER || process.env.NODEMAILER_GMAIL_ID;

  console.log(`[Test] Testing MailService with user: ${user}`);

  if (!user) {
    console.error('[Test] ERROR: SMTP credentials missing in .env (need SMTP_USER or NODEMAILER_GMAIL_ID)');
    process.exit(1);
  }

  try {
    console.log('[Test] Sending test OTP email using "otp" template...');
    await mailService.sendMail({
      name: 'Test Admin',
      email: user, // send to self
      subject: 'ChatApp OTP Test',
      template: 'otp',
      code: '123456',
    });
    console.log('[Test] SUCCESS: OTP Test email sent via MailService!');

    console.log('[Test] Sending test Welcome email using "welcome" template...');
    await mailService.sendMail({
      name: 'Test Admin',
      email: user, // send to self
      subject: 'Welcome to ChatApp!',
      template: 'welcome',
      link: 'http://localhost:5173',
    });
    console.log('[Test] SUCCESS: Welcome Test email sent via MailService!');
    
  } catch (error) {
    console.error('[Test] FAILURE: MailService Error:');
    console.error(error);
  }
};

testEmail();
