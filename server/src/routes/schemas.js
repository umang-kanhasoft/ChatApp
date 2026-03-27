import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number'),
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscore'),
  displayName: z.string().min(2).max(60),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
    .regex(/[a-z]/, 'Password must include at least one lowercase letter')
    .regex(/[0-9]/, 'Password must include at least one number'),
});

export const contactsMatchSchema = z.object({
  phones: z.array(z.string().min(3)).min(1).max(500),
});

export const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(8).max(128),
});

export const emailOtpRequestSchema = z.object({
  email: z.string().email(),
});

export const emailOtpVerifySchema = z.object({
  email: z.string().email(),
  code: z.string().trim().min(4).max(6),
});

export const emailOtpRequestByPhoneSchema = z.object({
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/u, 'Enter a valid phone number'),
});

export const emailOtpVerifyByPhoneSchema = z.object({
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/u, 'Enter a valid phone number'),
  code: z.string().trim().min(4).max(6),
});

export const otpRequestSchema = z.object({
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/u, 'Enter a valid phone number'),
});

export const otpVerifySchema = z.object({
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/u, 'Enter a valid phone number'),
  code: z.string().trim().min(4).max(6),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export const privateConversationSchema = z
  .object({
    peerUserId: z.string().trim().min(1).optional(),
    phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/u, 'Enter a valid phone number').optional(),
  })
  .refine((data) => data.peerUserId || data.phone, {
    message: 'Provide either peer user id or phone',
  });

export const messageCreateSchema = z.object({
  clientMessageId: z.string().trim().min(1).max(100),
  type: z.enum(['text', 'image', 'video', 'audio', 'document', 'poll']).default('text'),
  text: z.string().max(5000).optional(),
  replyTo: z.string().optional().nullable(),
  media: z
    .object({
      url: z.string().url(),
      fileName: z.string().max(255).optional(),
      mimeType: z.string().max(100).optional(),
      fileSize: z.number().int().nonnegative().optional(),
    })
    .optional(),
  poll: z
    .object({
      question: z.string().trim().min(1).max(500),
      options: z.array(z.string().trim().min(1).max(120)).min(2).max(10),
      allowMultipleChoice: z.boolean().optional(),
      expiresAt: z.coerce.date().optional().nullable(),
    })
    .optional(),
});

export const cursorQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const messageEditSchema = z.object({
  text: z.string().min(1).max(5000),
});

export const messageDeleteSchema = z.object({
  scope: z.enum(['me', 'everyone']).default('me'),
});

export const reactionSchema = z.object({
  emoji: z.string().min(1).max(32),
});

export const pollVoteSchema = z.object({
  optionIndex: z.coerce.number().int().min(0),
});

export const forwardMessageSchema = z.object({
  targetConversationId: z.string().min(1),
});

export const scheduleMessageSchema = z.object({
  clientMessageId: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(5000),
  replyTo: z.string().optional().nullable(),
  scheduledFor: z.coerce.date(),
  recurrence: z
    .object({
      frequency: z.enum(['none', 'daily', 'weekly']).default('none'),
      interval: z.coerce.number().int().min(1).max(30).default(1),
    })
    .optional(),
});

export const scheduledMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const searchMessagesQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export const groupCreateSchema = z.object({
  title: z.string().trim().min(2).max(80),
  memberIds: z.array(z.string().min(1)).min(1).max(99),
});

export const groupAddMembersSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(1).max(100),
});

export const groupRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export const statusCreateSchema = z.object({
  type: z.enum(['text', 'image', 'video']).default('text'),
  text: z.string().max(1000).optional(),
  mediaUrl: z.string().url().optional(),
  caption: z.string().max(500).optional(),
  privacy: z.enum(['all', 'contacts', 'private']).default('all'),
  allowedUsers: z.array(z.string().min(1)).max(100).optional(),
});

export const statusReactionSchema = z.object({
  emoji: z.string().min(1).max(32),
});

export const reportSchema = z.object({
  targetType: z.enum(['user', 'message', 'status', 'conversation']),
  targetId: z.string().min(1).max(100),
  reason: z.enum(['spam', 'abuse', 'harassment', 'hate', 'illegal', 'other']).default('other'),
  details: z.string().max(2000).optional(),
});
