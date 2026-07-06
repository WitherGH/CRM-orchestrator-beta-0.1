'use client';

import { usePathname } from 'next/navigation';

export interface ProductNavTab {
  href: string;
  label: string;
}

export const PRODUCT_NAV_TABS: readonly ProductNavTab[] = [
  { href: '/home', label: 'Home' },
  { href: '/build', label: 'Build' },
  { href: '/deploy', label: 'Deploy' },
  { href: '/market', label: 'Market' },
  { href: '/insights', label: 'Insights' },
];

export function ProductNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Product sections" className="flex items-center gap-1">
      {PRODUCT_NAV_TABS.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <a
            aria-current={isActive ? 'page' : undefined}
            className={`rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-accent-soft text-accent-strong'
                : 'text-ink-secondary hover:bg-sunken hover:text-ink'
            }`}
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}
