'use client';

import { useEffect } from 'react';

import type { LiveAgentSnapshot } from '../../server/live-agent-state';
import type {
  AgentRole,
  TaskStatus,
  VaultTask,
} from '../../server/vault-fs';
import { VaultMarkdownRenderer } from '../vault-markdown-renderer/vault-markdown-renderer';

export interface TaskDetailDrawerProps {
  githubRepository?: string | null;
  isOpen: boolean;
  liveAgentSnapshot?: LiveAgentSnapshot;
  onClose: () => void;
  projectId?: string | null;
  task: VaultTask | null;
}

export interface TaskDetailLogLine {
  href: string | null;
  label: string;
  text: string;
}

export interface TaskDetailArtifact {
  detail: string;
  href: string | null;
  label: string;
  tone: 'file' | 'link';
}

export interface TaskDetailPrLink {
  href: string | null;
  label: string;
}

export interface TaskDetailViewModel {
  artifacts: TaskDetailArtifact[];
  assigneeLabel: string;
  createdLabel: string;
  dependsOn: string[];
  effortLabel: string;
  labels: string[];
  logLines: TaskDetailLogLine[];
  prLink: TaskDetailPrLink | null;
  specLabel: string;
  statusLabel: string;
  updatedLabel: string;
}

interface BuildTaskDetailViewModelOptions {
  githubRepository?: string | null;
  liveAgentSnapshot?: LiveAgentSnapshot;
}

const agentLabels: Record<AgentRole, string> = {
  architect: 'Architect',
  designer: 'Designer',
  developer: 'Developer',
  pm: 'PM',
  reviewer: 'Reviewer',
  tester: 'Tester',
};

const prUrlMetadataKeys = [
  'pr_url',
  'prUrl',
  'pull_request_url',
  'pullRequestUrl',
  'github_pr_url',
  'githubPrUrl',
] as const;

const prNumberMetadataKeys = [
  'pr_number',
  'prNumber',
  'pull_request',
  'pullRequest',
  'github_pr',
  'githubPr',
] as const;

const controlActionPath = '/api/admin/orchestrator/control';
const taskStatuses: TaskStatus[] = [
  'backlog',
  'in-progress',
  'blocked-question',
  'review',
  'merge-ready',
  'done',
  'failed',
];

export function TaskDetailDrawer({
  githubRepository,
  isOpen,
  liveAgentSnapshot,
  onClose,
  projectId = null,
  task,
}: TaskDetailDrawerProps) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || task === null) {
    return null;
  }

  const model = buildTaskDetailViewModel(task, {
    githubRepository,
    liveAgentSnapshot,
  });
  const taskFileHref = buildVaultFileHref(task.path);

  return (
    <div className="orchestrator-drawer-layer">
      <button
        aria-label="Close task detail"
        className="orchestrator-drawer-scrim"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="orchestrator-task-drawer-title"
        aria-modal="true"
        className="orchestrator-task-drawer"
        id="orchestrator-task-detail-drawer"
        role="dialog"
      >
        <header className="orchestrator-task-drawer-header">
          <div className="orchestrator-task-drawer-heading">
            <span className="orchestrator-label">Task detail</span>
            <h2 className="orchestrator-task-drawer-title" id="orchestrator-task-drawer-title">
              <span className="orchestrator-task-id">{task.id}</span> {task.title}
            </h2>
          </div>
          <button className="orchestrator-action" onClick={onClose} type="button">
            Close
          </button>
        </header>

        <div className="orchestrator-task-drawer-body">
          <section
            aria-label={`${task.id} task metadata`}
            className="orchestrator-task-drawer-section"
          >
            <div className="orchestrator-task-detail-grid">
              <TaskDetailField label="Project" value={task.projectId ?? 'unscoped'} />
              <TaskDetailField label="Status" value={model.statusLabel} />
              <TaskDetailField label="Assignee" value={model.assigneeLabel} />
              <TaskDetailField label="Priority" value={task.priority} />
              <TaskDetailField label="Effort" value={model.effortLabel} />
              <TaskDetailField label="Created" value={model.createdLabel} />
              <TaskDetailField label="Updated" value={model.updatedLabel} />
            </div>

            <div className="orchestrator-task-drawer-link-grid">
              <TaskDetailLinkedField
                href={null}
                label="Spec"
                value={model.specLabel}
              />
              <TaskDetailLinkedField
                href={model.prLink?.href ?? null}
                label="PR"
                value={model.prLink?.label ?? 'No PR linked'}
              />
              <TaskDetailLinkedField
                href={taskFileHref}
                label="Task file"
                value={task.path}
              />
            </div>

            <div className="orchestrator-chip-row" aria-label={`${task.id} labels and dependencies`}>
              {model.dependsOn.length > 0 ? (
                model.dependsOn.map((dependency) => (
                  <span className="orchestrator-chip" key={dependency}>
                    depends {dependency}
                  </span>
                ))
              ) : (
                <span className="orchestrator-chip">no dependencies</span>
              )}
              {model.labels.map((label) => (
                <span className="orchestrator-chip" key={label}>
                  {label}
                </span>
              ))}
              {task.flagged ? (
                <span className="orchestrator-chip" data-tone="alert">
                  flagged
                </span>
              ) : null}
            </div>
          </section>

          <section className="orchestrator-task-drawer-section">
            <h3 className="orchestrator-task-drawer-section-title">Manual controls</h3>
            <div className="orchestrator-task-control-grid">
              <form action={controlActionPath} className="orchestrator-task-control-form" method="post">
                <input name="action" type="hidden" value="task-run" />
                {projectId === null ? null : <input name="projectId" type="hidden" value={projectId} />}
                <input name="taskId" type="hidden" value={task.id} />
                <button className="orchestrator-action orchestrator-primary-action" type="submit">
                  Run task
                </button>
                <p className="orchestrator-card-meta">Launches this task through its assigned runner.</p>
              </form>

              <form action={controlActionPath} className="orchestrator-task-control-form" method="post">
                <input name="action" type="hidden" value="task-status" />
                {projectId === null ? null : <input name="projectId" type="hidden" value={projectId} />}
                <input name="taskId" type="hidden" value={task.id} />
                <label className="orchestrator-field">
                  <span className="orchestrator-label">Status</span>
                  <select className="orchestrator-input" defaultValue={task.status} name="status">
                    {taskStatuses.map((status) => (
                      <option key={status} value={status}>
                        {formatTaskStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="orchestrator-action" type="submit">
                  Update status
                </button>
              </form>

              <form
                action={controlActionPath}
                className="orchestrator-task-control-form"
                method="post"
                onSubmit={(event) => {
                  if (!window.confirm(`Delete ${task.id} from the vault?`)) {
                    event.preventDefault();
                  }
                }}
              >
                <input name="action" type="hidden" value="task-delete" />
                {projectId === null ? null : <input name="projectId" type="hidden" value={projectId} />}
                <input name="taskId" type="hidden" value={task.id} />
                <button className="orchestrator-action" type="submit">
                  Delete task
                </button>
                <p className="orchestrator-card-meta">Removes the task markdown. Worktrees and branches stay intact.</p>
              </form>
            </div>
          </section>

          <section className="orchestrator-task-drawer-section">
            <h3 className="orchestrator-task-drawer-section-title">Edit task</h3>
            <form action={controlActionPath} className="orchestrator-task-edit-form" method="post">
              <input name="action" type="hidden" value="task-edit" />
              {projectId === null ? null : <input name="projectId" type="hidden" value={projectId} />}
              <input name="taskId" type="hidden" value={task.id} />
              <label className="orchestrator-field">
                <span className="orchestrator-label">Title</span>
                <input className="orchestrator-input" defaultValue={task.title} maxLength={180} minLength={3} name="title" />
              </label>
              <label className="orchestrator-field">
                <span className="orchestrator-label">Description</span>
                <textarea className="orchestrator-textarea" defaultValue={task.body} maxLength={20_000} name="body" rows={8} />
              </label>
              <button className="orchestrator-action" type="submit">
                Save task
              </button>
            </form>
          </section>

          <section className="orchestrator-task-drawer-section">
            <h3 className="orchestrator-task-drawer-section-title">Artifacts</h3>
            {model.artifacts.length > 0 ? (
              <ul className="orchestrator-task-artifact-list">
                {model.artifacts.map((artifact) => (
                  <li
                    className="orchestrator-task-artifact-item"
                    data-tone={artifact.tone}
                    key={`${artifact.label}-${artifact.detail}`}
                  >
                    <span className="orchestrator-card-meta">{artifact.label}</span>
                    {artifact.href === null ? (
                      <span className="orchestrator-task-artifact-path">{artifact.detail}</span>
                    ) : (
                      <a
                        className="orchestrator-task-artifact-path"
                        href={artifact.href}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {artifact.detail}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="orchestrator-empty">No artifacts attached.</p>
            )}
          </section>

          <section className="orchestrator-task-drawer-section">
            <h3 className="orchestrator-task-drawer-section-title">Recent log lines</h3>
            {model.logLines.length > 0 ? (
              <ul className="orchestrator-task-log-list">
                {model.logLines.map((line) => (
                  <li className="orchestrator-task-log-item" key={`${line.label}-${line.text}`}>
                    <p className="orchestrator-card-meta">{line.label}</p>
                    <p className="orchestrator-task-log-text">{line.text}</p>
                    {line.href === null ? null : (
                      <a
                        className="orchestrator-task-log-link"
                        href={line.href}
                        rel="noreferrer"
                        target="_blank"
                      >
                        View full log
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="orchestrator-empty">No recent log lines captured.</p>
            )}
          </section>

          <section className="orchestrator-task-drawer-section">
            <h3 className="orchestrator-task-drawer-section-title">Task content</h3>
            <VaultMarkdownRenderer currentPath={task.path} markdown={task.body} />
          </section>
        </div>
      </aside>
    </div>
  );
}

export function buildTaskDetailViewModel(
  task: VaultTask,
  options: BuildTaskDetailViewModelOptions = {},
): TaskDetailViewModel {
  return {
    artifacts: buildTaskArtifacts(
      task.metadata,
      readTaskPrLink(task.metadata, options.githubRepository ?? null),
      options.githubRepository ?? null,
    ),
    assigneeLabel: agentLabels[task.assignee],
    createdLabel: task.created,
    dependsOn: task.dependsOn,
    effortLabel: task.effort ?? 'effort unset',
    labels: task.labels,
    logLines: buildTaskLogLines(task.id, options.liveAgentSnapshot),
    prLink: readTaskPrLink(task.metadata, options.githubRepository ?? null),
    specLabel: task.spec ?? 'No spec linked',
    statusLabel: formatTaskStatusLabel(task.status),
    updatedLabel: formatIsoDateTimeLabel(task.updatedAt),
  };
}

export function buildTaskLogLines(
  taskId: string,
  liveAgentSnapshot?: LiveAgentSnapshot,
): TaskDetailLogLine[] {
  if (liveAgentSnapshot === undefined) {
    return [];
  }

  return liveAgentSnapshot.agents
    .filter((agent) => agent.taskId === taskId && agent.lastOutput.trim() !== '')
    .map((agent) => ({
      href: agent.fullLogHref,
      label: `${agent.roleLabel} ${agent.elapsedLabel}`,
      text: agent.lastOutput,
    }));
}

export function buildTaskArtifacts(
  metadata: Record<string, unknown>,
  prLink: TaskDetailPrLink | null = null,
  githubRepository: string | null = null,
): TaskDetailArtifact[] {
  const artifacts: TaskDetailArtifact[] = [];
  const seen = new Set<string>();

  function pushArtifact(artifact: TaskDetailArtifact): void {
    const key = `${artifact.tone}:${artifact.href ?? ''}:${artifact.label}:${artifact.detail}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    artifacts.push(artifact);
  }

  if (prLink !== null) {
    pushArtifact({
      detail: prLink.label,
      href: prLink.href,
      label: 'Pull request',
      tone: 'link',
    });
  }

  for (const link of readArtifactLinks(metadata)) {
    pushArtifact(link);
  }

  for (const file of readArtifactFiles(metadata, githubRepository)) {
    pushArtifact(file);
  }

  for (const filePath of readStringArrayMetadata(metadata, ['created_files', 'createdFiles'])) {
    pushArtifact({
      detail: filePath,
      href: buildFileArtifactHref(filePath, metadata, githubRepository),
      label: 'Created file',
      tone: 'file',
    });
  }

  for (const filePath of readStringArrayMetadata(metadata, ['changed_files', 'changedFiles'])) {
    pushArtifact({
      detail: filePath,
      href: buildFileArtifactHref(filePath, metadata, githubRepository),
      label: 'Changed file',
      tone: 'file',
    });
  }

  for (const filePath of readStringArrayMetadata(metadata, ['deleted_files', 'deletedFiles'])) {
    pushArtifact({
      detail: filePath,
      href: buildFileArtifactHref(filePath, metadata, githubRepository),
      label: 'Deleted file',
      tone: 'file',
    });
  }

  const branch = readStringMetadata(metadata, ['branch', 'git_branch', 'gitBranch']);
  if (branch !== null) {
    pushArtifact({
      detail: branch,
      href: null,
      label: 'Branch',
      tone: 'file',
    });
  }

  return artifacts;
}

export function readTaskPrLink(
  metadata: Record<string, unknown>,
  githubRepository: string | null,
): TaskDetailPrLink | null {
  const prUrl = readStringMetadata(metadata, prUrlMetadataKeys);

  if (prUrl !== null && isHttpUrl(prUrl)) {
    return {
      href: prUrl,
      label: formatPrUrlLabel(prUrl),
    };
  }

  const prNumber = readNumberMetadata(metadata, prNumberMetadataKeys);
  if (prNumber === null) {
    return null;
  }

  const repository = normalizeGithubRepository(githubRepository);

  return {
    href: repository === null ? null : `https://github.com/${repository}/pull/${prNumber}`,
    label: `PR #${prNumber}`,
  };
}

function TaskDetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="orchestrator-task-detail-field">
      <span className="orchestrator-label">{label}</span>
      <span className="orchestrator-task-detail-value">{value}</span>
    </div>
  );
}

function TaskDetailLinkedField({
  href,
  label,
  value,
}: {
  href: string | null;
  label: string;
  value: string;
}) {
  return (
    <div className="orchestrator-task-detail-field">
      <span className="orchestrator-label">{label}</span>
      {href === null ? (
        <span className="orchestrator-task-detail-value">{value}</span>
      ) : (
        <a
          className="orchestrator-task-detail-link"
          href={href}
          rel="noreferrer"
          target="_blank"
        >
          {value}
        </a>
      )}
    </div>
  );
}

function formatTaskStatusLabel(status: TaskStatus): string {
  const label = status.replaceAll('-', ' ');
  return `${label.slice(0, 1).toUpperCase()}${label.slice(1)}`;
}

function formatIsoDateTimeLabel(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return `${new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function readStringMetadata(
  metadata: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return null;
}

function readArtifactLinks(metadata: Record<string, unknown>): TaskDetailArtifact[] {
  const raw = metadata.artifact_links ?? metadata.artifactLinks ?? metadata.links;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((value): TaskDetailArtifact | null => {
      if (typeof value === 'string' && isHttpUrl(value)) {
        return {
          detail: value,
          href: value,
          label: 'Link',
          tone: 'link',
        };
      }

      if (!isRecord(value)) {
        return null;
      }

      const href = readStringFromRecord(value, ['href', 'url']);
      if (href === null || !isHttpUrl(href)) {
        return null;
      }

      return {
        detail: readStringFromRecord(value, ['title', 'detail', 'href']) ?? href,
        href,
        label: readStringFromRecord(value, ['label', 'kind', 'type']) ?? 'Link',
        tone: 'link',
      };
    })
    .filter((value): value is TaskDetailArtifact => value !== null);
}

function readArtifactFiles(
  metadata: Record<string, unknown>,
  githubRepository: string | null,
): TaskDetailArtifact[] {
  const raw = metadata.artifact_files ?? metadata.artifactFiles ?? metadata.files;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((value): TaskDetailArtifact | null => {
      if (typeof value === 'string' && value.trim() !== '') {
        const filePath = value.trim();
        return {
          detail: filePath,
          href: buildFileArtifactHref(filePath, metadata, githubRepository),
          label: 'File',
          tone: 'file',
        };
      }

      if (!isRecord(value)) {
        return null;
      }

      const filePath = readStringFromRecord(value, ['path', 'file', 'href']);
      if (filePath === null) {
        return null;
      }

      const href = isHttpUrl(filePath)
        ? filePath
        : buildFileArtifactHref(filePath, metadata, githubRepository);

      return {
        detail: filePath,
        href,
        label: readStringFromRecord(value, ['label', 'kind', 'type']) ?? 'File',
        tone: href === null ? 'file' : 'link',
      };
    })
    .filter((value): value is TaskDetailArtifact => value !== null);
}

function buildFileArtifactHref(
  filePath: string,
  metadata: Record<string, unknown>,
  githubRepository: string | null,
): string | null {
  if (filePath.endsWith('.md') && !filePath.startsWith('worktrees/')) {
    return buildVaultFileHref(filePath);
  }

  const repository = normalizeGithubRepository(githubRepository);
  const branch = readStringMetadata(metadata, ['branch', 'git_branch', 'gitBranch']);
  if (repository === null || branch === null || filePath.startsWith('worktrees/')) {
    return null;
  }

  return `https://github.com/${repository}/blob/${encodeURIComponent(branch)}/${filePath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

function buildVaultFileHref(filePath: string): string {
  return `/admin/orchestrator?mode=vault&vault=${encodeURIComponent(filePath.replace(/^\.vault\//, ''))}`;
}

function readNumberMetadata(
  metadata: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = metadata[key];

    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }

    if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) {
      return Number(value.trim());
    }
  }

  return null;
}

function readStringArrayMetadata(
  metadata: Record<string, unknown>,
  keys: readonly string[],
): string[] {
  for (const key of keys) {
    const value = metadata[key];
    if (!Array.isArray(value)) {
      continue;
    }

    return value
      .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .map((item) => item.trim());
  }

  return [];
}

function readStringFromRecord(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function formatPrUrlLabel(value: string): string {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/pull\/(\d+)(?:\/|$)/);
    return match?.[1] === undefined ? 'PR link' : `PR #${match[1]}`;
  } catch {
    return 'PR link';
  }
}

function normalizeGithubRepository(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return /^[\w.-]+\/[\w.-]+$/.test(normalized) ? normalized : null;
}
