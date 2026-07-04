import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isChallengeHtml } from './browser-fetch.js';

const fixture = (path: string): string => readFileSync(`fixtures/${path}`, 'utf8');

describe('isChallengeHtml', () => {
  it('detects the Cloudflare interstitial', () => {
    expect(isChallengeHtml(fixture('cloudflare/challenge.html'))).toBe(true);
  });

  it.each(['pararius/latest.html', 'huislijn/latest.html', 'huurwoningen/latest.html'])(
    'does not flag a real results page (%s)',
    (path) => {
      expect(isChallengeHtml(fixture(path))).toBe(false);
    },
  );
});
