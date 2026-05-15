import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { LiveAgentSnapshot } from '@/server/live-agent-state';

import { LiveAgentRail } from './live-agent-rail';

describe('LiveAgentRail', () => {
  it('renders running and idle agent cards from a live snapshot', () => {
    const html = renderToStaticMarkup(
      createElement(LiveAgentRail, {
        initialSnapshot: createSnapshot(),
      }),
    );

    expect(html).toContain('Live agents');
    expect(html).toContain('1 active');
    expect(html).toContain('refresh 5s');
    expect(html).toContain('Developer');
    expect(html).toContain('T-012 Live agent state right rail');
    expect(html).toContain('Last output');
    expect(html).toContain('Reading apps/web route surface.');
    expect(html).toContain('Reviewer');
    expect(html).toContain('No active task');
    expect(html).toContain('Pause');
    expect(html).toContain('Kill');
    expect(html).toContain('View log');
    expect(html).toContain('value="task-kill"');
    expect(html).toContain('/api/admin/orchestrator/live-agents/log?taskId=T-012');
  });
});

function createSnapshot(): LiveAgentSnapshot {
  return {
    activeCount: 1,
    agents: [
      {
        actions: {
          fullLogEnabled: true,
          killEnabled: true,
          pauseEnabled: false,
        },
        costLabel: 'meter pending',
        elapsedLabel: '14m 23s elapsed',
        fullLogHref: '/api/admin/orchestrator/live-agents/log?taskId=T-012',
        lastOutput: 'Reading apps/web route surface.',
        logPath: '/worktrees/T-012/.orchestrator-live.log',
        model: 'gpt-5.5',
        role: 'developer',
        roleLabel: 'Developer',
        runner: 'codex',
        status: 'running',
        taskId: 'T-012',
        taskTitle: 'Live agent state right rail',
        updatedAt: '2026-05-14T10:14:23.000Z',
      },
      {
        actions: {
          fullLogEnabled: false,
          killEnabled: false,
          pauseEnabled: false,
        },
        costLabel: 'no active spend',
        elapsedLabel: 'last seen 23m ago',
        fullLogHref: null,
        lastOutput: 'Idle. Last task T-001: Audit existing code.',
        logPath: null,
        model: 'opus',
        role: 'reviewer',
        roleLabel: 'Reviewer',
        runner: 'claude',
        status: 'idle',
        taskId: null,
        taskTitle: null,
        updatedAt: '2026-05-14T10:37:00.000Z',
      },
    ],
    pollIntervalMs: 5_000,
    refreshedAt: '2026-05-14T10:14:23.000Z',
    totalRoles: 6,
  };
}
