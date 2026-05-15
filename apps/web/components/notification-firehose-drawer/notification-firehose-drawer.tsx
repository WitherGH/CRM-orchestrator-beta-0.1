'use client';

import { useMemo, useState } from 'react';

import {
  notificationFirehoseEventTypes,
  type NotificationFirehoseEvent,
  type NotificationFirehoseEventType,
} from './notification-firehose.types';

type FirehoseTimeRange = '1h' | '24h' | '7d' | 'all';
type FirehoseEventTypeFilter = NotificationFirehoseEventType | 'all';
type FirehoseAgentFilter = string | 'all';

export interface NotificationFirehoseFilters {
  agentRole: FirehoseAgentFilter;
  eventType: FirehoseEventTypeFilter;
  timeRange: FirehoseTimeRange;
}

export interface NotificationFirehoseDrawerProps {
  defaultExpanded?: boolean;
  events: readonly NotificationFirehoseEvent[];
  now: string;
}

interface TimeRangeOption {
  label: string;
  ms: number | null;
  value: FirehoseTimeRange;
}

interface FilterOptions {
  agentRoles: string[];
  eventTypes: NotificationFirehoseEventType[];
}

const defaultFilters: NotificationFirehoseFilters = {
  agentRole: 'all',
  eventType: 'all',
  timeRange: '24h',
};

const timeRangeOptions: readonly TimeRangeOption[] = [
  { label: '1h', ms: 60 * 60 * 1_000, value: '1h' },
  { label: '24h', ms: 24 * 60 * 60 * 1_000, value: '24h' },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1_000, value: '7d' },
  { label: 'All', ms: null, value: 'all' },
];

export function NotificationFirehoseDrawer({
  defaultExpanded = false,
  events,
  now,
}: NotificationFirehoseDrawerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [filters, setFilters] = useState<NotificationFirehoseFilters>(defaultFilters);

  const filterOptions = useMemo(() => getFirehoseFilterOptions(events), [events]);
  const filteredEvents = useMemo(
    () => filterFirehoseEvents(events, filters, now),
    [events, filters, now],
  );
  const tickerEvents = filteredEvents.slice(0, 3);
  const visibleLabel = `${filteredEvents.length} visible`;
  const firehosePanelId = 'orchestrator-firehose-panel';

  return (
    <section
      aria-label="Notification firehose"
      className="orchestrator-firehose"
      data-expanded={expanded ? 'true' : 'false'}
    >
      <div className="orchestrator-firehose-bar">
        <button
          aria-controls={firehosePanelId}
          aria-expanded={expanded}
          className="orchestrator-firehose-toggle"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          <span className="orchestrator-panel-title">Notification firehose</span>
          <span className="orchestrator-card-meta">
            {expanded ? 'Collapse' : 'Expand'}
          </span>
        </button>

        <ul className="orchestrator-event-list" aria-label="Latest orchestrator events">
          {tickerEvents.length > 0 ? (
            tickerEvents.map((event) => (
              <li className="orchestrator-event-item" data-tone={event.tone} key={event.id}>
                <span className="orchestrator-event-time">
                  {formatFirehoseTimeLabel(event.occurredAt, now)}
                </span>
                <span>{event.summary}</span>
              </li>
            ))
          ) : (
            <li className="orchestrator-event-item">No events recorded.</li>
          )}
        </ul>

        <span className="orchestrator-card-meta">{visibleLabel}</span>
      </div>

      {expanded ? (
        <div className="orchestrator-firehose-panel" id={firehosePanelId}>
          <div className="orchestrator-firehose-filters" aria-label="Firehose filters">
            <label className="orchestrator-filter-control">
              <span className="orchestrator-label">Type</span>
              <select
                className="orchestrator-model-select"
                onChange={(event) => {
                  const eventType = normalizeEventTypeFilter(event.currentTarget.value);
                  setFilters((current) => ({ ...current, eventType }));
                }}
                value={filters.eventType}
              >
                <option value="all">All types</option>
                {filterOptions.eventTypes.map((eventType) => (
                  <option key={eventType} value={eventType}>
                    {formatEventTypeLabel(eventType)}
                  </option>
                ))}
              </select>
            </label>

            <label className="orchestrator-filter-control">
              <span className="orchestrator-label">Agent</span>
              <select
                className="orchestrator-model-select"
                onChange={(event) => {
                  setFilters((current) => ({
                    ...current,
                    agentRole: event.currentTarget.value,
                  }));
                }}
                value={filters.agentRole}
              >
                <option value="all">All agents</option>
                {filterOptions.agentRoles.map((agentRole) => (
                  <option key={agentRole} value={agentRole}>
                    {formatAgentRoleLabel(agentRole)}
                  </option>
                ))}
              </select>
            </label>

            <div className="orchestrator-filter-control">
              <span className="orchestrator-label">Range</span>
              <div className="orchestrator-firehose-range" role="group">
                {timeRangeOptions.map((option) => (
                  <button
                    aria-pressed={filters.timeRange === option.value}
                    className="orchestrator-filter-button"
                    key={option.value}
                    onClick={() => {
                      setFilters((current) => ({ ...current, timeRange: option.value }));
                    }}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <ul className="orchestrator-firehose-feed" aria-live="polite">
            {filteredEvents.length > 0 ? (
              filteredEvents.map((event) => (
                <FirehoseEventRow event={event} key={event.id} now={now} />
              ))
            ) : (
              <li className="orchestrator-firehose-empty">
                No events match the current filters.
              </li>
            )}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function filterFirehoseEvents(
  events: readonly NotificationFirehoseEvent[],
  filters: NotificationFirehoseFilters,
  now: string,
): NotificationFirehoseEvent[] {
  const nowDate = parseTimestamp(now) ?? new Date(0);
  const timeRange = timeRangeOptions.find((option) => option.value === filters.timeRange);
  const cutoff = timeRange?.ms === null || timeRange === undefined
    ? null
    : nowDate.getTime() - timeRange.ms;

  return events.filter((event) => {
    if (filters.eventType !== 'all' && event.type !== filters.eventType) {
      return false;
    }

    if (filters.agentRole !== 'all' && event.agentRole !== filters.agentRole) {
      return false;
    }

    if (cutoff === null) {
      return true;
    }

    const occurredAt = parseTimestamp(event.occurredAt);
    return occurredAt !== null && occurredAt.getTime() >= cutoff;
  });
}

export function getFirehoseFilterOptions(
  events: readonly NotificationFirehoseEvent[],
): FilterOptions {
  const presentEventTypes = new Set(events.map((event) => event.type));
  const agentRoles = new Set<string>();

  for (const event of events) {
    if (event.agentRole !== null) {
      agentRoles.add(event.agentRole);
    }
  }

  return {
    agentRoles: [...agentRoles].sort((a, b) => a.localeCompare(b)),
    eventTypes: notificationFirehoseEventTypes.filter((eventType) => (
      presentEventTypes.has(eventType)
    )),
  };
}

export function formatFirehoseTimeLabel(occurredAt: string, now: string): string {
  const occurredAtDate = parseTimestamp(occurredAt);
  const nowDate = parseTimestamp(now);

  if (occurredAtDate === null || nowDate === null) {
    return 'unknown';
  }

  const elapsedMs = Math.max(0, nowDate.getTime() - occurredAtDate.getTime());
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (elapsedMs < minuteMs) {
    return 'now';
  }

  if (elapsedMs < hourMs) {
    return `${Math.floor(elapsedMs / minuteMs)}m ago`;
  }

  if (elapsedMs < dayMs) {
    const hours = Math.floor(elapsedMs / hourMs);
    const minutes = Math.floor((elapsedMs % hourMs) / minuteMs);
    return minutes === 0 ? `${hours}h ago` : `${hours}h ${minutes}m ago`;
  }

  if (elapsedMs < 7 * dayMs) {
    return `${Math.floor(elapsedMs / dayMs)}d ago`;
  }

  return occurredAtDate.toISOString().slice(0, 10);
}

export function formatEventTypeLabel(eventType: NotificationFirehoseEventType): string {
  const labels: Record<NotificationFirehoseEventType, string> = {
    'agent.finished': 'Agent finished',
    'agent.started': 'Agent started',
    'cost.cap.hit': 'Cost cap hit',
    'cost.cap.warning': 'Cost warning',
    error: 'Error',
    'pr.merged': 'PR merged',
    'pr.opened': 'PR opened',
    'task.moved': 'Task moved',
    'tick.end': 'Tick ended',
    'tick.start': 'Tick started',
  };

  return labels[eventType];
}

function FirehoseEventRow({
  event,
  now,
}: {
  event: NotificationFirehoseEvent;
  now: string;
}) {
  return (
    <li className="orchestrator-firehose-event" data-tone={event.tone}>
      <div className="orchestrator-firehose-event-head">
        <span
          aria-hidden="true"
          className="orchestrator-status-dot"
          data-tone={event.tone}
        />
        <div className="orchestrator-firehose-event-copy">
          <p className="orchestrator-firehose-summary">{event.summary}</p>
          <p className="orchestrator-firehose-meta">
            {event.typeLabel}, {formatFirehoseTimeLabel(event.occurredAt, now)}
          </p>
        </div>
      </div>

      <div className="orchestrator-chip-row" aria-label={`${event.summary} metadata`}>
        {event.taskId === null ? null : (
          <span className="orchestrator-chip">{event.taskId}</span>
        )}
        {event.agentLabel === null ? null : (
          <span className="orchestrator-chip">{event.agentLabel}</span>
        )}
        {event.detail === null ? null : (
          <span className="orchestrator-chip">{event.detail}</span>
        )}
        {event.payloadEntries.map((entry) => (
          <span className="orchestrator-chip" key={`${event.id}-${entry.key}`}>
            {entry.key}: {entry.value}
          </span>
        ))}
      </div>
    </li>
  );
}

function normalizeEventTypeFilter(value: string): FirehoseEventTypeFilter {
  if (value === 'all') {
    return value;
  }

  return notificationFirehoseEventTypes.find((eventType) => eventType === value) ?? 'all';
}

function formatAgentRoleLabel(agentRole: string): string {
  if (agentRole === 'pm') {
    return 'PM';
  }

  return `${agentRole.slice(0, 1).toUpperCase()}${agentRole.slice(1)}`;
}

function parseTimestamp(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
