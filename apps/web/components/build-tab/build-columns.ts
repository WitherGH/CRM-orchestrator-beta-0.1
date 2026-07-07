import type {
  TaskPriority,
  TaskStatus,
  VaultTask,
} from '../../server/vault-fs';

/**
 * Display mapping over the seven vault statuses. The vault model is unchanged;
 * users of the Build tab see four columns:
 *   backlog → Queue, in-progress → Working, blocked-question → Working (badge),
 *   review + merge-ready → Review, failed → Review (badge), done → Done.
 */
export type BuildColumnKey = 'done' | 'queue' | 'review' | 'working';

export type BuildTaskBadge = 'error' | 'merge-ready' | 'question';

export interface BuildTaskCard {
  badge: BuildTaskBadge | null;
  task: VaultTask;
}

export interface BuildColumn {
  cards: BuildTaskCard[];
  emptyLabel: string;
  key: BuildColumnKey;
  label: string;
  totalCount: number;
}

export const DONE_VISIBLE_LIMIT = 8;

export const BUILD_BADGE_LABELS: Record<BuildTaskBadge, string> = {
  error: 'failed',
  'merge-ready': 'ready to merge',
  question: 'needs your answer',
};

const BUILD_COLUMN_CONFIG = [
  { emptyLabel: 'Nothing queued. Describe a goal to create work.', key: 'queue', label: 'Queue' },
  { emptyLabel: 'No agent is working right now.', key: 'working', label: 'Working' },
  { emptyLabel: 'Nothing waiting on you.', key: 'review', label: 'Review' },
  { emptyLabel: 'Nothing finished yet.', key: 'done', label: 'Done' },
] as const satisfies ReadonlyArray<{
  emptyLabel: string;
  key: BuildColumnKey;
  label: string;
}>;

const statusToColumn: Record<TaskStatus, { badge: BuildTaskBadge | null; key: BuildColumnKey }> = {
  backlog: { badge: null, key: 'queue' },
  'blocked-question': { badge: 'question', key: 'working' },
  done: { badge: null, key: 'done' },
  failed: { badge: 'error', key: 'review' },
  'in-progress': { badge: null, key: 'working' },
  'merge-ready': { badge: 'merge-ready', key: 'review' },
  review: { badge: null, key: 'review' },
};

const priorityRank: Record<TaskPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

export function resolveBuildColumn(status: TaskStatus): { badge: BuildTaskBadge | null; key: BuildColumnKey } {
  return statusToColumn[status];
}

export function buildBuildColumns(tasks: readonly VaultTask[]): BuildColumn[] {
  const grouped = new Map<BuildColumnKey, BuildTaskCard[]>(
    BUILD_COLUMN_CONFIG.map((column) => [column.key, []]),
  );

  for (const task of tasks) {
    const { badge, key } = resolveBuildColumn(task.status);
    grouped.get(key)?.push({ badge, task });
  }

  return BUILD_COLUMN_CONFIG.map((column) => {
    const cards = grouped.get(column.key) ?? [];
    const sorted = column.key === 'done'
      ? [...cards].sort(compareByRecency)
      : [...cards].sort(compareByUrgency);
    const visible = column.key === 'done' ? sorted.slice(0, DONE_VISIBLE_LIMIT) : sorted;

    return {
      cards: visible,
      emptyLabel: column.emptyLabel,
      key: column.key,
      label: column.label,
      totalCount: cards.length,
    };
  });
}

function compareByUrgency(a: BuildTaskCard, b: BuildTaskCard): number {
  const priorityDelta = priorityRank[a.task.priority] - priorityRank[b.task.priority];
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return a.task.id.localeCompare(b.task.id);
}

function compareByRecency(a: BuildTaskCard, b: BuildTaskCard): number {
  return Date.parse(b.task.updatedAt) - Date.parse(a.task.updatedAt);
}
