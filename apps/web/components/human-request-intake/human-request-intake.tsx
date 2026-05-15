'use client';

import { useMemo, useState, type FormEvent } from 'react';

type RoleId = 'architect' | 'pm' | 'designer' | 'developer' | 'reviewer' | 'tester';
type Priority = 'P0' | 'P1' | 'P2' | 'P3';

interface RoleState {
  enabled: boolean;
  model: string;
  role: RoleId;
}

interface SubmitResult {
  message?: string;
  ok: true;
  requestId?: string | null;
  taskIds?: string[];
}

export interface HumanRequestIntakeProps {
  actionPath?: string;
  projectId?: string | null;
  projectTitle?: string | null;
}

const defaultActionPath = '/api/admin/orchestrator/requests';

const roleOrder: RoleId[] = [
  'architect',
  'pm',
  'designer',
  'developer',
  'reviewer',
  'tester',
];

const roleLabels: Record<RoleId, string> = {
  architect: 'Architect',
  developer: 'Developer',
  designer: 'Designer',
  pm: 'PM',
  reviewer: 'Reviewer',
  tester: 'Tester',
};

const roleDescriptions: Record<RoleId, string> = {
  architect: 'Architecture, constraints, ADR or spec impact',
  developer: 'Worktree implementation after upstream notes land',
  designer: 'UX requirements when UI is involved',
  pm: 'Executable task breakdown and dependencies',
  reviewer: 'PR inspection against vault, specs, and ADRs',
  tester: 'QA checks, defect reports, and verification',
};

const defaultRoles: RoleState[] = [
  { enabled: true, model: 'opus', role: 'architect' },
  { enabled: true, model: 'sonnet', role: 'pm' },
  { enabled: true, model: 'sonnet', role: 'designer' },
  { enabled: true, model: 'gpt-5.5', role: 'developer' },
  { enabled: true, model: 'opus', role: 'reviewer' },
  { enabled: true, model: 'gpt-5.5', role: 'tester' },
];

const modelOptions = [
  { model: 'opus', resetHint: 'limit resets 17:00 local' },
  { model: 'sonnet', resetHint: 'limit resets 17:00 local' },
  { model: 'gpt-5.5', resetHint: 'limit resets 17:00 local' },
  { model: 'gpt-5.4', resetHint: 'limit resets 17:00 local' },
];

const priorities: Array<{ label: string; value: Priority }> = [
  { label: 'P0', value: 'P0' },
  { label: 'P1', value: 'P1' },
  { label: 'P2', value: 'P2' },
  { label: 'P3', value: 'P3' },
];

const submitTimeoutMs = 60_000;

export function HumanRequestIntake({
  actionPath = defaultActionPath,
  projectId = null,
  projectTitle = null,
}: HumanRequestIntakeProps) {
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [priority, setPriority] = useState<Priority>('P1');
  const [labels, setLabels] = useState('crm, orchestrator');
  const [targetArea, setTargetArea] = useState('');
  const [humanNotes, setHumanNotes] = useState('');
  const [roles, setRoles] = useState<RoleState[]>(defaultRoles);
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const enabledRoles = useMemo(
    () => roleOrder
      .map((role) => roles.find((entry) => entry.role === role))
      .filter((role): role is RoleState => role !== undefined && role.enabled),
    [roles],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitState('submitting');
    setSubmitMessage(null);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
    }, submitTimeoutMs);

    try {
      const response = await fetch(actionPath, {
        body: JSON.stringify({
          brief,
          humanNotes,
          labels: parseLabels(labels),
          priority,
          projectId,
          roles,
          targetArea,
          title,
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
        signal: controller.signal,
      });
      const payload: unknown = await response.json();

      if (!response.ok || !isSubmitResult(payload)) {
        throw new Error(readErrorMessage(payload) ?? 'Request intake failed');
      }

      setSubmitState('success');
      setSubmitMessage(
        payload.taskIds === undefined || payload.taskIds.length === 0
          ? payload.message ?? 'Request submitted'
          : `Created ${payload.taskIds.join(', ')}`,
      );
    } catch (error) {
      setSubmitState('error');
      setSubmitMessage(readSubmitErrorMessage(error));
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return (
    <section className="orchestrator-intake" aria-labelledby="orchestrator-intake-title">
      <div className="orchestrator-intake-header">
        <div>
          <p className="orchestrator-label">Human request</p>
          <h2 className="orchestrator-intake-title" id="orchestrator-intake-title">
            Intake composer
          </h2>
        </div>
        <span className="orchestrator-card-meta">
          {enabledRoles.length} role pipeline
          {projectTitle === null ? '' : ` | ${projectTitle}`}
        </span>
      </div>

      <form
        action={actionPath}
        className="orchestrator-intake-form"
        method="post"
        onSubmit={handleSubmit}
      >
        {projectId === null ? null : (
          <input name="projectId" type="hidden" value={projectId} />
        )}
        <div className="orchestrator-intake-grid">
          <label className="orchestrator-field orchestrator-field-wide">
            <span className="orchestrator-label">Title</span>
            <input
              className="orchestrator-input"
              maxLength={140}
              minLength={3}
              name="title"
              onChange={(event) => setTitle(event.target.value)}
              required
              type="text"
              value={title}
            />
          </label>

          <label className="orchestrator-field">
            <span className="orchestrator-label">Priority</span>
            <select
              className="orchestrator-input"
              name="priority"
              onChange={(event) => setPriority(event.target.value as Priority)}
              value={priority}
            >
              {priorities.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="orchestrator-field">
            <span className="orchestrator-label">Target area</span>
            <input
              className="orchestrator-input"
              list="orchestrator-target-areas"
              name="targetArea"
              onChange={(event) => setTargetArea(event.target.value)}
              placeholder="optional"
              type="text"
              value={targetArea}
            />
          </label>

          <label className="orchestrator-field orchestrator-field-wide">
            <span className="orchestrator-label">Labels</span>
            <input
              className="orchestrator-input"
              name="labels"
              onChange={(event) => setLabels(event.target.value)}
              type="text"
              value={labels}
            />
          </label>

          <label className="orchestrator-field orchestrator-field-wide">
            <span className="orchestrator-label">Brief</span>
            <textarea
              className="orchestrator-textarea"
              maxLength={8_000}
              minLength={10}
              name="brief"
              onChange={(event) => setBrief(event.target.value)}
              required
              rows={5}
              value={brief}
            />
          </label>

          <label className="orchestrator-field orchestrator-field-wide">
            <span className="orchestrator-label">Human notes</span>
            <textarea
              className="orchestrator-textarea"
              maxLength={6_000}
              name="humanNotes"
              onChange={(event) => setHumanNotes(event.target.value)}
              rows={3}
              value={humanNotes}
            />
          </label>
        </div>

        <datalist id="orchestrator-model-options">
          {modelOptions.map((option) => (
            <option key={option.model} value={option.model} />
          ))}
        </datalist>
        <datalist id="orchestrator-target-areas">
          <option value="apps/web" />
          <option value="orchestrator" />
          <option value="packages/ui" />
          <option value="packages/db" />
          <option value="apps/bot" />
        </datalist>

        <div className="orchestrator-intake-pipeline">
          <div className="orchestrator-intake-subhead">
            <h3 className="orchestrator-panel-title">Planned role pipeline</h3>
            <span className="orchestrator-card-meta">depends_on chain</span>
          </div>

          <ol className="orchestrator-pipeline-list">
            {roleOrder.map((role) => {
              const entry = roles.find((candidate) => candidate.role === role) ?? defaultRoles[0];
              const enabledIndex = enabledRoles.findIndex((candidate) => candidate.role === role);
              const previousEnabled = enabledIndex > 0 ? enabledRoles[enabledIndex - 1] : null;

              return (
                <li
                  className="orchestrator-pipeline-row"
                  data-enabled={entry.enabled}
                  key={role}
                >
                  <label className="orchestrator-role-toggle">
                    <input
                      checked={entry.enabled}
                      name="roleEnabled"
                      onChange={(event) => updateRole(role, { enabled: event.target.checked })}
                      type="checkbox"
                      value={role}
                    />
                    <span>
                      <span className="orchestrator-pipeline-role">
                        {roleLabels[role]}
                      </span>
                      <span className="orchestrator-card-meta">
                        {roleDescriptions[role]}
                      </span>
                    </span>
                  </label>

                  <label className="orchestrator-model-select-label">
                    <span className="orchestrator-label">Model</span>
                    <input
                      className="orchestrator-model-select"
                      list="orchestrator-model-options"
                      name={`roleModel:${role}`}
                      onChange={(event) => updateRole(role, { model: event.target.value })}
                      value={entry.model}
                    />
                  </label>

                  <div className="orchestrator-pipeline-meta">
                    <span className="orchestrator-chip">
                      {entry.enabled ? 'enabled' : 'disabled'}
                    </span>
                    <span className="orchestrator-chip">
                      {previousEnabled === null ? 'depends on none' : `depends on ${roleLabels[previousEnabled.role]}`}
                    </span>
                    <span className="orchestrator-chip">
                      {modelResetHint(entry.model)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="orchestrator-intake-footer">
          <p className="orchestrator-card-meta" aria-live="polite">
            {submitMessage ?? 'Submission creates vault-backed backlog tasks through the orchestrator.'}
          </p>
          <button
            className="orchestrator-action orchestrator-primary-action"
            disabled={submitState === 'submitting' || enabledRoles.length === 0}
            type="submit"
          >
            {submitState === 'submitting' ? 'Submitting' : 'Submit request'}
          </button>
        </div>
      </form>
    </section>
  );

  function updateRole(role: RoleId, patch: Partial<RoleState>): void {
    setRoles((currentRoles) => currentRoles.map((entry) => (
      entry.role === role ? { ...entry, ...patch } : entry
    )));
  }
}

function modelResetHint(model: string): string {
  return modelOptions.find((option) => option.model === model)?.resetHint ?? 'limit reset unknown';
}

function parseLabels(value: string): string[] {
  return value
    .split(',')
    .map((label) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'))
    .map((label) => label.replace(/^-+|-+$/g, ''))
    .filter((label) => label !== '');
}

function isSubmitResult(value: unknown): value is SubmitResult {
  return (
    isRecord(value)
    && value.ok === true
    && (typeof value.message === 'string' || value.message === undefined)
    && (typeof value.requestId === 'string' || value.requestId === null || value.requestId === undefined)
    && (Array.isArray(value.taskIds) || value.taskIds === undefined)
  );
}

function readErrorMessage(value: unknown): string | null {
  if (isRecord(value) && typeof value.message === 'string') {
    return value.message;
  }

  return null;
}

function readSubmitErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Request timed out. It may still have created tasks; refresh the board before retrying.';
  }

  return error instanceof Error ? error.message : 'Request intake failed';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
