'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { VaultTask } from '../../server/vault-fs';

import { extractAgentQuestion } from './task-question';
import { readTaskPr } from './task-pr';

/**
 * Answer-in-UI flow for blocked questions (F0.6) plus merge approval and
 * requeue/retry: the answer is appended to the task body, then the task moves
 * back to backlog unflagged so the scheduler can relaunch it.
 */
const controlEndpoint = '/api/admin/orchestrator/control';
const mergeEndpoint = '/api/admin/orchestrator/prs/merge';

export function appendAnswerToBody(body: string, answer: string, dateIso: string): string {
  const day = dateIso.slice(0, 10);
  const trimmedBody = body.replace(/\s+$/, '');
  const section = `## Human answer (${day})\n\n${answer.trim()}`;

  return trimmedBody === '' ? `${section}\n` : `${trimmedBody}\n\n${section}\n`;
}

async function postJson(endpoint: string, payload: Record<string, unknown>): Promise<void> {
  const response = await fetch(endpoint, {
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? 'Orchestrator action failed');
  }
}

type ActionState = 'error' | 'idle' | 'working';

export function TaskActions({ onDone, task }: { onDone: () => void; task: VaultTask }) {
  const router = useRouter();
  const [answer, setAnswer] = useState('');
  const [state, setState] = useState<ActionState>('idle');
  const [error, setError] = useState<string | null>(null);

  const needsAnswer = task.status === 'blocked-question';
  const taskPr = readTaskPr(task);
  const canMerge = !needsAnswer && task.status === 'merge-ready' && taskPr !== null && !task.flagged;
  const canRequeue = !needsAnswer && !canMerge
    && (task.flagged || task.status === 'failed');

  if (!needsAnswer && !canMerge && !canRequeue) {
    return null;
  }

  const question = needsAnswer ? extractAgentQuestion(task.body) : null;

  async function run(action: () => Promise<void>): Promise<void> {
    setState('working');
    setError(null);
    try {
      await action();
      router.refresh();
      onDone();
    } catch (cause) {
      setState('error');
      setError(cause instanceof Error ? cause.message : 'Action failed');
    }
  }

  async function requeueTask(): Promise<void> {
    await postJson(controlEndpoint, {
      action: 'task-status',
      status: 'backlog',
      taskId: task.id,
    });
  }

  async function submitAnswer(): Promise<void> {
    await postJson(controlEndpoint, {
      action: 'task-edit',
      body: appendAnswerToBody(task.body, answer, new Date().toISOString()),
      taskId: task.id,
    });
    await requeueTask();
  }

  async function approveMerge(): Promise<void> {
    if (taskPr === null) {
      return;
    }

    await postJson(mergeEndpoint, { prNumber: taskPr.prNumber });
  }

  return (
    <section
      aria-label="Task actions"
      className="rounded-card border border-line bg-sunken p-4"
    >
      {needsAnswer ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(submitAnswer);
          }}
        >
          {question !== null && (
            <blockquote className="mb-3 whitespace-pre-wrap border-l-2 border-warning pl-3 text-sm text-ink-secondary">
              {question}
            </blockquote>
          )}
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              The agent asked a question — answer to unblock
            </span>
            <textarea
              className="mt-2 w-full resize-y rounded-control border border-line bg-surface p-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
              minLength={2}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Your answer gets added to the task and the agent picks it back up."
              required
              rows={3}
              value={answer}
            />
          </label>
          <button
            className="mt-3 rounded-control bg-accent px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-accent-strong disabled:opacity-50"
            disabled={state === 'working' || answer.trim().length < 2}
            type="submit"
          >
            {state === 'working' ? 'Sending…' : 'Answer & requeue'}
          </button>
        </form>
      ) : canMerge ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-secondary">
            {taskPr?.prUrl !== null && taskPr !== null ? (
              <a
                className="font-medium text-accent hover:text-accent-strong"
                href={taskPr.prUrl ?? undefined}
                rel="noreferrer"
                target="_blank"
              >
                PR #{taskPr.prNumber}
              </a>
            ) : (
              <span>PR #{taskPr?.prNumber}</span>
            )}{' '}
            is ready to merge.
          </p>
          <button
            className="shrink-0 rounded-control bg-accent px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-accent-strong disabled:opacity-50"
            disabled={state === 'working'}
            onClick={() => void run(approveMerge)}
            type="button"
          >
            {state === 'working' ? 'Merging…' : 'Approve merge'}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-secondary">
            {task.status === 'failed'
              ? 'This task failed. Requeue it for another attempt.'
              : 'This task is flagged and waiting for you.'}
          </p>
          <button
            className="shrink-0 rounded-control bg-accent px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-accent-strong disabled:opacity-50"
            disabled={state === 'working'}
            onClick={() => void run(requeueTask)}
            type="button"
          >
            {state === 'working' ? 'Requeueing…' : task.status === 'failed' ? 'Retry' : 'Unflag & requeue'}
          </button>
        </div>
      )}

      {error !== null && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
