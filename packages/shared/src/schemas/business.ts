import { z } from 'zod';
import { MEMBERSHIP_STATUSES, SUPPORTED_LOCALES } from '../enums';
import { currencyCode, email } from './auth';
import { nullableText } from './common';

export const UpdateBusinessSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  legalName: nullableText(160),
  nif: nullableText(40),
  address: nullableText(250),
  phone: nullableText(30),
  email: z
    .union([email, z.literal('')])
    .nullish()
    .transform((v) => (v ? v : null)),
  currency: currencyCode.optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  timezone: z
    .string()
    .max(64)
    .refine(
      (tz) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: 'sw.timezone' },
    )
    .optional(),
});

export const InviteMemberSchema = z.object({
  email,
  roleId: z.uuid(),
});

export const UpdateMemberSchema = z
  .object({
    roleId: z.uuid().optional(),
    status: z.enum(MEMBERSHIP_STATUSES).optional(),
  })
  .refine((v) => v.roleId !== undefined || v.status !== undefined, {
    message: 'sw.roleOrStatus',
  });
