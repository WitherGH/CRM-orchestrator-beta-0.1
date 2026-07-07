import './product.css';

import { BurnMeter } from '@/components/build-tab/burn-meter';
import { ProductNav } from '@/components/product-shell/product-nav';
import { readBurnMeterData } from '@/server/cost-journal';

export const dynamic = 'force-dynamic';

export default async function ProductLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const burn = await readBurnMeterData();

  return (
    <div className="product-shell">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-3">
          <div className="flex items-center gap-8">
            <a className="text-base font-semibold tracking-tight text-ink" href="/home">
              Orchestrator
            </a>
            <ProductNav />
          </div>
          <BurnMeter capUsd={burn.capUsd} todayUsd={burn.todayUsd} />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
