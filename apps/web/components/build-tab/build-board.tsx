'use client';

import { useState } from 'react';

import type { VaultTask } from '../../server/vault-fs';

import {
  BUILD_BADGE_LABELS,
  type BuildColumn,
  type BuildTaskBadge,
  type BuildTaskCard,
} from './build-columns';
import { TaskActions } from './task-actions';
import { extractAgentQuestion } from './task-question';
import { readTaskPr } from './task-pr';

interface BuildBoardProps {
  columns: BuildColumn[];
  roleEstimatesUsd?: Record<string, number>;
}

const badgeToneClass: Record<BuildTaskBadge, string> = {
  error: 'bg-danger-soft text-danger',
  'merge-ready': 'bg-positive-soft text-positive',
  question: 'bg-warning-soft text-warning',
};

const priorityToneClass: Record<string, string> = {
  P0: 'text-danger',
  P1: 'text-warning',
};

export function BuildBoard({ columns, roleEstimatesUsd = {} }: BuildBoardProps) {
  const [selectedTask, setSelectedTask] = useState<VaultTask | null>(null);

  return (
    <div className="relative">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((column) => (
          <section
            aria-label={`${column.label} column`}
            className="flex min-h-64 flex-col gap-3 rounded-card bg-sunken p-3"
            key={column.key}
          >
            <header className="flex items-baseline justify-between px-1">
              <h2 className="text-sm font-semibold text-ink">{column.label}</h2>
              <span className="text-xs text-ink-faint">
                {column.cards.length === column.totalCount
                  ? column.totalCount
                  : `${column.cards.length} of ${column.totalCount}`}
              </span>
            </header>

            {column.cards.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-ink-faint">{column.emptyLabel}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {column.cards.map((card) => (
                  <TaskCard card={card} key={card.task.id} onSelect={setSelectedTask} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {selectedTask !== null && (
        <TaskDrawer
          estimateUsd={
            selectedTask.status === 'backlog'
              ? roleEstimatesUsd[selectedTask.assignee] ?? null
              : null
          }
          onClose={() => setSelectedTask(null)}
          task={selectedTask}
        />
      )}
    </div>
  );
}

function TaskCard({
  card,
  onSelect,
}: {
  card: BuildTaskCard;
  onSelect: (task: VaultTask) => void;
}) {
  const { badge, task } = card;
  const question = badge === 'question' ? extractAgentQuestion(task.body) : null;
  const taskPr = badge === 'merge-ready' ? readTaskPr(task) : null;

  return (
    <li>
      <button
        className="w-full rounded-card border border-line bg-surface p-3 text-left shadow-card transition-colors hover:border-accent"
        onClick={() => onSelect(task)}
        type="button"
      >
        <p className="flex items-center justify-between gap-2 text-xs text-ink-faint">
          <span className="font-mono">{task.id}</span>
          <span className={priorityToneClass[task.priority] ?? 'text-ink-faint'}>
            {task.priority}
          </span>
        </p>
        <p className="mt-1 text-sm font-medium text-ink">{task.title}</p>
        {badge !== null && (
          <span
            className={`mt-2 inline-block rounded-pill px-2 py-0.5 text-xs font-medium ${badgeToneClass[badge]}`}
          >
            {BUILD_BADGE_LABELS[badge]}
            {taskPr !== null && ` · #${taskPr.prNumber}`}
          </span>
        )}
        {question !== null && (
          <p className="mt-2 line-clamp-2 border-l-2 border-warning pl-2 text-xs text-ink-secondary">
            {question}
          </p>
        )}
      </button>
    </li>
  );
}

function TaskDrawer({
  estimateUsd,
  onClose,
  task,
}: {
  estimateUsd: number | null;
  onClose: () => void;
  task: VaultTask;
}) {
  return (
    <div aria-modal="true" className="fixed inset-0 z-50" role="dialog">
      <button
        aria-label="Close task details"
        className="absolute inset-0 cursor-default bg-ink/20"
        onClick={onClose}
        type="button"
      />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col gap-4 overflow-y-auto bg-surface p-6 shadow-drawer">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-ink-faint">{task.id}</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">{task.title}</h2>
          </div>
          <button
            aria-label="Close"
            className="rounded-control px-2 py-1 text-ink-faint hover:bg-sunken hover:text-ink"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </header>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <DrawerFact label="Status" value={task.status} />
          <DrawerFact label="Priority" value={task.priority} />
          <DrawerFact label="Agent" value={task.assignee} />
          <DrawerFact label="Effort" value={task.effort ?? '—'} />
          {task.dependsOn.length > 0 && (
            <DrawerFact label="Depends on" value={task.dependsOn.join(', ')} />
          )}
          {task.flagged && <DrawerFact label="Flagged" value="yes — needs a human look" />}
          {estimateUsd !== null && (
            <DrawerFact
              label="Estimated run cost"
              value={`≈ $${estimateUsd.toFixed(2)} (from prior runs)`}
            />
          )}
        </dl>

        <TaskActions onDone={onClose} task={task} />

        {task.body.trim() !== '' && (
          <section aria-label="Task description">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Description
            </h3>
            <pre className="mt-2 whitespace-pre-wrap rounded-card bg-sunken p-3 font-sans text-sm text-ink-secondary">
              {task.body.trim()}
            </pre>
          </section>
        )}

        <footer className="mt-auto border-t border-line pt-4">
          <a
            className="text-sm font-medium text-accent hover:text-accent-strong"
            href={`/admin/orchestrator?vault=${encodeURIComponent(task.path)}`}
          >
            Open in ops console →
          </a>
        </footer>
      </aside>
    </div>
  );
}

function DrawerFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="m-0 text-ink-secondary">{value}</dd>
    </div>
  );
}
