export const notificationFirehoseEventTypes = [
  'tick.start',
  'tick.end',
  'task.moved',
  'agent.started',
  'agent.finished',
  'pr.opened',
  'pr.merged',
  'cost.cap.warning',
  'cost.cap.hit',
  'error',
] as const;

export type NotificationFirehoseEventType = (typeof notificationFirehoseEventTypes)[number];

export type NotificationFirehoseTone = 'alert' | 'critical' | 'neutral' | 'positive';

export interface NotificationFirehosePayloadEntry {
  key: string;
  value: string;
}

export interface NotificationFirehoseEvent {
  agentLabel: string | null;
  agentRole: string | null;
  detail: string | null;
  id: string;
  occurredAt: string;
  payloadEntries: readonly NotificationFirehosePayloadEntry[];
  summary: string;
  taskId: string | null;
  tone: NotificationFirehoseTone;
  type: NotificationFirehoseEventType;
  typeLabel: string;
}
