import { handleOrchestratorControlRequest } from '@/server/orchestrator-control-route';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleOrchestratorControlRequest(request);
}
