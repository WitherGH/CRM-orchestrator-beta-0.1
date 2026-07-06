import type { Metadata } from 'next';

import { ComingSoon } from '@/components/product-shell/coming-soon';
import { requireAdminSession } from '@/server/auth/admin';

export const metadata: Metadata = {
  title: 'Deploy | Orchestrator',
};

export default async function DeployPage() {
  await requireAdminSession();

  return (
    <ComingSoon
      description="One-click deploys with preview URLs per pull request. Arrives with Phase 2."
      phaseLabel="Phase 2"
      title="Deploy"
    />
  );
}
