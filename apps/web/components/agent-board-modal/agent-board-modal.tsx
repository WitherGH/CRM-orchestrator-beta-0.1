import type { AgentBoardData } from '../../server/agent-board';

export interface AgentBoardModalProps {
  data: AgentBoardData;
  id?: string;
}

export function AgentBoardModal({
  data,
  id = 'orchestrator-agent-board-modal',
}: AgentBoardModalProps) {
  return (
    <section
      aria-labelledby="orchestrator-agent-board-title"
      aria-modal="true"
      className="orchestrator-agent-board-modal"
      id={id}
      role="dialog"
    >
      <a
        aria-label="Close agent board"
        className="orchestrator-modal-scrim"
        href="#orchestrator-agent-board-closed"
      />
      <div className="orchestrator-agent-board-surface">
        <header className="orchestrator-agent-board-header">
          <div>
            <span className="orchestrator-label">Agent board</span>
            <h2
              className="orchestrator-agent-board-title"
              id="orchestrator-agent-board-title"
            >
              Current capacity and 7d performance
            </h2>
          </div>
          <a
            className="orchestrator-action"
            href="#orchestrator-agent-board-closed"
          >
            Close
          </a>
        </header>

        <div className="orchestrator-agent-board-summary" aria-label="Agent board summary">
          <Metric label="Active" value={`${data.summary.activeAgents}/${data.summary.totalAgents}`} />
          <Metric label="Queued" value={String(data.summary.queuedTasks)} />
          <Metric label="Success" value={data.summary.averageSuccessRateLabel} />
          <Metric label="7d cost" value={data.summary.weekCostLabel} />
        </div>

        <div className="orchestrator-agent-board-grid">
          {data.roles.map((role) => (
            <article
              className="orchestrator-agent-board-row"
              data-status={role.status}
              key={role.role}
            >
              <div className="orchestrator-agent-board-row-head">
                <span
                  aria-hidden="true"
                  className="orchestrator-status-dot"
                  data-tone={role.status === 'running' ? 'positive' : 'neutral'}
                />
                <div className="orchestrator-agent-board-role">
                  <h3 className="orchestrator-panel-title">{role.roleLabel}</h3>
                  <p className="orchestrator-card-meta">
                    {role.runner} / {role.model}
                  </p>
                </div>
                <span
                  className="orchestrator-chip"
                  data-tone={role.status === 'running' ? 'positive' : undefined}
                >
                  {role.status}
                </span>
              </div>

              <div className="orchestrator-agent-board-active-task">
                <span className="orchestrator-label">Current</span>
                <p className="orchestrator-agent-board-task">
                  {role.activeTaskId === null
                    ? 'Idle'
                    : `${role.activeTaskId} ${role.activeTaskTitle ?? ''}`}
                </p>
              </div>

              <dl className="orchestrator-agent-board-metrics">
                <div>
                  <dt>Queue</dt>
                  <dd>{role.queueCount}</dd>
                </div>
                <div>
                  <dt>Success</dt>
                  <dd>{role.successRateLabel}</dd>
                </div>
                <div>
                  <dt>Avg time</dt>
                  <dd>{role.averageTaskTimeLabel}</dd>
                </div>
                <div>
                  <dt>Avg cost</dt>
                  <dd>{role.averageCostPerTaskLabel}</dd>
                </div>
              </dl>

              <div className="orchestrator-agent-board-costs">
                <span className="orchestrator-chip">today {role.costTodayLabel}</span>
                <span className="orchestrator-chip">7d {role.costWeekLabel}</span>
                <span className="orchestrator-chip">{role.tasksCompletedWeek} done</span>
              </div>

              {role.queuePreview.length === 0 ? (
                <p className="orchestrator-empty">Queue clear.</p>
              ) : (
                <ul className="orchestrator-agent-board-queue" aria-label={`${role.roleLabel} queue`}>
                  {role.queuePreview.map((task) => (
                    <li key={task.id}>
                      <span className="orchestrator-task-id">{task.id}</span>
                      <span className="orchestrator-agent-board-queue-title">{task.title}</span>
                      <span className="orchestrator-card-meta">{task.priority} / {task.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="orchestrator-agent-board-summary-item">
      <span className="orchestrator-label">{label}</span>
      <span className="orchestrator-stat-value">{value}</span>
    </div>
  );
}
