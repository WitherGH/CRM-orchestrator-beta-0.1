import type { Metadata } from 'next';

import { ComingSoon } from '@/components/product-shell/coming-soon';
import { requireAdminSession } from '@/server/auth/admin';

export const metadata: Metadata = {
  title: 'Insights | Orchestrator',
};

export default async function InsightsPage() {
  await requireAdminSession();

  return (
    <ComingSoon
      description="Product analytics, token spend, and unit economics on one screen. Cost detail lives in the ops console for now."
      phaseLabel="Phase 4"
      title="Insights"
    />
  );
}
