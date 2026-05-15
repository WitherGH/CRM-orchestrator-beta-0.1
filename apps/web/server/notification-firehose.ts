import type {
  OrchestratorEvent,
  OrchestratorEventType,
} from '@crm-orchestrator/db/schema';

import type {
  NotificationFirehoseEvent,
  NotificationFirehosePayloadEntry,
  NotificationFirehoseTone,
} from '../components/notification-firehose-drawer/notification-firehose.types';

const agentLabels: Record<string, string> = {
  architect: 'Architect',
  designer: 'Designer',
  developer: 'Developer',
  pm: 'PM',
  reviewer: 'Reviewer',
  tester: 'Tester',
};

const payloadEntryLimit = 4;
const payloadValueLimit = 48;

export function createNotificationFirehoseEvents(
  events: readonly OrchestratorEvent[],
): NotificationFirehoseEvent[] {
  return [...events]
    .sort((a, b) => b.ts.getTime() - a.ts.getTime() || a.id.localeCompare(b.id))
    .map(createNotificationFirehoseEvent);
}

export function createNotificationFirehoseEvent(
  event: OrchestratorEvent,
): NotificationFirehoseEvent {
  const agentRole = readPayloadString(event.payload, [
    'agentRole',
    'agent_role',
    'agent',
    'assignee',
    'role',
  ]);
  const agentLabel = agentRole === null ? null : formatAgentLabel(agentRole);
  const detail = createEventDetail(event);
  const summary = createEventSummary(event, agentLabel);

  return {
    agentLabel,
    agentRole,
    detail,
    id: event.id,
    occurredAt: event.ts.toISOString(),
    payloadEntries: createPayloadEntries(event.payload),
    summary,
    taskId: event.taskId,
    tone: getEventTone(event),
    type: event.type,
    typeLabel: formatEventTypeLabel(event.type),
  };
}

function createEventSummary(event: OrchestratorEvent, agentLabel: string | null): string {
  const taskLabel = event.taskId ?? 'task';
  const prNumber = readPayloadNumber(event.payload, ['prNumber', 'pr_number', 'number']);
  const status = readPayloadString(event.payload, ['status', 'result', 'outcome']);
  const message = readPayloadString(event.payload, ['message', 'error', 'reason']);

  switch (event.type) {
    case 'tick.start':
      return 'Orchestrator tick started';
    case 'tick.end':
      return 'Orchestrator tick finished';
    case 'task.moved':
      return `${taskLabel} moved${formatTaskMoveSuffix(event.payload)}`;
    case 'agent.started':
      return `${agentLabel ?? 'Agent'} started ${taskLabel}`;
    case 'agent.finished':
      return `${agentLabel ?? 'Agent'} ${formatAgentFinishedVerb(status)} ${taskLabel}`;
    case 'pr.opened':
      return prNumber === null ? `${taskLabel} PR opened` : `PR #${prNumber} opened`;
    case 'pr.merged':
      return prNumber === null ? `${taskLabel} PR merged` : `PR #${prNumber} merged`;
    case 'cost.cap.warning':
      return 'Cost cap warning';
    case 'cost.cap.hit':
      return 'Cost cap hit';
    case 'error':
      return message === null ? 'Orchestrator error' : `Error: ${truncate(message, 88)}`;
  }
}

function createEventDetail(event: OrchestratorEvent): string | null {
  const model = readPayloadString(event.payload, ['model']);
  const branch = readPayloadString(event.payload, ['branch']);
  const status = readPayloadString(event.payload, ['status', 'result', 'outcome']);
  const costUsd = readPayloadNumber(event.payload, ['costUsd', 'cost_usd', 'todayUsd']);
  const capUsd = readPayloadNumber(event.payload, ['capUsd', 'cap_usd', 'dailyCapUsd']);

  if (event.type === 'agent.started' && model !== null) {
    return model;
  }

  if (event.type === 'agent.finished' && status !== null) {
    return status;
  }

  if ((event.type === 'pr.opened' || event.type === 'pr.merged') && branch !== null) {
    return branch;
  }

  if (event.type === 'cost.cap.warning' || event.type === 'cost.cap.hit') {
    if (costUsd !== null && capUsd !== null) {
      return `$${costUsd.toFixed(2)} of $${capUsd.toFixed(2)}`;
    }

    if (costUsd !== null) {
      return `$${costUsd.toFixed(2)} today`;
    }
  }

  return null;
}

function getEventTone(event: OrchestratorEvent): NotificationFirehoseTone {
  const status = readPayloadString(event.payload, ['status', 'result', 'outcome']);

  if (
    event.type === 'error'
    || event.type === 'cost.cap.hit'
    || (event.type === 'agent.finished' && isCriticalAgentStatus(status))
  ) {
    return 'critical';
  }

  if (event.type === 'cost.cap.warning') {
    return 'alert';
  }

  if (event.type === 'pr.merged' || event.type === 'tick.end') {
    return 'positive';
  }

  return 'neutral';
}

function isCriticalAgentStatus(status: string | null): boolean {
  return status === 'failed' || status === 'killed' || status === 'timeout';
}

function formatAgentFinishedVerb(status: string | null): string {
  if (status === 'killed') {
    return 'was killed on';
  }

  if (status === 'failed') {
    return 'failed';
  }

  if (status === 'timeout') {
    return 'timed out on';
  }

  return 'finished';
}

function formatTaskMoveSuffix(payload: Record<string, unknown>): string {
  const from = readPayloadString(payload, ['from', 'fromStatus', 'from_status']);
  const to = readPayloadString(payload, ['to', 'toStatus', 'to_status', 'status']);

  if (from !== null && to !== null) {
    return ` from ${from} to ${to}`;
  }

  if (to !== null) {
    return ` to ${to}`;
  }

  return '';
}

function createPayloadEntries(payload: Record<string, unknown>): NotificationFirehosePayloadEntry[] {
  return Object.entries(payload)
    .filter(([key]) => !isPrimaryPayloadKey(key))
    .slice(0, payloadEntryLimit)
    .map(([key, value]) => ({
      key,
      value: truncate(formatPayloadValue(value), payloadValueLimit),
    }));
}

function isPrimaryPayloadKey(key: string): boolean {
  return [
    'agent',
    'agent_role',
    'agentRole',
    'assignee',
    'branch',
    'capUsd',
    'cap_usd',
    'costUsd',
    'cost_usd',
    'dailyCapUsd',
    'error',
    'from',
    'from_status',
    'fromStatus',
    'message',
    'model',
    'number',
    'outcome',
    'pr_number',
    'prNumber',
    'reason',
    'result',
    'role',
    'status',
    'to',
    'to_status',
    'toStatus',
    'todayUsd',
  ].includes(key);
}

function readPayloadString(
  payload: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  return null;
}

function readPayloadNumber(
  payload: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function formatAgentLabel(agentRole: string): string {
  return agentLabels[agentRole] ?? `${agentRole.slice(0, 1).toUpperCase()}${agentRole.slice(1)}`;
}

function formatPayloadValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value) ?? String(value);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatEventTypeLabel(eventType: OrchestratorEventType): string {
  const labels: Record<OrchestratorEventType, string> = {
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
