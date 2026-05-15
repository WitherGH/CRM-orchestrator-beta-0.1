import type { Metadata } from 'next';

import type {
  AgentRun,
  DailyCost,
} from '@crm-orchestrator/db/schema';

import {
  AdminOrchestratorShell,
  type OrchestratorWorkspaceMode,
} from '@/components/admin-orchestrator-shell/admin-orchestrator-shell';
import { createTopStatBarData } from '@/components/top-stat-bar/top-stat-bar';
import { requireAdminSession } from '@/server/auth/admin';
import { buildAgentBoardData } from '@/server/agent-board';
import { buildCostDashboardData } from '@/server/cost-dashboard';
import { readLiveAgentSnapshot } from '@/server/live-agent-state';
import { readOrchestratorStatus } from '@/server/orchestrator-status';
import { buildPrQueueItems } from '@/server/pr-queue';
import { vaultFs } from '@/server/vault-fs';

export const metadata: Metadata = {
  title: 'Orchestrator | CRM Orchestrator',
};

export const dynamic = 'force-dynamic';

interface AdminOrchestratorPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminOrchestratorPage({
  searchParams,
}: AdminOrchestratorPageProps) {
  await requireAdminSession();
  const params = await searchParams;
  const selectedInboxPath = getSingleSearchParam(params, 'inbox');
  const selectedVaultPath = getSingleSearchParam(params, 'vault');
  const requestedProjectId = getSingleSearchParam(params, 'project');
  const requestedMode = readWorkspaceMode(params?.mode);
  const activeMode = selectedVaultPath === null ? requestedMode : 'vault';
  const [
    inboxItems,
    selectedInboxFile,
    selectedVaultFile,
    tasks,
    projects,
    vaultTree,
    orchestratorStatus,
  ] = await Promise.all([
    vaultFs.listInbox(),
    readSelectedMarkdown(selectedInboxPath, '00-inbox/'),
    readSelectedMarkdown(selectedVaultPath),
    vaultFs.listTasks(),
    vaultFs.listProjects(),
    vaultFs.listVaultTree(),
    readOrchestratorStatus(),
  ]);
  const dailyCosts: DailyCost[] = [];
  const recentRuns: AgentRun[] = [];
  const now = new Date();
  const activeProjectId = pickActiveProjectId(projects, requestedProjectId);
  const projectTasks = activeProjectId === null
    ? tasks
    : tasks.filter((task) => task.projectId === activeProjectId);
  const dailyCostCapUsd = readDailyCostCapUsd();
  const liveAgentSnapshot = await readLiveAgentSnapshot({ tasks: projectTasks });
  const prQueueItems = buildPrQueueItems({ runs: recentRuns, tasks: projectTasks });
  const topStats = {
    ...createTopStatBarData({
      dailyCosts,
      dailyCostCapUsd,
      now,
      recentRuns,
      tasks: projectTasks,
    }),
    agents: {
      active: liveAgentSnapshot.activeCount,
      total: liveAgentSnapshot.totalRoles,
    },
  };
  const agentBoardData = buildAgentBoardData({
    dailyCosts,
    liveAgentSnapshot,
    now,
    recentRuns,
    tasks: projectTasks,
  });
  const costDashboardData = buildCostDashboardData({
    dailyCapUsd: dailyCostCapUsd,
    dailyCosts,
    now,
  });
  const githubRepository = process.env.ORCHESTRATOR_GITHUB_REPOSITORY
    ?? process.env.NEXT_PUBLIC_GITHUB_REPOSITORY
    ?? null;

  return (
    <AdminOrchestratorShell
      activeMode={activeMode}
      activeProjectId={activeProjectId}
      agentBoardData={agentBoardData}
      costDashboardData={costDashboardData}
      githubRepository={githubRepository}
      inboxItems={inboxItems}
      liveAgentSnapshot={liveAgentSnapshot}
      orchestratorStatus={orchestratorStatus}
      prQueueItems={prQueueItems}
      projects={projects}
      selectedInboxFile={selectedInboxFile}
      selectedVaultFile={selectedVaultFile}
      tasks={projectTasks}
      topStats={topStats}
      vaultTree={vaultTree}
    />
  );
}

function pickActiveProjectId(
  projects: Awaited<ReturnType<typeof vaultFs.listProjects>>,
  requestedProjectId: string | null,
): string | null {
  if (requestedProjectId !== null && projects.some((project) => project.id === requestedProjectId)) {
    return requestedProjectId;
  }

  return projects[0]?.id ?? null;
}

async function readSelectedMarkdown(
  path: string | null,
  requiredPrefix?: string,
) {
  if (path === null || !path.endsWith('.md')) {
    return null;
  }

  if (requiredPrefix !== undefined && !path.startsWith(requiredPrefix)) {
    return null;
  }

  try {
    return await vaultFs.read(path);
  } catch {
    return null;
  }
}

function getSingleSearchParam(
  params: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | null {
  const value = params?.[key];
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }

  return null;
}

function readWorkspaceMode(value: string | string[] | undefined): OrchestratorWorkspaceMode {
  const mode = Array.isArray(value) ? value[0] : value;

  if (
    mode === 'cost'
    || mode === 'daily-log'
    || mode === 'kanban'
    || mode === 'pr-queue'
    || mode === 'vault'
  ) {
    return mode;
  }

  return 'kanban';
}

function readDailyCostCapUsd(): number {
  const raw = process.env.ORCHESTRATOR_COST_CAP_USD;
  if (raw === undefined || raw.trim() === '') {
    return 50;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 50;
}
