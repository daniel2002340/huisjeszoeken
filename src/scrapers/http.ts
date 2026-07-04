import { fetch } from 'undici';

/** Realistic browser headers for polite scraping (PLAN.md §3 etiquette). */
export const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
} as const;

/** Error carrying the HTTP status so the scheduler can back off on 403/429. */
export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpStatusError';
  }
}

// ---------------------------------------------------------------------------
// Cookie jar — PLAN.md §3: "keep cookies between polls". One in-memory jar per
// host, so consecutive polls look like one returning session instead of a
// fresh client every time. Deliberately minimal: name=value only, session
// lifetime of the process, no cross-host sharing.
// ---------------------------------------------------------------------------

export type CookieJar = Map<string, string>;

const jars = new Map<string, CookieJar>();

function jarFor(host: string): CookieJar {
  let jar = jars.get(host);
  if (!jar) {
    jar = new Map();
    jars.set(host, jar);
  }
  return jar;
}

/** Store cookies from Set-Cookie headers; an empty value deletes the cookie. */
export function updateJar(jar: CookieJar, setCookieHeaders: string[]): void {
  for (const header of setCookieHeaders) {
    const pair = header.split(';', 1)[0] ?? '';
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (value === '' || value === '""') {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
}

export function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

export async function fetchHtml(
  url: string,
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  const jar = jarFor(new URL(url).host);
  const cookies = cookieHeader(jar);

  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, ...(cookies ? { cookie: cookies } : {}), ...extraHeaders },
  });
  updateJar(jar, res.headers.getSetCookie());

  if (!res.ok) {
    throw new HttpStatusError(res.status, url);
  }
  return res.text();
}
