import type { LiveAgentSnapshot } from '../../server/live-agent-state';

/**
 * Turns the raw live-agent snapshot into human-language feed lines, e.g.
 * "Developer is working on “Request form” (T-031) · $0.42". Raw logs stay one
 * click deeper (task drawer / admin console).
 */
export type AgentFeedTone = 'active' | 'attention' | 'idle';

export interface AgentFeedItem {
  costLabel: string | null;
  id: string;
  roleLabel: string;
  sentence: string;
  taskId: string | null;
  tone: AgentFeedTone;
}

export interface BuildAgentFeedOptions {
  taskCostsUsd?: Record<string, number>;
}

const toneRank: Record<AgentFeedTone, number> = {
  active: 0,
  attention: 1,
  idle: 2,
};

export function buildAgentFeed(
  snapshot: LiveAgentSnapshot,
  options: BuildAgentFeedOptions = {},
): AgentFeedItem[] {
  const taskCostsUsd = options.taskCostsUsd ?? {};

  const items = snapshot.agents.map((agent): AgentFeedItem => {
    const taskLabel = agent.taskTitle ?? agent.taskId;
    const taskSuffix = agent.taskId === null ? '' : ` (${agent.taskId})`;
    const costUsd = agent.taskId === null ? undefined : taskCostsUsd[agent.taskId];

    let sentence: string;
    let tone: AgentFeedTone;
    if (agent.status === 'running') {
      sentence = taskLabel === null
        ? `${agent.roleLabel} is working`
        : `${agent.roleLabel} is working on “${taskLabel}”${taskSuffix}`;
      tone = 'active';
    } else if (agent.status === 'stale') {
      sentence = taskLabel === null
        ? `${agent.roleLabel} has gone quiet`
        : `${agent.roleLabel} has gone quiet on “${taskLabel}”${taskSuffix}`;
      tone = 'attention';
    } else {
      sentence = `${agent.roleLabel} is idle`;
      tone = 'idle';
    }

    return {
      costLabel: costUsd === undefined ? null : formatUsd(costUsd),
      id: agent.role,
      roleLabel: agent.roleLabel,
      sentence,
      taskId: agent.taskId,
      tone,
    };
  });

  return items.sort((a, b) => {
    const toneDelta = toneRank[a.tone] - toneRank[b.tone];
    if (toneDelta !== 0) {
      return toneDelta;
    }

    return a.roleLabel.localeCompare(b.roleLabel);
  });
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}
