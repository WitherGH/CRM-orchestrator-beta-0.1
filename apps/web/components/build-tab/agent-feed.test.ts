import { describe, expect, it } from 'vitest';

import type {
  LiveAgentCardState,
  LiveAgentSnapshot,
} from '../../server/live-agent-state';

import { buildAgentFeed, formatUsd } from './agent-feed';

describe('buildAgentFeed', () => {
  it('writes human sentences for running, stale, and idle agents', () => {
    const feed = buildAgentFeed(createSnapshot([
      createAgent({
        role: 'developer',
        roleLabel: 'Developer',
        status: 'running',
        taskId: 'T-031',
        taskTitle: 'Request form',
      }),
      createAgent({
        role: 'reviewer',
        roleLabel: 'Reviewer',
        status: 'stale',
        taskId: 'T-018',
        taskTitle: 'Auth middleware',
      }),
      createAgent({ role: 'pm', roleLabel: 'PM', status: 'idle' }),
    ]));

    expect(feed.map((item) => item.sentence)).toEqual([
      'Developer is working on “Request form” (T-031)',
      'Reviewer has gone quiet on “Auth middleware” (T-018)',
      'PM is idle',
    ]);
    expect(feed.map((item) => item.tone)).toEqual(['active', 'attention', 'idle']);
  });

  it('attaches today task cost when the journal has it', () => {
    const feed = buildAgentFeed(
      createSnapshot([
        createAgent({
          role: 'developer',
          roleLabel: 'Developer',
          status: 'running',
          taskId: 'T-031',
          taskTitle: 'Request form',
        }),
      ]),
      { taskCostsUsd: { 'T-031': 0.42 } },
    );

    expect(feed[0]?.costLabel).toBe('$0.42');
  });

  it('sorts working agents ahead of quiet and idle ones', () => {
    const feed = buildAgentFeed(createSnapshot([
      createAgent({ role: 'pm', roleLabel: 'PM', status: 'idle' }),
      createAgent({ role: 'tester', roleLabel: 'Tester', status: 'running', taskId: 'T-040' }),
      createAgent({ role: 'reviewer', roleLabel: 'Reviewer', status: 'stale', taskId: 'T-018' }),
    ]));

    expect(feed.map((item) => item.roleLabel)).toEqual(['Tester', 'Reviewer', 'PM']);
  });
});

describe('formatUsd', () => {
  it('formats dollars with two decimals', () => {
    expect(formatUsd(0.42)).toBe('$0.42');
    expect(formatUsd(10)).toBe('$10.00');
  });
});

function createSnapshot(agents: LiveAgentCardState[]): LiveAgentSnapshot {
  return {
    activeCount: agents.filter((agent) => agent.status === 'running').length,
    agents,
    pollIntervalMs: 5_000,
    refreshedAt: '2026-07-06T10:00:00.000Z',
    totalRoles: agents.length,
  };
}

function createAgent(
  overrides: Partial<LiveAgentCardState> & Pick<LiveAgentCardState, 'role' | 'roleLabel' | 'status'>,
): LiveAgentCardState {
  return {
    actions: {
      fullLogEnabled: false,
      killEnabled: false,
      pauseEnabled: false,
    },
    costLabel: '—',
    elapsedLabel: '—',
    fullLogHref: null,
    lastOutput: '',
    logPath: null,
    model: 'sonnet',
    runner: 'claude',
    taskId: null,
    taskTitle: null,
    updatedAt: '2026-07-06T10:00:00.000Z',
    ...overrides,
  };
}
