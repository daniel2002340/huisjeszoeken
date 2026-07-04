import { describe, expect, it } from 'vitest';
import { computeStartupPlan } from './scheduler.js';

const NOW = new Date('2026-07-02T12:00:00Z');
const minutesAgo = (min: number): Date => new Date(NOW.getTime() - min * 60_000);

const run = (min: number, ok: boolean, error: string | null = null) => ({
  startedAt: minutesAgo(min),
  ok,
  error,
});

const blocked = (min: number, status = 403) =>
  run(min, false, `HTTP ${status} for https://example.com/x`);

describe('computeStartupPlan', () => {
  it('waits one full jittered interval when there is no history', () => {
    for (let i = 0; i < 20; i++) {
      const plan = computeStartupPlan([], 120, NOW);
      expect(plan.blockedStreak).toBe(0);
      expect(plan.delayMs).toBeGreaterThanOrEqual(120_000 * 0.8);
      expect(plan.delayMs).toBeLessThanOrEqual(120_000 * 1.2);
    }
  });

  it('waits one full interval after a clean run — never an instant poll', () => {
    const plan = computeStartupPlan([run(1, true)], 120, NOW);
    expect(plan.blockedStreak).toBe(0);
    expect(plan.delayMs).toBeGreaterThanOrEqual(96_000);
  });

  it('resumes the first backoff rung after one blocked run', () => {
    // Blocked 2 min ago; rung 1 is 5 min -> 3 min remaining.
    const plan = computeStartupPlan([blocked(2), run(4, true)], 120, NOW);
    expect(plan.blockedStreak).toBe(1);
    expect(plan.delayMs).toBe(3 * 60_000);
  });

  it('escalates the rung with the streak length (429 counts too)', () => {
    // Streak of 2 -> rung 30 min; last run 10 min ago -> 20 min remaining.
    const plan = computeStartupPlan([blocked(10, 429), blocked(15), run(20, true)], 120, NOW);
    expect(plan.blockedStreak).toBe(2);
    expect(plan.delayMs).toBe(20 * 60_000);
  });

  it('caps the streak at the top rung (2h)', () => {
    const runs = [blocked(5), blocked(35), blocked(65), blocked(95), blocked(125)];
    const plan = computeStartupPlan(runs, 120, NOW);
    expect(plan.blockedStreak).toBe(5);
    expect(plan.delayMs).toBe(2 * 60 * 60_000 - 5 * 60_000);
  });

  it('eases back in after 60s when the backoff already elapsed', () => {
    const plan = computeStartupPlan([blocked(90)], 120, NOW); // rung 5 min, long past
    expect(plan.blockedStreak).toBe(1);
    expect(plan.delayMs).toBe(60_000);
  });

  it('a non-blocked failure (parse error) does not trigger backoff resume', () => {
    const plan = computeStartupPlan([run(2, false, 'fetch failed: ECONNRESET')], 120, NOW);
    expect(plan.blockedStreak).toBe(0);
  });

  it('only counts the trailing streak, not older blocks', () => {
    const plan = computeStartupPlan([run(1, true), blocked(3), blocked(5)], 120, NOW);
    expect(plan.blockedStreak).toBe(0);
  });
});
