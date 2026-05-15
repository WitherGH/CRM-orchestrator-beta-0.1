import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { OrchestratorEvent } from '@crm-orchestrator/db/schema';

import {
  createNotificationFirehoseEvent,
  createNotificationFirehoseEvents,
} from './notification-firehose';

describe('notification firehose view model', () => {
  it('formats agent lifecycle events with task and agent metadata', () => {
    const event = createNotificationFirehoseEvent(
      createOrchestratorEvent({
        payload: {
          agentRole: 'developer',
          model: 'gpt-5.5',
        },
        taskId: 'T-016',
        type: 'agent.started',
      }),
    );

    expect(event).toMatchObject({
      agentLabel: 'Developer',
      agentRole: 'developer',
      detail: 'gpt-5.5',
      summary: 'Developer started T-016',
      taskId: 'T-016',
      tone: 'neutral',
      typeLabel: 'Agent started',
    });
  });

  it('marks killed or failed agent finishes as critical events', () => {
    const event = createNotificationFirehoseEvent(
      createOrchestratorEvent({
        payload: {
          agent_role: 'tester',
          status: 'killed',
        },
        taskId: 'T-099',
        type: 'agent.finished',
      }),
    );

    expect(event.summary).toBe('Tester was killed on T-099');
    expect(event.detail).toBe('killed');
    expect(event.tone).toBe('critical');
  });

  it('summarizes PR and cost cap events without exposing noisy payload keys twice', () => {
    const event = createNotificationFirehoseEvent(
      createOrchestratorEvent({
        payload: {
          capUsd: 50,
          extra: 'launches paused',
          todayUsd: 51.25,
        },
        taskId: null,
        type: 'cost.cap.hit',
      }),
    );

    expect(event.summary).toBe('Cost cap hit');
    expect(event.detail).toBe('$51.25 of $50.00');
    expect(event.tone).toBe('critical');
    expect(event.payloadEntries).toEqual([
      {
        key: 'extra',
        value: 'launches paused',
      },
    ]);
  });

  it('sorts mapped events newest first', () => {
    const older = createOrchestratorEvent({
      id: '00000000-0000-4000-8000-000000000001',
      ts: new Date('2026-05-14T10:00:00.000Z'),
    });
    const newer = createOrchestratorEvent({
      id: '00000000-0000-4000-8000-000000000002',
      ts: new Date('2026-05-14T12:00:00.000Z'),
    });

    const events = createNotificationFirehoseEvents([older, newer]);

    expect(events.map((event) => event.id)).toEqual([newer.id, older.id]);
  });
});

function createOrchestratorEvent(
  overrides: Partial<OrchestratorEvent> = {},
): OrchestratorEvent {
  return {
    agentRunId: null,
    id: randomUUID(),
    payload: {},
    taskId: 'T-001',
    ts: new Date('2026-05-14T12:00:00.000Z'),
    type: 'tick.start',
    ...overrides,
  };
}
