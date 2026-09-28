import { z } from 'zod';

export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

const email = z.string().trim().toLowerCase().email('Enter a valid email');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  email,
  password,
  phone: z.string().trim().regex(/^[0-9+\-\s]{7,20}$/, 'Enter a valid phone number').optional().or(z.literal('')),
  city: z.string().trim().max(60).optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(72),
});
