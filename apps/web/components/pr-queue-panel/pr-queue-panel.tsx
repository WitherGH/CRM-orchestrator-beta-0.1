import {
  formatPrAgeLabel,
  type PrQueueCiStatus,
  type PrQueueItem,
  type PrQueueReviewerStatus,
} from '../../server/pr-queue';

export interface PrQueuePanelProps {
  mergeReadyActionPath?: string;
  items: readonly PrQueueItem[];
  mergeActionPath?: string;
  now?: Date;
  projectId?: string | null;
}

const defaultMergeReadyActionPath = '/api/admin/orchestrator/control';
const defaultMergeActionPath = '/api/admin/orchestrator/prs/merge';

const ciLabels: Record<PrQueueCiStatus, string> = {
  green: 'Green',
  red: 'Red',
  unknown: 'Unknown',
  yellow: 'Running',
};

const reviewerLabels: Record<PrQueueReviewerStatus, string> = {
  approved: 'Approved',
  'changes-requested': 'Changes requested',
  pending: 'Pending',
  unknown: 'Unknown',
};

export function PrQueuePanel({
  items,
  mergeReadyActionPath = defaultMergeReadyActionPath,
  mergeActionPath = defaultMergeActionPath,
  now = new Date(),
  projectId = null,
}: PrQueuePanelProps) {
  const mergeReadyCount = items.filter((item) => (
    item.taskStatus === 'merge-ready' && item.mergeEnabled
  )).length;

  return (
    <section className="orchestrator-pr-queue" aria-labelledby="orchestrator-pr-queue-title">
      <div className="orchestrator-pr-queue-header">
        <div>
          <h2 className="orchestrator-panel-title" id="orchestrator-pr-queue-title">
            PR queue
          </h2>
          <p className="orchestrator-pr-queue-copy">
            Green CI plus Reviewer approval unlocks merge.
          </p>
        </div>
        <div className="orchestrator-pr-queue-actions">
          <span className="orchestrator-card-meta">{items.length} open</span>
          <form action={mergeReadyActionPath} method="post">
            <input name="action" type="hidden" value="pr-merge-ready" />
            {projectId === null ? null : <input name="projectId" type="hidden" value={projectId} />}
            <button
              className="orchestrator-action"
              disabled={mergeReadyCount === 0}
              type="submit"
            >
              Reviewer merge {mergeReadyCount}
            </button>
          </form>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="orchestrator-pr-table-scroll">
          <table className="orchestrator-pr-table">
            <thead>
              <tr>
                <th scope="col">PR</th>
                <th scope="col">Task</th>
                <th scope="col">Assignee</th>
                <th scope="col">CI</th>
                <th scope="col">Reviewer</th>
                <th scope="col">Age</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <PrQueueRow
                  item={item}
                  key={item.prNumber}
                  mergeActionPath={mergeActionPath}
                  now={now}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="orchestrator-empty">No open PRs waiting for review.</p>
      )}
    </section>
  );
}

function PrQueueRow({
  item,
  mergeActionPath,
  now,
}: {
  item: PrQueueItem;
  mergeActionPath: string;
  now: Date;
}) {
  return (
    <tr>
      <td>
        <span className="orchestrator-pr-number">#{item.prNumber}</span>
        {item.branch === null ? null : (
          <span className="orchestrator-pr-branch" title={item.branch}>
            {item.branch}
          </span>
        )}
      </td>
      <td>
        <span className="orchestrator-task-id">{item.taskId}</span>
        <span className="orchestrator-pr-title">{item.title}</span>
      </td>
      <td>{formatAssignee(item.assignee)}</td>
      <td>
        <span className="orchestrator-chip" data-tone={ciTone(item.ciStatus)}>
          {ciLabels[item.ciStatus]}
        </span>
      </td>
      <td>
        <span className="orchestrator-chip" data-tone={reviewerTone(item.reviewerStatus)}>
          {reviewerLabels[item.reviewerStatus]}
        </span>
      </td>
      <td>{formatPrAgeLabel(item.openedAt, now)}</td>
      <td>
        <div className="orchestrator-pr-actions">
          {item.githubUrl === null ? (
            <button className="orchestrator-action" disabled type="button">
              View diff
            </button>
          ) : (
            <a
              className="orchestrator-action"
              href={item.githubUrl}
              rel="noreferrer"
              target="_blank"
            >
              View diff
            </a>
          )}
          <form action={mergeActionPath} method="post">
            <input name="prNumber" type="hidden" value={item.prNumber} />
            <button
              className="orchestrator-action"
              disabled={!item.mergeEnabled}
              type="submit"
            >
              Merge
            </button>
          </form>
          <button className="orchestrator-action" disabled type="button">
            Request re-review
          </button>
          <button className="orchestrator-action" disabled type="button">
            Close
          </button>
        </div>
      </td>
    </tr>
  );
}

function ciTone(status: PrQueueCiStatus): 'alert' | 'danger' | 'muted-light' | 'positive' {
  if (status === 'green') {
    return 'positive';
  }

  if (status === 'red') {
    return 'danger';
  }

  if (status === 'yellow') {
    return 'alert';
  }

  return 'muted-light';
}

function reviewerTone(
  status: PrQueueReviewerStatus,
): 'alert' | 'danger' | 'muted-light' | 'positive' {
  if (status === 'approved') {
    return 'positive';
  }

  if (status === 'changes-requested') {
    return 'danger';
  }

  if (status === 'pending') {
    return 'alert';
  }

  return 'muted-light';
}

function formatAssignee(assignee: PrQueueItem['assignee']): string {
  if (assignee === 'pm') {
    return 'PM';
  }

  return assignee[0].toUpperCase() + assignee.slice(1);
}
