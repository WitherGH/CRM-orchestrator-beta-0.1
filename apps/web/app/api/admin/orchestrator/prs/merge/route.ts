import { handleMergePrRequest } from '@/server/pr-merge-route';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleMergePrRequest(request);
}
