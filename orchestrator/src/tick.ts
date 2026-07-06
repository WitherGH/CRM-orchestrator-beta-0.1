// orchestrator/src/tick.ts
// CRM Orchestrator — Multi-Agent Orchestrator v0.3
// Fixes: dotenv loading, ensureWorktree copies legacy + symlinks vault, stdout logging

import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import { appendFile, cp, mkdir, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { basename, dirname, extname, isAbsolute, join, relative, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import matter from 'gray-matter';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  createHumanRequestTasks,
  humanRequestInputSchema,
  type CreateHumanRequestResult,
  type HumanRequestInput,
} from './human-request';

// ============================================================================
// Load .env from repo root (two levels up from orchestrator/src/)
// ============================================================================

function loadDotenv(): void {
  try {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const envPath = join(here, '../../.env');
    if (!existsSync(envPath)) return;
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
    console.log('[env] loaded .env from repo root');
  } catch (err) {
    console.warn('[env] could not load .env:', String(err));
  }
}

loadDotenv();

// ============================================================================
// Types
// ============================================================================

const TASK_STATUSES = [
  'backlog',
  'in-progress',
  'blocked-question',
  'review',
  'merge-ready',
  'done',
  'failed',
] as const;
const TASK_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
const AGENT_ROLES = ['architect', 'designer', 'pm', 'reviewer', 'developer', 'tester'] as const;

const TaskStatus = z.enum(TASK_STATUSES);
type TaskStatus = z.infer<typeof TaskStatus>;

const TaskPriority = z.enum(TASK_PRIORITIES);
type TaskPriority = z.infer<typeof TaskPriority>;

const AgentRole = z.enum(AGENT_ROLES);
type AgentRole = z.infer<typeof AgentRole>;

const TaskFrontmatter = z.object({
  id: z.string().regex(/^T-\d{3,}$/),
  title: z.string(),
  status: TaskStatus,
  priority: TaskPriority.default('P2'),
  effort: z.enum(['XS', 'S', 'M', 'L', 'XL']).optional(),
  assignee: AgentRole,
  depends_on: z.array(z.string()).default([]),
  spec: z.string().optional(),
  labels: z.array(z.string()).default([]),
  created: z.string(),
  flagged: z.boolean().default(false),
  project_id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  pr_number: z.number().int().positive().optional(),
  pr_url: z.string().url().optional(),
  model: z.string().optional(),
  artifact_files: z.array(z.object({
    kind: z.string().optional(),
    label: z.string(),
    path: z.string(),
  })).optional(),
  artifact_links: z.array(z.object({
    href: z.string(),
    kind: z.string().optional(),
    label: z.string(),
  })).optional(),
  branch: z.string().optional(),
  changed_files: z.array(z.string()).optional(),
  created_files: z.array(z.string()).optional(),
  deleted_files: z.array(z.string()).optional(),
  merged_at: z.string().optional(),
  merged_by: z.string().optional(),
});

const MergePullRequestBody = z.object({
  actorUserId: z.string().min(1),
});

const HumanRequestBody = humanRequestInputSchema;

const TaskControlBody = z
  .object({
    actorUserId: z.string().min(1),
    body: z.string().max(20_000).optional(),
    flagged: z.boolean().optional(),
    projectId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
    status: TaskStatus.optional(),
    title: z.string().trim().min(3).max(180).optional(),
  })
  .refine((input) => (
    input.status !== undefined
    || input.flagged !== undefined
    || input.title !== undefined
    || input.body !== undefined
  ), {
    message: 'At least one task update field is required',
  });

const ActorBody = z.object({
  actorUserId: z.string().min(1),
  projectId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
});

const TickBody = z.object({
  actorUserId: z.string().min(1),
  projectId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  taskId: z.string().regex(/^T-\d{3,}$/).optional(),
});

const ModelId = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9._:-]+$/);

const AgentRoutingBody = z
  .object({
    actorUserId: z.string().min(1),
    model: ModelId.optional(),
    runner: z.enum(['claude', 'codex']).optional(),
  })
  .refine((input) => input.model !== undefined || input.runner !== undefined, {
    message: 'At least one routing field is required',
  });

type Task = z.infer<typeof TaskFrontmatter> & {
  body: string;
  filepath: string;
};

type AgentRunner = 'claude' | 'codex';

// ============================================================================
// Config
// ============================================================================

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../..');
const VAULT_PATH = process.env.ORCHESTRATOR_VAULT_PATH ?? join(REPO_ROOT, '.vault');
const WORKTREE_BASE = join(REPO_ROOT, 'worktrees');
const COST_CAP_USD = Number(process.env.ORCHESTRATOR_COST_CAP_USD ?? '50');
const HTTP_HOST = process.env.ORCHESTRATOR_HTTP_HOST ?? '127.0.0.1';
const HTTP_PORT = Number(process.env.ORCHESTRATOR_HTTP_PORT ?? '4373');
const TICK_INTERVAL_MS = 60_000;
const AGENT_TIMEOUT_MS = Number(process.env.ORCHESTRATOR_AGENT_TIMEOUT_MS ?? String(45 * 60_000));

const MAX_PARALLEL_PER_ROLE: Record<AgentRole, number> = {
  architect: 1,
  designer: 1,
  pm: 1,
  reviewer: 2,
  developer: 4,
  tester: 2,
};

const AGENT_RUNNER: Record<AgentRole, AgentRunner> = {
  architect: 'claude',
  designer: 'claude',
  pm: 'claude',
  reviewer: 'claude',
  developer: 'codex',
  tester: 'codex',
};

const DEFAULT_AGENT_MODEL: Record<AgentRole, string> = {
  architect: 'opus',
  designer: 'sonnet',
  pm: 'sonnet',
  reviewer: 'opus',
  developer: 'gpt-5.5',
  tester: 'gpt-5.5',
};

const DEFAULT_MODEL_LIMIT_RESETS: Record<string, string> = {
  'opus': '17:00',
  'sonnet': '17:00',
  'gpt-5.5': '17:00',
};
const AGENT_ROUTING_PATH = process.env.ORCHESTRATOR_AGENT_ROUTING_PATH
  ?? join(VAULT_PATH, '06-progress', 'agent-routing.json');

type AgentRuntimeConfig = {
  model: string;
  runner: 'claude' | 'codex';
};

type AgentRoutingOverrides = Partial<Record<AgentRole, Partial<AgentRuntimeConfig>>>;

function envKeyForRole(role: AgentRole, suffix: 'MODEL' | 'RUNNER'): string {
  return `ORCHESTRATOR_${role.toUpperCase()}_${suffix}`;
}

function readAgentRoutingOverrides(routingPath = AGENT_ROUTING_PATH): AgentRoutingOverrides {
  if (!existsSync(routingPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(routingPath, 'utf-8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    const overrides: AgentRoutingOverrides = {};
    for (const [role, value] of Object.entries(parsed)) {
      if (!AGENT_ROLES.includes(role as AgentRole) || typeof value !== 'object' || value === null || Array.isArray(value)) {
        continue;
      }

      const candidate = value as Record<string, unknown>;
      const override: Partial<AgentRuntimeConfig> = {};
      if (typeof candidate.model === 'string' && ModelId.safeParse(candidate.model).success) {
        override.model = candidate.model;
      }
      if (candidate.runner === 'claude' || candidate.runner === 'codex') {
        override.runner = candidate.runner;
      }
      overrides[role as AgentRole] = override;
    }

    return overrides;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[models] could not read agent routing overrides: ${msg}`);
    return {};
  }
}

async function updateAgentRoutingControl(
  role: AgentRole,
  input: Partial<AgentRuntimeConfig>,
  routingPath = AGENT_ROUTING_PATH,
): Promise<OrchestratorMutationResult> {
  const overrides = readAgentRoutingOverrides(routingPath);
  const next = {
    ...overrides[role],
    ...input,
  };

  overrides[role] = next;
  await mkdir(dirname(routingPath), { recursive: true });
  const tmpPath = `${routingPath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(overrides, null, 2)}\n`, 'utf-8');
  await rename(tmpPath, routingPath);

  return {
    message: `${role} routing updated to ${next.runner ?? readAgentRuntimeConfig(role, undefined, routingPath).runner}:${next.model ?? readAgentRuntimeConfig(role, undefined, routingPath).model}`,
    ok: true,
    requestId: role,
  };
}

function readAgentRuntimeConfig(
  role: AgentRole,
  modelOverride?: string,
  routingPath = AGENT_ROUTING_PATH,
): AgentRuntimeConfig {
  const routingOverride = readAgentRoutingOverrides(routingPath)[role];
  const runnerOverride = process.env[envKeyForRole(role, 'RUNNER')];
  const runner = runnerOverride === 'claude' || runnerOverride === 'codex'
    ? runnerOverride
    : routingOverride?.runner ?? AGENT_RUNNER[role];

  return {
    model: modelOverride
      ?? routingOverride?.model
      ?? process.env[envKeyForRole(role, 'MODEL')]
      ?? DEFAULT_AGENT_MODEL[role],
    runner,
  };
}

function parseModelLimitResets(raw = process.env.ORCHESTRATOR_MODEL_LIMIT_RESETS): Record<string, string> {
  if (!raw) return DEFAULT_MODEL_LIMIT_RESETS;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      );
    }
  } catch {
    // Fall through to the compact "model=HH:MM,other=ISO" format.
  }

  return Object.fromEntries(
    raw
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const idx = pair.indexOf('=');
        return idx === -1 ? null : [pair.slice(0, idx).trim(), pair.slice(idx + 1).trim()];
      })
      .filter((pair): pair is [string, string] => Boolean(pair?.[0] && pair[1])),
  );
}

function resolveResetAt(raw: string, now = new Date()): Date | null {
  const clock = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) {
    const resetAt = new Date(now);
    resetAt.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
    if (resetAt <= now) resetAt.setDate(resetAt.getDate() + 1);
    return resetAt;
  }

  const absolute = new Date(raw);
  return Number.isNaN(absolute.getTime()) ? null : absolute;
}

function formatDurationUntil(resetAt: Date, now = new Date()): string {
  const remainingMs = Math.max(0, resetAt.getTime() - now.getTime());
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function describeModelLimit(model: string, now = new Date()): string {
  const raw = parseModelLimitResets()[model];
  if (!raw) return 'limit reset unknown';

  const resetAt = resolveResetAt(raw, now);
  if (!resetAt) return `limit reset ${raw}`;

  return `limit reset in ${formatDurationUntil(resetAt, now)} (${raw})`;
}

function logAgentRouting(tasks: Task[], now = new Date(), routingPath = AGENT_ROUTING_PATH): void {
  const roles = (['architect', 'designer', 'pm', 'reviewer', 'developer', 'tester'] as AgentRole[]);
  console.log('[models] current routing:');
  for (const role of roles) {
    const config = readAgentRuntimeConfig(role, undefined, routingPath);
    console.log(`[models] ${role} → ${config.runner}:${config.model} | ${describeModelLimit(config.model, now)}`);
  }

  if (tasks.length === 0) return;

  console.log('[tick] launch plan:');
  for (const task of tasks) {
    const config = readAgentRuntimeConfig(task.assignee, task.model);
    console.log(`[tick] ${task.id} ${task.assignee} via ${config.runner}:${config.model} → ${task.title}`);
  }
}

export interface OrchestratorRuntimeState {
  activeLaunches: number;
  daemonRunning: boolean;
  lastTickError: string | null;
  lastTickFinishedAt: string | null;
  lastTickStartedAt: string | null;
  processStartedAt: string;
}

const runtimeState: OrchestratorRuntimeState = {
  activeLaunches: 0,
  daemonRunning: false,
  lastTickError: null,
  lastTickFinishedAt: null,
  lastTickStartedAt: null,
  processStartedAt: new Date().toISOString(),
};

const runningAgentProcesses = new Map<string, ChildProcess>();

// ============================================================================
// Vault filesystem helpers
// ============================================================================

async function readTask(filepath: string): Promise<Task | null> {
  try {
    const raw = await readFile(filepath, 'utf-8');
    const parsed = matter(raw);
    const fm = TaskFrontmatter.parse(parsed.data);
    const folderStatus = taskStatusFromFilepath(filepath);
    const projectId = fm.project_id ?? projectIdFromFilepath(filepath);
    return {
      ...fm,
      project_id: projectId ?? fm.project_id,
      status: folderStatus ?? fm.status,
      body: parsed.content,
      filepath,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[vault] failed to read ${filepath}: ${msg}`);
    return null;
  }
}

async function writeTask(task: Task, overrides: Partial<Task> = {}): Promise<void> {
  const fm = { ...task, ...overrides };
  const { body, filepath, ...frontmatter } = fm;
  const content = matter.stringify(body, compactFrontmatter(frontmatter));
  await writeFile(filepath, content, 'utf-8');
}

async function listTasksInDir(
  subdir: TaskStatus,
  vaultPath = VAULT_PATH,
  projectId?: string,
): Promise<Task[]> {
  const taskRoot = join(vaultPath, '04-tasks');
  const files = await listMarkdownFiles(taskRoot);
  const tasks = await Promise.all(files.map((file) => readTask(file)));
  return tasks
    .filter((task): task is Task => task !== null)
    .filter((task) => task.status === subdir)
    .filter((task) => projectId === undefined || task.project_id === projectId);
}

async function listAllTasks(vaultPath = VAULT_PATH, projectId?: string): Promise<Task[]> {
  const taskRoot = join(vaultPath, '04-tasks');
  if (!existsSync(taskRoot)) return [];

  const files = await listMarkdownFiles(taskRoot);
  const tasks = await Promise.all(files.map((file) => readTask(file)));
  return tasks
    .filter((task): task is Task => task !== null)
    .filter((task) => projectId === undefined || task.project_id === projectId);
}

async function findTaskById(taskId: string, vaultPath = VAULT_PATH, projectId?: string): Promise<Task | null> {
  const tasks = await listAllTasks(vaultPath, projectId);
  return tasks.find((task) => task.id === taskId) ?? null;
}

async function moveTask(task: Task, newSubdir: TaskStatus, vaultPath = VAULT_PATH): Promise<Task> {
  const projectId = task.project_id ?? projectIdFromFilepath(task.filepath);
  const dir = projectId === null
    ? join(vaultPath, '04-tasks', newSubdir)
    : join(vaultPath, '04-tasks', projectId, newSubdir);
  await mkdir(dir, { recursive: true });
  const newPath = join(dir, basename(task.filepath));
  const raw = await readFile(task.filepath, 'utf-8');
  const parsed = matter(raw);
  if (newPath === task.filepath) {
    await writeFile(task.filepath, matter.stringify(parsed.content, compactFrontmatter({
      ...parsed.data,
      project_id: projectId ?? parsed.data.project_id,
      status: newSubdir,
    })), 'utf-8');
    return { ...task, project_id: projectId ?? task.project_id, status: newSubdir };
  }

  await writeFile(newPath, matter.stringify(parsed.content, compactFrontmatter({
    ...parsed.data,
    project_id: projectId ?? parsed.data.project_id,
    status: newSubdir,
  })), 'utf-8');
  await rm(task.filepath);
  return { ...task, filepath: newPath, project_id: projectId ?? task.project_id, status: newSubdir };
}

function compactFrontmatter(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];

  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries
    .filter((entry) => !entry.name.startsWith('.'))
    .map(async (entry) => {
      const absolutePath = join(root, entry.name);
      if (entry.isDirectory()) {
        return listMarkdownFiles(absolutePath);
      }

      return entry.isFile() && extname(entry.name) === '.md' && entry.name.startsWith('T-')
        ? [absolutePath]
        : [];
    }));

  return files.flat();
}

function taskStatusFromFilepath(filepath: string): TaskStatus | null {
  const segments = filepath.split(sep).join('/').split('/');
  const taskRootIndex = segments.indexOf('04-tasks');
  if (taskRootIndex === -1) return null;

  const directStatus = segments[taskRootIndex + 1];
  if (TaskStatus.safeParse(directStatus).success) {
    return directStatus as TaskStatus;
  }

  const projectStatus = segments[taskRootIndex + 2];
  return TaskStatus.safeParse(projectStatus).success ? projectStatus as TaskStatus : null;
}

function projectIdFromFilepath(filepath: string): string | null {
  const segments = filepath.split(sep).join('/').split('/');
  const taskRootIndex = segments.indexOf('04-tasks');
  if (taskRootIndex === -1) return null;

  const candidate = segments[taskRootIndex + 1];
  if (candidate === undefined || TaskStatus.safeParse(candidate).success) {
    return null;
  }

  return /^[a-z0-9][a-z0-9-]*$/.test(candidate) ? candidate : null;
}

async function updateTaskControl(
  input: {
    body?: string;
    flagged?: boolean;
    projectId?: string;
    status?: TaskStatus;
    taskId: string;
    title?: string;
  },
  vaultPath = VAULT_PATH,
): Promise<OrchestratorMutationResult> {
  const task = await findTaskById(input.taskId, vaultPath, input.projectId);
  if (task === null) {
    throw new Error(`Task ${input.taskId} not found`);
  }

  const flagged = input.flagged ?? (input.status !== undefined && input.status !== 'failed'
    ? false
    : task.flagged);

  if (input.status !== undefined && input.status !== task.status) {
    const moved = await moveTask(task, input.status, vaultPath);
    await writeTask(moved, { flagged, status: input.status });
    return {
      message: `${input.taskId} moved to ${input.status}`,
      ok: true,
      requestId: input.taskId,
    };
  }

  await writeTask(task, {
    body: input.body ?? task.body,
    flagged,
    status: input.status ?? task.status,
    title: input.title ?? task.title,
  });
  return {
    message: `${input.taskId} updated`,
    ok: true,
    requestId: input.taskId,
  };
}

async function deleteTaskControl(
  taskId: string,
  vaultPath = VAULT_PATH,
): Promise<OrchestratorMutationResult> {
  const task = await findTaskById(taskId, vaultPath);
  if (task === null) {
    throw new Error(`Task ${taskId} not found`);
  }

  await rm(task.filepath);
  return {
    message: `${taskId} deleted`,
    ok: true,
    requestId: taskId,
  };
}

// ============================================================================
// Git operations
// ============================================================================

function exec(
  cmd: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  options: { timeoutMs?: number; logPath?: string; taskId?: string } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      shell: false,
      // Codex waits for additional stdin when the pipe stays open.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const log = options.logPath ? createWriteStream(options.logPath, { flags: 'a' }) : null;
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    if (options.taskId !== undefined) {
      runningAgentProcesses.set(options.taskId, child);
    }

    const cleanup = () => {
      if (
        options.taskId !== undefined
        && runningAgentProcesses.get(options.taskId) === child
      ) {
        runningAgentProcesses.delete(options.taskId);
      }
    };

    const timeout = options.timeoutMs
      ? setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        // Some CLIs ignore SIGTERM mid-request; force-kill after a grace period.
        setTimeout(() => {
          if (child.exitCode === null && !child.killed) {
            child.kill('SIGKILL');
          }
        }, 10_000).unref();
      }, options.timeoutMs)
      : null;

    child.stdout?.on('data', (d) => {
      const text = String(d);
      stdout += text;
      log?.write(text);
    });
    child.stderr?.on('data', (d) => {
      const text = String(d);
      stderr += text;
      log?.write(text);
    });
    child.on('error', (err) => {
      if (timeout) clearTimeout(timeout);
      cleanup();
      log?.end();
      resolve({ stdout, stderr: `${stderr}\n${String(err)}`, code: -1 });
    });
    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout);
      cleanup();
      log?.end();
      resolve({
        stdout,
        stderr: timedOut
          ? `${stderr}\nTimed out after ${options.timeoutMs}ms`
          : stderr,
        code: timedOut ? 124 : code ?? -1,
      });
    });
  });
}

async function configureEphemeralPaths(worktreePath: string): Promise<void> {
  const excludePath = (await exec('git', ['rev-parse', '--git-path', 'info/exclude'], worktreePath))
    .stdout
    .trim();
  const infoExclude = isAbsolute(excludePath) ? excludePath : join(worktreePath, excludePath);
  await mkdir(dirname(infoExclude), { recursive: true });

  const entries = ['.vault', '.vault/**', '.legacy-code', '.legacy-code/**'];
  const existing = existsSync(infoExclude) ? await readFile(infoExclude, 'utf-8') : '';
  const missing = entries.filter((entry) => !existing.split('\n').includes(entry));
  if (missing.length > 0) {
    await appendFile(
      infoExclude,
      `\n# Orchestrator-shared inputs; never commit from agent worktrees\n${missing.join('\n')}\n`,
      'utf-8',
    );
  }

  const trackedVault = (await exec('git', ['ls-files', '.vault'], worktreePath)).stdout
    .split('\n')
    .filter(Boolean);
  if (trackedVault.length > 0) {
    await exec('git', ['update-index', '--skip-worktree', ...trackedVault], worktreePath);
  }
}

async function ensureWorktree(task: Task): Promise<string> {
  await mkdir(WORKTREE_BASE, { recursive: true });
  const wtPath = join(WORKTREE_BASE, task.id);
  const branch = `agent/${task.assignee}/${task.id.toLowerCase()}-${slugify(task.title)}`;

  if (existsSync(wtPath)) {
    console.log(`[git] worktree exists at ${wtPath}`);
    await configureEphemeralPaths(wtPath);
    return wtPath;
  }

  // Create a fresh worktree from main
  await exec('git', ['worktree', 'add', '-b', branch, wtPath, 'main'], REPO_ROOT);
  console.log(`[git] worktree created at ${wtPath} on branch ${branch}`);
  await configureEphemeralPaths(wtPath);

  // ── Copy legacy code so agent sandbox can read it ──────────────────────────
  const legacyPath = process.env.ORCHESTRATOR_LEGACY_PATH;
  if (legacyPath && existsSync(legacyPath)) {
    const legacyDst = join(wtPath, '.legacy-code');
    await cp(legacyPath, legacyDst, { recursive: true });
    console.log(`[git] copied legacy code into worktree at .legacy-code/`);
  } else {
    console.warn(`[git] ORCHESTRATOR_LEGACY_PATH not set or missing: ${legacyPath ?? '(unset)'}`);
  }

  // ── Symlink canonical .vault/ into worktree ────────────────────────────────
  // git worktree add creates .vault/ as a real directory (tracked files).
  // We replace it with a symlink to the canonical vault so agents write there.
  const vaultDst = join(wtPath, '.vault');
  const vaultSrc = VAULT_PATH;
  if (existsSync(vaultDst)) {
    await rm(vaultDst, { recursive: true, force: true });
  }
  await symlink(vaultSrc, vaultDst, 'dir');
  console.log(`[git] .vault symlinked → canonical vault`);

  return wtPath;
}

async function commitAndPush(
  worktreePath: string,
  task: Task,
): Promise<{
  branch: string;
  changedFiles: string[];
  createdFiles: string[];
  deletedFiles: string[];
  prNumber: number | null;
  prUrl: string | null;
}> {
  const agentPathspec = [
    '.',
    ':(exclude).vault',
    ':(exclude).vault/**',
    ':(exclude).legacy-code',
    ':(exclude).legacy-code/**',
    ':(exclude).orchestrator-*.log',
  ];

  await exec('git', ['add', '-A', '--', ...agentPathspec], worktreePath);

  const status = await exec('git', ['status', '--porcelain', '--', ...agentPathspec], worktreePath);
  const changedFiles = parseGitStatusFiles(status.stdout);
  if (status.stdout.trim() === '') {
    console.log(`[git] ${task.id}: nothing to commit`);
    return {
      branch: '',
      changedFiles: [],
      createdFiles: [],
      deletedFiles: [],
      prNumber: null,
      prUrl: null,
    };
  }

  const commitMsg = `${task.assignee}(${task.id}): ${task.title}\n\nRefs: ${task.id}`;
  await exec('git', ['commit', '-m', commitMsg], worktreePath);

  const branch = (
    await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath)
  ).stdout.trim();
  await exec('git', ['push', '-u', 'origin', branch], worktreePath);

  const prBody =
    `Task: ${task.id}\n\nAuto-generated by orchestrator architect agent.`;
  const pr = await exec(
    'gh',
    ['pr', 'create', '--title', task.title, '--body', prBody, '--base', 'main'],
    worktreePath,
  );
  let prNumber = parsePrNumber(pr.stdout);
  let prUrl = parsePrUrl(pr.stdout);

  // On worktree reuse, `gh pr create` fails if a PR already exists for the
  // branch. Recover the existing PR instead of moving the task to review
  // without a PR link.
  if (prNumber === null) {
    const existing = await exec(
      'gh',
      ['pr', 'view', branch, '--json', 'number,url'],
      worktreePath,
    );
    if (existing.code === 0) {
      try {
        const parsed = JSON.parse(existing.stdout) as { number?: number; url?: string };
        if (typeof parsed.number === 'number') prNumber = parsed.number;
        if (typeof parsed.url === 'string') prUrl = parsed.url;
        console.log(`[git] ${task.id}: recovered existing PR #${prNumber ?? '?'} for ${branch}`);
      } catch {
        // Leave prNumber/prUrl null; task will land in review without a PR link.
      }
    }
  }

  return { branch, ...changedFiles, prNumber, prUrl };
}

async function readPendingWorktreeFiles(worktreePath: string): Promise<{
  changedFiles: string[];
  createdFiles: string[];
  deletedFiles: string[];
}> {
  const status = await exec(
    'git',
    [
      'status',
      '--porcelain',
      '--',
      '.',
      ':(exclude).vault',
      ':(exclude).vault/**',
      ':(exclude).legacy-code',
      ':(exclude).legacy-code/**',
      ':(exclude).orchestrator-*.log',
    ],
    worktreePath,
  );

  return parseGitStatusFiles(status.stdout);
}

function parseGitStatusFiles(output: string): {
  changedFiles: string[];
  createdFiles: string[];
  deletedFiles: string[];
} {
  const changedFiles = new Set<string>();
  const createdFiles = new Set<string>();
  const deletedFiles = new Set<string>();

  for (const line of output.split('\n')) {
    if (line.trim() === '') continue;

    const status = line.slice(0, 2);
    const rawPath = line.slice(3).trim();
    const filePath = rawPath.includes(' -> ')
      ? rawPath.split(' -> ').at(-1)?.trim() ?? rawPath
      : rawPath;

    if (filePath === '') continue;

    if (status === '??' || status.includes('A')) {
      createdFiles.add(filePath);
      continue;
    }

    if (status.includes('D')) {
      deletedFiles.add(filePath);
      continue;
    }

    changedFiles.add(filePath);
  }

  return {
    changedFiles: [...changedFiles].sort(),
    createdFiles: [...createdFiles].sort(),
    deletedFiles: [...deletedFiles].sort(),
  };
}

async function stripInjectedMemoryContext(worktreePath: string): Promise<void> {
  const agentsPath = join(worktreePath, 'AGENTS.md');
  if (!existsSync(agentsPath)) return;

  const raw = await readFile(agentsPath, 'utf-8');
  const cleaned = raw.replace(/\n{0,2}<claude-mem-context>[\s\S]*?<\/claude-mem-context>\s*/g, '\n');
  if (cleaned !== raw) {
    await writeFile(agentsPath, cleaned, 'utf-8');
  }
}

function parsePrNumber(ghOutput: string): number | null {
  const match = ghOutput.match(/\/pull\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function parsePrUrl(ghOutput: string): string | null {
  const match = ghOutput.match(/https?:\/\/\S+\/pull\/\d+/);
  return match?.[0] ?? null;
}

function buildRunArtifactFiles(taskId: string, worktreePath: string): Array<{
  kind: string;
  label: string;
  path: string;
}> {
  return [
    {
      kind: 'stdout_log',
      label: 'stdout log',
      path: relativePath(join(worktreePath, '.orchestrator-stdout.log')),
    },
    {
      kind: 'live_log',
      label: 'live log',
      path: relativePath(join(worktreePath, '.orchestrator-live.log')),
    },
    {
      kind: 'worktree',
      label: 'worktree',
      path: relativePath(worktreePath),
    },
  ].map((artifact) => ({
    ...artifact,
    label: `${taskId} ${artifact.label}`,
  }));
}

function relativePath(absolutePath: string): string {
  return isAbsolute(absolutePath)
    ? relative(REPO_ROOT, absolutePath) || '.'
    : absolutePath;
}

async function mergePullRequestWithGh(
  input: MergePullRequestInput,
): Promise<OrchestratorMutationResult> {
  const result = await exec(
    'gh',
    ['pr', 'merge', String(input.prNumber), '--squash'],
    REPO_ROOT,
  );

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || 'gh pr merge failed');
  }

  return {
    message: `PR #${input.prNumber} merge requested by ${input.actorUserId}`,
    ok: true,
  };
}

async function mergeReadyPullRequestsControl(
  input: { actorUserId: string; projectId?: string },
  vaultPath: string,
  mergePullRequest: MergePullRequestHandler,
  now = new Date(),
): Promise<OrchestratorMutationResult> {
  const tasks = await listTasksInDir('merge-ready', vaultPath, input.projectId);
  const mergeable = tasks.filter((task) => task.pr_number !== undefined && !task.flagged);
  const merged: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const task of tasks) {
    if (task.flagged) {
      skipped.push(`${task.id}: flagged`);
      continue;
    }

    if (task.pr_number === undefined) {
      skipped.push(`${task.id}: missing PR number`);
      continue;
    }

    try {
      await mergePullRequest({
        actorUserId: input.actorUserId,
        prNumber: task.pr_number,
      });
      const moved = await moveTask(task, 'done', vaultPath);
      await writeTask(moved, {
        flagged: false,
        merged_at: now.toISOString(),
        merged_by: input.actorUserId,
        status: 'done',
      });
      merged.push(`${task.id} (#${task.pr_number})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await writeTask(task, { flagged: true });
      failed.push(`${task.id}: ${message}`);
    }
  }

  const messageParts = [
    `Reviewer merge run checked ${tasks.length} merge-ready task(s)${input.projectId === undefined ? '' : ` for ${input.projectId}`}`,
    `merged ${merged.length}`,
  ];
  if (skipped.length > 0) {
    messageParts.push(`skipped ${skipped.length}`);
  }
  if (failed.length > 0) {
    messageParts.push(`failed ${failed.length}`);
  }

  const details = [
    merged.length > 0 ? `merged: ${merged.join(', ')}` : null,
    skipped.length > 0 ? `skipped: ${skipped.join('; ')}` : null,
    failed.length > 0 ? `failed: ${failed.join('; ')}` : null,
  ].filter((part): part is string => part !== null);

  return {
    message: details.length > 0
      ? `${messageParts.join(', ')}. ${details.join('. ')}`
      : `${messageParts.join(', ')}. No eligible PRs found.`,
    ok: true,
    requestId: mergeable.length > 0 ? 'merge-ready-reviewer' : null,
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// ============================================================================
// Agent invocation
// ============================================================================

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  costUsd: number;
  costEstimated: boolean;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

async function runAgent(task: Task, worktreePath: string): Promise<RunResult> {
  const { model, runner } = readAgentRuntimeConfig(task.assignee, task.model);
  const started = Date.now();
  const prompt = buildPrompt(task);
  const liveLogPath = join(worktreePath, '.orchestrator-live.log');
  await writeFile(
    liveLogPath,
    `[agent] ${task.id} ${task.assignee} via ${runner}:${model} started at ${new Date(started).toISOString()}\n`,
    'utf-8',
  );

  let result: { stdout: string; stderr: string; code: number };

  if (runner === 'claude') {
    result = await exec(
      'claude',
      ['--agent', task.assignee, '--model', model, '--print', prompt],
      worktreePath,
      claudeAgentEnv(),
      { timeoutMs: AGENT_TIMEOUT_MS, logPath: liveLogPath, taskId: task.id },
    );
  } else {
    // Codex doesn't support --agent flag. Read role file and prepend to prompt.
    const agentFilePath = join(REPO_ROOT, `.codex/agents/${task.assignee}.md`);
    const agentContext = existsSync(agentFilePath)
      ? await readFile(agentFilePath, 'utf-8')
      : '';
    const codexPrompt = agentContext
      ? `${agentContext}\n\n---\n\nYour task:\n${prompt}`
      : prompt;
    result = await exec(
      'codex',
      ['exec', '--model', model, '--dangerously-bypass-approvals-and-sandbox', codexPrompt],
      worktreePath,
      codexAgentEnv(),
      { timeoutMs: AGENT_TIMEOUT_MS, logPath: liveLogPath, taskId: task.id },
    );
  }

  const cost = estimateCost(result.stdout);
  return {
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    costUsd: cost.usd,
    costEstimated: cost.estimated,
    model,
    tokensIn: cost.tokensIn,
    tokensOut: cost.tokensOut,
    durationMs: Date.now() - started,
  };
}

function claudeAgentEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDE_CODE_SIMPLE;
  return env;
}

function codexAgentEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  env.CLAUDE_CODE_SIMPLE = '1';
  return env;
}

function buildPrompt(task: Task): string {
  const lines = [
    `You have been assigned task ${task.id}: "${task.title}".`,
    ``,
    `Task body:`,
    task.body,
    ``,
    `Project: ${task.project_id ?? '(unscoped)'}`,
    ``,
    `Spec: ${task.spec ?? '(none — implement per task body and related ADRs)'}`,
  ];

  const legacyPath = process.env.ORCHESTRATOR_LEGACY_PATH;
  if (legacyPath) {
    lines.push(``, `Legacy codebase (read-only) is available at: ./.legacy-code/`);
  }

  lines.push(
    ``,
    `Vault is available at: ./.vault/ (you may write audit/spec files here).`,
    ``,
    `When done: commit any files you wrote. The orchestrator handles push and PR.`,
  );

  return lines.join('\n');
}

interface CostEstimate {
  usd: number;
  tokensIn: number;
  tokensOut: number;
  estimated: boolean;
}

function estimateCost(output: string): CostEstimate {
  // 1. Codex-style summary line: "Tokens used: N input, M output ... $X.YZ"
  const codex = output.match(/Tokens used: (\d+) input, (\d+) output.*\$(\d+\.\d+)/);
  if (codex) {
    return {
      tokensIn: Number(codex[1]),
      tokensOut: Number(codex[2]),
      usd: Number(codex[3]),
      estimated: false,
    };
  }

  // 2. Claude Code JSON result fields (present with --output-format json,
  //    and often embedded in stream output): total_cost_usd + usage tokens.
  const claudeCost = output.match(/"total_cost_usd"\s*:\s*([0-9]+(?:\.[0-9]+)?)/);
  const claudeIn = output.match(/"input_tokens"\s*:\s*(\d+)/);
  const claudeOut = output.match(/"output_tokens"\s*:\s*(\d+)/);
  if (claudeCost) {
    return {
      tokensIn: claudeIn ? Number(claudeIn[1]) : 0,
      tokensOut: claudeOut ? Number(claudeOut[1]) : 0,
      usd: Number(claudeCost[1]),
      estimated: false,
    };
  }

  // 3. Fallback heuristic: ~4 chars per token. Marked as estimated so the
  //    journal and UI can distinguish real vs guessed spend.
  return {
    tokensIn: Math.floor(output.length / 4),
    tokensOut: Math.floor(output.length / 8),
    usd: (output.length / 4 / 1_000_000) * 3,
    estimated: true,
  };
}

// ============================================================================
// Cost tracking — append-only JSONL journal in the vault.
// Postgres (packages/db daily_cost / agent_runs) can be layered on later;
// the journal keeps the cost cap enforceable without a DB dependency.
// ============================================================================

const COST_JOURNAL_PATH = process.env.ORCHESTRATOR_COST_JOURNAL_PATH
  ?? join(VAULT_PATH, '06-progress', 'cost-journal.jsonl');

interface CostJournalEntry {
  ts: string;
  role: AgentRole;
  taskId: string;
  model: string;
  usd: number;
  tokensIn: number;
  tokensOut: number;
  estimated: boolean;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

async function getTodayCost(now = new Date(), journalPath = COST_JOURNAL_PATH): Promise<number> {
  if (!existsSync(journalPath)) return 0;

  try {
    const raw = await readFile(journalPath, 'utf-8');
    let total = 0;
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      try {
        const entry = JSON.parse(trimmed) as Partial<CostJournalEntry>;
        if (typeof entry.ts !== 'string' || typeof entry.usd !== 'number') continue;
        const ts = new Date(entry.ts);
        if (!Number.isNaN(ts.getTime()) && isSameLocalDay(ts, now) && entry.usd >= 0) {
          total += entry.usd;
        }
      } catch {
        // Skip malformed lines instead of failing the whole tick.
      }
    }
    return total;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[cost] could not read cost journal: ${msg}`);
    return 0;
  }
}

async function recordCost(
  entry: Omit<CostJournalEntry, 'ts'>,
  journalPath = COST_JOURNAL_PATH,
  now = new Date(),
): Promise<void> {
  try {
    await mkdir(dirname(journalPath), { recursive: true });
    await appendFile(
      journalPath,
      `${JSON.stringify({ ts: now.toISOString(), ...entry } satisfies CostJournalEntry)}\n`,
      'utf-8',
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[cost] could not record cost entry: ${msg}`);
  }
}

// ============================================================================
// HTTP status endpoint
// ============================================================================

export interface OrchestratorStatusSnapshot {
  agents: {
    active: number;
    roles: Array<{
      capacity: number;
      limitReset: string;
      model: string;
      role: AgentRole;
      runner: AgentRunner;
      runningCount: number;
      runningTaskIds: string[];
    }>;
    total: number;
  };
  config: {
    agentTimeoutMs: number;
    httpHost: string;
    httpPort: number;
    tickIntervalMs: number;
  };
  cost: {
    capHit: boolean;
    capUsd: number;
    remainingUsd: number;
    todayUsd: number;
  };
  ok: boolean;
  runtime: OrchestratorRuntimeState;
  tasks: {
    byPriority: Record<TaskPriority, number>;
    byStatus: Record<TaskStatus, number>;
    flagged: number;
    total: number;
  };
  timestamp: string;
  uptimeMs: number;
  vault: {
    path: string;
    reachable: boolean;
    taskRoot: string;
    taskRootReachable: boolean;
  };
  worktrees: {
    basePath: string;
    reachable: boolean;
  };
}

export interface OrchestratorStatusError {
  code: 'STATUS_UNAVAILABLE';
  message: string;
  ok: false;
  timestamp: string;
}

export interface OrchestratorMutationResult {
  message?: string;
  ok: true;
  requestId?: string | null;
}

export interface MergePullRequestInput {
  actorUserId: string;
  prNumber: number;
}

type MergePullRequestHandler = (input: MergePullRequestInput) => Promise<OrchestratorMutationResult>;
type CreateHumanRequestHandler = (input: HumanRequestInput) => Promise<CreateHumanRequestResult>;

interface StatusSnapshotOptions {
  costCapUsd?: number;
  createHumanRequest?: CreateHumanRequestHandler;
  agentRoutingPath?: string;
  getTodayCost?: () => Promise<number>;
  httpHost?: string;
  httpPort?: number;
  mergePullRequest?: MergePullRequestHandler;
  now?: () => Date;
  runtime?: OrchestratorRuntimeState;
  vaultPath?: string;
  worktreeBase?: string;
}

interface StatusServerOptions extends StatusSnapshotOptions {
  app?: Hono;
  host?: string;
  port?: number;
}

export interface StartedStatusServer {
  close: () => Promise<void>;
  host: string;
  port: number;
}

function zeroRecord<const T extends readonly string[]>(keys: T): Record<T[number], number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T[number], number>;
}

function cloneRuntimeState(state: OrchestratorRuntimeState): OrchestratorRuntimeState {
  return { ...state };
}

export async function getStatusSnapshot(
  options: StatusSnapshotOptions = {},
): Promise<OrchestratorStatusSnapshot> {
  const now = options.now?.() ?? new Date();
  const vaultPath = options.vaultPath ?? VAULT_PATH;
  const taskRoot = join(vaultPath, '04-tasks');
  const worktreeBase = options.worktreeBase ?? WORKTREE_BASE;
  const costCapUsd = options.costCapUsd ?? COST_CAP_USD;
  const runtime = options.runtime ?? runtimeState;
  const tasks = await listAllTasks(vaultPath);
  const todayUsd = await (options.getTodayCost ?? getTodayCost)();

  const byStatus = zeroRecord(TASK_STATUSES);
  const byPriority = zeroRecord(TASK_PRIORITIES);
  let flagged = 0;

  for (const task of tasks) {
    byStatus[task.status] += 1;
    byPriority[task.priority] += 1;
    if (task.flagged) {
      flagged += 1;
    }
  }

  const activeProcessIds = new Set(runningAgentProcesses.keys());
  const roles = AGENT_ROLES.map((role) => {
    const config = readAgentRuntimeConfig(role, undefined, options.agentRoutingPath);
    const runningTaskIds = tasks
      .filter((task) => (
        task.assignee === role
        && task.status === 'in-progress'
        && activeProcessIds.has(task.id)
      ))
      .map((task) => task.id)
      .sort();

    return {
      capacity: MAX_PARALLEL_PER_ROLE[role],
      limitReset: describeModelLimit(config.model, now),
      model: config.model,
      role,
      runner: config.runner,
      runningCount: runningTaskIds.length,
      runningTaskIds,
    };
  });
  const active = roles.filter((role) => role.runningCount > 0).length;
  const vaultReachable = existsSync(vaultPath);
  const taskRootReachable = existsSync(taskRoot);

  return {
    agents: {
      active,
      roles,
      total: roles.length,
    },
    config: {
      agentTimeoutMs: AGENT_TIMEOUT_MS,
      httpHost: options.httpHost ?? HTTP_HOST,
      httpPort: options.httpPort ?? HTTP_PORT,
      tickIntervalMs: TICK_INTERVAL_MS,
    },
    cost: {
      capHit: todayUsd > costCapUsd,
      capUsd: costCapUsd,
      remainingUsd: Math.max(costCapUsd - todayUsd, 0),
      todayUsd,
    },
    ok: vaultReachable && taskRootReachable && runtime.lastTickError === null,
    runtime: cloneRuntimeState(runtime),
    tasks: {
      byPriority,
      byStatus,
      flagged,
      total: tasks.length,
    },
    timestamp: now.toISOString(),
    uptimeMs: Math.max(now.getTime() - Date.parse(runtime.processStartedAt), 0),
    vault: {
      path: vaultPath,
      reachable: vaultReachable,
      taskRoot,
      taskRootReachable,
    },
    worktrees: {
      basePath: worktreeBase,
      reachable: existsSync(worktreeBase),
    },
  };
}

export function createStatusApp(options: StatusSnapshotOptions = {}): Hono {
  const app = new Hono();
  const mergePullRequest = options.mergePullRequest ?? mergePullRequestWithGh;
  const createHumanRequest = options.createHumanRequest ?? ((input: HumanRequestInput) => (
    createHumanRequestTasks(input, { vaultPath: options.vaultPath ?? VAULT_PATH })
  ));

  app.get('/status', async (c) => {
    try {
      const snapshot = await getStatusSnapshot(options);
      c.status(snapshot.ok ? 200 : 503);
      return c.json(snapshot);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      c.status(503);
      return c.json({
        code: 'STATUS_UNAVAILABLE',
        message,
        ok: false,
        timestamp: (options.now?.() ?? new Date()).toISOString(),
      } satisfies OrchestratorStatusError);
    }
  });

  app.post('/prs/:prNumber/merge', async (c) => {
    const prNumber = Number(c.req.param('prNumber'));
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      c.status(400);
      return c.json({
        code: 'BAD_REQUEST',
        message: 'Valid PR number is required',
        ok: false,
      });
    }

    const body = await c.req.json().catch(() => null);
    const parsed = MergePullRequestBody.safeParse(body);
    if (!parsed.success) {
      c.status(400);
      return c.json({
        code: 'BAD_REQUEST',
        message: 'Valid actorUserId is required',
        ok: false,
      });
    }

    try {
      return c.json(await mergePullRequest({
        actorUserId: parsed.data.actorUserId,
        prNumber,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      c.status(409);
      return c.json({
        code: 'CONFLICT',
        message,
        ok: false,
      });
    }
  });

  app.post('/prs/merge-ready', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = ActorBody.safeParse(body);
    if (!parsed.success) {
      c.status(400);
      return c.json({
        code: 'BAD_REQUEST',
        message: 'Valid actorUserId is required',
        ok: false,
      });
    }

    try {
      return c.json(await mergeReadyPullRequestsControl(
        parsed.data,
        options.vaultPath ?? VAULT_PATH,
        mergePullRequest,
        options.now?.(),
      ));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      c.status(409);
      return c.json({
        code: 'CONFLICT',
        message,
        ok: false,
      });
    }
  });

  app.post('/requests', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = HumanRequestBody.safeParse(body);

    if (!parsed.success) {
      c.status(400);
      return c.json({
        code: 'BAD_REQUEST',
        message: 'Valid human request intake payload is required',
        ok: false,
      });
    }

    try {
      return c.json(await createHumanRequest(parsed.data));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      c.status(409);
      return c.json({
        code: 'CONFLICT',
        message,
        ok: false,
      });
    }
  });

  app.post('/tick', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = TickBody.safeParse(body);

    if (!parsed.success) {
      c.status(400);
      return c.json({
        code: 'BAD_REQUEST',
        message: 'Valid tick payload is required',
        ok: false,
      });
    }

    return c.json(startBackgroundRun({
      projectId: parsed.data.projectId,
      taskId: parsed.data.taskId,
    }));
  });

  app.post('/automation/start', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = ActorBody.safeParse(body);

    if (!parsed.success) {
      c.status(400);
      return c.json({
        code: 'BAD_REQUEST',
        message: 'Valid actorUserId is required',
        ok: false,
      });
    }

    return c.json(startAutomationLoop(parsed.data.projectId));
  });

  app.post('/automation/stop', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = ActorBody.safeParse(body);

    if (!parsed.success) {
      c.status(400);
      return c.json({
        code: 'BAD_REQUEST',
        message: 'Valid actorUserId is required',
        ok: false,
      });
    }

    return c.json(stopAutomationLoop());
  });

  app.patch('/agents/:role/routing', async (c) => {
    const role = AgentRole.safeParse(c.req.param('role'));
    const body = await c.req.json().catch(() => null);
    const parsed = AgentRoutingBody.safeParse(body);

    if (!role.success || !parsed.success) {
      c.status(400);
      return c.json({
        code: 'BAD_REQUEST',
        message: 'Valid agent routing payload is required',
        ok: false,
      });
    }

    return c.json(await updateAgentRoutingControl(
      role.data,
      {
        model: parsed.data.model,
        runner: parsed.data.runner,
      },
      options.agentRoutingPath ?? AGENT_ROUTING_PATH,
    ));
  });

  app.patch('/tasks/:taskId', async (c) => {
    const taskId = c.req.param('taskId');
    const body = await c.req.json().catch(() => null);
    const parsed = TaskControlBody.safeParse(body);

    if (!/^T-\d{3,}$/.test(taskId) || !parsed.success) {
      c.status(400);
      return c.json({
        code: 'BAD_REQUEST',
        message: 'Valid task update payload is required',
        ok: false,
      });
    }

    try {
      return c.json(await updateTaskControl({
        body: parsed.data.body,
        flagged: parsed.data.flagged,
        projectId: parsed.data.projectId,
        status: parsed.data.status,
        taskId,
        title: parsed.data.title,
      }, options.vaultPath ?? VAULT_PATH));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      c.status(404);
      return c.json({
        code: 'NOT_FOUND',
        message,
        ok: false,
      });
    }
  });

  app.post('/tasks/:taskId/kill', async (c) => {
    const taskId = c.req.param('taskId');
    const body = await c.req.json().catch(() => null);
    const parsed = ActorBody.safeParse(body);

    if (!/^T-\d{3,}$/.test(taskId) || !parsed.success) {
      c.status(400);
      return c.json({
        code: 'BAD_REQUEST',
        message: 'Valid task kill payload is required',
        ok: false,
      });
    }

    try {
      return c.json(await killRunningTaskControl(taskId, options.vaultPath ?? VAULT_PATH));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      c.status(404);
      return c.json({
        code: 'NOT_FOUND',
        message,
        ok: false,
      });
    }
  });

  app.delete('/tasks/:taskId', async (c) => {
    const taskId = c.req.param('taskId');
    const body = await c.req.json().catch(() => null);
    const parsed = ActorBody.safeParse(body);

    if (!/^T-\d{3,}$/.test(taskId) || !parsed.success) {
      c.status(400);
      return c.json({
        code: 'BAD_REQUEST',
        message: 'Valid task delete payload is required',
        ok: false,
      });
    }

    try {
      return c.json(await deleteTaskControl(taskId, options.vaultPath ?? VAULT_PATH));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      c.status(404);
      return c.json({
        code: 'NOT_FOUND',
        message,
        ok: false,
      });
    }
  });

  return app;
}

function headersFromIncoming(req: IncomingMessage): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.set(key, value);
    }
  }

  return headers;
}

function requestFromIncoming(req: IncomingMessage): Request {
  const method = req.method ?? 'GET';
  const host = req.headers.host ?? `${HTTP_HOST}:${HTTP_PORT}`;
  const url = new URL(req.url ?? '/', `http://${host}`);
  const init: RequestInit & { duplex?: 'half' } = {
    headers: headersFromIncoming(req),
    method,
  };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = Readable.toWeb(req) as unknown as BodyInit;
    init.duplex = 'half';
  }

  return new Request(url, init);
}

async function writeHonoResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function handleStatusRequest(app: Hono, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const response = await app.fetch(requestFromIncoming(req));
    await writeHonoResponse(res, response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=UTF-8');
    res.end(
      JSON.stringify({
        code: 'STATUS_UNAVAILABLE',
        message,
        ok: false,
        timestamp: new Date().toISOString(),
      } satisfies OrchestratorStatusError),
    );
  }
}

export async function startStatusServer(
  options: StatusServerOptions = {},
): Promise<StartedStatusServer> {
  const host = options.host ?? HTTP_HOST;
  const port = options.port ?? HTTP_PORT;
  const app = options.app ?? createStatusApp({
    ...options,
    httpHost: host,
    httpPort: port,
  });
  const server: Server = createServer((req, res) => {
    void handleStatusRequest(app, req, res);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });

  const address = server.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : port;
  console.log(`[status] listening on http://${host}:${boundPort}/status`);

  return {
    close: () => new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    }),
    host,
    port: boundPort,
  };
}

// ============================================================================
// Routing
// ============================================================================

interface AgentState {
  role: AgentRole;
  runningTasks: string[];
}

function canStart(task: Task, state: Record<AgentRole, AgentState>): boolean {
  return state[task.assignee].runningTasks.length < MAX_PARALLEL_PER_ROLE[task.assignee];
}

function depsOk(task: Task, all: Task[]): boolean {
  if (!task.depends_on.length) return true;
  const done = new Set(all.filter((t) => t.status === 'done').map((t) => t.id));
  return task.depends_on.every((d) => done.has(d));
}

function pickNext(
  backlog: Task[],
  all: Task[],
  state: Record<AgentRole, AgentState>,
): Task[] {
  const order: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const runningByRole = Object.fromEntries(
    Object.entries(state).map(([role, agentState]) => [role, agentState.runningTasks.length]),
  ) as Record<AgentRole, number>;
  const selected: Task[] = [];

  for (const task of backlog
    .filter((t) => !t.flagged && depsOk(t, all) && canStart(t, state))
    .sort((a, b) => order[a.priority] - order[b.priority])) {
    if (runningByRole[task.assignee] >= MAX_PARALLEL_PER_ROLE[task.assignee]) continue;
    selected.push(task);
    runningByRole[task.assignee] += 1;
  }

  return selected;
}

// ============================================================================
// Main tick
// ============================================================================

const inFlightLaunches = new Set<string>();

function trackLaunch(task: Task): void {
  if (inFlightLaunches.has(task.id)) {
    console.warn(`[tick] ${task.id} already launching; skipped duplicate launch`);
    return;
  }

  inFlightLaunches.add(task.id);
  runtimeState.activeLaunches = inFlightLaunches.size;
  void launchTask(task)
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[tick] ${task.id} launch crashed: ${msg}`);
    })
    .finally(() => {
      inFlightLaunches.delete(task.id);
      runtimeState.activeLaunches = inFlightLaunches.size;
    });
}

async function tick(projectId?: string): Promise<void> {
  runtimeState.lastTickStartedAt = new Date().toISOString();
  runtimeState.lastTickError = null;
  console.log(`[tick] starting at ${new Date().toISOString()}`);

  try {
    const todayCost = await getTodayCost();
    if (todayCost > COST_CAP_USD) {
      console.warn(`[tick] cost cap hit ($${todayCost.toFixed(2)} > $${COST_CAP_USD}). Halting new launches.`);
      return;
    }

    const [backlog, inProgress, review, done] = await Promise.all([
      listTasksInDir('backlog', VAULT_PATH, projectId),
      listTasksInDir('in-progress', VAULT_PATH, projectId),
      listTasksInDir('review', VAULT_PATH, projectId),
      listTasksInDir('done', VAULT_PATH, projectId),
    ]);
    const all = [...backlog, ...inProgress, ...review, ...done];

    const state = Object.fromEntries(
      AGENT_ROLES.map(
        (r) => [r, { role: r, runningTasks: inProgress.filter((t) => t.assignee === r).map((t) => t.id) }],
      ),
    ) as Record<AgentRole, AgentState>;

    const toLaunch = pickNext(backlog, all, state);
    console.log(`[tick] launching ${toLaunch.length} task(s) from ${backlog.length} backlog${projectId === undefined ? '' : ` for ${projectId}`}; ${inFlightLaunches.size} already in flight`);
    logAgentRouting(toLaunch);

    // Fire-and-forget: agents run for up to AGENT_TIMEOUT_MS, so the tick must
    // not block on them. Tasks are moved to in-progress inside launchTask, and
    // pickNext only draws from backlog, so subsequent ticks cannot double-launch.
    for (const task of toLaunch) {
      trackLaunch(task);
    }

    console.log(`[tick] scheduling complete`);
  } catch (err) {
    runtimeState.lastTickError = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    runtimeState.lastTickFinishedAt = new Date().toISOString();
  }
}

async function launchTask(task: Task): Promise<void> {
  console.log(`[launch] ${task.id} (${task.assignee}): ${task.title}`);

  task = await moveTask(task, 'in-progress');
  const worktreePath = await ensureWorktree(task);
  const result = await runAgent(task, worktreePath);

  // Save full output for debugging
  const logPath = join(worktreePath, '.orchestrator-stdout.log');
  await writeFile(logPath, `STDOUT:\n${result.stdout}\n\nSTDERR:\n${result.stderr}`);
  const artifactFiles = buildRunArtifactFiles(task.id, worktreePath);

  console.log(
    `[launch] ${task.id} finished: exit=${result.exitCode} cost=$${result.costUsd.toFixed(2)} dur=${result.durationMs}ms`,
  );
  console.log(`[launch] stdout log: ${logPath}`);

  // Print last 60 lines of agent output
  const lines = result.stdout.split('\n');
  console.log(`--- agent stdout (last ${Math.min(60, lines.length)} lines) ---`);
  console.log(lines.slice(-60).join('\n'));
  console.log('--- end ---');

  await recordCost({
    role: task.assignee,
    taskId: task.id,
    model: result.model,
    usd: result.costUsd,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    estimated: result.costEstimated,
  });
  await stripInjectedMemoryContext(worktreePath);

  if (result.exitCode !== 0) {
    console.error(`[launch] ${task.id} FAILED. stderr: ${result.stderr.slice(0, 500)}`);
    const pendingFiles = await readPendingWorktreeFiles(worktreePath);
    await writeTask(task, {
      ...pendingFiles,
      artifact_files: artifactFiles,
      flagged: true,
      status: 'failed',
    });
    await moveTask(task, 'failed');
    return;
  }

  const {
    branch,
    changedFiles,
    createdFiles,
    deletedFiles,
    prNumber,
    prUrl,
  } = await commitAndPush(worktreePath, task);

  if (prNumber !== null) {
    console.log(`[launch] ${task.id} → PR #${prNumber} on ${branch}`);
    const reviewUpdate: Partial<Task> = {
      artifact_files: artifactFiles,
      artifact_links: prUrl === null
        ? undefined
        : [
            {
              href: prUrl,
              kind: 'pull_request',
              label: `PR #${prNumber}`,
            },
          ],
      branch,
      changed_files: changedFiles,
      created_files: createdFiles,
      deleted_files: deletedFiles,
      pr_number: prNumber,
      status: 'review',
    };
    if (prUrl !== null) {
      reviewUpdate.pr_url = prUrl;
    }
    await writeTask(task, reviewUpdate);
    await moveTask(task, 'review');
  } else {
    console.log(`[launch] ${task.id} produced no code changes`);
    const updated = await readTask(task.filepath);
    const pendingFiles = await readPendingWorktreeFiles(worktreePath);
    if (updated?.body.includes('## Question for')) {
      await writeTask(updated, {
        ...pendingFiles,
        artifact_files: artifactFiles,
        status: 'blocked-question',
      });
      await moveTask(updated, 'blocked-question');
      return;
    }

    const taskForReview = updated ?? task;
    await writeTask(taskForReview, {
      ...pendingFiles,
      artifact_files: artifactFiles,
      status: 'review',
    });
    await moveTask(taskForReview, 'review');
  }
}

async function killRunningTaskControl(
  taskId: string,
  vaultPath = VAULT_PATH,
): Promise<OrchestratorMutationResult> {
  const child = runningAgentProcesses.get(taskId);
  if (child !== undefined) {
    child.kill('SIGTERM');
    return {
      message: `${taskId} kill signal sent`,
      ok: true,
      requestId: taskId,
    };
  }

  const task = await findTaskById(taskId, vaultPath);
  if (task !== null && task.status === 'in-progress') {
    await writeTask(task, { flagged: true, status: 'failed' });
    await moveTask(task, 'failed', vaultPath);
    return {
      message: `${taskId} had no tracked live process and was moved to failed`,
      ok: true,
      requestId: taskId,
    };
  }

  if (task !== null) {
    return {
      message: `${taskId} has no tracked live process`,
      ok: true,
      requestId: taskId,
    };
  }

  throw new Error(`Task ${taskId} not found`);
}

let activeRunPromise: Promise<void> | null = null;
let automationStopRequested = false;
let automationProjectId: string | undefined;

function startBackgroundRun(
  input: {
    projectId?: string;
    taskId?: string;
  } = {},
): OrchestratorMutationResult {
  if (activeRunPromise !== null) {
    return {
      message: 'Orchestrator run already active',
      ok: true,
      requestId: input.taskId ?? 'tick',
    };
  }

  const startedAt = new Date().toISOString();
  activeRunPromise = (input.taskId === undefined ? tick(input.projectId) : launchSingleTask(input.taskId, input.projectId))
    .catch((err: unknown) => {
      runtimeState.lastTickError = err instanceof Error ? err.message : String(err);
      console.error('[orchestrator] background run error:', runtimeState.lastTickError);
    })
    .finally(() => {
      activeRunPromise = null;
      runtimeState.lastTickFinishedAt = new Date().toISOString();
    });

  return {
    message: input.taskId === undefined
      ? `Tick started at ${startedAt}${input.projectId === undefined ? '' : ` for ${input.projectId}`}`
      : `${input.taskId} started at ${startedAt}`,
    ok: true,
    requestId: input.taskId ?? 'tick',
  };
}

async function launchSingleTask(taskId: string, projectId?: string): Promise<void> {
  runtimeState.lastTickStartedAt = new Date().toISOString();
  runtimeState.lastTickError = null;

  if (inFlightLaunches.has(taskId) || runningAgentProcesses.has(taskId)) {
    throw new Error(`Task ${taskId} is already running`);
  }

  inFlightLaunches.add(taskId);
  runtimeState.activeLaunches = inFlightLaunches.size;

  try {
    for (const dir of ['backlog', 'in-progress', 'failed'] as const) {
      const tasks = await listTasksInDir(dir, VAULT_PATH, projectId);
      const found = tasks.find((task) => task.id === taskId);
      if (found !== undefined) {
        await launchTask(found);
        return;
      }
    }

    throw new Error(`Task ${taskId} not found`);
  } finally {
    inFlightLaunches.delete(taskId);
    runtimeState.activeLaunches = inFlightLaunches.size;
  }
}

function startAutomationLoop(projectId?: string): OrchestratorMutationResult {
  if (runtimeState.daemonRunning) {
    return {
      message: 'Automation already running',
      ok: true,
      requestId: 'automation',
    };
  }

  automationStopRequested = false;
  automationProjectId = projectId;
  runtimeState.daemonRunning = true;
  void automationLoop();

  return {
    message: `Automation started${projectId === undefined ? '' : ` for ${projectId}`}`,
    ok: true,
    requestId: 'automation',
  };
}

function stopAutomationLoop(): OrchestratorMutationResult {
  automationStopRequested = true;
  automationProjectId = undefined;
  runtimeState.daemonRunning = false;

  return {
    message: 'Automation stop requested',
    ok: true,
    requestId: 'automation',
  };
}

async function automationLoop(): Promise<void> {
  while (!automationStopRequested) {
    if (activeRunPromise === null) {
      startBackgroundRun({ projectId: automationProjectId });
    }

    await new Promise((resolve) => setTimeout(resolve, TICK_INTERVAL_MS));
  }
}

// ============================================================================
// Startup reconciliation
// ============================================================================

// If the orchestrator process crashed or was restarted, tasks left in
// in-progress have no live agent process. They silently consume role capacity
// forever, which starves the scheduler. On startup, no agent processes exist
// yet, so every in-progress task is an orphan: flag it and return it to the
// backlog so a human can decide whether to relaunch.
async function reconcileOrphanedInProgressTasks(vaultPath = VAULT_PATH): Promise<void> {
  const orphans = await listTasksInDir('in-progress', vaultPath);
  if (orphans.length === 0) return;

  for (const task of orphans) {
    console.warn(`[recover] ${task.id} was in-progress with no live process; returning to backlog (flagged)`);
    const moved = await moveTask(task, 'backlog', vaultPath);
    await writeTask(moved, { flagged: true, status: 'backlog' });
  }

  console.warn(`[recover] reconciled ${orphans.length} orphaned in-progress task(s). Unflag them to relaunch.`);
}

// ============================================================================
// CLI
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const daemon = args.includes('--daemon');
  const statusServerOnly = args.includes('--status') || args.includes('--status-server');
  const noStatusServer = args.includes('--no-status-server');
  const taskIdx = args.indexOf('--task');
  const singleId = taskIdx !== -1 ? args[taskIdx + 1] : null;

  if (singleId) {
    for (const dir of ['backlog', 'in-progress'] as const) {
      const tasks = await listTasksInDir(dir);
      const found = tasks.find((t) => t.id === singleId);
      if (found) {
        await launchTask(found);
        return;
      }
    }
    console.error(`Task ${singleId} not found`);
    process.exit(1);
  }

  if (statusServerOnly) {
    await reconcileOrphanedInProgressTasks();
    await startStatusServer();
    await new Promise(() => { });
  }

  if (daemon) {
    runtimeState.daemonRunning = true;
    await reconcileOrphanedInProgressTasks();
    if (!noStatusServer) {
      await startStatusServer();
    }
    console.log(`[orchestrator] daemon mode, ticking every ${TICK_INTERVAL_MS}ms`);
    while (true) {
      try {
        await tick();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[orchestrator] tick error:', msg);
      }
      await new Promise((r) => setTimeout(r, TICK_INTERVAL_MS));
    }
  } else {
    await tick();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[orchestrator] fatal:', msg);
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
  });
}
