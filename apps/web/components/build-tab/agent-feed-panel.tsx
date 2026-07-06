'use client';

import { useEffect, useState } from 'react';

import type { LiveAgentSnapshot } from '../../server/live-agent-state';

import {
  buildAgentFeed,
  type AgentFeedItem,
  type AgentFeedTone,
} from './agent-feed';

interface AgentFeedPanelProps {
  initialSnapshot: LiveAgentSnapshot;
  taskCostsUsd: Record<string, number>;
}

const liveAgentsEndpoint = '/api/admin/orchestrator/live-agents';

const toneDotClass: Record<AgentFeedTone, string> = {
  active: 'bg-positive',
  attention: 'bg-warning',
  idle: 'bg-line-strong',
};

export function AgentFeedPanel({ initialSnapshot, taskCostsUsd }: AgentFeedPanelProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const response = await fetch(liveAgentsEndpoint, { cache: 'no-store' });
        if (!response.ok) {
          return;
        }

        const next = (await response.json()) as LiveAgentSnapshot;
        if (!cancelled) {
          setSnapshot(next);
        }
      } catch {
        // Keep showing the last snapshot; the next poll retries.
      }
    };

    const interval = window.setInterval(refresh, snapshot.pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [snapshot.pollIntervalMs]);

  const items = buildAgentFeed(snapshot, { taskCostsUsd });

  return (
    <section
      aria-label="Agent activity"
      className="rounded-card border border-line bg-surface p-4 shadow-card"
    >
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-ink">Agents</h2>
        <span className="text-xs text-ink-faint">
          {snapshot.activeCount} of {snapshot.totalRoles} working
        </span>
      </header>

      {items.length === 0 ? (
        <p className="py-4 text-sm text-ink-faint">No agents configured yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((item) => (
            <FeedRow item={item} key={item.id} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FeedRow({ item }: { item: AgentFeedItem }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-pill ${toneDotClass[item.tone]}`} />
      <span className={item.tone === 'idle' ? 'text-ink-faint' : 'text-ink-secondary'}>
        {item.sentence}
        {item.costLabel !== null && (
          <span className="text-ink-faint"> · {item.costLabel}</span>
        )}
      </span>
    </li>
  );
}
