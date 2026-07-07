import { describe, expect, it } from 'vitest';

import { estimateRoleCostsUsd, summarizeCostJournal } from './cost-journal';

describe('summarizeCostJournal', () => {
  const now = new Date('2026-07-06T15:00:00');

  it('sums only entries from the current local day', () => {
    const content = [
      entry({ taskId: 'T-001', ts: '2026-07-06T09:00:00', usd: 0.5 }),
      entry({ taskId: 'T-002', ts: '2026-07-06T12:30:00', usd: 1.25 }),
      entry({ taskId: 'T-003', ts: '2026-07-05T23:59:00', usd: 4 }),
    ].join('\n');

    const summary = summarizeCostJournal(content, now);

    expect(summary.todayUsd).toBeCloseTo(1.75);
    expect(summary.todayEntryCount).toBe(2);
    expect(summary.taskCostsUsd).toEqual({ 'T-001': 0.5, 'T-002': 1.25 });
  });

  it('accumulates repeated launches of the same task', () => {
    const content = [
      entry({ taskId: 'T-001', ts: '2026-07-06T09:00:00', usd: 0.3 }),
      entry({ taskId: 'T-001', ts: '2026-07-06T11:00:00', usd: 0.12 }),
    ].join('\n');

    const summary = summarizeCostJournal(content, now);

    expect(summary.taskCostsUsd['T-001']).toBeCloseTo(0.42);
  });

  it('skips malformed lines, negative amounts, and bad timestamps', () => {
    const content = [
      'not json at all',
      '{"ts":"2026-07-06T09:00:00"}',
      entry({ taskId: 'T-001', ts: 'invalid-date', usd: 1 }),
      entry({ taskId: 'T-002', ts: '2026-07-06T10:00:00', usd: -5 }),
      entry({ taskId: 'T-003', ts: '2026-07-06T10:00:00', usd: 0.1 }),
      '',
    ].join('\n');

    const summary = summarizeCostJournal(content, now);

    expect(summary.todayUsd).toBeCloseTo(0.1);
    expect(summary.todayEntryCount).toBe(1);
  });

  it('returns an empty summary for an empty journal', () => {
    expect(summarizeCostJournal('', now)).toEqual({
      taskCostsUsd: {},
      todayEntryCount: 0,
      todayUsd: 0,
    });
  });
});

describe('estimateRoleCostsUsd', () => {
  it('averages exact runs per role and skips heuristic entries', () => {
    const content = [
      JSON.stringify({ estimated: false, model: 'gpt-5.5', role: 'developer', usd: 0.4 }),
      JSON.stringify({ estimated: false, model: 'gpt-5.5', role: 'developer', usd: 0.6 }),
      JSON.stringify({ estimated: true, model: 'gpt-5.5', role: 'developer', usd: 9 }),
      JSON.stringify({ estimated: false, model: 'opus', role: 'reviewer', usd: 3 }),
      'garbage line',
    ].join('\n');

    const estimates = estimateRoleCostsUsd(content);

    expect(estimates.developer).toBeCloseTo(0.5);
    expect(estimates.reviewer).toBeCloseTo(3);
  });

  it('returns an empty record for an empty journal', () => {
    expect(estimateRoleCostsUsd('')).toEqual({});
  });
});

function entry({ taskId, ts, usd }: { taskId: string; ts: string; usd: number }): string {
  return JSON.stringify({
    estimated: false,
    model: 'sonnet',
    role: 'developer',
    taskId,
    tokensIn: 1_000,
    tokensOut: 500,
    ts,
    usd,
  });
}
