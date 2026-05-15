import { NextResponse } from 'next/server';

import {
  getAdminSession,
  type AdminSession,
} from './auth/admin';
import {
  AdminOrchestratorError,
  type AdminOrchestratorClient,
  createHttpAdminOrchestratorClient,
} from './trpc/admin-orchestrator';

export interface MergePrRequestOptions {
  getSession?: () => Promise<AdminSession | null>;
  orchestrator?: AdminOrchestratorClient;
}

export async function handleMergePrRequest(
  request: Request,
  options: MergePrRequestOptions = {},
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

  const prNumber = await readPrNumber(request);
  if (prNumber === null) {
    return NextResponse.json(
      {
        code: 'BAD_REQUEST',
        message: 'Valid prNumber is required',
      },
      { status: 400 },
    );
  }

  const orchestrator = options.orchestrator ?? createHttpAdminOrchestratorClient();

  try {
    const result = await orchestrator.prMerge({
      actorUserId: session.user.id,
      prNumber,
    });

    if (isFormRequest(request)) {
      return NextResponse.redirect(
        new URL('/admin/orchestrator?mode=pr-queue', request.url),
        { status: 303 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function readPrNumber(request: Request): Promise<number | null> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return readPrNumberFromJson(await request.json().catch(() => null));
  }

  const formData = await request.formData().catch(() => null);
  if (formData === null) {
    return null;
  }

  return readPositiveInteger(formData.get('prNumber'));
}

function readPrNumberFromJson(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null || !('prNumber' in payload)) {
    return null;
  }

  return readPositiveInteger(payload.prNumber);
}

function readPositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
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
      message: 'Failed to merge pull request',
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
