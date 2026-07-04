import { describe, expect, it } from 'vitest';
import { evaluateSource, type SourceRunSummary } from './alerts.js';

const NOW = new Date('2026-07-02T12:00:00Z');
const minutesAgo = (min: number): Date => new Date(NOW.getTime() - min * 60_000);

const summary = (overrides: Partial<SourceRunSummary> = {}): SourceRunSummary => ({
  source: 'pararius',
  lastSuccessAt: minutesAgo(2),
  recentOkListingCounts: [30, 28, 30, 31, 29],
  ...overrides,
});

describe('evaluateSource', () => {
  it('reports nothing for a healthy source', () => {
    expect(evaluateSource(summary(), NOW)).toEqual([]);
  });

  describe('stale (no successful run for >30 min)', () => {
    it('alerts when the last success is older than 30 min', () => {
      const issues = evaluateSource(summary({ lastSuccessAt: minutesAgo(31) }), NOW);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ kind: 'stale', source: 'pararius' });
      expect(issues[0]?.message).toContain('31 min');
    });

    it('does not alert at exactly 30 min or less', () => {
      expect(evaluateSource(summary({ lastSuccessAt: minutesAgo(30) }), NOW)).toEqual([]);
      expect(evaluateSource(summary({ lastSuccessAt: minutesAgo(29) }), NOW)).toEqual([]);
    });

    it('alerts when a source has runs but never succeeded', () => {
      const issues = evaluateSource(
        summary({ lastSuccessAt: null, recentOkListingCounts: [] }),
        NOW,
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]?.kind).toBe('stale');
    });
  });

  describe('zero-listing streak', () => {
    it('alerts after 5 consecutive zero-listing successful runs', () => {
      const issues = evaluateSource(summary({ recentOkListingCounts: [0, 0, 0, 0, 0, 30] }), NOW);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ kind: 'zero-streak' });
    });

    it('does not alert after only 4 zeros', () => {
      expect(evaluateSource(summary({ recentOkListingCounts: [0, 0, 0, 0] }), NOW)).toEqual([]);
    });

    it('does not alert when a non-zero run interrupts the streak', () => {
      expect(
        evaluateSource(summary({ recentOkListingCounts: [0, 0, 30, 0, 0, 0] }), NOW),
      ).toEqual([]);
    });

    it('reports stale and zero-streak together', () => {
      const issues = evaluateSource(
        summary({ lastSuccessAt: minutesAgo(45), recentOkListingCounts: [0, 0, 0, 0, 0] }),
        NOW,
      );
      expect(issues.map((i) => i.kind).sort()).toEqual(['stale', 'zero-streak']);
    });
  });
});
