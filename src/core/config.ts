import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /** Never send real emails unless explicitly disabled (CLAUDE.md hard rule). */
  DRY_RUN: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('127.0.0.1'),
  DB_PATH: z.string().default('data/app.db'),
  // SMTP (PLAN.md §5) — only required when actually sending (DRY_RUN=false).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Delft Rental Alert <delft-rental-alert@localhost>'),
  // Master switch for the scrape loops. `pnpm dev` disables them so UI/API
  // work never hits the live sites; use `pnpm dev:scrape` to test scraping.
  SCRAPERS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // Per-source poll intervals in seconds (PLAN.md §3: 60-180, ±20% jitter
  // applied by the scheduler). Aggregators whose listings are near-pure
  // duplicates of primary sources poll relaxed (600s).
  // Cloudflare-challenged trio (browser-fetch.ts): a headed navigation every
  // 2-3 min got the browser session flagged in production — poll these
  // relaxed (300s) to stay under the radar.
  POLL_INTERVAL_PARARIUS_SEC: z.coerce.number().int().min(60).default(300),
  POLL_INTERVAL_HUURWONINGEN_SEC: z.coerce.number().int().min(60).default(300),
  POLL_INTERVAL_HUISLIJN_SEC: z.coerce.number().int().min(60).default(300),
  POLL_INTERVAL_FUNDA_SEC: z.coerce.number().int().min(60).default(180),
  POLL_INTERVAL_HUURE_SEC: z.coerce.number().int().min(60).default(180),
  POLL_INTERVAL_APPARTEMENTDELFT_SEC: z.coerce.number().int().min(60).default(180),
  POLL_INTERVAL_BJORND_SEC: z.coerce.number().int().min(60).default(180),
  POLL_INTERVAL_OUDEDELFT_SEC: z.coerce.number().int().min(60).default(180),
  POLL_INTERVAL_IKWILHUREN_SEC: z.coerce.number().int().min(60).default(180),
  POLL_INTERVAL_HUURWONINGPORTAAL_SEC: z.coerce.number().int().min(60).default(180),
  POLL_INTERVAL_RENTFINDER_SEC: z.coerce.number().int().min(60).default(180),
  POLL_INTERVAL_HUIZENVINDER_SEC: z.coerce.number().int().min(60).default(180),
  POLL_INTERVAL_RENT_SEC: z.coerce.number().int().min(60).default(180),
  POLL_INTERVAL_DIRECTWONEN_SEC: z.coerce.number().int().min(60).default(180),
  POLL_INTERVAL_VBT_SEC: z.coerce.number().int().min(60).default(180),
  POLL_INTERVAL_MARKTPLAATS_SEC: z.coerce.number().int().min(60).default(180),
  POLL_INTERVAL_HUURSTUNT_SEC: z.coerce.number().int().min(60).default(600),
  POLL_INTERVAL_RENTUMO_SEC: z.coerce.number().int().min(60).default(600),
  POLL_INTERVAL_RENTOLA_SEC: z.coerce.number().int().min(60).default(600),
  POLL_INTERVAL_BUURTJE_SEC: z.coerce.number().int().min(60).default(180),
  POLL_INTERVAL_TROVIT_SEC: z.coerce.number().int().min(60).default(600),
  POLL_INTERVAL_WOONNET_SEC: z.coerce.number().int().min(60).default(300),
  POLL_INTERVAL_ROOMMATCH_SEC: z.coerce.number().int().min(60).default(300),
  // Dashboard (PLAN.md §6): password for the built-in `admin` login. Friends
  // log in with the username/password stored on their profile. When unset,
  // admin login is disabled (profile logins still work).
  DASHBOARD_PASSWORD: z.string().optional(),
  // Admin alert recipient (PLAN.md §6): stale source / zero-listing streaks.
  ADMIN_EMAIL: z.string().email().optional(),
});

const envSchemaChecked = envSchema.superRefine((cfg, ctx) => {
  if (!cfg.DRY_RUN) {
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const) {
      if (!cfg[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when DRY_RUN=false`,
        });
      }
    }
  }
});

export type Config = z.infer<typeof envSchemaChecked>;

export const config: Config = envSchemaChecked.parse(process.env);
