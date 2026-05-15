import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const agentRoles = [
  'architect',
  'designer',
  'pm',
  'reviewer',
  'developer',
  'tester',
] as const;

export const agentRunStatuses = [
  'queued',
  'running',
  'success',
  'failed',
  'killed',
  'timeout',
] as const;

export const orchestratorEventTypes = [
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

export const agentRoleEnum = pgEnum('agent_role', agentRoles);
export const agentRunStatusEnum = pgEnum('agent_run_status', agentRunStatuses);
export const orchestratorEventTypeEnum = pgEnum(
  'orchestrator_event_type',
  orchestratorEventTypes,
);

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    taskId: text('task_id').notNull(),
    agentRole: agentRoleEnum('agent_role').notNull(),
    model: text('model').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    status: agentRunStatusEnum('status').notNull(),
    exitCode: integer('exit_code'),
    costUsd: numeric('cost_usd', { mode: 'number', precision: 10, scale: 4 })
      .default(0)
      .notNull(),
    tokensInput: integer('tokens_input').default(0).notNull(),
    tokensOutput: integer('tokens_output').default(0).notNull(),
    worktreePath: text('worktree_path'),
    branch: text('branch'),
    prNumber: integer('pr_number'),
    stdoutPath: text('stdout_path').notNull(),
    stderrPath: text('stderr_path').notNull(),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
  },
  (table) => [
    index('agent_runs_task_id_idx').on(table.taskId),
    index('agent_runs_status_started_at_idx').on(table.status, table.startedAt),
    index('agent_runs_role_started_at_idx').on(table.agentRole, table.startedAt),
    check('agent_runs_cost_usd_non_negative', sql`${table.costUsd} >= 0`),
    check('agent_runs_tokens_input_non_negative', sql`${table.tokensInput} >= 0`),
    check('agent_runs_tokens_output_non_negative', sql`${table.tokensOutput} >= 0`),
  ],
).enableRLS();

export const orchestratorEvents = pgTable(
  'orchestrator_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
    type: orchestratorEventTypeEnum('type').notNull(),
    taskId: text('task_id'),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, {
      onDelete: 'set null',
    }),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
  },
  (table) => [
    index('orchestrator_events_ts_idx').on(table.ts),
    index('orchestrator_events_type_ts_idx').on(table.type, table.ts),
    index('orchestrator_events_task_id_idx').on(table.taskId),
    index('orchestrator_events_agent_run_id_idx').on(table.agentRunId),
  ],
).enableRLS();

export const dailyCost = pgTable(
  'daily_cost',
  {
    date: date('date', { mode: 'date' }).notNull(),
    agentRole: text('agent_role', { enum: agentRoles }).notNull(),
    costUsd: numeric('cost_usd', { mode: 'number', precision: 10, scale: 4 })
      .default(0)
      .notNull(),
    tasksCompleted: integer('tasks_completed').default(0).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.date, table.agentRole],
      name: 'daily_cost_pkey',
    }),
    check('daily_cost_cost_usd_non_negative', sql`${table.costUsd} >= 0`),
    check('daily_cost_tasks_completed_non_negative', sql`${table.tasksCompleted} >= 0`),
  ],
).enableRLS();

export type AgentRole = (typeof agentRoles)[number];
export type AgentRunStatus = (typeof agentRunStatuses)[number];
export type OrchestratorEventType = (typeof orchestratorEventTypes)[number];

export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type OrchestratorEvent = typeof orchestratorEvents.$inferSelect;
export type NewOrchestratorEvent = typeof orchestratorEvents.$inferInsert;
export type DailyCost = typeof dailyCost.$inferSelect;
export type NewDailyCost = typeof dailyCost.$inferInsert;
