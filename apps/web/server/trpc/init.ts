import { initTRPC, TRPCError } from '@trpc/server';

import type { AdminDataStore } from './admin-data';
import type { AdminOrchestratorClient } from './admin-orchestrator';
import type {
  TaskStatus,
  VaultFileSummary,
  VaultMarkdownFile,
  VaultTask,
  VaultTreeNode,
} from '../vault-fs';

export interface AdminVaultReader {
  listInbox(): Promise<VaultFileSummary[]>;
  listTasks(status?: TaskStatus): Promise<VaultTask[]>;
  listVaultTree(path?: string): Promise<VaultTreeNode[]>;
  read(path: string): Promise<VaultMarkdownFile>;
  readTask(id: string): Promise<VaultTask>;
}

export interface TRPCUser {
  id: string;
  isAdmin: boolean;
}

export interface TRPCContext {
  adminDataStore: AdminDataStore;
  orchestrator: AdminOrchestratorClient;
  user: TRPCUser | null;
  vaultFs: AdminVaultReader;
}

const t = initTRPC.context<TRPCContext>().create();

const enforceAdmin = t.middleware(({ ctx, next }) => {
  if (ctx.user === null) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Admin session required',
    });
  }

  if (!ctx.user.isAdmin) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin role required',
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: {
        id: ctx.user.id,
        isAdmin: true,
      },
    },
  });
});

export const createCallerFactory = t.createCallerFactory;
export const protectedAdminProcedure = t.procedure.use(enforceAdmin);
export const publicProcedure = t.procedure;
export const router = t.router;
