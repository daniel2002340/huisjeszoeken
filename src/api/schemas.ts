import { z } from 'zod';

/** API input validation (CLAUDE.md: zod-validate all external input). */

export const profileInputSchema = z.object({
  name: z.string().min(1).max(100),
  emails: z.array(z.string().email()).min(1).max(10),
  // Dashboard login. Username null = no login for this profile. Password is
  // write-only: omitted/empty on update means "keep the current password".
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{2,30}$/, 'username: 2-30 chars, a-z 0-9 . _ -')
    .refine((u) => u !== 'admin', { message: 'username "admin" is reserved' })
    .nullable()
    .default(null),
  password: z.string().min(6).max(200).optional(),
  minPrice: z.number().int().nonnegative().nullable().default(null),
  maxPrice: z.number().int().positive().nullable().default(null),
  minBedrooms: z.number().int().nonnegative().nullable().default(null),
  minSurfaceM2: z.number().int().positive().nullable().default(null),
  propertyTypes: z.array(z.enum(['apartment', 'studio', 'room', 'house'])).default([]),
  furnishedPref: z.enum(['any', 'furnished', 'unfurnished']).default('any'),
  letterTemplate: z.string().min(1),
  letterVars: z.record(z.string()),
  active: z.boolean().default(true),
});

export type ProfileInputBody = z.infer<typeof profileInputSchema>;

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(100),
  password: z.string().min(1).max(200),
});

export const matchStatusSchema = z.object({
  status: z.enum(['new', 'responded', 'viewing', 'rejected', 'won']),
});

export const letterPreviewSchema = z.object({
  letterTemplate: z.string(),
  letterVars: z.record(z.string()),
});

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
