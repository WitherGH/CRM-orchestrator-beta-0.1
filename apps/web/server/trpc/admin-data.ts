import { desc } from 'drizzle-orm';

import {
  agentRuns,
  dailyCost,
  orchestratorEvents,
  type AgentRun,
  type DailyCost,
  type OrchestratorEvent,
} from '@crm-orchestrator/db/schema';

export interface AdminDataStore {
  listDailyCost(): Promise<DailyCost[]>;
  listRecentEvents(input: { limit: number }): Promise<OrchestratorEvent[]>;
  listRecentRuns(input: { limit: number }): Promise<AgentRun[]>;
}

export interface LimitedQuery<TRecord> {
  limit(limit: number): Promise<TRecord[]>;
}

export interface OrderedLimitedQuery<TRecord> {
  orderBy(orderBy: unknown): LimitedQuery<TRecord>;
}

export interface OrderedQuery<TRecord> {
  orderBy(orderBy: unknown): Promise<TRecord[]>;
}

export interface AgentRunSelectBuilder {
  from(table: typeof agentRuns): OrderedLimitedQuery<AgentRun>;
}

export interface DailyCostSelectBuilder {
  from(table: typeof dailyCost): OrderedQuery<DailyCost>;
}

export interface OrchestratorEventSelectBuilder {
  from(table: typeof orchestratorEvents): OrderedLimitedQuery<OrchestratorEvent>;
}

export interface AgentRunReadDatabase {
  select(): AgentRunSelectBuilder;
}

export interface DailyCostReadDatabase {
  select(): DailyCostSelectBuilder;
}

export interface OrchestratorEventReadDatabase {
  select(): OrchestratorEventSelectBuilder;
}

export type AdminReadDatabase =
  & AgentRunReadDatabase
  & DailyCostReadDatabase
  & OrchestratorEventReadDatabase;

export function createDrizzleAdminDataStore(
  db: AdminReadDatabase,
): AdminDataStore {
  return {
    listDailyCost() {
      const costDb: DailyCostReadDatabase = db;
      return costDb.select().from(dailyCost).orderBy(desc(dailyCost.date));
    },
    listRecentEvents({ limit }) {
      const eventsDb: OrchestratorEventReadDatabase = db;
      return eventsDb
        .select()
        .from(orchestratorEvents)
        .orderBy(desc(orchestratorEvents.ts))
        .limit(limit);
    },
    listRecentRuns({ limit }) {
      const runsDb: AgentRunReadDatabase = db;
      return runsDb
        .select()
        .from(agentRuns)
        .orderBy(desc(agentRuns.startedAt))
        .limit(limit);
    },
  };
}
