import type { OrchestratorStatusReadResult } from '../../server/orchestrator-status';
import type { VaultTask } from '../../server/vault-fs';

export interface AutomationControlPanelProps {
  now?: Date;
  projectId?: string | null;
  projectTitle?: string | null;
  status: OrchestratorStatusReadResult;
  tasks: readonly VaultTask[];
}

interface AutomationWindowSummary {
  failed: number;
  finished: number;
  hours: 1 | 2 | 4;
  inProgress: number;
  review: number;
  touched: number;
}

const controlActionPath = '/api/admin/orchestrator/control';
const summaryWindows = [1, 2, 4] as const;

export function AutomationControlPanel({
  now = new Date(),
  projectId = null,
  projectTitle = null,
  status,
  tasks,
}: AutomationControlPanelProps) {
  const runtime = status.snapshot?.runtime ?? null;
  const active = runtime?.daemonRunning === true || (runtime?.activeLaunches ?? 0) > 0;
  const summaries = buildAutomationWindowSummaries(tasks, now);
  const recentTasks = [...tasks]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 4);

  return (
    <section className="orchestrator-panel orchestrator-automation-panel" aria-labelledby="orchestrator-automation-title">
      <div className="orchestrator-panel-header">
        <div>
          <h2 className="orchestrator-panel-title" id="orchestrator-automation-title">
            Automation
          </h2>
          <p className="orchestrator-card-meta">
            {status.online ? 'control plane online' : status.message ?? 'control plane offline'}
            {projectTitle === null ? '' : ` | ${projectTitle}`}
          </p>
        </div>
        <span
          className="orchestrator-status-dot"
          data-tone={active ? 'positive' : status.online ? 'neutral' : 'critical'}
        />
      </div>

      <div className="orchestrator-panel-body">
        <div className="orchestrator-automation-actions" aria-label="Automation controls">
          <ControlForm action="tick-run" label="Run tick" projectId={projectId} />
          <ControlForm action="automation-start" label="Start auto" projectId={projectId} />
          <ControlForm action="automation-stop" label="Stop" tone="secondary" />
        </div>

        <dl className="orchestrator-automation-runtime">
          <RuntimeField label="Daemon" value={runtime?.daemonRunning === true ? 'running' : 'stopped'} />
          <RuntimeField label="Active" value={String(runtime?.activeLaunches ?? 0)} />
          <RuntimeField label="Last tick" value={formatRuntimeStamp(runtime?.lastTickFinishedAt ?? runtime?.lastTickStartedAt)} />
          <RuntimeField label="Last error" value={runtime?.lastTickError ?? 'none'} />
        </dl>

        <div className="orchestrator-automation-summary" aria-label="Recent automation summary">
          {summaries.map((summary) => (
            <article className="orchestrator-automation-window" key={summary.hours}>
              <span className="orchestrator-label">Last {summary.hours}h</span>
              <p className="orchestrator-automation-window-main">
                {summary.touched} touched
              </p>
              <p className="orchestrator-card-meta">
                {summary.finished} done / {summary.review} review / {summary.failed} failed
              </p>
            </article>
          ))}
        </div>

        <div className="orchestrator-automation-recent">
          <p className="orchestrator-label">Recent task movement</p>
          {recentTasks.length > 0 ? (
            <ul className="orchestrator-automation-task-list">
              {recentTasks.map((task) => (
                <li className="orchestrator-automation-task" key={task.id}>
                  <span>
                    <span className="orchestrator-task-id">{task.id}</span> {task.title}
                  </span>
                  <span className="orchestrator-chip">{task.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="orchestrator-empty">No task movement yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function buildAutomationWindowSummaries(
  tasks: readonly VaultTask[],
  now = new Date(),
): AutomationWindowSummary[] {
  return summaryWindows.map((hours) => {
    const cutoff = now.getTime() - hours * 60 * 60_000;
    const touched = tasks.filter((task) => readTaskTimestamp(task) >= cutoff);

    return {
      failed: touched.filter((task) => task.status === 'failed').length,
      finished: touched.filter((task) => task.status === 'done').length,
      hours,
      inProgress: touched.filter((task) => task.status === 'in-progress').length,
      review: touched.filter((task) => task.status === 'review' || task.status === 'merge-ready').length,
      touched: touched.length,
    };
  });
}

function ControlForm({
  action,
  label,
  projectId = null,
  tone = 'primary',
}: {
  action: string;
  label: string;
  projectId?: string | null;
  tone?: 'primary' | 'secondary';
}) {
  return (
    <form action={controlActionPath} method="post">
      <input name="action" type="hidden" value={action} />
      {projectId === null ? null : (
        <input name="projectId" type="hidden" value={projectId} />
      )}
      <button
        className={tone === 'primary' ? 'orchestrator-action orchestrator-primary-action' : 'orchestrator-action'}
        type="submit"
      >
        {label}
      </button>
    </form>
  );
}

function RuntimeField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatRuntimeStamp(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return 'never';
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Date(timestamp).toISOString().slice(11, 16);
}

function readTaskTimestamp(task: VaultTask): number {
  const updatedAt = Date.parse(task.updatedAt);
  if (!Number.isNaN(updatedAt)) {
    return updatedAt;
  }

  const created = Date.parse(task.created);
  return Number.isNaN(created) ? 0 : created;
}
