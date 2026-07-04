import { describe, expect, it } from 'vitest';
import { cookieHeader, updateJar, type CookieJar } from './http.js';

describe('cookie jar', () => {
  it('stores name=value pairs and drops attributes', () => {
    const jar: CookieJar = new Map();
    updateJar(jar, [
      'session=abc123; Path=/; HttpOnly; Secure',
      '__cf_bm=token-xyz; path=/; expires=Wed, 02-Jul-2026 12:30:00 GMT; domain=.pararius.nl',
    ]);
    expect(cookieHeader(jar)).toBe('session=abc123; __cf_bm=token-xyz');
  });

  it('overwrites an existing cookie with the same name', () => {
    const jar: CookieJar = new Map([['session', 'old']]);
    updateJar(jar, ['session=new; Path=/']);
    expect(cookieHeader(jar)).toBe('session=new');
  });

  it('deletes a cookie when the value is emptied', () => {
    const jar: CookieJar = new Map([
      ['session', 'abc'],
      ['other', 'keep'],
    ]);
    updateJar(jar, ['session=; expires=Thu, 01 Jan 1970 00:00:00 GMT']);
    expect(cookieHeader(jar)).toBe('other=keep');
  });

  it('keeps values containing = intact', () => {
    const jar: CookieJar = new Map();
    updateJar(jar, ['token=a=b=c; Path=/']);
    expect(cookieHeader(jar)).toBe('token=a=b=c');
  });

  it('ignores malformed headers and empty input', () => {
    const jar: CookieJar = new Map();
    updateJar(jar, ['nonsense-without-equals', '=value-without-name']);
    expect(cookieHeader(jar)).toBe('');
  });
});
