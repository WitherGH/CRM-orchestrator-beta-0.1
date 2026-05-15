import { z } from 'zod';

import {
  agentRoles,
  type AgentRole,
} from '@crm-orchestrator/db/schema';

import type {
  TaskPriority,
  TaskStatus,
} from '../vault-fs';

export const inboxTriageActions = ['to-pm', 'archive', 'snooze'] as const;

export type InboxTriageAction = (typeof inboxTriageActions)[number];

const modelIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9._:-]+$/);

const projectIdSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}, z.string().max(80).regex(/^[a-z0-9][a-z0-9-]*$/).nullable().optional());

export const humanRequestCreateSchema = z
  .object({
    brief: z.string().trim().min(10).max(8_000),
    humanNotes: z.preprocess((value) => {
      if (typeof value !== 'string') {
        return value;
      }

      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }, z.string().max(6_000).nullable().optional()),
    labels: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(32)
          .regex(/^[a-z0-9][a-z0-9-]*$/),
      )
      .max(12)
      .default([]),
    priority: z.enum(['P0', 'P1', 'P2', 'P3']),
    projectId: projectIdSchema,
    roles: z
      .array(
        z.object({
          enabled: z.boolean(),
          model: modelIdSchema,
          role: z.enum(agentRoles),
        }),
      )
      .min(1)
      .max(agentRoles.length),
    targetArea: z.preprocess((value) => {
      if (typeof value !== 'string') {
        return value;
      }

      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }, z.string().max(160).nullable().optional()),
    title: z.string().trim().min(3).max(140),
  })
  .superRefine((input, ctx) => {
    const seen = new Set<AgentRole>();
    for (const entry of input.roles) {
      if (seen.has(entry.role)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate role: ${entry.role}`,
          path: ['roles'],
        });
      }
      seen.add(entry.role);
    }

    if (!input.roles.some((entry) => entry.enabled)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one pipeline role must be enabled',
        path: ['roles'],
      });
    }
  });

export type HumanRequestCreateInput = z.infer<typeof humanRequestCreateSchema>;

export const adminMutationResultSchema = z.object({
  message: z.string().optional(),
  ok: z.literal(true),
  requestId: z.string().nullable().optional(),
  taskIds: z.array(z.string()).optional(),
});

export type AdminMutationResult = z.infer<typeof adminMutationResultSchema>;

export type AdminOrchestratorErrorCode =
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'UNAVAILABLE';

export class AdminOrchestratorError extends Error {
  constructor(
    readonly code: AdminOrchestratorErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AdminOrchestratorError';
  }
}

export interface AdminActorInput {
  actorUserId: string;
  projectId?: string | null;
}

export interface TaskReprioritizeInput extends AdminActorInput {
  id: string;
  priority: TaskPriority;
}

export interface TaskStatusSetInput extends AdminActorInput {
  flagged?: boolean;
  id: string;
  status: TaskStatus;
}

export interface TaskUpdateInput extends AdminActorInput {
  body?: string;
  id: string;
  title?: string;
}

export interface TaskDeleteInput extends AdminActorInput {
  id: string;
}

export interface TaskKillInput extends AdminActorInput {
  id: string;
}

export interface TickRunInput extends AdminActorInput {
  taskId?: string;
}

export interface InboxTriageInput extends AdminActorInput {
  action: InboxTriageAction;
  filename: string;
}

export interface AgentKillInput extends AdminActorInput {
  runId: string;
}

export interface AgentPauseInput extends AdminActorInput {
  role: AgentRole;
}

export interface AgentModelSetInput extends AdminActorInput {
  model: string;
  role: AgentRole;
}

export interface CostCapSetInput extends AdminActorInput {
  usd: number;
}

export interface PrMergeInput extends AdminActorInput {
  prNumber: number;
}

export interface CreateHumanRequestInput extends HumanRequestCreateInput, AdminActorInput {}

export interface AdminOrchestratorClient {
  agentKill(input: AgentKillInput): Promise<AdminMutationResult>;
  agentModelSet(input: AgentModelSetInput): Promise<AdminMutationResult>;
  agentPause(input: AgentPauseInput): Promise<AdminMutationResult>;
  automationStart(input: AdminActorInput): Promise<AdminMutationResult>;
  automationStop(input: AdminActorInput): Promise<AdminMutationResult>;
  costCapSet(input: CostCapSetInput): Promise<AdminMutationResult>;
  createHumanRequest(input: CreateHumanRequestInput): Promise<AdminMutationResult>;
  inboxTriage(input: InboxTriageInput): Promise<AdminMutationResult>;
  prMerge(input: PrMergeInput): Promise<AdminMutationResult>;
  prMergeReady(input: AdminActorInput): Promise<AdminMutationResult>;
  taskDelete(input: TaskDeleteInput): Promise<AdminMutationResult>;
  taskKill(input: TaskKillInput): Promise<AdminMutationResult>;
  taskReprioritize(input: TaskReprioritizeInput): Promise<AdminMutationResult>;
  taskStatusSet(input: TaskStatusSetInput): Promise<AdminMutationResult>;
  taskUpdate(input: TaskUpdateInput): Promise<AdminMutationResult>;
  tickRun(input: TickRunInput): Promise<AdminMutationResult>;
}

export interface AdminOrchestratorHttpClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  mutationTimeoutMs?: number;
}

const defaultMutationTimeoutMs = 15_000;

export function createHttpAdminOrchestratorClient(
  options: AdminOrchestratorHttpClientOptions = {},
): AdminOrchestratorClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? defaultOrchestratorBaseUrl());
  const fetchImpl = options.fetchImpl ?? fetch;
  const mutationTimeoutMs = options.mutationTimeoutMs ?? defaultMutationTimeoutMs;

  return {
    agentKill: () => unavailable('agentKill'),
    agentModelSet: (input) => postMutation(
      fetchImpl,
      baseUrl,
      `/agents/${encodeURIComponent(input.role)}/routing`,
      {
        actorUserId: input.actorUserId,
        model: input.model,
      },
      mutationTimeoutMs,
      'PATCH',
    ),
    agentPause: () => unavailable('agentPause'),
    automationStart: (input) => postMutation(
      fetchImpl,
      baseUrl,
      '/automation/start',
      {
        actorUserId: input.actorUserId,
        projectId: input.projectId ?? undefined,
      },
      mutationTimeoutMs,
    ),
    automationStop: (input) => postMutation(
      fetchImpl,
      baseUrl,
      '/automation/stop',
      {
        actorUserId: input.actorUserId,
      },
      mutationTimeoutMs,
    ),
    costCapSet: () => unavailable('costCapSet'),
    createHumanRequest: (input) => postMutation(
      fetchImpl,
      baseUrl,
      '/requests',
      {
        actorUserId: input.actorUserId,
        brief: input.brief,
        humanNotes: input.humanNotes ?? null,
        labels: input.labels,
        priority: input.priority,
        projectId: input.projectId ?? null,
        roles: input.roles,
        targetArea: input.targetArea ?? null,
        title: input.title,
      },
      mutationTimeoutMs,
    ),
    inboxTriage: () => unavailable('inboxTriage'),
    prMerge: (input) => postMutation(
      fetchImpl,
      baseUrl,
      `/prs/${encodeURIComponent(String(input.prNumber))}/merge`,
      {
        actorUserId: input.actorUserId,
        projectId: input.projectId ?? undefined,
      },
      mutationTimeoutMs,
    ),
    prMergeReady: (input) => postMutation(
      fetchImpl,
      baseUrl,
      '/prs/merge-ready',
      {
        actorUserId: input.actorUserId,
        projectId: input.projectId ?? undefined,
      },
      mutationTimeoutMs,
    ),
    taskDelete: (input) => postMutation(
      fetchImpl,
      baseUrl,
      `/tasks/${encodeURIComponent(input.id)}`,
      {
        actorUserId: input.actorUserId,
      },
      mutationTimeoutMs,
      'DELETE',
    ),
    taskKill: (input) => postMutation(
      fetchImpl,
      baseUrl,
      `/tasks/${encodeURIComponent(input.id)}/kill`,
      {
        actorUserId: input.actorUserId,
      },
      mutationTimeoutMs,
    ),
    taskReprioritize: () => unavailable('taskReprioritize'),
    taskStatusSet: (input) => postMutation(
      fetchImpl,
      baseUrl,
      `/tasks/${encodeURIComponent(input.id)}`,
      {
        actorUserId: input.actorUserId,
        flagged: input.flagged,
        projectId: input.projectId ?? undefined,
        status: input.status,
      },
      mutationTimeoutMs,
      'PATCH',
    ),
    taskUpdate: (input) => postMutation(
      fetchImpl,
      baseUrl,
      `/tasks/${encodeURIComponent(input.id)}`,
      {
        actorUserId: input.actorUserId,
        body: input.body,
        projectId: input.projectId ?? undefined,
        title: input.title,
      },
      mutationTimeoutMs,
      'PATCH',
    ),
    tickRun: (input) => postMutation(
      fetchImpl,
      baseUrl,
      '/tick',
      {
        actorUserId: input.actorUserId,
        projectId: input.projectId ?? undefined,
        taskId: input.taskId,
      },
      mutationTimeoutMs,
    ),
  };
}

function defaultOrchestratorBaseUrl(): string {
  const explicitUrl = process.env.ORCHESTRATOR_HTTP_URL;
  if (explicitUrl !== undefined && explicitUrl.trim() !== '') {
    return explicitUrl;
  }

  const host = process.env.ORCHESTRATOR_HTTP_HOST ?? '127.0.0.1';
  const port = process.env.ORCHESTRATOR_HTTP_PORT ?? '4373';
  return `http://${host}:${port}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

async function postMutation(
  fetchImpl: typeof fetch,
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number,
  method = 'POST',
): Promise<AdminMutationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
      },
      method,
      signal: controller.signal,
    });
  } catch (error) {
    throw new AdminOrchestratorError('UNAVAILABLE', 'Orchestrator unavailable', error);
  } finally {
    clearTimeout(timeout);
  }

  const payload = await readJsonPayload(response);
  if (!response.ok) {
    throw new AdminOrchestratorError(
      statusToErrorCode(response.status),
      readErrorMessage(payload) ?? 'Orchestrator mutation failed',
      payload,
    );
  }

  const parsed = adminMutationResultSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AdminOrchestratorError(
      'UNAVAILABLE',
      'Orchestrator returned an invalid mutation response',
      parsed.error,
    );
  }

  return parsed.data;
}

async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function readErrorMessage(payload: unknown): string | null {
  if (
    typeof payload === 'object'
    && payload !== null
    && 'message' in payload
    && typeof payload.message === 'string'
  ) {
    return payload.message;
  }

  return null;
}

function statusToErrorCode(status: number): AdminOrchestratorErrorCode {
  if (status === 400) {
    return 'BAD_REQUEST';
  }

  if (status === 404) {
    return 'NOT_FOUND';
  }

  if (status === 409) {
    return 'CONFLICT';
  }

  return 'UNAVAILABLE';
}

function unavailable(name: string): Promise<never> {
  return Promise.reject(
    new AdminOrchestratorError(
      'UNAVAILABLE',
      `Orchestrator HTTP client does not implement ${name}`,
    ),
  );
}
