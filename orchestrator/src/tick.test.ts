import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createStatusApp,
  getStatusSnapshot,
  type OrchestratorRuntimeState,
  type OrchestratorStatusError,
  type OrchestratorStatusSnapshot,
} from './tick';

const tempRoots: string[] = [];

async function createVault(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'crm-orchestrator-status-'));
  tempRoots.push(root);
  await mkdir(join(root, '04-tasks', 'backlog'), { recursive: true });
  await mkdir(join(root, '04-tasks', 'in-progress'), { recursive: true });
  await mkdir(join(root, '04-tasks', 'review'), { recursive: true });
  return root;
}

async function writeTask(
  vaultPath: string,
  dir: string,
  frontmatter: {
    assignee: string;
    flagged?: boolean;
    id: string;
    pr_number?: number;
    priority: string;
    status: string;
    title: string;
  },
): Promise<void> {
  const flagged = frontmatter.flagged ?? false;
  const prNumber = frontmatter.pr_number === undefined ? '' : `pr_number: ${frontmatter.pr_number}\n`;
  const content = `---
id: ${frontmatter.id}
title: ${frontmatter.title}
status: ${frontmatter.status}
priority: ${frontmatter.priority}
effort: S
assignee: ${frontmatter.assignee}
depends_on: []
labels: []
created: '2026-05-14'
flagged: ${flagged}
${prNumber}
---

## What
Test task.
`;

  await mkdir(join(vaultPath, '04-tasks', dir), { recursive: true });
  await writeFile(join(vaultPath, '04-tasks', dir, `${frontmatter.id}.md`), content, 'utf-8');
}

function runtime(overrides: Partial<OrchestratorRuntimeState> = {}): OrchestratorRuntimeState {
  return {
    activeLaunches: 0,
    daemonRunning: true,
    lastTickError: null,
    lastTickFinishedAt: '2026-05-14T11:59:00.000Z',
    lastTickStartedAt: '2026-05-14T11:58:00.000Z',
    processStartedAt: '2026-05-14T11:00:00.000Z',
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { force: true, recursive: true })));
  tempRoots.length = 0;
});

describe('orchestrator status snapshot', () => {
  it('summarizes vault tasks, active agents, cost, and runtime state', async () => {
    const vaultPath = await createVault();
    const now = new Date('2026-05-14T12:00:00.000Z');

    await writeTask(vaultPath, 'backlog', {
      assignee: 'developer',
      id: 'T-010',
      priority: 'P0',
      status: 'backlog',
      title: 'Backlog task',
    });
    await writeTask(vaultPath, 'in-progress', {
      assignee: 'developer',
      id: 'T-011',
      priority: 'P1',
      status: 'in-progress',
      title: 'Running task',
    });
    await writeTask(vaultPath, 'review', {
      assignee: 'reviewer',
      flagged: true,
      id: 'T-012',
      priority: 'P2',
      status: 'review',
      title: 'Review task',
    });

    const snapshot = await getStatusSnapshot({
      costCapUsd: 50,
      getTodayCost: async () => 14.25,
      now: () => now,
      runtime: runtime(),
      vaultPath,
      worktreeBase: vaultPath,
    });

    expect(snapshot.ok).toBe(true);
    expect(snapshot.timestamp).toBe('2026-05-14T12:00:00.000Z');
    expect(snapshot.uptimeMs).toBe(3_600_000);
    expect(snapshot.tasks.total).toBe(3);
    expect(snapshot.tasks.flagged).toBe(1);
    expect(snapshot.tasks.byStatus.backlog).toBe(1);
    expect(snapshot.tasks.byStatus['in-progress']).toBe(1);
    expect(snapshot.tasks.byStatus.review).toBe(1);
    expect(snapshot.tasks.byPriority.P0).toBe(1);
    expect(snapshot.cost).toEqual({
      capHit: false,
      capUsd: 50,
      remainingUsd: 35.75,
      todayUsd: 14.25,
    });
    expect(snapshot.agents.active).toBe(0);
    expect(snapshot.agents.roles.find((role) => role.role === 'developer')).toMatchObject({
      capacity: 4,
      role: 'developer',
      runner: 'codex',
      runningCount: 0,
      runningTaskIds: [],
    });
  });

  it('marks the snapshot unhealthy when the vault task root is unavailable', async () => {
    const missingVaultPath = join(tmpdir(), `crm-missing-vault-${randomUUID()}`);

    const snapshot = await getStatusSnapshot({
      getTodayCost: async () => 0,
      runtime: runtime(),
      vaultPath: missingVaultPath,
      worktreeBase: missingVaultPath,
    });

    expect(snapshot.ok).toBe(false);
    expect(snapshot.tasks.total).toBe(0);
    expect(snapshot.vault.reachable).toBe(false);
    expect(snapshot.vault.taskRootReachable).toBe(false);
  });
});

describe('orchestrator status endpoint', () => {
  it('serves the status snapshot as JSON', async () => {
    const vaultPath = await createVault();
    await writeTask(vaultPath, 'in-progress', {
      assignee: 'tester',
      id: 'T-013',
      priority: 'P3',
      status: 'in-progress',
      title: 'Tester task',
    });

    const app = createStatusApp({
      getTodayCost: async () => 51,
      runtime: runtime({ activeLaunches: 1 }),
      vaultPath,
      worktreeBase: vaultPath,
    });
    const response = await app.request('/status');
    const json = await response.json() as OrchestratorStatusSnapshot;

    expect(response.status).toBe(200);
    expect(json.cost.capHit).toBe(true);
    expect(json.runtime.activeLaunches).toBe(1);
    expect(json.agents.roles.find((role) => role.role === 'tester')?.runningTaskIds).toEqual([]);
  });

  it('returns 503 when status collection fails', async () => {
    const vaultPath = await createVault();
    const app = createStatusApp({
      getTodayCost: async () => {
        throw new Error('cost store unavailable');
      },
      runtime: runtime(),
      vaultPath,
      worktreeBase: vaultPath,
    });

    const response = await app.request('/status');
    const json = await response.json() as OrchestratorStatusError;

    expect(response.status).toBe(503);
    expect(json).toMatchObject({
      code: 'STATUS_UNAVAILABLE',
      message: 'cost store unavailable',
      ok: false,
    });
  });

  it('serves PR merge requests through the orchestrator mutation surface', async () => {
    let seenInput: unknown = null;
    const app = createStatusApp({
      mergePullRequest: async (input) => {
        seenInput = input;
        return {
          message: 'PR #13 merge requested',
          ok: true,
          requestId: 'req-13',
        };
      },
    });

    const response = await app.request('/prs/13/merge', {
      body: JSON.stringify({ actorUserId: 'local-admin' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      message: 'PR #13 merge requested',
      ok: true,
      requestId: 'req-13',
    });
    expect(seenInput).toEqual({
      actorUserId: 'local-admin',
      prNumber: 13,
    });
  });

  it('serves reviewer merge-ready runs through the orchestrator mutation surface', async () => {
    const vaultPath = await createVault();
    const seenInputs: unknown[] = [];
    await writeTask(vaultPath, 'merge-ready', {
      assignee: 'reviewer',
      id: 'T-030',
      pr_number: 30,
      priority: 'P0',
      status: 'merge-ready',
      title: 'Merge ready task',
    });
    await writeTask(vaultPath, 'merge-ready', {
      assignee: 'reviewer',
      id: 'T-031',
      priority: 'P1',
      status: 'merge-ready',
      title: 'Missing PR task',
    });

    const app = createStatusApp({
      mergePullRequest: async (input) => {
        seenInputs.push(input);
        return {
          message: `PR #${input.prNumber} merged`,
          ok: true,
          requestId: `req-${input.prNumber}`,
        };
      },
      now: () => new Date('2026-05-14T12:00:00.000Z'),
      vaultPath,
    });

    const response = await app.request('/prs/merge-ready', {
      body: JSON.stringify({ actorUserId: 'local-admin' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      requestId: 'merge-ready-reviewer',
    });
    expect(json.message).toContain('merged 1');
    expect(json.message).toContain('skipped 1');
    expect(seenInputs).toEqual([
      {
        actorUserId: 'local-admin',
        prNumber: 30,
      },
    ]);
    await expect(readFile(join(vaultPath, '04-tasks', 'done', 'T-030.md'), 'utf-8')).resolves.toContain('status: done');
    await expect(readFile(join(vaultPath, '04-tasks', 'done', 'T-030.md'), 'utf-8')).resolves.toContain('merged_by: local-admin');
    await expect(readFile(join(vaultPath, '04-tasks', 'merge-ready', 'T-031.md'), 'utf-8')).resolves.toContain('status: merge-ready');
  });

  it('serves human request intake through the orchestrator mutation surface', async () => {
    let seenInput: unknown = null;
    const app = createStatusApp({
      createHumanRequest: async (input) => {
        seenInput = input;
        return {
          message: 'Created 2 task(s)',
          ok: true,
          requestId: 'R-20260514T120000-intake',
          taskIds: ['T-019', 'T-020'],
        };
      },
    });

    const response = await app.request('/requests', {
      body: JSON.stringify({
        actorUserId: 'local-admin',
        brief: 'Create a role pipeline from a human request.',
        humanNotes: 'Keep notes visible.',
        labels: ['crm'],
        priority: 'P0',
        roles: [
          { enabled: true, model: 'opus', role: 'architect' },
          { enabled: true, model: 'gpt-5.4', role: 'developer' },
        ],
        targetArea: 'apps/web',
        title: 'Request intake',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      message: 'Created 2 task(s)',
      ok: true,
      requestId: 'R-20260514T120000-intake',
      taskIds: ['T-019', 'T-020'],
    });
    expect(seenInput).toMatchObject({
      actorUserId: 'local-admin',
      priority: 'P0',
      roles: [
        { enabled: true, model: 'opus', role: 'architect' },
        { enabled: true, model: 'gpt-5.4', role: 'developer' },
      ],
    });
  });

  it('validates human request intake before invoking the create handler', async () => {
    let calls = 0;
    const app = createStatusApp({
      createHumanRequest: async () => {
        calls += 1;
        return {
          message: 'Created tasks',
          ok: true,
          requestId: 'R-20260514T120000-intake',
          taskIds: ['T-019'],
        };
      },
    });

    const response = await app.request('/requests', {
      body: JSON.stringify({
        actorUserId: '',
        brief: 'too short',
        labels: ['Bad Label'],
        priority: 'P0',
        roles: [
          { enabled: false, model: 'gpt-5.5', role: 'developer' },
        ],
        title: 'No',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(response.status).toBe(400);
    expect(calls).toBe(0);
  });

  it('validates PR merge requests before invoking the merge handler', async () => {
    let calls = 0;
    const app = createStatusApp({
      mergePullRequest: async () => {
        calls += 1;
        return { ok: true };
      },
    });

    const invalidPr = await app.request('/prs/0/merge', {
      body: JSON.stringify({ actorUserId: 'local-admin' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const invalidBody = await app.request('/prs/13/merge', {
      body: JSON.stringify({ actorUserId: '' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(invalidPr.status).toBe(400);
    expect(invalidBody.status).toBe(400);
    expect(calls).toBe(0);
  });

  it('maps PR merge handler failures to a conflict response', async () => {
    const app = createStatusApp({
      mergePullRequest: async () => {
        throw new Error('PR is not mergeable');
      },
    });

    const response = await app.request('/prs/13/merge', {
      body: JSON.stringify({ actorUserId: 'local-admin' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toMatchObject({
      code: 'CONFLICT',
      message: 'PR is not mergeable',
      ok: false,
    });
  });

  it('serves task control and agent routing mutations', async () => {
    const vaultPath = await createVault();
    const agentRoutingPath = join(vaultPath, '06-progress', 'agent-routing.json');
    await writeTask(vaultPath, 'backlog', {
      assignee: 'developer',
      id: 'T-020',
      priority: 'P1',
      status: 'backlog',
      title: 'Move me',
    });
    await writeTask(vaultPath, 'backlog', {
      assignee: 'tester',
      id: 'T-021',
      priority: 'P2',
      status: 'backlog',
      title: 'Delete me',
    });
    await writeTask(vaultPath, 'in-progress', {
      assignee: 'architect',
      id: 'T-022',
      priority: 'P0',
      status: 'in-progress',
      title: 'Stale running task',
    });

    const app = createStatusApp({
      agentRoutingPath,
      getTodayCost: async () => 0,
      runtime: runtime(),
      vaultPath,
      worktreeBase: vaultPath,
    });

    const moveResponse = await app.request('/tasks/T-020', {
      body: JSON.stringify({
        actorUserId: 'local-admin',
        flagged: false,
        status: 'review',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    });
    const deleteResponse = await app.request('/tasks/T-021', {
      body: JSON.stringify({ actorUserId: 'local-admin' }),
      headers: { 'content-type': 'application/json' },
      method: 'DELETE',
    });
    const killResponse = await app.request('/tasks/T-022/kill', {
      body: JSON.stringify({ actorUserId: 'local-admin' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const routingResponse = await app.request('/agents/developer/routing', {
      body: JSON.stringify({
        actorUserId: 'local-admin',
        model: 'gpt-5.5',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    });
    const statusResponse = await app.request('/status');
    const status = await statusResponse.json() as OrchestratorStatusSnapshot;

    expect(moveResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
    expect(killResponse.status).toBe(200);
    expect(routingResponse.status).toBe(200);
    await expect(readFile(join(vaultPath, '04-tasks', 'backlog', 'T-021.md'), 'utf-8')).rejects.toThrow();
    await expect(readFile(join(vaultPath, '04-tasks', 'review', 'T-020.md'), 'utf-8')).resolves.toContain('status: review');
    await expect(readFile(join(vaultPath, '04-tasks', 'failed', 'T-022.md'), 'utf-8')).resolves.toContain('flagged: true');
    await expect(readFile(agentRoutingPath, 'utf-8')).resolves.toContain('"developer"');
    expect(status.agents.roles.find((role) => role.role === 'developer')).toMatchObject({
      model: 'gpt-5.5',
      runner: 'codex',
    });
  });
});
