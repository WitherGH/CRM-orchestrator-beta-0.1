import type { Metadata } from 'next';

import { formatUsd } from '@/components/build-tab/agent-feed';
import { GoalIntake } from '@/components/home-tab/goal-intake';
import {
  buildHomeProjectCards,
  type HomeProjectCard,
} from '@/components/home-tab/home-projects';
import { requireAdminSession } from '@/server/auth/admin';
import { readCostJournalSummary } from '@/server/cost-journal';
import { vaultFs } from '@/server/vault-fs';

export const metadata: Metadata = {
  title: 'Home | Orchestrator',
};

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  await requireAdminSession();

  const [tasks, projects, costSummary] = await Promise.all([
    vaultFs.listTasks(),
    vaultFs.listProjects(),
    readCostJournalSummary(),
  ]);
  const cards = buildHomeProjectCards({
    projects,
    taskCostsUsd: costSummary.taskCostsUsd,
    tasks,
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          What are we building next?
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Describe a goal in one message — agents break it down, build it, and you approve merges.
        </p>
      </header>

      <GoalIntake projects={projects} />

      <section aria-label="Projects" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ink">Projects</h2>
        {cards.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-5 text-sm text-ink-faint shadow-card">
            No projects yet. Send a goal above, or create a project in the ops console to scope work.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {cards.map((card) => (
              <ProjectCard card={card} key={card.id} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProjectCard({ card }: { card: HomeProjectCard }) {
  return (
    <li>
      <a
        className="block rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-accent"
        href="/build"
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-ink">{card.title}</p>
          <span className="shrink-0 font-mono text-xs text-ink-faint">
            {formatUsd(card.todayUsd)} today
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-secondary">{card.description}</p>

        <div className="mt-3 flex items-center gap-3">
          <span
            aria-label={`${card.progressPercent}% of tasks done`}
            className="h-1.5 grow overflow-hidden rounded-pill bg-sunken"
          >
            <span
              className="block h-full rounded-pill bg-accent"
              style={{ width: `${card.progressPercent}%` }}
            />
          </span>
          <span className="shrink-0 text-xs text-ink-faint">
            {card.doneCount}/{card.taskCount} done
          </span>
        </div>

        <p className="mt-2 flex gap-4 text-xs text-ink-faint">
          {card.workingCount > 0 && (
            <span className="text-positive">{card.workingCount} working</span>
          )}
          {card.attentionCount > 0 && (
            <span className="text-warning">{card.attentionCount} need you</span>
          )}
          {card.status !== 'active' && <span>{card.status}</span>}
        </p>
      </a>
    </li>
  );
}
