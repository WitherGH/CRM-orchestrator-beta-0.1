import { describe, expect, it } from 'vitest';

import { handleMergePrRequest } from './pr-merge-route';
import {
  AdminOrchestratorError,
  type AdminOrchestratorClient,
} from './trpc/admin-orchestrator';

describe('handleMergePrRequest', () => {
  it('merges a PR through the orchestrator client for JSON requests', async () => {
    let seenInput: unknown = null;
    const response = await handleMergePrRequest(
      new Request('http://localhost/api/admin/orchestrator/prs/merge', {
        body: JSON.stringify({ prNumber: 13 }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
      {
        getSession: async () => ({
          user: {
            id: 'local-admin',
            isAdmin: true,
          },
        }),
        orchestrator: createOrchestratorClient({
          prMerge: async (input) => {
            seenInput = input;
            return {
              message: 'PR #13 merged',
              ok: true,
              requestId: 'req-13',
            };
          },
        }),
      },
    );

    await expect(response.json()).resolves.toEqual({
      message: 'PR #13 merged',
      ok: true,
      requestId: 'req-13',
    });
    expect(seenInput).toEqual({
      actorUserId: 'local-admin',
      prNumber: 13,
    });
  });

  it('redirects form submissions back to the PR queue', async () => {
    const response = await handleMergePrRequest(
      new Request('http://localhost/api/admin/orchestrator/prs/merge', {
        body: new URLSearchParams({ prNumber: '13' }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }),
      {
        getSession: async () => ({
          user: {
            id: 'local-admin',
            isAdmin: true,
          },
        }),
        orchestrator: createOrchestratorClient(),
      },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost/admin/orchestrator?mode=pr-queue');
  });

  it('rejects unauthenticated and invalid merge requests', async () => {
    const missingSession = await handleMergePrRequest(
      new Request('http://localhost/api/admin/orchestrator/prs/merge', {
        body: JSON.stringify({ prNumber: 13 }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
      {
        getSession: async () => null,
        orchestrator: createOrchestratorClient(),
      },
    );
    const invalidPr = await handleMergePrRequest(
      new Request('http://localhost/api/admin/orchestrator/prs/merge', {
        body: JSON.stringify({ prNumber: 0 }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
      {
        getSession: async () => ({
          user: {
            id: 'local-admin',
            isAdmin: true,
          },
        }),
        orchestrator: createOrchestratorClient(),
      },
    );

    expect(missingSession.status).toBe(404);
    expect(invalidPr.status).toBe(400);
  });

  it('maps orchestrator merge errors to HTTP status codes', async () => {
    const response = await handleMergePrRequest(
      new Request('http://localhost/api/admin/orchestrator/prs/merge', {
        body: JSON.stringify({ prNumber: 13 }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
      {
        getSession: async () => ({
          user: {
            id: 'local-admin',
            isAdmin: true,
          },
        }),
        orchestrator: createOrchestratorClient({
          prMerge: async () => {
            throw new AdminOrchestratorError('CONFLICT', 'PR is not mergeable');
          },
        }),
      },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONFLICT',
      message: 'PR is not mergeable',
    });
  });
});

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
