import type { SourceAdapter } from '../core/types.js';
import { fetchZigObjects } from './zig-fetch.js';
import { parseZigJson } from './zig.js';

/**
 * ROOMmatch — SOURCES.md #16. Student housing (ZIG/Hexia portal, DUWO);
 * registration system, so alerts are informational (no letter, see
 * NO_LETTER_SOURCES in notify.ts). Only relevant for student profiles.
 * Tests parse fixtures/roommatch/ — never live sites in CI.
 */

const BASE_URL = 'https://www.roommatch.nl';

export const roommatch: SourceAdapter = {
  name: 'roommatch',
  intervalSec: 300, // no speed game — poll relaxed
  async fetchLatest() {
    // Verified: roommatch's detail route lives under /aanbod/studentenwoningen/.
    return parseZigJson(
      await fetchZigObjects(BASE_URL),
      'roommatch',
      BASE_URL,
      '/aanbod/studentenwoningen/details/',
    );
  },
};
