import type { Metadata } from 'next';

import { ComingSoon } from '@/components/product-shell/coming-soon';
import { requireAdminSession } from '@/server/auth/admin';

export const metadata: Metadata = {
  title: 'Home | Orchestrator',
};

export default async function HomePage() {
  await requireAdminSession();

  return (
    <ComingSoon
      description="Describe a product as one goal and watch agents break it down and build it. Until then, goal intake lives in the ops console."
      phaseLabel="Coming after Build"
      title="Home"
    />
  );
}
