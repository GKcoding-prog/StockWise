import { z } from 'zod';
import { SUPPORTED_LOCALES } from '../enums';
import { nullableText } from './common';

export const email = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());

export const password = z.string().min(8).max(128);

export const currencyCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, { message: 'sw.currency' })
  .transform((v) => v.toUpperCase());

export const RegisterSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email,
  password,
  businessName: z.string().trim().min(2).max(120),
  currency: currencyCode.default('BIF'),
  locale: z.enum(SUPPORTED_LOCALES).default('fr'),
});
export type RegisterInput = z.input<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.input<typeof LoginSchema>;

export const SwitchBusinessSchema = z.object({ businessId: z.uuid() });

export const ForgotPasswordSchema = z.object({ email });

export const ResetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  newPassword: password,
});

export const AcceptInvitationSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  password: password.optional(),
});

export const UpdateMeSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  phone: nullableText(30),
  locale: z.enum(SUPPORTED_LOCALES).nullish(),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});
