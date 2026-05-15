import { readFileSync, readdirSync } from 'node:fs';

import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  agentRoles,
  agentRuns,
  agentRunStatuses,
  dailyCost,
  orchestratorEvents,
  orchestratorEventTypes,
} from './schema';

const readGeneratedMigration = (): string => {
  const migrationDir = new URL('../drizzle/', import.meta.url);
  const migrationFiles = readdirSync(migrationDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (migrationFiles.length === 0) {
    throw new Error('No generated SQL migration found in packages/db/drizzle');
  }

  return migrationFiles
    .map((migrationFile) => readFileSync(new URL(migrationFile, migrationDir), 'utf-8'))
    .join('\n');
};

describe('orchestrator schema', () => {
  it('exports the agent run table required by F-001', () => {
    expect(getTableName(agentRuns)).toBe('agent_runs');
    expect(agentRoles).toEqual([
      'architect',
      'designer',
      'pm',
      'reviewer',
      'developer',
      'tester',
    ]);
    expect(agentRunStatuses).toEqual([
      'queued',
      'running',
      'success',
      'failed',
      'killed',
      'timeout',
    ]);

    const columns = getTableColumns(agentRuns);
    expect(columns.taskId.name).toBe('task_id');
    expect(columns.agentRole.name).toBe('agent_role');
    expect(columns.costUsd.name).toBe('cost_usd');
    expect(columns.tokensInput.name).toBe('tokens_input');
    expect(columns.tokensOutput.name).toBe('tokens_output');
    expect(columns.stdoutPath.name).toBe('stdout_path');
    expect(columns.stderrPath.name).toBe('stderr_path');
  });

  it('exports the event and daily cost tables required by F-001', () => {
    expect(getTableName(orchestratorEvents)).toBe('orchestrator_events');
    expect(getTableName(dailyCost)).toBe('daily_cost');
    expect(orchestratorEventTypes).toEqual([
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
    ]);

    const eventColumns = getTableColumns(orchestratorEvents);
    expect(eventColumns.agentRunId.name).toBe('agent_run_id');
    expect(eventColumns.payload.name).toBe('payload');

    const costColumns = getTableColumns(dailyCost);
    expect(costColumns.agentRole.name).toBe('agent_role');
    expect(costColumns.costUsd.name).toBe('cost_usd');
    expect(costColumns.tasksCompleted.name).toBe('tasks_completed');
  });

  it('keeps the generated migration aligned with the table exports', () => {
    const migration = readGeneratedMigration();

    expect(migration).toContain('CREATE TYPE "public"."agent_role" AS ENUM');
    expect(migration).toContain('CREATE TYPE "public"."agent_run_status" AS ENUM');
    expect(migration).toContain('CREATE TYPE "public"."orchestrator_event_type" AS ENUM');
    expect(migration).toContain('CREATE TABLE "agent_runs"');
    expect(migration).toContain('CREATE TABLE "orchestrator_events"');
    expect(migration).toContain('CREATE TABLE "daily_cost"');
    expect(migration).toContain('CONSTRAINT "daily_cost_pkey" PRIMARY KEY("date","agent_role")');
    expect(migration).toContain('CONSTRAINT "agent_runs_cost_usd_non_negative"');
    expect(migration).toContain('CONSTRAINT "daily_cost_tasks_completed_non_negative"');
    expect(migration).toContain('ALTER TABLE "agent_runs" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE "orchestrator_events" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE "daily_cost" ENABLE ROW LEVEL SECURITY');
  });
});
