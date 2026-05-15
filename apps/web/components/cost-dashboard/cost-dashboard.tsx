import type { CSSProperties } from 'react';

import type { CostDashboardData } from '../../server/cost-dashboard';

export interface CostDashboardProps {
  data: CostDashboardData;
}

type ProgressStyle = CSSProperties & {
  '--orchestrator-progress': string;
};

export function CostDashboard({ data }: CostDashboardProps) {
  return (
    <section className="orchestrator-cost-dashboard" aria-labelledby="orchestrator-cost-title">
      <header className="orchestrator-cost-header">
        <div>
          <span className="orchestrator-label">Cost</span>
          <h2 className="orchestrator-cost-title" id="orchestrator-cost-title">
            Spend by agent
          </h2>
        </div>
        <div className="orchestrator-cost-cap" data-tone={data.cap.tone}>
          <span className="orchestrator-label">{data.cap.statusLabel}</span>
          <span className="orchestrator-stat-value">
            {data.summary.todayLabel} / {data.cap.dailyCapLabel}
          </span>
          <span
            aria-label={`Daily cost is ${Math.round(data.cap.progressPercent)}% of cap`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.round(data.cap.progressPercent)}
            className="orchestrator-cost-track"
            role="progressbar"
          >
            <span
              className="orchestrator-cost-fill"
              data-tone={data.cap.tone}
              style={progressStyle(data.cap.progressPercent)}
            />
          </span>
          <span className="orchestrator-card-meta">{data.cap.remainingLabel} remaining</span>
        </div>
      </header>

      <div className="orchestrator-cost-summary" aria-label="Cost summary">
        <Metric label="Today" value={data.summary.todayLabel} />
        <Metric label="7d spend" value={data.summary.weekLabel} />
        <Metric label="30d run rate" value={data.summary.monthlyProjectionLabel} />
        <Metric label="Tasks done" value={String(data.summary.tasksCompletedWeek)} />
      </div>

      <div className="orchestrator-cost-table-scroll">
        <table className="orchestrator-cost-table">
          <caption>Cost by agent for the last 7 days</caption>
          <thead>
            <tr>
              <th scope="col">Agent</th>
              <th scope="col">Today</th>
              <th scope="col">7d</th>
              <th scope="col">Tasks</th>
              <th scope="col">Avg / task</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {data.roleRows.map((row) => (
              <tr key={row.role}>
                <th scope="row">{row.roleLabel}</th>
                <td>{row.todayLabel}</td>
                <td>{row.weekLabel}</td>
                <td>{row.tasksCompletedWeek}</td>
                <td>{row.averageCostPerTaskLabel}</td>
                <td>{row.shareLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="orchestrator-cost-table-scroll">
        <table className="orchestrator-cost-table orchestrator-cost-ledger">
          <caption>Daily cost ledger by agent</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              {data.roleRows.map((row) => (
                <th key={row.role} scope="col">{row.roleLabel}</th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.dayRows.map((row) => (
              <tr key={row.dateKey}>
                <th scope="row">{row.dayLabel}</th>
                {data.roleRows.map((roleRow) => (
                  <td key={roleRow.role}>{row.costLabelsByRole[roleRow.role]}</td>
                ))}
                <td>{row.totalLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="orchestrator-cost-summary-item">
      <span className="orchestrator-label">{label}</span>
      <span className="orchestrator-stat-value">{value}</span>
    </div>
  );
}

function progressStyle(progressPercent: number): ProgressStyle {
  return {
    '--orchestrator-progress': `${progressPercent}%`,
  };
}
