import { describe, expect, it } from 'vitest';

import { handleOrchestratorControlRequest } from './orchestrator-control-route';
import {
  AdminOrchestratorError,
  type AdminOrchestratorClient,
} from './trpc/admin-orchestrator';

describe('handleOrchestratorControlRequest', () => {
  it('runs automation and task controls through the orchestrator client', async () => {
    const calls: Array<{ input: unknown; name: string }> = [];
    const orchestrator = createOrchestratorClient({
      automationStart: async (input) => {
        calls.push({ input, name: 'automationStart' });
        return { ok: true, requestId: 'automation' };
      },
      prMergeReady: async (input) => {
        calls.push({ input, name: 'prMergeReady' });
        return { ok: true, requestId: 'merge-ready-reviewer' };
      },
      tickRun: async (input) => {
        calls.push({ input, name: 'tickRun' });
        return { ok: true, requestId: input.taskId ?? 'tick' };
      },
    });

    await handleOrchestratorControlRequest(
      jsonRequest({ action: 'automation-start' }),
      { getSession: adminSession, orchestrator },
    );
    await handleOrchestratorControlRequest(
      jsonRequest({ action: 'task-run', taskId: 'T-024' }),
      { getSession: adminSession, orchestrator },
    );
    await handleOrchestratorControlRequest(
      jsonRequest({ action: 'pr-merge-ready' }),
      { getSession: adminSession, orchestrator },
    );

    expect(calls).toEqual([
      {
        input: { actorUserId: 'local-admin' },
        name: 'automationStart',
      },
      {
        input: { actorUserId: 'local-admin', taskId: 'T-024' },
        name: 'tickRun',
      },
      {
        input: { actorUserId: 'local-admin' },
        name: 'prMergeReady',
      },
    ]);
  });

  it('updates task status, deletes tasks, and changes agent model routing', async () => {
    const calls: Array<{ input: unknown; name: string }> = [];
    const orchestrator = createOrchestratorClient({
      agentModelSet: async (input) => {
        calls.push({ input, name: 'agentModelSet' });
        return { ok: true, requestId: input.role };
      },
      taskDelete: async (input) => {
        calls.push({ input, name: 'taskDelete' });
        return { ok: true, requestId: input.id };
      },
      taskKill: async (input) => {
        calls.push({ input, name: 'taskKill' });
        return { ok: true, requestId: input.id };
      },
      taskStatusSet: async (input) => {
        calls.push({ input, name: 'taskStatusSet' });
        return { ok: true, requestId: input.id };
      },
    });

    await handleOrchestratorControlRequest(
      jsonRequest({ action: 'task-status', status: 'backlog', taskId: 'T-019' }),
      { getSession: adminSession, orchestrator },
    );
    await handleOrchestratorControlRequest(
      jsonRequest({ action: 'task-delete', taskId: 'T-020' }),
      { getSession: adminSession, orchestrator },
    );
    await handleOrchestratorControlRequest(
      jsonRequest({ action: 'task-kill', taskId: 'T-021' }),
      { getSession: adminSession, orchestrator },
    );
    await handleOrchestratorControlRequest(
      jsonRequest({ action: 'agent-model', model: 'gpt-5.5', role: 'tester' }),
      { getSession: adminSession, orchestrator },
    );

    expect(calls).toEqual([
      {
        input: {
          actorUserId: 'local-admin',
          flagged: false,
          id: 'T-019',
          status: 'backlog',
        },
        name: 'taskStatusSet',
      },
      {
        input: {
          actorUserId: 'local-admin',
          id: 'T-020',
        },
        name: 'taskDelete',
      },
      {
        input: {
          actorUserId: 'local-admin',
          id: 'T-021',
        },
        name: 'taskKill',
      },
      {
        input: {
          actorUserId: 'local-admin',
          model: 'gpt-5.5',
          role: 'tester',
        },
        name: 'agentModelSet',
      },
    ]);
  });

  it('redirects form submissions back to the orchestrator console', async () => {
    const response = await handleOrchestratorControlRequest(
      new Request('http://localhost/api/admin/orchestrator/control', {
        body: new URLSearchParams({
          action: 'task-status',
          status: 'review',
          taskId: 'T-019',
        }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }),
      {
        getSession: adminSession,
        orchestrator: createOrchestratorClient(),
      },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost/admin/orchestrator');
  });

  it('redirects merge-ready form submissions back to the PR queue', async () => {
    const response = await handleOrchestratorControlRequest(
      new Request('http://localhost/api/admin/orchestrator/control', {
        body: new URLSearchParams({
          action: 'pr-merge-ready',
        }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }),
      {
        getSession: adminSession,
        orchestrator: createOrchestratorClient(),
      },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost/admin/orchestrator?mode=pr-queue');
  });

  it('rejects unauthenticated, invalid, and failed control requests', async () => {
    const missingSession = await handleOrchestratorControlRequest(
      jsonRequest({ action: 'tick-run' }),
      {
        getSession: async () => null,
        orchestrator: createOrchestratorClient(),
      },
    );
    const invalidPayload = await handleOrchestratorControlRequest(
      jsonRequest({ action: 'task-status', taskId: 'nope' }),
      {
        getSession: adminSession,
        orchestrator: createOrchestratorClient(),
      },
    );
    const failedMutation = await handleOrchestratorControlRequest(
      jsonRequest({ action: 'task-delete', taskId: 'T-404' }),
      {
        getSession: adminSession,
        orchestrator: createOrchestratorClient({
          taskDelete: async () => {
            throw new AdminOrchestratorError('NOT_FOUND', 'Task not found');
          },
        }),
      },
    );

    expect(missingSession.status).toBe(404);
    expect(invalidPayload.status).toBe(400);
    expect(failedMutation.status).toBe(404);
    await expect(failedMutation.json()).resolves.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Task not found',
    });
  });
});

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/orchestrator/control', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

async function adminSession() {
  return {
    user: {
      id: 'local-admin',
      isAdmin: true as const,
    },
  };
}

function createOrchestratorClient(
  overrides: Partial<AdminOrchestratorClient> = {},
): AdminOrchestratorClient {
  return {
    agentKill: async () => ({ ok: true }),
    agentModelSet: async () => ({ ok: true }),
    agentPause: async () => ({ ok: true }),
    automationStart: async () => ({ ok: true }),
    automationStop: async () => ({ ok: true }),
    costCapSet: async () => ({ ok: true }),
    createHumanRequest: async () => ({ ok: true }),
    inboxTriage: async () => ({ ok: true }),
    prMerge: async () => ({ ok: true }),
    prMergeReady: async () => ({ ok: true }),
    taskDelete: async () => ({ ok: true }),
    taskKill: async () => ({ ok: true }),
    taskReprioritize: async () => ({ ok: true }),
    taskStatusSet: async () => ({ ok: true }),
    taskUpdate: async () => ({ ok: true }),
    tickRun: async () => ({ ok: true }),
    ...overrides,
  };
}
