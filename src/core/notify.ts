import nodemailer, { type Transporter } from 'nodemailer';
import { config } from './config.js';
import { renderApplicationLetter, type LetterProfile } from './letter.js';
import type { Listing } from './types.js';

/**
 * Email composition + send (PLAN.md §5). All email MUST go through this module.
 * DRY_RUN=true (the dev default) logs the rendered email instead of sending
 * (CLAUDE.md hard rule) — never send real emails during development.
 */

export interface NotifyProfile extends LetterProfile {
  name: string;
  emails: string[];
}

export interface OutgoingEmail {
  to: string[];
  subject: string;
  html: string;
  text: string;
}

const TYPE_LABELS: Record<string, string> = {
  apartment: 'appartement',
  studio: 'studio',
  room: 'kamer',
  house: 'huis',
};

const FURNISHED_LABELS: Record<string, string> = {
  furnished: 'gemeubileerd',
  unfurnished: 'gestoffeerd',
  shell: 'kaal',
};

const COPY_INSTRUCTION = 'Kopieer en plak de brief hieronder in het contactformulier:';

/** Fixed warnings appended to every alert from specific sources (SOURCES.md). */
export const SOURCE_WARNINGS: Record<string, string> = {
  marktplaats:
    '⚠️ Particuliere verhuur via Marktplaats kent veel oplichting: betaal NOOIT iets (borg, huur, "reserveringskosten") vóór een bezichtiging en een getekend huurcontract.',
};

/**
 * Registration/lottery systems (SOURCES.md #15/#16): reaction speed and a
 * letter are irrelevant — the alert is informational only.
 */
export const NO_LETTER_SOURCES = new Set(['woonnet-haaglanden', 'roommatch']);

const NO_LETTER_INSTRUCTION =
  'Dit is een inschrijfsysteem: log in en reageer via de site — toewijzing gaat op inschrijfduur of loting, geen brief nodig.';

const euro = (amount: number): string => `€${amount.toLocaleString('nl-NL')}`;
const sourceLabel = (source: string): string =>
  source.charAt(0).toUpperCase() + source.slice(1);
const shortAddress = (listing: Listing): string =>
  (listing.addressRaw.split(',')[0] ?? listing.addressRaw).trim();

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Subject format per PLAN.md §5: 🏠 €1.450 — Voorstraat 12, Delft (62 m², 2 slk) — Pararius */
export function buildSubject(listing: Listing): string {
  const price = listing.priceEur === null ? 'prijs onbekend' : euro(listing.priceEur);
  const city = listing.city ?? 'Delft';
  const details = [
    listing.surfaceM2 !== null ? `${listing.surfaceM2} m²` : null,
    listing.bedrooms !== null ? `${listing.bedrooms} slk` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(', ');

  return `🏠 ${price} — ${shortAddress(listing)}, ${city}${details ? ` (${details})` : ''} — ${sourceLabel(listing.source)}`;
}

/** Key facts, unknown fields omitted rather than shown as gaps. */
function buildFacts(listing: Listing): Array<[string, string]> {
  const facts: Array<[string, string | null]> = [
    ['Adres', listing.addressRaw],
    ['Huurprijs', listing.priceEur !== null ? `${euro(listing.priceEur)} per maand` : null],
    ['Oppervlakte', listing.surfaceM2 !== null ? `${listing.surfaceM2} m²` : null],
    ['Slaapkamers', listing.bedrooms !== null ? String(listing.bedrooms) : null],
    ['Type', TYPE_LABELS[listing.propertyType] ?? null],
    ['Interieur', FURNISHED_LABELS[listing.furnished] ?? null],
    ['Makelaar', listing.agency],
    ['Bron', sourceLabel(listing.source)],
  ];
  return facts.filter((f): f is [string, string] => f[1] !== null);
}

export function composeMatchEmail(listing: Listing, profile: NotifyProfile): OutgoingEmail {
  const subject = buildSubject(listing);
  const facts = buildFacts(listing);
  const withLetter = !NO_LETTER_SOURCES.has(listing.source);
  const letter = withLetter ? renderApplicationLetter(listing, profile) : null;
  const warning = SOURCE_WARNINGS[listing.source];

  const factRowsHtml = facts
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666;">${escapeHtml(label)}</td>` +
        `<td style="padding:4px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`,
    )
    .join('\n');

  const html = `<!doctype html>
<html lang="nl">
<body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;">
    ${
      listing.imageUrl
        ? `<img src="${escapeHtml(listing.imageUrl)}" alt="${escapeHtml(shortAddress(listing))}" style="display:block;width:100%;height:auto;" />`
        : ''
    }
    <div style="padding:24px;">
      <h1 style="margin:0 0 16px;font-size:20px;">${escapeHtml(shortAddress(listing))}, ${escapeHtml(listing.city ?? 'Delft')}</h1>
      <table style="border-collapse:collapse;font-size:14px;">
${factRowsHtml}
      </table>
      ${
        warning
          ? `<p style="margin:16px 0 0;padding:12px 14px;background:#fdecea;color:#b3261e;border-radius:6px;font-size:14px;">${escapeHtml(warning)}</p>`
          : ''
      }
      <a href="${escapeHtml(listing.url)}"
         style="display:block;margin:24px 0;padding:14px 0;background:#0a7d38;color:#ffffff;text-align:center;text-decoration:none;font-size:16px;font-weight:700;border-radius:6px;">
        Bekijk de woning &rarr;
      </a>
      ${
        letter !== null
          ? `<p style="font-size:14px;color:#666;">${escapeHtml(COPY_INSTRUCTION)}</p>
      <pre style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;background:#f5f5f5;border-radius:6px;padding:16px;white-space:pre-wrap;margin:0;">${escapeHtml(letter)}</pre>`
          : `<p style="font-size:14px;color:#666;">${escapeHtml(NO_LETTER_INSTRUCTION)}</p>`
      }
    </div>
  </div>
</body>
</html>`;

  const text = [
    subject,
    '',
    ...facts.map(([label, value]) => `${label}: ${value}`),
    ...(warning ? ['', warning] : []),
    '',
    `Bekijk de woning: ${listing.url}`,
    '',
    ...(letter !== null
      ? [
          COPY_INSTRUCTION,
          '',
          '--------------------------------------------------',
          letter,
          '--------------------------------------------------',
        ]
      : [NO_LETTER_INSTRUCTION]),
  ].join('\n');

  return { to: [...profile.emails], subject, html, text };
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  });
  return transporter;
}

export async function sendEmail(email: OutgoingEmail): Promise<void> {
  if (config.DRY_RUN) {
    const line = '─'.repeat(72);
    console.log(
      [
        line,
        `DRY_RUN email (not sent) — html alternative: ${email.html.length} chars`,
        `To:      ${email.to.join(', ')}`,
        `Subject: ${email.subject}`,
        line,
        email.text,
        line,
      ].join('\n'),
    );
    return;
  }

  await getTransporter().sendMail({
    from: config.MAIL_FROM,
    to: email.to.join(', '),
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

/** One email per match per profile, to all addresses in profile.emails (PLAN.md §5). */
export async function notifyMatch(listing: Listing, profile: NotifyProfile): Promise<void> {
  await sendEmail(composeMatchEmail(listing, profile));
}
