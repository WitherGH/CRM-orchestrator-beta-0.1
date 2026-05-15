import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  agentRoles,
  agentRunStatuses,
  orchestratorEventTypes,
} from '@crm-orchestrator/db/schema';

import {
  AdminOrchestratorError,
  adminMutationResultSchema,
  humanRequestCreateSchema,
  inboxTriageActions,
} from './admin-orchestrator';
import { protectedAdminProcedure, router } from './init';
import {
  PR_QUEUE_CI_STATUSES,
  PR_QUEUE_REVIEWER_STATUSES,
  buildPrQueueItems,
} from '../pr-queue';
import { readLiveAgentSnapshot } from '../live-agent-state';
import {
  AGENT_ROLES,
  TASK_EFFORTS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  VaultFsError,
  type VaultTreeNode,
} from '../vault-fs';

const vaultAreaSchema = z.enum(['tasks', 'inbox', 'progress', 'vault']);
const jsonRecordSchema = z.record(z.unknown());
const taskIdSchema = z.string().regex(/^T-\d{3,}$/);

const vaultTaskSchema = z.object({
  assignee: z.enum(AGENT_ROLES),
  body: z.string(),
  created: z.string(),
  dependsOn: z.array(z.string()),
  effort: z.enum(TASK_EFFORTS).nullable(),
  flagged: z.boolean(),
  folderStatus: z.enum(TASK_STATUSES).nullable(),
  frontmatterStatus: z.enum(TASK_STATUSES),
  id: z.string(),
  labels: z.array(z.string()),
  metadata: jsonRecordSchema,
  path: z.string(),
  priority: z.enum(TASK_PRIORITIES),
  projectId: z.string().nullable(),
  spec: z.string().nullable(),
  status: z.enum(TASK_STATUSES),
  title: z.string(),
  updatedAt: z.string(),
});

const vaultMarkdownFileSchema = z.object({
  area: vaultAreaSchema,
  body: z.string(),
  content: z.string(),
  frontmatter: jsonRecordSchema,
  name: z.string(),
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  updatedAt: z.string(),
});

const vaultFileSummarySchema = z.object({
  area: vaultAreaSchema,
  name: z.string(),
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  updatedAt: z.string(),
});

const vaultTreeNodeSchema: z.ZodType<VaultTreeNode> = z.lazy(() => (
  z.object({
    children: z.array(vaultTreeNodeSchema).optional(),
    name: z.string(),
    path: z.string(),
    sizeBytes: z.number().int().nonnegative().optional(),
    type: z.enum(['directory', 'file']),
    updatedAt: z.string().optional(),
  })
));

const agentRunSchema = z.object({
  agentRole: z.enum(agentRoles),
  branch: z.string().nullable(),
  costUsd: z.number(),
  exitCode: z.number().int().nullable(),
  finishedAt: z.date().nullable(),
  id: z.string().uuid(),
  metadata: jsonRecordSchema,
  model: z.string(),
  prNumber: z.number().int().nullable(),
  startedAt: z.date(),
  status: z.enum(agentRunStatuses),
  stderrPath: z.string(),
  stdoutPath: z.string(),
  taskId: z.string(),
  tokensInput: z.number().int().nonnegative(),
  tokensOutput: z.number().int().nonnegative(),
  worktreePath: z.string().nullable(),
});

const dailyCostSchema = z.object({
  agentRole: z.enum(agentRoles),
  costUsd: z.number(),
  date: z.date(),
  tasksCompleted: z.number().int().nonnegative(),
});

const orchestratorEventSchema = z.object({
  agentRunId: z.string().uuid().nullable(),
  id: z.string().uuid(),
  payload: jsonRecordSchema,
  taskId: z.string().nullable(),
  ts: z.date(),
  type: z.enum(orchestratorEventTypes),
});

const prQueueItemSchema = z.object({
  assignee: z.enum(AGENT_ROLES),
  branch: z.string().nullable(),
  ciStatus: z.enum(PR_QUEUE_CI_STATUSES),
  githubUrl: z.string().nullable(),
  mergeEnabled: z.boolean(),
  openedAt: z.string(),
  prNumber: z.number().int().positive(),
  reviewerStatus: z.enum(PR_QUEUE_REVIEWER_STATUSES),
  taskId: taskIdSchema,
  taskStatus: z.enum(TASK_STATUSES).nullable(),
  title: z.string(),
});

const liveAgentSnapshotSchema = z.object({
  activeCount: z.number().int().nonnegative(),
  agents: z.array(
    z.object({
      actions: z.object({
        fullLogEnabled: z.boolean(),
        killEnabled: z.boolean(),
        pauseEnabled: z.boolean(),
      }),
      costLabel: z.string(),
      elapsedLabel: z.string(),
      fullLogHref: z.string().nullable(),
      lastOutput: z.string(),
      logPath: z.string().nullable(),
      model: z.string(),
      role: z.enum(AGENT_ROLES),
      roleLabel: z.string(),
      runner: z.enum(['claude', 'codex']),
      status: z.enum(['idle', 'running', 'stale']),
      taskId: z.string().nullable(),
      taskTitle: z.string().nullable(),
      updatedAt: z.string(),
    }),
  ),
  pollIntervalMs: z.number().int().positive(),
  refreshedAt: z.string(),
  totalRoles: z.number().int().positive(),
});

const emptyObjectInputSchema = z.object({}).default({});
const inboxFilenameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (filename) => !filename.includes('/') && !filename.includes('\\'),
    'Inbox filename must not include path separators',
  )
  .refine((filename) => filename.endsWith('.md'), 'Inbox filename must be a markdown file');

export const adminRouter = router({
  dailyCost: protectedAdminProcedure
    .input(emptyObjectInputSchema)
    .output(z.array(dailyCostSchema))
    .query(async ({ ctx }) => {
      try {
        return await ctx.adminDataStore.listDailyCost();
      } catch (error) {
        throw toInternalReadError(error, 'Failed to read daily cost');
      }
    }),

  inboxList: protectedAdminProcedure
    .input(emptyObjectInputSchema)
    .output(z.array(vaultFileSummarySchema))
    .query(async ({ ctx }) => {
      try {
        return await ctx.vaultFs.listInbox();
      } catch (error) {
        throw toVaultReadError(error, 'Failed to list inbox files');
      }
    }),

  liveAgentState: protectedAdminProcedure
    .input(emptyObjectInputSchema)
    .output(liveAgentSnapshotSchema)
    .query(async ({ ctx }) => {
      try {
        const tasks = await ctx.vaultFs.listTasks();
        return await readLiveAgentSnapshot({ tasks });
      } catch (error) {
        throw toInternalReadError(error, 'Failed to read live agent state');
      }
    }),

  prQueue: protectedAdminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(100),
        })
        .default({}),
    )
    .output(z.array(prQueueItemSchema))
    .query(async ({ ctx, input }) => {
      try {
        const [tasks, runs] = await Promise.all([
          ctx.vaultFs.listTasks(),
          ctx.adminDataStore.listRecentRuns({ limit: input.limit }),
        ]);

        return buildPrQueueItems({ runs, tasks });
      } catch (error) {
        throw toInternalReadError(error, 'Failed to read PR queue');
      }
    }),

  recentRuns: protectedAdminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
        })
        .default({}),
    )
    .output(z.array(agentRunSchema))
    .query(async ({ ctx, input }) => {
      try {
        return await ctx.adminDataStore.listRecentRuns({ limit: input.limit });
      } catch (error) {
        throw toInternalReadError(error, 'Failed to read agent runs');
      }
    }),

  recentEvents: protectedAdminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).default(100),
        })
        .default({}),
    )
    .output(z.array(orchestratorEventSchema))
    .query(async ({ ctx, input }) => {
      try {
        return await ctx.adminDataStore.listRecentEvents({ limit: input.limit });
      } catch (error) {
        throw toInternalReadError(error, 'Failed to read orchestrator events');
      }
    }),

  taskDetail: protectedAdminProcedure
    .input(z.object({ id: taskIdSchema }))
    .output(vaultTaskSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await ctx.vaultFs.readTask(input.id);
      } catch (error) {
        throw toVaultReadError(error, 'Failed to read task');
      }
    }),

  taskList: protectedAdminProcedure
    .input(
      z
        .object({
          status: z.enum(TASK_STATUSES).optional(),
        })
        .default({}),
    )
    .output(z.array(vaultTaskSchema))
    .query(async ({ ctx, input }) => {
      try {
        return await ctx.vaultFs.listTasks(input.status);
      } catch (error) {
        throw toVaultReadError(error, 'Failed to list tasks');
      }
    }),

  vaultRead: protectedAdminProcedure
    .input(z.object({ path: z.string().min(1) }))
    .output(vaultMarkdownFileSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await ctx.vaultFs.read(input.path);
      } catch (error) {
        throw toVaultReadError(error, 'Failed to read vault file');
      }
    }),

  vaultTree: protectedAdminProcedure
    .input(
      z
        .object({
          path: z.string().default(''),
        })
        .default({}),
    )
    .output(z.array(vaultTreeNodeSchema))
    .query(async ({ ctx, input }) => {
      try {
        return await ctx.vaultFs.listVaultTree(input.path);
      } catch (error) {
        throw toVaultReadError(error, 'Failed to read vault tree');
      }
    }),

  agentKill: protectedAdminProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .output(adminMutationResultSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.orchestrator.agentKill({
          actorUserId: ctx.user.id,
          runId: input.runId,
        });
      } catch (error) {
        throw toOrchestratorMutationError(error, 'Failed to kill agent run');
      }
    }),

  agentPause: protectedAdminProcedure
    .input(z.object({ role: z.enum(agentRoles) }))
    .output(adminMutationResultSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.orchestrator.agentPause({
          actorUserId: ctx.user.id,
          role: input.role,
        });
      } catch (error) {
        throw toOrchestratorMutationError(error, 'Failed to pause agent');
      }
    }),

  costCapSet: protectedAdminProcedure
    .input(z.object({ usd: z.number().min(0).max(1000) }))
    .output(adminMutationResultSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.orchestrator.costCapSet({
          actorUserId: ctx.user.id,
          usd: input.usd,
        });
      } catch (error) {
        throw toOrchestratorMutationError(error, 'Failed to set cost cap');
      }
    }),

  createHumanRequest: protectedAdminProcedure
    .input(humanRequestCreateSchema)
    .output(adminMutationResultSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.orchestrator.createHumanRequest({
          actorUserId: ctx.user.id,
          brief: input.brief,
          humanNotes: input.humanNotes ?? null,
          labels: input.labels,
          priority: input.priority,
          projectId: input.projectId ?? null,
          roles: input.roles,
          targetArea: input.targetArea ?? null,
          title: input.title,
        });
      } catch (error) {
        throw toOrchestratorMutationError(error, 'Failed to create human request');
      }
    }),

  inboxTriage: protectedAdminProcedure
    .input(
      z.object({
        action: z.enum(inboxTriageActions),
        filename: inboxFilenameSchema,
      }),
    )
    .output(adminMutationResultSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.orchestrator.inboxTriage({
          action: input.action,
          actorUserId: ctx.user.id,
          filename: input.filename,
        });
      } catch (error) {
        throw toOrchestratorMutationError(error, 'Failed to triage inbox item');
      }
    }),

  prMerge: protectedAdminProcedure
    .input(z.object({ prNumber: z.number().int().positive() }))
    .output(adminMutationResultSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.orchestrator.prMerge({
          actorUserId: ctx.user.id,
          prNumber: input.prNumber,
        });
      } catch (error) {
        throw toOrchestratorMutationError(error, 'Failed to merge pull request');
      }
    }),

  prMergeReady: protectedAdminProcedure
    .output(adminMutationResultSchema)
    .mutation(async ({ ctx }) => {
      try {
        return await ctx.orchestrator.prMergeReady({
          actorUserId: ctx.user.id,
        });
      } catch (error) {
        throw toOrchestratorMutationError(error, 'Failed to run reviewer merge-ready process');
      }
    }),

  taskReprioritize: protectedAdminProcedure
    .input(
      z.object({
        id: taskIdSchema,
        priority: z.enum(TASK_PRIORITIES),
      }),
    )
    .output(adminMutationResultSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.orchestrator.taskReprioritize({
          actorUserId: ctx.user.id,
          id: input.id,
          priority: input.priority,
        });
      } catch (error) {
        throw toOrchestratorMutationError(error, 'Failed to reprioritize task');
      }
    }),
});

function toVaultReadError(error: unknown, fallbackMessage: string): TRPCError {
  if (error instanceof VaultFsError) {
    const code = error.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'BAD_REQUEST';
    return new TRPCError({ code, message: error.message });
  }

  return toInternalReadError(error, fallbackMessage);
}

function toInternalReadError(error: unknown, message: string): TRPCError {
  if (error instanceof TRPCError) {
    return error;
  }

  return new TRPCError({
    cause: error,
    code: 'INTERNAL_SERVER_ERROR',
    message,
  });
}

function toOrchestratorMutationError(error: unknown, fallbackMessage: string): TRPCError {
  if (error instanceof AdminOrchestratorError) {
    if (error.code === 'BAD_REQUEST') {
      return new TRPCError({ code: 'BAD_REQUEST', message: error.message });
    }

    if (error.code === 'CONFLICT') {
      return new TRPCError({ code: 'CONFLICT', message: error.message });
    }

    if (error.code === 'NOT_FOUND') {
      return new TRPCError({ code: 'NOT_FOUND', message: error.message });
    }

    return new TRPCError({
      cause: error,
      code: 'INTERNAL_SERVER_ERROR',
      message: error.message,
    });
  }

  if (error instanceof TRPCError) {
    return error;
  }

  return new TRPCError({
    cause: error,
    code: 'INTERNAL_SERVER_ERROR',
    message: fallbackMessage,
  });
}
