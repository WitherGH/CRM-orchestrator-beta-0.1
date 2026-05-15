import { NextResponse } from 'next/server';

import {
  getAdminSession,
  type AdminSession,
} from './auth/admin';
import {
  AdminOrchestratorError,
  createHttpAdminOrchestratorClient,
  type AdminMutationResult,
  type AdminOrchestratorClient,
} from './trpc/admin-orchestrator';
import {
  AGENT_ROLES,
  TASK_STATUSES,
  type AgentRole,
  type TaskStatus,
} from './vault-fs';

export interface OrchestratorControlRouteOptions {
  getSession?: () => Promise<AdminSession | null>;
  orchestrator?: AdminOrchestratorClient;
}

type ControlAction =
  | 'agent-model'
  | 'automation-start'
  | 'automation-stop'
  | 'pr-merge-ready'
  | 'task-delete'
  | 'task-edit'
  | 'task-kill'
  | 'task-run'
  | 'task-status'
  | 'tick-run';

interface ControlPayload {
  action: ControlAction;
  body: string | null;
  model: string | null;
  projectId: string | null;
  role: AgentRole | null;
  status: TaskStatus | null;
  taskId: string | null;
  title: string | null;
}

export async function handleOrchestratorControlRequest(
  request: Request,
  options: OrchestratorControlRouteOptions = {},
): Promise<Response> {
  const session = await (options.getSession ?? getAdminSession)();

  if (session === null) {
    return NextResponse.json(
      {
        code: 'NOT_FOUND',
        message: 'Admin route not found',
      },
      { status: 404 },
    );
  }

  const payload = await readPayload(request);
  if (payload === null) {
    return NextResponse.json(
      {
        code: 'BAD_REQUEST',
        message: 'Valid orchestrator action payload is required',
      },
      { status: 400 },
    );
  }

  const orchestrator = options.orchestrator ?? createHttpAdminOrchestratorClient();

  try {
    const result = await executeControlAction(payload, session.user.id, orchestrator);

    if (isFormRequest(request)) {
      return NextResponse.redirect(
        buildFormRedirectUrl(request, payload),
        { status: 303 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function executeControlAction(
  payload: ControlPayload,
  actorUserId: string,
  orchestrator: AdminOrchestratorClient,
): Promise<AdminMutationResult> {
  const actorInput = payload.projectId === null
    ? { actorUserId }
    : { actorUserId, projectId: payload.projectId };

  if (payload.action === 'tick-run') {
    return orchestrator.tickRun(actorInput);
  }

  if (payload.action === 'automation-start') {
    return orchestrator.automationStart(actorInput);
  }

  if (payload.action === 'automation-stop') {
    return orchestrator.automationStop({ actorUserId });
  }

  if (payload.action === 'pr-merge-ready') {
    return orchestrator.prMergeReady(actorInput);
  }

  if (payload.action === 'agent-model') {
    if (payload.role === null || payload.model === null) {
      throw new AdminOrchestratorError('BAD_REQUEST', 'Valid agent role and model are required');
    }

    return orchestrator.agentModelSet({
      actorUserId,
      model: payload.model,
      role: payload.role,
    });
  }

  if (payload.taskId === null) {
    throw new AdminOrchestratorError('BAD_REQUEST', 'Valid taskId is required');
  }

  if (payload.action === 'task-run') {
    return orchestrator.tickRun({
      ...actorInput,
      taskId: payload.taskId,
    });
  }

  if (payload.action === 'task-delete') {
    return orchestrator.taskDelete({
      ...actorInput,
      id: payload.taskId,
    });
  }

  if (payload.action === 'task-kill') {
    return orchestrator.taskKill({
      ...actorInput,
      id: payload.taskId,
    });
  }

  if (payload.action === 'task-edit') {
    if (payload.title === null && payload.body === null) {
      throw new AdminOrchestratorError('BAD_REQUEST', 'Task title or body is required');
    }

    return orchestrator.taskUpdate({
      ...actorInput,
      body: payload.body ?? undefined,
      id: payload.taskId,
      title: payload.title ?? undefined,
    });
  }

  if (payload.status === null) {
    throw new AdminOrchestratorError('BAD_REQUEST', 'Valid task status is required');
  }

  return orchestrator.taskStatusSet({
    ...actorInput,
    flagged: payload.status === 'failed' ? undefined : false,
    id: payload.taskId,
    status: payload.status,
  });
}

async function readPayload(request: Request): Promise<ControlPayload | null> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return normalizePayload(await request.json().catch(() => null));
  }

  const formData = await request.formData().catch(() => null);
  if (formData === null) {
    return null;
  }

  return normalizePayload({
    action: formData.get('action'),
    model: formData.get('model'),
    projectId: formData.get('projectId'),
    role: formData.get('role'),
    status: formData.get('status'),
    taskId: formData.get('taskId'),
    title: formData.get('title'),
    body: formData.get('body'),
  });
}

function normalizePayload(payload: unknown): ControlPayload | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const action = readStringProperty(payload, 'action');
  if (!isControlAction(action)) {
    return null;
  }

  const taskId = readStringProperty(payload, 'taskId');
  const role = readStringProperty(payload, 'role');
  const model = readStringProperty(payload, 'model');
  const status = readStringProperty(payload, 'status');
  const projectId = readStringProperty(payload, 'projectId');
  const title = readStringProperty(payload, 'title');
  const body = readStringProperty(payload, 'body');

  return {
    action,
    body,
    model: isModelId(model) ? model : null,
    projectId: isProjectId(projectId) ? projectId : null,
    role: isAgentRole(role) ? role : null,
    status: isTaskStatus(status) ? status : null,
    taskId: taskId !== null && /^T-\d{3,}$/.test(taskId) ? taskId : null,
    title,
  };
}

function readStringProperty(payload: object, key: string): string | null {
  if (!(key in payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function isControlAction(value: string | null): value is ControlAction {
  return value === 'agent-model'
    || value === 'automation-start'
    || value === 'automation-stop'
    || value === 'pr-merge-ready'
    || value === 'task-delete'
    || value === 'task-edit'
    || value === 'task-kill'
    || value === 'task-run'
    || value === 'task-status'
    || value === 'tick-run';
}

function isProjectId(value: string | null): boolean {
  return value !== null
    && value.length <= 80
    && /^[a-z0-9][a-z0-9-]*$/.test(value);
}

function isTaskStatus(value: string | null): value is TaskStatus {
  return TASK_STATUSES.some((status) => status === value);
}

function isAgentRole(value: string | null): value is AgentRole {
  return AGENT_ROLES.some((role) => role === value);
}

function isModelId(value: string | null): boolean {
  return value !== null
    && value.length <= 80
    && /^[A-Za-z0-9._:-]+$/.test(value);
}

function isFormRequest(request: Request): boolean {
  return (request.headers.get('content-type') ?? '').includes('application/x-www-form-urlencoded')
    || (request.headers.get('content-type') ?? '').includes('multipart/form-data');
}

function buildFormRedirectUrl(request: Request, payload: ControlPayload): URL {
  const url = new URL('/admin/orchestrator', request.url);

  if (payload.action === 'pr-merge-ready') {
    url.searchParams.set('mode', 'pr-queue');
  }

  if (payload.projectId !== null) {
    url.searchParams.set('project', payload.projectId);
  }

  return url;
}

function toErrorResponse(error: unknown): Response {
  if (error instanceof AdminOrchestratorError) {
    return NextResponse.json(
      {
        code: error.code,
        message: error.message,
      },
      { status: errorCodeToStatus(error.code) },
    );
  }

  return NextResponse.json(
    {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to run orchestrator action',
    },
    { status: 500 },
  );
}

function errorCodeToStatus(code: AdminOrchestratorError['code']): number {
  if (code === 'BAD_REQUEST') {
    return 400;
  }

  if (code === 'NOT_FOUND') {
    return 404;
  }

  if (code === 'CONFLICT') {
    return 409;
  }

  return 503;
}
