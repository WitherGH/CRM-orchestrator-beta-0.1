import { NextResponse } from 'next/server';

import { getAdminSession } from '@/server/auth/admin';
import { readLiveAgentSnapshot } from '@/server/live-agent-state';
import { vaultFs } from '@/server/vault-fs';

export const dynamic = 'force-dynamic';

export async function GET() {
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

  const tasks = await vaultFs.listTasks();
  const snapshot = await readLiveAgentSnapshot({ tasks });

  return NextResponse.json(snapshot, {
    headers: {
      'cache-control': 'no-store',
    },
  });
}
