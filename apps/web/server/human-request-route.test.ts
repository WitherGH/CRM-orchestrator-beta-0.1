import { describe, expect, it } from 'vitest';

import { handleCreateHumanRequest } from './human-request-route';
import {
  AdminOrchestratorError,
  type AdminOrchestratorClient,
} from './trpc/admin-orchestrator';

describe('handleCreateHumanRequest', () => {
  it('submits JSON intake payloads through the orchestrator client', async () => {
    let seenInput: unknown = null;
    const response = await handleCreateHumanRequest(
      new Request('http://localhost/api/admin/orchestrator/requests', {
        body: JSON.stringify({
          brief: 'Create an admin console intake for role pipeline tasks.',
          humanNotes: 'Keep notes in each generated task.',
          labels: ['crm'],
          priority: 'P0',
          roles: [
            { enabled: true, model: 'opus', role: 'architect' },
            { enabled: true, model: 'gpt-5.5', role: 'developer' },
          ],
          targetArea: 'apps/web',
          title: 'Human request intake',
        }),
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
          createHumanRequest: async (input) => {
            seenInput = input;
            return {
              message: 'Created 2 tasks',
              ok: true,
              requestId: 'R-20260514T120000-human-request-intake',
              taskIds: ['T-019', 'T-020'],
            };
          },
        }),
      },
    );

    await expect(response.json()).resolves.toEqual({
      message: 'Created 2 tasks',
      ok: true,
      requestId: 'R-20260514T120000-human-request-intake',
      taskIds: ['T-019', 'T-020'],
    });
    expect(seenInput).toEqual({
      actorUserId: 'local-admin',
      brief: 'Create an admin console intake for role pipeline tasks.',
      humanNotes: 'Keep notes in each generated task.',
      labels: ['crm'],
      priority: 'P0',
      roles: [
        { enabled: true, model: 'opus', role: 'architect' },
        { enabled: true, model: 'gpt-5.5', role: 'developer' },
      ],
      targetArea: 'apps/web',
      title: 'Human request intake',
    });
  });

  it('parses form submissions and redirects back to the orchestrator page', async () => {
    let seenInput: unknown = null;
    const form = new URLSearchParams({
      brief: 'Create a form submission path for intake requests.',
      humanNotes: 'No client filesystem writes.',
      labels: 'CRM, request intake',
      priority: 'P1',
      'roleModel:architect': 'opus',
      'roleModel:developer': 'gpt-5.4',
      'roleModel:designer': 'sonnet',
      'roleModel:pm': 'sonnet',
      'roleModel:reviewer': 'opus',
      'roleModel:tester': 'gpt-5.5',
      targetArea: 'apps/web',
      title: 'Form intake',
    });
    form.append('roleEnabled', 'architect');
    form.append('roleEnabled', 'developer');

    const response = await handleCreateHumanRequest(
      new Request('http://localhost/api/admin/orchestrator/requests', {
        body: form,
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
        orchestrator: createOrchestratorClient({
          createHumanRequest: async (input) => {
            seenInput = input;
            return {
              ok: true,
              requestId: 'R-20260514T120000-form-intake',
              taskIds: ['T-019', 'T-020'],
            };
          },
        }),
      },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'http://localhost/admin/orchestrator?request=R-20260514T120000-form-intake',
    );
    expect(seenInput).toMatchObject({
      actorUserId: 'local-admin',
      labels: ['crm', 'request-intake'],
      priority: 'P1',
      roles: [
        { enabled: true, model: 'opus', role: 'architect' },
        { enabled: false, model: 'sonnet', role: 'pm' },
        { enabled: false, model: 'sonnet', role: 'designer' },
        { enabled: true, model: 'gpt-5.4', role: 'developer' },
        { enabled: false, model: 'opus', role: 'reviewer' },
        { enabled: false, model: 'gpt-5.5', role: 'tester' },
      ],
    });
  });

  it('rejects unauthenticated and invalid intake requests', async () => {
    const missingSession = await handleCreateHumanRequest(
      new Request('http://localhost/api/admin/orchestrator/requests', {
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
      {
        getSession: async () => null,
        orchestrator: createOrchestratorClient(),
      },
    );
    const invalidPayload = await handleCreateHumanRequest(
      new Request('http://localhost/api/admin/orchestrator/requests', {
        body: JSON.stringify({
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
    expect(invalidPayload.status).toBe(400);
  });

  it('maps orchestrator intake errors to HTTP status codes', async () => {
    const response = await handleCreateHumanRequest(
      new Request('http://localhost/api/admin/orchestrator/requests', {
        body: JSON.stringify({
          brief: 'Create a request intake but simulate an orchestrator conflict.',
          labels: ['crm'],
          priority: 'P0',
          roles: [
            { enabled: true, model: 'gpt-5.5', role: 'developer' },
          ],
          title: 'Conflict intake',
        }),
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
          createHumanRequest: async () => {
            throw new AdminOrchestratorError('CONFLICT', 'Task id already exists');
          },
        }),
      },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONFLICT',
      message: 'Task id already exists',
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
