import type {
  ProjectStatus,
  VaultProject,
  VaultTask,
} from '../../server/vault-fs';

/**
 * Per-project summary for the Home tab: delivery progress, live activity,
 * what needs the owner, and today's token burn from the cost journal.
 */
export interface HomeProjectCard {
  attentionCount: number;
  description: string;
  doneCount: number;
  id: string;
  progressPercent: number;
  status: ProjectStatus;
  taskCount: number;
  title: string;
  todayUsd: number;
  workingCount: number;
}

export interface BuildHomeProjectCardsInput {
  projects: readonly VaultProject[];
  taskCostsUsd?: Record<string, number>;
  tasks: readonly VaultTask[];
}

const statusRank: Record<ProjectStatus, number> = {
  active: 0,
  paused: 1,
  archived: 2,
};

export function buildHomeProjectCards({
  projects,
  taskCostsUsd = {},
  tasks,
}: BuildHomeProjectCardsInput): HomeProjectCard[] {
  const cards = projects.map((project): HomeProjectCard => {
    const projectTasks = tasks.filter((task) => task.projectId === project.id);
    const doneCount = projectTasks.filter((task) => task.status === 'done').length;
    const workingCount = projectTasks.filter(
      (task) => task.status === 'in-progress',
    ).length;
    const attentionCount = projectTasks.filter(
      (task) => task.status === 'blocked-question' || task.status === 'failed' || task.flagged,
    ).length;
    const todayUsd = projectTasks.reduce(
      (total, task) => total + (taskCostsUsd[task.id] ?? 0),
      0,
    );

    return {
      attentionCount,
      description: project.description,
      doneCount,
      id: project.id,
      progressPercent: projectTasks.length === 0
        ? 0
        : Math.round((doneCount / projectTasks.length) * 100),
      status: project.status,
      taskCount: projectTasks.length,
      title: project.title,
      todayUsd,
      workingCount,
    };
  });

  return cards.sort((a, b) => {
    const statusDelta = statusRank[a.status] - statusRank[b.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }

    return a.title.localeCompare(b.title);
  });
}
