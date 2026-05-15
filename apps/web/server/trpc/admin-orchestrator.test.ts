import { describe, expect, it } from 'vitest';

import {
  AdminOrchestratorError,
  createHttpAdminOrchestratorClient,
} from './admin-orchestrator';

describe('createHttpAdminOrchestratorClient', () => {
  it('posts human request intake payloads to the orchestrator HTTP endpoint', async () => {
    let seenUrl = '';
    let seenBody: unknown = null;
    const fetchImpl: typeof fetch = async (input, init) => {
      seenUrl = String(input);
      seenBody = JSON.parse(String(init?.body)) as unknown;
      return new Response(
        JSON.stringify({
          message: 'Created 6 tasks',
          ok: true,
          requestId: 'R-20260514T120000-request',
          taskIds: ['T-019'],
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    };

    const client = createHttpAdminOrchestratorClient({
      baseUrl: 'http://127.0.0.1:4373/',
      fetchImpl,
    });

    await expect(
      client.createHumanRequest({
        actorUserId: 'local-admin',
        brief: 'Build the request intake flow from the admin console.',
        humanNotes: 'Keep each role output reviewable.',
        labels: ['crm'],
        priority: 'P0',
        roles: [
          { enabled: true, model: 'opus', role: 'architect' },
          { enabled: true, model: 'gpt-5.5', role: 'developer' },
        ],
        targetArea: 'apps/web',
        title: 'Request intake',
      }),
    ).resolves.toEqual({
      message: 'Created 6 tasks',
      ok: true,
      requestId: 'R-20260514T120000-request',
      taskIds: ['T-019'],
    });
    expect(seenUrl).toBe('http://127.0.0.1:4373/requests');
    expect(seenBody).toEqual({
      actorUserId: 'local-admin',
      brief: 'Build the request intake flow from the admin console.',
      humanNotes: 'Keep each role output reviewable.',
      labels: ['crm'],
      priority: 'P0',
      projectId: null,
      roles: [
        { enabled: true, model: 'opus', role: 'architect' },
        { enabled: true, model: 'gpt-5.5', role: 'developer' },
      ],
      targetArea: 'apps/web',
      title: 'Request intake',
    });
  });

  it('posts PR merge requests to the orchestrator HTTP endpoint', async () => {
    let seenUrl = '';
    let seenBody: unknown = null;
    const fetchImpl: typeof fetch = async (input, init) => {
      seenUrl = String(input);
      seenBody = JSON.parse(String(init?.body)) as unknown;
      return new Response(
        JSON.stringify({
          message: 'PR #13 merged',
          ok: true,
          requestId: 'req-13',
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    };

    const client = createHttpAdminOrchestratorClient({
      baseUrl: 'http://127.0.0.1:4373/',
      fetchImpl,
    });

    await expect(
      client.prMerge({
        actorUserId: 'local-admin',
        prNumber: 13,
      }),
    ).resolves.toEqual({
      message: 'PR #13 merged',
      ok: true,
      requestId: 'req-13',
    });
    expect(seenUrl).toBe('http://127.0.0.1:4373/prs/13/merge');
    expect(seenBody).toEqual({
      actorUserId: 'local-admin',
    });
  });

  it('posts reviewer merge-ready requests to the orchestrator HTTP endpoint', async () => {
    let seenUrl = '';
    let seenBody: unknown = null;
    const fetchImpl: typeof fetch = async (input, init) => {
      seenUrl = String(input);
      seenBody = JSON.parse(String(init?.body)) as unknown;
      return new Response(
        JSON.stringify({
          message: 'Reviewer merge run checked 2 merge-ready task(s), merged 2',
          ok: true,
          requestId: 'merge-ready-reviewer',
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    };

    const client = createHttpAdminOrchestratorClient({
      baseUrl: 'http://127.0.0.1:4373/',
      fetchImpl,
    });

    await expect(
      client.prMergeReady({
        actorUserId: 'local-admin',
      }),
    ).resolves.toEqual({
      message: 'Reviewer merge run checked 2 merge-ready task(s), merged 2',
      ok: true,
      requestId: 'merge-ready-reviewer',
    });
    expect(seenUrl).toBe('http://127.0.0.1:4373/prs/merge-ready');
    expect(seenBody).toEqual({
      actorUserId: 'local-admin',
    });
  });

  it('posts task control and tick requests to the orchestrator HTTP endpoint', async () => {
    const seen: Array<{ body: unknown; method: string | undefined; url: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      seen.push({
        body: JSON.parse(String(init?.body)) as unknown,
        method: init?.method,
        url: String(input),
      });
      return new Response(
        JSON.stringify({
          message: 'ok',
          ok: true,
          requestId: 'control',
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    };
    const client = createHttpAdminOrchestratorClient({
      baseUrl: 'http://127.0.0.1:4373',
      fetchImpl,
    });

    await client.tickRun({ actorUserId: 'local-admin' });
    await client.tickRun({ actorUserId: 'local-admin', taskId: 'T-022' });
    await client.taskStatusSet({
      actorUserId: 'local-admin',
      flagged: false,
      id: 'T-022',
      status: 'backlog',
    });
    await client.taskDelete({ actorUserId: 'local-admin', id: 'T-024' });
    await client.taskKill({ actorUserId: 'local-admin', id: 'T-025' });
    await client.agentModelSet({
      actorUserId: 'local-admin',
      model: 'gpt-5.5',
      role: 'developer',
    });
    await client.automationStart({ actorUserId: 'local-admin' });
    await client.automationStop({ actorUserId: 'local-admin' });
    await client.prMergeReady({ actorUserId: 'local-admin' });

    expect(seen).toEqual([
      {
        body: { actorUserId: 'local-admin' },
        method: 'POST',
        url: 'http://127.0.0.1:4373/tick',
      },
      {
        body: { actorUserId: 'local-admin', taskId: 'T-022' },
        method: 'POST',
        url: 'http://127.0.0.1:4373/tick',
      },
      {
        body: { actorUserId: 'local-admin', flagged: false, status: 'backlog' },
        method: 'PATCH',
        url: 'http://127.0.0.1:4373/tasks/T-022',
      },
      {
        body: { actorUserId: 'local-admin' },
        method: 'DELETE',
        url: 'http://127.0.0.1:4373/tasks/T-024',
      },
      {
        body: { actorUserId: 'local-admin' },
        method: 'POST',
        url: 'http://127.0.0.1:4373/tasks/T-025/kill',
      },
      {
        body: { actorUserId: 'local-admin', model: 'gpt-5.5' },
        method: 'PATCH',
        url: 'http://127.0.0.1:4373/agents/developer/routing',
      },
      {
        body: { actorUserId: 'local-admin' },
        method: 'POST',
        url: 'http://127.0.0.1:4373/automation/start',
      },
      {
        body: { actorUserId: 'local-admin' },
        method: 'POST',
        url: 'http://127.0.0.1:4373/automation/stop',
      },
      {
        body: { actorUserId: 'local-admin' },
        method: 'POST',
        url: 'http://127.0.0.1:4373/prs/merge-ready',
      },
    ]);
  });

  it('maps orchestrator HTTP errors to admin orchestrator errors', async () => {
    const fetchImpl: typeof fetch = async () => new Response(
      JSON.stringify({
        message: 'PR is not mergeable',
      }),
      {
        headers: { 'content-type': 'application/json' },
        status: 409,
      },
    );
    const client = createHttpAdminOrchestratorClient({
      baseUrl: 'http://127.0.0.1:4373',
      fetchImpl,
    });

    await expect(
      client.prMerge({
        actorUserId: 'local-admin',
        prNumber: 13,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'PR is not mergeable',
    } satisfies Partial<AdminOrchestratorError>);
  });

  it('times out hanging orchestrator mutations', async () => {
    const fetchImpl: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });
    const client = createHttpAdminOrchestratorClient({
      baseUrl: 'http://127.0.0.1:4373',
      fetchImpl,
      mutationTimeoutMs: 1,
    });

    await expect(
      client.createHumanRequest({
        actorUserId: 'local-admin',
        brief: 'Build a timeout guard around request intake submission.',
        humanNotes: 'Avoid leaving the UI in a permanent submitting state.',
        labels: ['crm'],
        priority: 'P0',
        roles: [
          { enabled: true, model: 'gpt-5.5', role: 'developer' },
        ],
        targetArea: 'apps/web',
        title: 'Timeout guard',
      }),
    ).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      message: 'Orchestrator unavailable',
    } satisfies Partial<AdminOrchestratorError>);
  });
});
