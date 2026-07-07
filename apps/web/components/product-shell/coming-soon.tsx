export interface ComingSoonProps {
  description: string;
  phaseLabel: string;
  title: string;
}

export function ComingSoon({ description, phaseLabel, title }: ComingSoonProps) {
  return (
    <section className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-card border border-line bg-surface px-8 py-16 text-center shadow-card">
      <span className="rounded-pill bg-accent-soft px-3 py-1 text-xs font-medium text-accent-strong">
        {phaseLabel}
      </span>
      <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="text-sm text-ink-secondary">{description}</p>
      <a className="mt-2 text-sm font-medium text-accent hover:text-accent-strong" href="/build">
        Go to Build →
      </a>
    </section>
  );
}
