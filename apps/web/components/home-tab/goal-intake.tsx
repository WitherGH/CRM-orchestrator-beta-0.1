'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { VaultProject } from '../../server/vault-fs';

/**
 * The Home tab's single main action: describe a product goal in one field.
 * Submits to the existing human-request API with the full pipeline enabled on
 * default models; the detailed intake form stays in the ops console.
 */
export interface GoalRequestPayload {
  brief: string;
  humanNotes: null;
  labels: string[];
  priority: 'P1';
  projectId: string | null;
  roles: Array<{ enabled: boolean; model: string; role: string }>;
  targetArea: null;
  title: string;
}

export type GoalPayloadResult =
  | { error: string; ok: false }
  | { ok: true; payload: GoalRequestPayload };

const MIN_GOAL_LENGTH = 10;
const MAX_TITLE_LENGTH = 140;

const defaultPipelineRoles: GoalRequestPayload['roles'] = [
  { enabled: true, model: 'opus', role: 'architect' },
  { enabled: true, model: 'sonnet', role: 'pm' },
  { enabled: true, model: 'sonnet', role: 'designer' },
  { enabled: true, model: 'gpt-5.5', role: 'developer' },
  { enabled: true, model: 'opus', role: 'reviewer' },
  { enabled: true, model: 'gpt-5.5', role: 'tester' },
];

export function buildGoalRequestPayload(
  goal: string,
  projectId: string | null,
): GoalPayloadResult {
  const trimmed = goal.trim();
  if (trimmed.length < MIN_GOAL_LENGTH) {
    return {
      error: 'Describe the goal in at least a sentence so agents can break it down.',
      ok: false,
    };
  }

  const firstLine = trimmed.split('\n')[0]?.trim() ?? '';
  const title = firstLine.length > MAX_TITLE_LENGTH
    ? `${firstLine.slice(0, MAX_TITLE_LENGTH - 1)}…`
    : firstLine;

  return {
    ok: true,
    payload: {
      brief: trimmed,
      humanNotes: null,
      labels: [],
      priority: 'P1',
      projectId,
      roles: defaultPipelineRoles,
      targetArea: null,
      title,
    },
  };
}

type SubmitState = 'error' | 'idle' | 'submitted' | 'submitting';

export function GoalIntake({ projects }: { projects: readonly VaultProject[] }) {
  const router = useRouter();
  const [goal, setGoal] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [state, setState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const result = buildGoalRequestPayload(goal, projectId === '' ? null : projectId);
    if (!result.ok) {
      setState('error');
      setMessage(result.error);
      return;
    }

    setState('submitting');
    setMessage(null);

    try {
      const response = await fetch('/api/admin/orchestrator/requests', {
        body: JSON.stringify(result.payload),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'The orchestrator rejected the goal.');
      }

      setState('submitted');
      setMessage('Queued. The PM agent will break this down into tasks — watch the Build tab.');
      setGoal('');
      router.refresh();
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Something went wrong.');
    }
  }

  return (
    <form
      aria-label="Describe a goal"
      className="rounded-card border border-line bg-surface p-5 shadow-card"
      onSubmit={handleSubmit}
    >
      <label className="block">
        <span className="text-sm font-semibold text-ink">What should be built?</span>
        <textarea
          className="mt-2 w-full resize-y rounded-control border border-line bg-surface p-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          maxLength={8_000}
          minLength={MIN_GOAL_LENGTH}
          name="goal"
          onChange={(event) => setGoal(event.target.value)}
          placeholder="e.g. Landing page for X with a signup form, deployed with a preview link"
          required
          rows={3}
          value={goal}
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          Project
          <select
            className="rounded-control border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
            name="projectId"
            onChange={(event) => setProjectId(event.target.value)}
            value={projectId}
          >
            <option value="">Unscoped</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </label>

        <button
          className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-accent-strong disabled:opacity-50"
          disabled={state === 'submitting'}
          type="submit"
        >
          {state === 'submitting' ? 'Queueing…' : 'Send to agents'}
        </button>
      </div>

      {message !== null && (
        <p
          className={`mt-3 text-sm ${state === 'error' ? 'text-danger' : 'text-positive'}`}
          role="status"
        >
          {message}
        </p>
      )}
    </form>
  );
}
