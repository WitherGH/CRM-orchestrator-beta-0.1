import { afterEach, describe, expect, it } from 'vitest';

import {
  depSatisfiedStatuses,
  depsOk,
  estimateCost,
  estimateLaunchCostUsd,
} from './tick';

describe('estimateCost', () => {
  it('parses the Claude stream-json result event exactly, including cache tokens', () => {
    const output = [
      '{"type":"system","subtype":"init","model":"opus"}',
      '{"type":"assistant","message":{"usage":{"input_tokens":50,"output_tokens":10}}}',
      JSON.stringify({
        type: 'result',
        total_cost_usd: 1.2345,
        usage: {
          input_tokens: 1_000,
          cache_read_input_tokens: 20_000,
          cache_creation_input_tokens: 5_000,
          output_tokens: 2_500,
        },
      }),
    ].join('\n');

    expect(estimateCost(output)).toEqual({
      tokensIn: 26_000,
      tokensOut: 2_500,
      usd: 1.2345,
      estimated: false,
    });
  });

  it('parses the Codex summary line exactly', () => {
    const output = 'work done\nTokens used: 1200 input, 300 output. Cost: $0.42';

    expect(estimateCost(output)).toEqual({
      tokensIn: 1_200,
      tokensOut: 300,
      usd: 0.42,
      estimated: false,
    });
  });

  it('falls back to the marked heuristic only when no exact data exists', () => {
    const cost = estimateCost('plain text output with no usage data at all');

    expect(cost.estimated).toBe(true);
    expect(cost.usd).toBeGreaterThan(0);
  });
});

describe('depsOk', () => {
  const task = (id: string, status: string, dependsOn: string[] = []) => ({
    id,
    status,
    depends_on: dependsOn,
  });

  afterEach(() => {
    delete process.env.ORCHESTRATOR_DEP_SATISFIED_STATUSES;
  });

  it('accepts merge-ready dependencies by default (F0.4)', () => {
    const all = [task('T-001', 'merge-ready'), task('T-002', 'done')];

    expect(depsOk(task('T-003', 'backlog', ['T-001', 'T-002']) as never, all as never)).toBe(true);
  });

  it('still rejects dependencies that are only in review', () => {
    const all = [task('T-001', 'review')];

    expect(depsOk(task('T-002', 'backlog', ['T-001']) as never, all as never)).toBe(false);
  });

  it('honours ORCHESTRATOR_DEP_SATISFIED_STATUSES override', () => {
    process.env.ORCHESTRATOR_DEP_SATISFIED_STATUSES = 'done';

    expect(depSatisfiedStatuses()).toEqual(new Set(['done']));
    const all = [task('T-001', 'merge-ready')];
    expect(depsOk(task('T-002', 'backlog', ['T-001']) as never, all as never)).toBe(false);
  });
});

describe('estimateLaunchCostUsd', () => {
  const entry = (role: string, model: string, usd: number, estimated = false) => ({
    role: role as never,
    model,
    usd,
    estimated,
  });

  it('averages recent exact runs for the same role and model', () => {
    const entries = [
      entry('developer', 'gpt-5.5', 0.4),
      entry('developer', 'gpt-5.5', 0.6),
      entry('reviewer', 'opus', 3),
    ];

    expect(estimateLaunchCostUsd('developer', 'gpt-5.5', entries)).toBeCloseTo(0.5);
  });

  it('falls back to same-role entries when the model has no history', () => {
    const entries = [entry('developer', 'gpt-5.4', 0.8)];

    expect(estimateLaunchCostUsd('developer', 'gpt-5.5', entries)).toBeCloseTo(0.8);
  });

  it('ignores heuristic (estimated) entries', () => {
    const entries = [
      entry('developer', 'gpt-5.5', 0.02, true),
      entry('developer', 'gpt-5.5', 1.0),
    ];

    expect(estimateLaunchCostUsd('developer', 'gpt-5.5', entries)).toBeCloseTo(1.0);
  });

  it('uses the flat default with an empty journal', () => {
    expect(estimateLaunchCostUsd('developer', 'gpt-5.5', [])).toBe(1);
  });
});
