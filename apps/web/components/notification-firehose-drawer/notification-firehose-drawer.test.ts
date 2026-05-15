import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { NotificationFirehoseEvent } from './notification-firehose.types';
import {
  filterFirehoseEvents,
  formatFirehoseTimeLabel,
  getFirehoseFilterOptions,
  NotificationFirehoseDrawer,
  type NotificationFirehoseDrawerProps,
} from './notification-firehose-drawer';

const now = '2026-05-14T12:00:00.000Z';

describe('NotificationFirehoseDrawer', () => {
  it('renders collapsed by default with a latest-event ticker', () => {
    const html = renderDrawer({
      events: [
        createEvent({
          id: 'event-agent-started',
          summary: 'Developer started T-016',
        }),
      ],
    });

    expect(html).toContain('aria-label="Notification firehose"');
    expect(html).toContain('data-expanded="false"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Developer started T-016');
    expect(html).toContain('1 visible');
  });

  it('renders expanded filter controls and the full event feed', () => {
    const html = renderDrawer({
      defaultExpanded: true,
      events: [
        createEvent({
          agentLabel: 'Developer',
          agentRole: 'developer',
          detail: 'gpt-5.5',
          id: 'event-agent-started',
          summary: 'Developer started T-016',
          taskId: 'T-016',
        }),
      ],
    });

    expect(html).toContain('data-expanded="true"');
    expect(html).toContain('All types');
    expect(html).toContain('All agents');
    expect(html).toContain('Developer');
    expect(html).toContain('24h');
    expect(html).toContain('T-016');
    expect(html).toContain('gpt-5.5');
  });

  it('filters events by type, agent, and time range', () => {
    const events = [
      createEvent({
        agentRole: 'developer',
        id: 'recent-agent',
        occurredAt: '2026-05-14T11:45:00.000Z',
        type: 'agent.started',
      }),
      createEvent({
        agentRole: 'tester',
        id: 'recent-error',
        occurredAt: '2026-05-14T11:50:00.000Z',
        type: 'error',
      }),
      createEvent({
        agentRole: 'developer',
        id: 'old-agent',
        occurredAt: '2026-05-14T09:00:00.000Z',
        type: 'agent.started',
      }),
    ];

    const filtered = filterFirehoseEvents(
      events,
      {
        agentRole: 'developer',
        eventType: 'agent.started',
        timeRange: '1h',
      },
      now,
    );

    expect(filtered.map((event) => event.id)).toEqual(['recent-agent']);
  });

  it('derives filter options from the event set in stable order', () => {
    const options = getFirehoseFilterOptions([
      createEvent({ agentRole: 'tester', type: 'error' }),
      createEvent({ agentRole: 'developer', type: 'agent.started' }),
      createEvent({ agentRole: 'developer', type: 'tick.end' }),
    ]);

    expect(options.agentRoles).toEqual(['developer', 'tester']);
    expect(options.eventTypes).toEqual(['tick.end', 'agent.started', 'error']);
  });

  it('formats relative event time labels without relying on the current clock', () => {
    expect(formatFirehoseTimeLabel('2026-05-14T11:59:30.000Z', now)).toBe('now');
    expect(formatFirehoseTimeLabel('2026-05-14T11:30:00.000Z', now)).toBe('30m ago');
    expect(formatFirehoseTimeLabel('2026-05-14T09:15:00.000Z', now)).toBe('2h 45m ago');
    expect(formatFirehoseTimeLabel('2026-05-10T12:00:00.000Z', now)).toBe('4d ago');
  });
});

function renderDrawer(props: Partial<NotificationFirehoseDrawerProps> = {}): string {
  const Drawer = NotificationFirehoseDrawer as FunctionComponent<NotificationFirehoseDrawerProps>;

  return renderToStaticMarkup(
    createElement(Drawer, {
      events: [],
      now,
      ...props,
    }),
  );
}

function createEvent(
  overrides: Partial<NotificationFirehoseEvent> = {},
): NotificationFirehoseEvent {
  return {
    agentLabel: null,
    agentRole: null,
    detail: null,
    id: 'event-1',
    occurredAt: '2026-05-14T11:55:00.000Z',
    payloadEntries: [],
    summary: 'Orchestrator tick started',
    taskId: null,
    tone: 'neutral',
    type: 'tick.start',
    typeLabel: 'Tick started',
    ...overrides,
  };
}
