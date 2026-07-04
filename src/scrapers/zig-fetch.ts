import { fetch } from 'undici';
import { BROWSER_HEADERS, HttpStatusError } from './http.js';
import { ZIG_ENDPOINT_PATH } from './zig.js';

/** POST to a ZIG portal's getallobjects endpoint (empty body = full offer). */
export async function fetchZigObjects(baseUrl: string): Promise<string> {
  const url = `${baseUrl}${ZIG_ENDPOINT_PATH}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${baseUrl}/`,
    },
    body: '',
  });
  if (!res.ok) throw new HttpStatusError(res.status, url);
  return res.text();
}
