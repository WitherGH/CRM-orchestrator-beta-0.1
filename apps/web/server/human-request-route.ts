import { NextResponse } from 'next/server';

import {
  getAdminSession,
  type AdminSession,
} from './auth/admin';
import {
  AdminOrchestratorError,
  createHttpAdminOrchestratorClient,
  humanRequestCreateSchema,
  type AdminOrchestratorClient,
} from './trpc/admin-orchestrator';

export interface CreateHumanRequestRouteOptions {
  getSession?: () => Promise<AdminSession | null>;
  orchestrator?: AdminOrchestratorClient;
}

const roleOrder = [
  'architect',
  'pm',
  'designer',
  'developer',
  'reviewer',
  'tester',
] as const;

export async function handleCreateHumanRequest(
  request: Request,
  options: CreateHumanRequestRouteOptions = {},
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
  const parsed = humanRequestCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        code: 'BAD_REQUEST',
        message: 'Valid human request payload is required',
      },
      { status: 400 },
    );
  }

  const orchestrator = options.orchestrator ?? createHttpAdminOrchestratorClient();

  try {
    const result = await orchestrator.createHumanRequest({
      actorUserId: session.user.id,
      ...parsed.data,
    });

    if (isFormRequest(request)) {
      const url = new URL('/admin/orchestrator', request.url);
      if (parsed.data.projectId !== null && parsed.data.projectId !== undefined) {
        url.searchParams.set('project', parsed.data.projectId);
      }
      url.searchParams.set('request', result.requestId ?? 'created');
      return NextResponse.redirect(url, { status: 303 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function readPayload(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return await request.json().catch(() => null) as unknown;
  }

  const formData = await request.formData().catch(() => null);
  if (formData === null) {
    return null;
  }

  return readPayloadFromForm(formData);
}

function readPayloadFromForm(formData: FormData): unknown {
  const enabledRoles = new Set(formData.getAll('roleEnabled').map(String));

  return {
    brief: readString(formData.get('brief')),
    humanNotes: readString(formData.get('humanNotes')),
    labels: parseLabels(readString(formData.get('labels'))),
    priority: readString(formData.get('priority')),
    projectId: readString(formData.get('projectId')),
    roles: roleOrder.map((role) => ({
      enabled: enabledRoles.has(role),
      model: readString(formData.get(`roleModel:${role}`)),
      role,
    })),
    targetArea: readString(formData.get('targetArea')),
    title: readString(formData.get('title')),
  };
}

function parseLabels(value: string): string[] {
  return value
    .split(',')
    .map((label) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'))
    .map((label) => label.replace(/^-+|-+$/g, ''))
    .filter((label) => label !== '');
}

function readString(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

function isFormRequest(request: Request): boolean {
  return (request.headers.get('content-type') ?? '').includes('application/x-www-form-urlencoded');
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
      message: 'Failed to create human request',
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
