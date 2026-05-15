import { handleCreateHumanRequest } from '@/server/human-request-route';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleCreateHumanRequest(request);
}
