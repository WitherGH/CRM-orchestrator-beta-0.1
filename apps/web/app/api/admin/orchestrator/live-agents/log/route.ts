import { NextResponse } from 'next/server';

import { getAdminSession } from '@/server/auth/admin';
import { readLiveAgentLog } from '@/server/live-agent-state';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getAdminSession();

  if (session === null) {
    return NextResponse.json(
      {
        code: 'NOT_FOUND',
        message: 'Admin route not found',
      },
      { status: 404 },
    );
  }

  const taskId = new URL(request.url).searchParams.get('taskId');
  if (taskId === null || !/^T-\d{3,}$/.test(taskId)) {
    return NextResponse.json(
      {
        code: 'BAD_REQUEST',
        message: 'Valid taskId is required',
      },
      { status: 400 },
    );
  }

  const log = await readLiveAgentLog(taskId);
  if (log === null) {
    return new NextResponse(
      [
        `No live log has been written for ${taskId} yet.`,
        '',
        'This usually means the task was marked in-progress before the agent process created its worktree log, or the process already ended without a captured log.',
      ].join('\n'),
      {
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/plain; charset=utf-8',
        },
      },
    );
  }

  return new NextResponse(log.content, {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
      'x-orchestrator-log-path': log.logPath,
    },
  });
}
