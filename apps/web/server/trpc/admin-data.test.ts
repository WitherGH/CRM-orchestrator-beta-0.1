import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  agentRuns,
  dailyCost,
  orchestratorEvents,
  type AgentRun,
  type DailyCost,
  type OrchestratorEvent,
} from '@crm-orchestrator/db/schema';

import {
  createDrizzleAdminDataStore,
  type AgentRunSelectBuilder,
  type AdminReadDatabase,
  type DailyCostSelectBuilder,
  type OrchestratorEventSelectBuilder,
} from './admin-data';

type OrchestratorTable = typeof agentRuns | typeof dailyCost | typeof orchestratorEvents;

describe('createDrizzleAdminDataStore', () => {
  it('reads recent agent runs through the Drizzle query builder with a caller limit', async () => {
    const runs = [
      createAgentRun({ taskId: 'T-001' }),
      createAgentRun({ taskId: 'T-002' }),
    ];
    const db = new FakeAdminReadDatabase({ costs: [], events: [], runs });
    const store = createDrizzleAdminDataStore(db);

    const result = await store.listRecentRuns({ limit: 1 });

    expect(result).toEqual([runs[0]]);
    expect(db.seenTables).toEqual(['agent_runs']);
    expect(db.seenLimits).toEqual([1]);
    expect(db.orderByCount).toBe(1);
  });

  it('reads daily cost rows through the Drizzle query builder', async () => {
    const costs = [createDailyCost({ agentRole: 'developer' })];
    const db = new FakeAdminReadDatabase({ costs, events: [], runs: [] });
    const store = createDrizzleAdminDataStore(db);

    const result = await store.listDailyCost();

    expect(result).toEqual(costs);
    expect(db.seenTables).toEqual(['daily_cost']);
    expect(db.orderByCount).toBe(1);
  });

  it('reads recent orchestrator events through the Drizzle query builder with a caller limit', async () => {
    const events = [
      createOrchestratorEvent({ taskId: 'T-016', type: 'agent.started' }),
      createOrchestratorEvent({ taskId: 'T-015', type: 'tick.end' }),
    ];
    const db = new FakeAdminReadDatabase({ costs: [], events, runs: [] });
    const store = createDrizzleAdminDataStore(db);

    const result = await store.listRecentEvents({ limit: 1 });

    expect(result).toEqual([events[0]]);
    expect(db.seenTables).toEqual(['orchestrator_events']);
    expect(db.seenLimits).toEqual([1]);
    expect(db.orderByCount).toBe(1);
  });
});

class FakeAdminReadDatabase implements AdminReadDatabase {
  readonly seenLimits: number[] = [];
  readonly seenTables: string[] = [];
  orderByCount = 0;

  constructor(
    private readonly fixtures: {
      costs: DailyCost[];
      events: OrchestratorEvent[];
      runs: AgentRun[];
    },
  ) {}

  select(): AgentRunSelectBuilder & DailyCostSelectBuilder & OrchestratorEventSelectBuilder {
    return new FakeSelectBuilder(this);
  }

  get costs(): DailyCost[] {
    return this.fixtures.costs;
  }

  get runs(): AgentRun[] {
    return this.fixtures.runs;
  }

  get events(): OrchestratorEvent[] {
    return this.fixtures.events;
  }
}

class FakeSelectBuilder implements
  AgentRunSelectBuilder,
  DailyCostSelectBuilder,
  OrchestratorEventSelectBuilder {
  constructor(private readonly db: FakeAdminReadDatabase) {}

  from(table: typeof agentRuns): {
    orderBy(orderBy: unknown): { limit(limit: number): Promise<AgentRun[]> };
  };
  from(table: typeof dailyCost): {
    orderBy(orderBy: unknown): Promise<DailyCost[]>;
  };
  from(table: typeof orchestratorEvents): {
    orderBy(orderBy: unknown): { limit(limit: number): Promise<OrchestratorEvent[]> };
  };
  from(table: OrchestratorTable) {
    if (table === agentRuns) {
      this.db.seenTables.push('agent_runs');
      return {
        orderBy: (_orderBy: unknown) => {
          this.db.orderByCount += 1;
          return {
            limit: async (limit: number) => {
              this.db.seenLimits.push(limit);
              return this.db.runs.slice(0, limit);
            },
          };
        },
      };
    }

    if (table === orchestratorEvents) {
      this.db.seenTables.push('orchestrator_events');
      return {
        orderBy: (_orderBy: unknown) => {
          this.db.orderByCount += 1;
          return {
            limit: async (limit: number) => {
              this.db.seenLimits.push(limit);
              return this.db.events.slice(0, limit);
            },
          };
        },
      };
    }

    this.db.seenTables.push('daily_cost');
    return {
      orderBy: async (_orderBy: unknown) => {
        this.db.orderByCount += 1;
        return this.db.costs;
      },
    };
  }
}

function createAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    agentRole: 'developer',
    branch: 'agent/developer/T-001-test',
    costUsd: 0.125,
    exitCode: null,
    finishedAt: null,
    id: randomUUID(),
    metadata: {},
    model: 'gpt-5.5',
    prNumber: null,
    startedAt: new Date('2026-05-14T10:00:00.000Z'),
    status: 'running',
    stderrPath: '/tmp/T-001.err',
    stdoutPath: '/tmp/T-001.out',
    taskId: 'T-001',
    tokensInput: 100,
    tokensOutput: 50,
    worktreePath: '/worktrees/T-001',
    ...overrides,
  };
}

function createDailyCost(overrides: Partial<DailyCost> = {}): DailyCost {
  return {
    agentRole: 'developer',
    costUsd: 1.25,
    date: new Date('2026-05-14T00:00:00.000Z'),
    tasksCompleted: 2,
    ...overrides,
  };
}

function createOrchestratorEvent(
  overrides: Partial<OrchestratorEvent> = {},
): OrchestratorEvent {
  return {
    agentRunId: null,
    id: randomUUID(),
    payload: {},
    taskId: 'T-001',
    ts: new Date('2026-05-14T12:00:00.000Z'),
    type: 'tick.start',
    ...overrides,
  };
}
