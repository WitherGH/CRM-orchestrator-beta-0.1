import {
  buildAgentBoardData,
  type AgentBoardData,
} from '../../server/agent-board';
import {
  buildCostDashboardData,
  type CostDashboardData,
} from '../../server/cost-dashboard';
import type { LiveAgentSnapshot } from '../../server/live-agent-state';
import type { OrchestratorStatusReadResult } from '../../server/orchestrator-status';
import type { PrQueueItem } from '../../server/pr-queue';
import type {
  AgentRole,
  VaultFileSummary,
  VaultMarkdownFile,
  VaultProject,
  VaultTask,
  VaultTreeNode,
} from '../../server/vault-fs';
import { AgentBoardModal } from '../agent-board-modal/agent-board-modal';
import { AutomationControlPanel } from '../automation-control-panel/automation-control-panel';
import { CostDashboard } from '../cost-dashboard/cost-dashboard';
import { HumanRequestIntake } from '../human-request-intake/human-request-intake';
import { InboxVaultSidebar } from '../inbox-vault-sidebar/inbox-vault-sidebar';
import { KanbanBoard } from '../kanban-board/kanban-board';
import { LiveAgentRail } from '../live-agent-rail/live-agent-rail';
import { NotificationFirehoseDrawer } from '../notification-firehose-drawer/notification-firehose-drawer';
import type { NotificationFirehoseEvent } from '../notification-firehose-drawer/notification-firehose.types';
import { PrQueuePanel } from '../pr-queue-panel/pr-queue-panel';
import {
  TopStatBar,
  type TopStatBarData,
} from '../top-stat-bar/top-stat-bar';
import { VaultDocumentView } from '../vault-document-view/vault-document-view';

export type OrchestratorWorkspaceMode = 'cost' | 'daily-log' | 'kanban' | 'pr-queue' | 'vault';

type ModelRoute = {
  activeTask: string;
  label: string;
  model: string;
  role: AgentRole;
  reset: string;
  runner: 'claude' | 'codex';
};

export interface AdminOrchestratorShellProps {
  activeMode?: OrchestratorWorkspaceMode;
  activeProjectId?: string | null;
  agentBoardData?: AgentBoardData;
  costDashboardData?: CostDashboardData;
  firehoseEvents?: readonly NotificationFirehoseEvent[];
  githubRepository?: string | null;
  inboxItems?: readonly VaultFileSummary[];
  liveAgentSnapshot?: LiveAgentSnapshot;
  now?: Date;
  orchestratorStatus?: OrchestratorStatusReadResult;
  prQueueItems?: readonly PrQueueItem[];
  projects?: readonly VaultProject[];
  selectedInboxFile?: VaultMarkdownFile | null;
  selectedVaultFile?: VaultMarkdownFile | null;
  tasks?: readonly VaultTask[];
  topStats?: TopStatBarData;
  vaultTree?: readonly VaultTreeNode[];
}

const defaultTopStats: TopStatBarData = {
  agents: {
    active: 3,
    total: 6,
  },
  botKill: {
    haltedCount: 0,
    status: 'clear',
  },
  ci: {
    status: 'green',
  },
  cost: {
    dailyCapUsd: 50,
    progressPercent: 28.46,
    todayUsd: 14.23,
  },
  taskCounts: {
    backlog: 12,
    done: 47,
    failed: 0,
    'in-progress': 3,
    'merge-ready': 5,
    review: 2,
  },
};

const emptyLiveAgentSnapshot: LiveAgentSnapshot = {
  activeCount: 0,
  agents: [],
  pollIntervalMs: 5_000,
  refreshedAt: new Date(0).toISOString(),
  totalRoles: 6,
};

const defaultAgentBoardData = buildAgentBoardData({
  liveAgentSnapshot: emptyLiveAgentSnapshot,
  now: new Date(0),
  tasks: [],
});

const defaultCostDashboardData = buildCostDashboardData({
  now: new Date(0),
});

const defaultOrchestratorStatus: OrchestratorStatusReadResult = {
  message: 'Status not loaded',
  online: false,
  snapshot: null,
};

const modelOptions = ['gpt-5.5', 'gpt-5.4', 'opus', 'sonnet'];

const modelRoutes: ModelRoute[] = [
  {
    activeTask: 'T-007 next',
    label: 'Developer',
    model: 'gpt-5.5',
    reset: '17:00 local',
    role: 'developer',
    runner: 'codex',
  },
  {
    activeTask: 'PR review queue',
    label: 'Reviewer',
    model: 'opus',
    reset: '17:00 local',
    role: 'reviewer',
    runner: 'claude',
  },
  {
    activeTask: 'Backlog shaping',
    label: 'PM',
    model: 'sonnet',
    reset: 'unknown',
    role: 'pm',
    runner: 'claude',
  },
  {
    activeTask: 'QA wave',
    label: 'Tester',
    model: 'gpt-5.5',
    reset: '17:00 local',
    role: 'tester',
    runner: 'codex',
  },
];

const workspaceTabs = [
  { href: '/admin/orchestrator', label: 'Kanban', mode: 'kanban' },
  { href: '/admin/orchestrator?mode=pr-queue', label: 'PR queue', mode: 'pr-queue' },
  { href: '/admin/orchestrator?mode=vault', label: 'Vault', mode: 'vault' },
  { href: '/admin/orchestrator?mode=daily-log', label: 'Daily log', mode: 'daily-log' },
  { href: '/admin/orchestrator?mode=cost', label: 'Cost', mode: 'cost' },
] as const satisfies ReadonlyArray<{
  href: string;
  label: string;
  mode: OrchestratorWorkspaceMode;
}>;

function ModelRouteRow({ route }: { route: ModelRoute }) {
  return (
    <li>
      <form action="/api/admin/orchestrator/control" className="orchestrator-model-row" method="post">
        <input name="action" type="hidden" value="agent-model" />
        <input name="role" type="hidden" value={route.role} />
        <div className="orchestrator-model-copy">
          <p className="orchestrator-agent-title">
            <span>{route.label}</span>
            <span className="orchestrator-card-meta">{route.activeTask}</span>
          </p>
          <div className="orchestrator-chip-row" aria-label={`${route.label} model metadata`}>
            <span className="orchestrator-chip">{route.runner}</span>
            <span className="orchestrator-chip">{formatLimitResetLabel(route.reset)}</span>
          </div>
        </div>
        <label className="orchestrator-model-select-label">
          <span className="orchestrator-label">Model</span>
          <select className="orchestrator-model-select" defaultValue={route.model} name="model">
            {modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <button className="orchestrator-action" type="submit">
          Save
        </button>
      </form>
    </li>
  );
}

function buildModelRoutes(status: OrchestratorStatusReadResult): ModelRoute[] | null {
  const roles = status.snapshot?.agents.roles;
  if (roles === undefined || roles.length === 0) {
    return null;
  }

  return roles.map((role) => ({
    activeTask: role.runningTaskIds.length > 0
      ? role.runningTaskIds.join(', ')
      : `${role.runningCount} running`,
    label: formatAgentRole(role.role),
    model: role.model ?? defaultModelForRole(role.role),
    reset: role.limitReset ?? 'limit reset unknown',
    role: isAgentRole(role.role) ? role.role : 'developer',
    runner: role.runner,
  }));
}

function isAgentRole(value: string): value is AgentRole {
  return value === 'architect'
    || value === 'designer'
    || value === 'developer'
    || value === 'pm'
    || value === 'reviewer'
    || value === 'tester';
}

function formatAgentRole(value: string): string {
  if (value === 'pm') {
    return 'PM';
  }

  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function formatLimitResetLabel(value: string): string {
  return value.startsWith('limit') ? value : `limit ${value}`;
}

function defaultModelForRole(role: string): string {
  if (role === 'architect' || role === 'reviewer') {
    return 'opus';
  }

  if (role === 'designer' || role === 'pm') {
    return 'sonnet';
  }

  return 'gpt-5.5';
}

function buildWorkspaceHref(mode: OrchestratorWorkspaceMode, projectId: string | null): string {
  const params = new URLSearchParams();
  if (mode !== 'kanban') {
    params.set('mode', mode);
  }
  if (projectId !== null) {
    params.set('project', projectId);
  }

  const query = params.toString();
  return query === '' ? '/admin/orchestrator' : `/admin/orchestrator?${query}`;
}

function ProjectSwitcher({
  activeMode,
  activeProject,
  activeProjectId,
  projects,
}: {
  activeMode: OrchestratorWorkspaceMode;
  activeProject: VaultProject | null;
  activeProjectId: string | null;
  projects: readonly VaultProject[];
}) {
  return (
    <section className="orchestrator-project-switcher" aria-labelledby="orchestrator-project-title">
      <div className="orchestrator-project-header">
        <div>
          <p className="orchestrator-label">Project workspace</p>
          <h2 className="orchestrator-project-title" id="orchestrator-project-title">
            {activeProject?.title ?? 'No project selected'}
          </h2>
          <p className="orchestrator-card-meta">
            {activeProject?.okr || 'Create a project to isolate tasks, runs, and agent context.'}
          </p>
        </div>
        <span className="orchestrator-chip">
          {activeProject === null ? 'unscoped' : `${activeProject.taskCount} tasks`}
        </span>
      </div>

      <div className="orchestrator-project-body">
        <nav className="orchestrator-project-list" aria-label="Projects">
          {projects.map((project) => (
            <a
              aria-current={project.id === activeProjectId ? 'page' : undefined}
              className="orchestrator-project-pill"
              href={buildWorkspaceHref(activeMode, project.id)}
              key={project.id}
            >
              <span>{project.title}</span>
              <span className="orchestrator-card-meta">{project.taskCount}</span>
            </a>
          ))}
        </nav>

        <form action="/api/admin/orchestrator/projects" className="orchestrator-project-form" method="post">
          <label className="orchestrator-field">
            <span className="orchestrator-label">New project</span>
            <input className="orchestrator-input" maxLength={120} minLength={3} name="title" placeholder="Project name" required />
          </label>
          <label className="orchestrator-field">
            <span className="orchestrator-label">Description</span>
            <input className="orchestrator-input" maxLength={240} minLength={10} name="description" placeholder="What this workspace owns" required />
          </label>
          <label className="orchestrator-field orchestrator-field-wide">
            <span className="orchestrator-label">OKR</span>
            <textarea className="orchestrator-textarea" maxLength={2_000} minLength={10} name="okr" placeholder="Objective and key results" required rows={2} />
          </label>
          <button className="orchestrator-action orchestrator-primary-action" type="submit">
            Create project
          </button>
        </form>
      </div>
    </section>
  );
}

export function AdminOrchestratorShell(props: AdminOrchestratorShellProps = {}) {
  const {
    activeMode = 'kanban',
    activeProjectId = null,
    agentBoardData = defaultAgentBoardData,
    costDashboardData = defaultCostDashboardData,
    firehoseEvents = [],
    githubRepository = null,
    inboxItems = [],
    liveAgentSnapshot = emptyLiveAgentSnapshot,
    now,
    orchestratorStatus = defaultOrchestratorStatus,
    prQueueItems = [],
    projects = [],
    selectedInboxFile = null,
    selectedVaultFile = null,
    tasks = [],
    topStats = defaultTopStats,
    vaultTree = [],
  } = props;
  const renderedAt = now ?? new Date();
  const renderedModelRoutes = buildModelRoutes(orchestratorStatus) ?? modelRoutes;
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;

  return (
    <section className="orchestrator-shell" aria-label="Admin orchestrator">
      <TopStatBar data={topStats} />
      <AgentBoardModal data={agentBoardData} />
      <span
        aria-hidden="true"
        className="orchestrator-fragment-target"
        id="orchestrator-agent-board-closed"
      />

      <InboxVaultSidebar
        inboxItems={inboxItems}
        now={now}
        selectedInboxFile={selectedInboxFile}
        selectedVaultPath={selectedVaultFile?.path ?? null}
        vaultTree={vaultTree}
      />

      <main className="orchestrator-main" aria-label="Orchestrator workspace">
        <ProjectSwitcher
          activeMode={activeMode}
          activeProject={activeProject}
          activeProjectId={activeProjectId}
          projects={projects}
        />

        <HumanRequestIntake
          projectId={activeProjectId}
          projectTitle={activeProject?.title ?? null}
        />

        <nav className="orchestrator-tabs" aria-label="Workspace modes" role="tablist">
          {workspaceTabs.map((tab) => (
            <a
              aria-selected={tab.mode === activeMode}
              className="orchestrator-tab"
              href={buildWorkspaceHref(tab.mode, activeProjectId)}
              key={tab.mode}
              role="tab"
            >
              {tab.label}
            </a>
          ))}
        </nav>

        <WorkspacePanel
          activeMode={activeMode}
          costDashboardData={costDashboardData}
          githubRepository={githubRepository}
          liveAgentSnapshot={liveAgentSnapshot}
          now={now}
          projectId={activeProjectId}
          prQueueItems={prQueueItems}
          selectedVaultFile={selectedVaultFile}
          tasks={tasks}
          vaultTree={vaultTree}
        />
      </main>

      <aside className="orchestrator-right-rail" aria-label="Live agent state">
        <AutomationControlPanel
          now={renderedAt}
          projectId={activeProjectId}
          projectTitle={activeProject?.title ?? null}
          status={orchestratorStatus}
          tasks={tasks}
        />

        <LiveAgentRail initialSnapshot={liveAgentSnapshot} />

        <section className="orchestrator-panel" aria-labelledby="orchestrator-model-title">
          <div className="orchestrator-panel-header">
            <h2 className="orchestrator-panel-title" id="orchestrator-model-title">
              Model routing
            </h2>
            <span className="orchestrator-card-meta">per agent</span>
          </div>
          <div className="orchestrator-panel-body">
            <ul className="orchestrator-model-list">
              {renderedModelRoutes.map((route) => (
                <ModelRouteRow key={route.role} route={route} />
              ))}
            </ul>
          </div>
        </section>
      </aside>

      <NotificationFirehoseDrawer
        events={firehoseEvents}
        now={renderedAt.toISOString()}
      />
    </section>
  );
}

function WorkspacePanel({
  activeMode,
  costDashboardData,
  githubRepository,
  liveAgentSnapshot,
  now,
  projectId,
  prQueueItems,
  selectedVaultFile,
  tasks,
  vaultTree,
}: {
  activeMode: OrchestratorWorkspaceMode;
  costDashboardData: CostDashboardData;
  githubRepository: string | null;
  liveAgentSnapshot: LiveAgentSnapshot;
  now?: Date;
  projectId: string | null;
  prQueueItems: readonly PrQueueItem[];
  selectedVaultFile: VaultMarkdownFile | null;
  tasks: readonly VaultTask[];
  vaultTree: readonly VaultTreeNode[];
}) {
  if (activeMode === 'pr-queue') {
    return <PrQueuePanel items={prQueueItems} now={now} projectId={projectId} />;
  }

  if (activeMode === 'cost') {
    return <CostDashboard data={costDashboardData} />;
  }

  if (activeMode === 'daily-log') {
    return <DailyLogPanel tasks={tasks} />;
  }

  if (activeMode === 'vault') {
    return selectedVaultFile !== null
      ? <VaultDocumentView file={selectedVaultFile} tree={vaultTree} />
      : <VaultModeLanding vaultTree={vaultTree} />;
  }

  return (
    <KanbanBoard
      githubRepository={githubRepository}
      liveAgentSnapshot={liveAgentSnapshot}
      now={now}
      projectId={projectId}
      tasks={tasks}
    />
  );
}

function VaultModeLanding({ vaultTree }: { vaultTree: readonly VaultTreeNode[] }) {
  const topLevel = vaultTree.slice(0, 8);

  return (
    <section className="orchestrator-vault-document" aria-labelledby="orchestrator-vault-mode-title">
      <header className="orchestrator-vault-document-header">
        <div>
          <p className="orchestrator-label">Vault</p>
          <h1 className="orchestrator-vault-document-title" id="orchestrator-vault-mode-title">
            Select a vault file
          </h1>
        </div>
        <span className="orchestrator-log-path">read-only</span>
      </header>
      <div className="orchestrator-mode-panel">
        <p className="orchestrator-empty">
          Pick any markdown file from the left vault tree to inspect specs, tasks, architecture notes, and progress logs.
        </p>
        <ul className="orchestrator-mode-list" aria-label="Top level vault folders">
          {topLevel.map((node) => (
            <li className="orchestrator-mode-list-item" key={node.path}>
              <span>{node.name}</span>
              <span className="orchestrator-card-meta">
                {node.type === 'directory' ? 'folder' : 'file'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function DailyLogPanel({ tasks }: { tasks: readonly VaultTask[] }) {
  const recentTasks = [...tasks]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 12);

  return (
    <section className="orchestrator-vault-document" aria-labelledby="orchestrator-daily-log-title">
      <header className="orchestrator-vault-document-header">
        <div>
          <p className="orchestrator-label">Daily log</p>
          <h1 className="orchestrator-vault-document-title" id="orchestrator-daily-log-title">
            Recent task movement
          </h1>
        </div>
        <span className="orchestrator-log-path">{recentTasks.length} entries</span>
      </header>
      <div className="orchestrator-mode-panel">
        {recentTasks.length > 0 ? (
          <ul className="orchestrator-mode-list" aria-label="Recent task movement">
            {recentTasks.map((task) => (
              <li className="orchestrator-mode-list-item" key={task.id}>
                <span>
                  <span className="orchestrator-task-id">{task.id}</span> {task.title}
                </span>
                <span className="orchestrator-chip">{task.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="orchestrator-empty">No task movement captured yet.</p>
        )}
      </div>
    </section>
  );
}
