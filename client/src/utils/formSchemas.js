import { z } from 'zod';

export const registerSchema = z.object({
  displayName: z.string().min(2, 'Display name is required').max(60),
  phone: z
    .string()
    .trim()
    .min(6, 'Enter a valid phone number')
    .max(20, 'Enter a valid phone number')
    .regex(/^[0-9+\s().-]+$/u, 'Enter a valid phone number'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscore are allowed'),
  email: z.string().email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must include an uppercase letter')
    .regex(/[a-z]/, 'Must include a lowercase letter')
    .regex(/[0-9]/, 'Must include a number'),
});

export const loginSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(6, 'Enter a valid phone number')
    .max(20, 'Enter a valid phone number')
    .regex(/^[0-9+\s().-]+$/u, 'Enter a valid phone number'),
});
