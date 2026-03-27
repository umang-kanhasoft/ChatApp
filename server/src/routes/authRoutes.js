import { Router } from 'express';
import {
  login,
  logout,
  logoutAll,
  emailOtpRequestByPhone,
  emailOtpRequest,
  emailOtpVerifyByPhone,
  emailOtpVerify,
  matchContacts,
  me,
  otpRequest,
  otpVerify,
  refresh,
  register,
  subscribePush,
  unsubscribePush,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { createAuthLimiter, createOtpLimiter } from '../middleware/rateLimiter.js';
import { validateBody } from '../middleware/validate.js';
import {
  loginSchema,
  emailOtpRequestByPhoneSchema,
  emailOtpRequestSchema,
  emailOtpVerifyByPhoneSchema,
  emailOtpVerifySchema,
  otpRequestSchema,
  otpVerifySchema,
  contactsMatchSchema,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  refreshSchema,
  registerSchema,
} from './schemas.js';

export const createAuthRoutes = ({ redisClient = null } = {}) => {
  const router = Router();
  const authLimiter = createAuthLimiter(redisClient);
  const otpLimiter = createOtpLimiter(redisClient);

  router.post('/register', authLimiter, validateBody(registerSchema), register);
  router.post('/login', authLimiter, validateBody(loginSchema), login);
  router.post('/otp/request', otpLimiter, validateBody(otpRequestSchema), otpRequest);
  router.post('/otp/verify', otpLimiter, validateBody(otpVerifySchema), otpVerify);
  router.post('/otp/email/request', otpLimiter, validateBody(emailOtpRequestSchema), emailOtpRequest);
  router.post('/otp/email/verify', otpLimiter, validateBody(emailOtpVerifySchema), emailOtpVerify);
  router.post(
    '/otp/email/request-by-phone',
    otpLimiter,
    validateBody(emailOtpRequestByPhoneSchema),
    emailOtpRequestByPhone,
  );
  router.post(
    '/otp/email/verify-by-phone',
    otpLimiter,
    validateBody(emailOtpVerifyByPhoneSchema),
    emailOtpVerifyByPhone,
  );
  router.post('/refresh', authLimiter, validateBody(refreshSchema), refresh);
  router.post('/logout', requireAuth, validateBody(refreshSchema), logout);
  router.post('/logout-all', requireAuth, logoutAll);
  router.get('/me', requireAuth, me);
  router.post('/contacts/match', requireAuth, validateBody(contactsMatchSchema), matchContacts);
  router.post('/push/subscribe', requireAuth, validateBody(pushSubscriptionSchema), subscribePush);
  router.post('/push/unsubscribe', requireAuth, validateBody(pushUnsubscribeSchema), unsubscribePush);

  return router;
};

export default createAuthRoutes;
