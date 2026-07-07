import type { Metadata } from 'next';

import { ComingSoon } from '@/components/product-shell/coming-soon';
import { requireAdminSession } from '@/server/auth/admin';

export const metadata: Metadata = {
  title: 'Market | Orchestrator',
};

export default async function MarketPage() {
  await requireAdminSession();

  return (
    <ComingSoon
      description="Creatives, campaigns, and UTM links for the product you just shipped. Arrives with Phase 3."
      phaseLabel="Phase 3"
      title="Market"
    />
  );
}
