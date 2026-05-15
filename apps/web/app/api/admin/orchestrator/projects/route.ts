import { handleCreateProjectRequest } from '@/server/project-route';

export async function POST(request: Request): Promise<Response> {
  return handleCreateProjectRequest(request);
}
