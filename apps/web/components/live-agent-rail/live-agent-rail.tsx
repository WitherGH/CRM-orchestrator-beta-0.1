'use client';

import { useEffect, useState } from 'react';

import type {
  LiveAgentCardState,
  LiveAgentSnapshot,
} from '@/server/live-agent-state';

const liveAgentsEndpoint = '/api/admin/orchestrator/live-agents';
const controlActionPath = '/api/admin/orchestrator/control';

export function LiveAgentRail({
  initialSnapshot,
}: {
  initialSnapshot: LiveAgentSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [refreshState, setRefreshState] = useState<'live' | 'stale'>('live');

  useEffect(() => {
    let active = true;

    async function refreshLiveAgents(): Promise<void> {
      try {
        const response = await fetch(liveAgentsEndpoint, { cache: 'no-store' });
        const payload: unknown = await response.json();

        if (!response.ok || !isLiveAgentSnapshot(payload)) {
          throw new Error('Invalid live agent snapshot');
        }

        if (active) {
          setSnapshot(payload);
          setRefreshState('live');
        }
      } catch {
        if (active) {
          setRefreshState('stale');
        }
      }
    }

    const interval = window.setInterval(refreshLiveAgents, snapshot.pollIntervalMs);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [snapshot.pollIntervalMs]);

  return (
    <section className="orchestrator-panel" aria-labelledby="orchestrator-agent-title">
      <div className="orchestrator-panel-header">
        <div>
          <h2 className="orchestrator-panel-title" id="orchestrator-agent-title">
            Live agents
          </h2>
          <p className="orchestrator-live-agent-refresh">
            refresh {Math.round(snapshot.pollIntervalMs / 1_000)}s
          </p>
        </div>
        <span className="orchestrator-card-meta" data-refresh-state={refreshState}>
          {snapshot.activeCount} active
        </span>
      </div>
      <div className="orchestrator-panel-body">
        <ul className="orchestrator-agent-list" aria-live="polite">
          {snapshot.agents.map((agent) => (
            <LiveAgentCard agent={agent} key={`${agent.role}-${agent.taskId ?? 'idle'}`} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function LiveAgentCard({ agent }: { agent: LiveAgentCardState }) {
  const statusLabel = agent.status === 'running'
    ? 'Running'
    : agent.status === 'stale'
      ? 'Stale'
      : 'Idle';

  return (
    <li className="orchestrator-agent-card" data-status={agent.status}>
      <div className="orchestrator-agent-heading">
        <span
          aria-hidden="true"
          className="orchestrator-status-dot"
          data-tone={agent.status === 'running'
            ? 'positive'
            : agent.status === 'stale'
              ? 'alert'
              : undefined}
        />
        <div className="orchestrator-agent-heading-copy">
          <p className="orchestrator-agent-title">
            <span>{agent.roleLabel}</span>
            <span className="orchestrator-card-meta">{statusLabel}</span>
          </p>
          <p className="orchestrator-agent-task">
            {agent.taskId === null ? 'No active task' : `${agent.taskId} ${agent.taskTitle}`}
          </p>
        </div>
      </div>

      <div className="orchestrator-chip-row" aria-label={`${agent.roleLabel} status`}>
        <span className="orchestrator-chip">{agent.elapsedLabel}</span>
        <span className="orchestrator-chip">{agent.runner}</span>
        <span className="orchestrator-chip">{agent.model}</span>
        <span className="orchestrator-chip">{agent.costLabel}</span>
      </div>

      <p className="orchestrator-agent-output">
        <span className="orchestrator-agent-output-label">
          {agent.status === 'running' ? 'Last output' : 'State'}
        </span>
        {agent.lastOutput}
      </p>

      {agent.logPath === null ? null : (
        <p className="orchestrator-log-path" title={agent.logPath}>
          {agent.logPath}
        </p>
      )}

      <div className="orchestrator-action-row">
        <button
          className="orchestrator-action"
          disabled={!agent.actions.pauseEnabled}
          type="button"
        >
          Pause
        </button>
        {agent.actions.killEnabled && agent.taskId !== null ? (
          <form action={controlActionPath} method="post">
            <input name="action" type="hidden" value="task-kill" />
            <input name="taskId" type="hidden" value={agent.taskId} />
            <button className="orchestrator-action" type="submit">
              Kill
            </button>
          </form>
        ) : (
          <button
            className="orchestrator-action"
            disabled
            type="button"
          >
            Kill
          </button>
        )}
        {agent.actions.fullLogEnabled && agent.fullLogHref !== null ? (
          <a
            className="orchestrator-action"
            href={agent.fullLogHref}
            rel="noreferrer"
            target="_blank"
          >
            View log
          </a>
        ) : (
          <button
            className="orchestrator-action"
            disabled
            type="button"
          >
            View log
          </button>
        )}
      </div>
    </li>
  );
}

function isLiveAgentSnapshot(value: unknown): value is LiveAgentSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.activeCount === 'number'
    && Array.isArray(value.agents)
    && typeof value.pollIntervalMs === 'number'
    && typeof value.refreshedAt === 'string'
    && typeof value.totalRoles === 'number'
    && value.agents.every(isLiveAgentCardState)
  );
}

function isLiveAgentCardState(value: unknown): value is LiveAgentCardState {
  if (!isRecord(value) || !isRecord(value.actions)) {
    return false;
  }

  return (
    typeof value.actions.fullLogEnabled === 'boolean'
    && typeof value.actions.killEnabled === 'boolean'
    && typeof value.actions.pauseEnabled === 'boolean'
    && typeof value.costLabel === 'string'
    && typeof value.elapsedLabel === 'string'
    && (typeof value.fullLogHref === 'string' || value.fullLogHref === null)
    && typeof value.lastOutput === 'string'
    && (typeof value.logPath === 'string' || value.logPath === null)
    && typeof value.model === 'string'
    && typeof value.role === 'string'
    && typeof value.roleLabel === 'string'
    && (value.runner === 'claude' || value.runner === 'codex')
    && (value.status === 'idle' || value.status === 'running' || value.status === 'stale')
    && (typeof value.taskId === 'string' || value.taskId === null)
    && (typeof value.taskTitle === 'string' || value.taskTitle === null)
    && typeof value.updatedAt === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
