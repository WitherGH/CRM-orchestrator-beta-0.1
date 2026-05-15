import { NextResponse } from 'next/server';

import {
  getAdminSession,
  type AdminSession,
} from './auth/admin';
import {
  VaultFsError,
  vaultFs,
} from './vault-fs';

export interface CreateProjectRouteOptions {
  getSession?: () => Promise<AdminSession | null>;
}

export async function handleCreateProjectRequest(
  request: Request,
  options: CreateProjectRouteOptions = {},
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
        message: 'Valid project payload is required',
      },
      { status: 400 },
    );
  }

  try {
    const project = await vaultFs.createProject(payload);

    if (isFormRequest(request)) {
      const url = new URL('/admin/orchestrator', request.url);
      url.searchParams.set('project', project.id);
      return NextResponse.redirect(url, { status: 303 });
    }

    return NextResponse.json({
      ok: true,
      project,
      requestId: project.id,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function readPayload(request: Request): Promise<{
  description: string;
  okr: string;
  title: string;
} | null> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = await request.json().catch(() => null) as unknown;
    return normalizePayload(payload);
  }

  const formData = await request.formData().catch(() => null);
  if (formData === null) {
    return null;
  }

  return normalizePayload({
    description: formData.get('description'),
    okr: formData.get('okr'),
    title: formData.get('title'),
  });
}

function normalizePayload(payload: unknown): {
  description: string;
  okr: string;
  title: string;
} | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const title = readString(payload, 'title');
  const description = readString(payload, 'description');
  const okr = readString(payload, 'okr');

  return title === null || description === null || okr === null
    ? null
    : { description, okr, title };
}

function readString(payload: object, key: string): string | null {
  if (!(key in payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function isFormRequest(request: Request): boolean {
  const contentType = request.headers.get('content-type') ?? '';
  return contentType.includes('application/x-www-form-urlencoded')
    || contentType.includes('multipart/form-data');
}

function toErrorResponse(error: unknown): Response {
  if (error instanceof VaultFsError) {
    return NextResponse.json(
      {
        code: error.code,
        message: error.message,
      },
      { status: error.code === 'NOT_FOUND' ? 404 : 400 },
    );
  }

  return NextResponse.json(
    {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create project',
    },
    { status: 500 },
  );
}
