import type { SourceAdapter } from '../core/types.js';
import { fetchZigObjects } from './zig-fetch.js';
import { parseZigJson } from './zig.js';

/**
 * Woonnet Haaglanden — SOURCES.md #15. Social housing (ZIG/Hexia portal);
 * allocation by inschrijfduur/loting, so alerts are informational (no letter,
 * see NO_LETTER_SOURCES in notify.ts).
 * Tests parse fixtures/woonnethaaglanden/ — never live sites in CI.
 */

const BASE_URL = 'https://www.woonnet-haaglanden.nl';

export const woonnethaaglanden: SourceAdapter = {
  name: 'woonnet-haaglanden',
  intervalSec: 300, // no speed game — poll relaxed
  async fetchLatest() {
    return parseZigJson(await fetchZigObjects(BASE_URL), 'woonnet-haaglanden', BASE_URL);
  },
};
