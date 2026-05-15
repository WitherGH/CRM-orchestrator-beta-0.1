import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import matter from 'gray-matter';
import { z } from 'zod';

export const HUMAN_REQUEST_ROLE_ORDER = [
  'architect',
  'pm',
  'designer',
  'developer',
  'reviewer',
  'tester',
] as const;

export const HUMAN_REQUEST_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;

export type HumanRequestRole = (typeof HUMAN_REQUEST_ROLE_ORDER)[number];
export type HumanRequestPriority = (typeof HUMAN_REQUEST_PRIORITIES)[number];

export interface HumanRequestTaskPlan {
  assignee: HumanRequestRole;
  body: string;
  dependsOn: string[];
  filename: string;
  id: string;
  model: string;
  projectId: string | null;
  title: string;
}

export interface HumanRequestPlan {
  requestId: string;
  taskIds: string[];
  tasks: HumanRequestTaskPlan[];
}

export interface CreateHumanRequestResult {
  message: string;
  ok: true;
  requestId: string;
  taskIds: string[];
}

export interface CreateHumanRequestOptions {
  existingTaskIds?: readonly string[];
  now?: () => Date;
  vaultPath: string;
}

const labelSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Labels must be lowercase slugs');

const optionalTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}, z.string().max(160).nullable().optional());

const projectIdSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}, z.string().max(80).regex(/^[a-z0-9][a-z0-9-]*$/).nullable().optional());

const roleSelectionSchema = z.object({
  enabled: z.boolean(),
  model: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z0-9._:-]+$/, 'Model ids may include letters, numbers, dots, underscores, colons, and hyphens'),
  role: z.enum(HUMAN_REQUEST_ROLE_ORDER),
});

export const humanRequestInputSchema = z
  .object({
    actorUserId: z.string().trim().min(1).max(128),
    brief: z.string().trim().min(10).max(8_000),
    humanNotes: z.preprocess((value) => {
      if (typeof value !== 'string') {
        return value;
      }

      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }, z.string().max(6_000).nullable().optional()),
    labels: z.array(labelSchema).max(12).default([]),
    priority: z.enum(HUMAN_REQUEST_PRIORITIES),
    projectId: projectIdSchema,
    roles: z.array(roleSelectionSchema).min(1).max(HUMAN_REQUEST_ROLE_ORDER.length),
    targetArea: optionalTrimmedStringSchema,
    title: z.string().trim().min(3).max(140),
  })
  .superRefine((input, ctx) => {
    const seen = new Set<HumanRequestRole>();
    for (const entry of input.roles) {
      if (seen.has(entry.role)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate role: ${entry.role}`,
          path: ['roles'],
        });
      }
      seen.add(entry.role);
    }

    if (!input.roles.some((entry) => entry.enabled)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one pipeline role must be enabled',
        path: ['roles'],
      });
    }
  });

export type HumanRequestInput = z.infer<typeof humanRequestInputSchema>;

const roleTaskCopy: Record<HumanRequestRole, string> = {
  architect: 'Clarify architecture constraints, ADR impact, feature spec changes, and any open questions before downstream work starts.',
  developer: 'Implement the approved task set in worktrees, keep code scoped to the vault-backed requirements, and leave review-ready commits.',
  designer: 'Add UX and design requirements when the request touches product UI, components, flow copy, density, or interaction states.',
  pm: 'Decompose the clarified request into executable tasks with dependencies, priorities, labels, and acceptance criteria.',
  reviewer: 'Inspect resulting PRs against the task, vault notes, specs, ADRs, and project quality bar before merge readiness.',
  tester: 'Add or run focused QA checks, report defects, and verify the workflow outcome is testable from the user surface.',
};

const roleEffort: Record<HumanRequestRole, 'S' | 'M' | 'L'> = {
  architect: 'M',
  developer: 'L',
  designer: 'M',
  pm: 'M',
  reviewer: 'M',
  tester: 'M',
};

export function buildHumanRequestPlan(
  rawInput: HumanRequestInput,
  existingTaskIds: readonly string[],
  now = new Date(),
): HumanRequestPlan {
  const input = humanRequestInputSchema.parse(rawInput);
  const enabledRoles = HUMAN_REQUEST_ROLE_ORDER
    .map((role) => input.roles.find((entry) => entry.role === role))
    .filter((entry): entry is HumanRequestInput['roles'][number] => entry !== undefined && entry.enabled);
  const requestId = buildRequestId(input.title, now);
  const firstTaskNumber = nextTaskNumber(existingTaskIds);
  const labels = uniqueStrings(['human-request', 'orchestrator', ...input.labels]);

  const plannedIds = enabledRoles.map((_, index) => formatTaskId(firstTaskNumber + index));
  const tasks = enabledRoles.map((entry, index): HumanRequestTaskPlan => {
    const id = plannedIds[index];
    const dependsOn = index === 0 ? [] : [plannedIds[index - 1]];
    const taskTitle = `${roleLabel(entry.role)}: ${input.title}`;

    return {
      assignee: entry.role,
      body: buildTaskBody({
        allTasks: plannedIds,
        dependsOn,
        input,
        model: entry.model,
        requestId,
        role: entry.role,
      }),
      dependsOn,
      filename: `${id}-${entry.role}-${slugify(input.title)}.md`,
      id,
      model: entry.model,
      projectId: input.projectId ?? null,
      title: taskTitle,
    };
  });

  return {
    requestId,
    taskIds: tasks.map((task) => task.id),
    tasks,
  };
}

export async function createHumanRequestTasks(
  rawInput: HumanRequestInput,
  options: CreateHumanRequestOptions,
): Promise<CreateHumanRequestResult> {
  const now = options.now?.() ?? new Date();
  const existingTaskIds = options.existingTaskIds ?? await readExistingTaskIds(options.vaultPath);
  const plan = buildHumanRequestPlan(rawInput, existingTaskIds, now);
  const input = humanRequestInputSchema.parse(rawInput);
  const backlogDir = input.projectId === null || input.projectId === undefined
    ? join(options.vaultPath, '04-tasks', 'backlog')
    : join(options.vaultPath, '04-tasks', input.projectId, 'backlog');

  await mkdir(backlogDir, { recursive: true });

  for (const task of plan.tasks) {
    const content = matter.stringify(task.body, {
      id: task.id,
      title: task.title,
      status: 'backlog',
      priority: input.priority,
      effort: roleEffort[task.assignee],
      assignee: task.assignee,
      depends_on: task.dependsOn,
      labels: uniqueStrings(['human-request', 'orchestrator', ...input.labels]),
      created: formatDate(now),
      flagged: false,
      project_id: input.projectId ?? null,
      request_id: plan.requestId,
      requested_by: input.actorUserId,
      target_area: input.targetArea ?? null,
      model: task.model,
    });

    await writeFile(join(backlogDir, task.filename), content, { flag: 'wx' });
  }

  return {
    message: `Created ${plan.taskIds.length} task(s) for ${plan.requestId}`,
    ok: true,
    requestId: plan.requestId,
    taskIds: plan.taskIds,
  };
}

async function readExistingTaskIds(vaultPath: string): Promise<string[]> {
  const taskRoot = join(vaultPath, '04-tasks');
  const ids: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }

      const match = entry.name.match(/^(T-\d{3,})/);
      if (match) {
        ids.push(match[1]);
      }
    }
  }

  await walk(taskRoot);
  return ids;
}

function buildTaskBody({
  allTasks,
  dependsOn,
  input,
  model,
  requestId,
  role,
}: {
  allTasks: readonly string[];
  dependsOn: readonly string[];
  input: HumanRequestInput;
  model: string;
  requestId: string;
  role: HumanRequestRole;
}): string {
  const pipelineLines = HUMAN_REQUEST_ROLE_ORDER
    .map((candidate) => input.roles.find((entry) => entry.role === candidate))
    .filter((entry): entry is HumanRequestInput['roles'][number] => entry !== undefined && entry.enabled)
    .map((entry, index) => `${index + 1}. ${roleLabel(entry.role)}: ${allTasks[index]} via ${entry.model}`);
  const notes = input.humanNotes ?? 'None.';
  const targetArea = input.targetArea ?? 'Not specified';
  const project = input.projectId ?? 'Unscoped';
  const dependencyText = dependsOn.length > 0 ? dependsOn.join(', ') : 'None';

  return [
    '## What',
    `${roleLabel(role)} pipeline task for human request ${requestId}: ${input.title}`,
    '',
    '## Role responsibility',
    roleTaskCopy[role],
    '',
    '## Original brief',
    input.brief,
    '',
    '## Request context',
    `- Project: ${project}`,
    `- Target area: ${targetArea}`,
    `- Selected model: ${model}`,
    `- Depends on: ${dependencyText}`,
    '',
    '## Planned role pipeline',
    ...pipelineLines,
    '',
    '## Human notes',
    notes,
    '',
    '## Acceptance criteria',
    '- Keep output explicit and reviewable in the vault before downstream roles act.',
    '- Do not start downstream work until this task dependencies are satisfied.',
    '- Preserve the generated depends_on order as the execution contract.',
    '',
    '## Reference materials',
    '- [[F-001-multi-agent-crm]]',
    '- [[ADR-001-crm-orchestrator-architecture]]',
    '- [[ADR-003-agent-role-pipeline]]',
    '',
  ].join('\n');
}

function buildRequestId(title: string, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
  return `R-${stamp}-${slugify(title).slice(0, 28)}`;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatTaskId(value: number): string {
  return `T-${String(value).padStart(3, '0')}`;
}

function nextTaskNumber(existingTaskIds: readonly string[]): number {
  const max = existingTaskIds.reduce((currentMax, id) => {
    const match = id.match(/^T-(\d{3,})$/);
    return match ? Math.max(currentMax, Number(match[1])) : currentMax;
  }, 0);

  return max + 1;
}

function roleLabel(role: HumanRequestRole): string {
  if (role === 'pm') {
    return 'PM';
  }

  return role[0].toUpperCase() + role.slice(1);
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 44);

  return slug === '' ? 'human-request' : slug;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
