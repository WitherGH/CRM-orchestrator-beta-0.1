import { existsSync, type Dirent, type Stats } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import { watch, type FSWatcher } from 'chokidar';
import matter from 'gray-matter';
import { z } from 'zod';

export const ADMIN_VAULT_ROOM = 'admin:vault';
export const VAULT_CHANGED_EVENT = 'vault:changed';

export const TASK_STATUSES = [
  'backlog',
  'in-progress',
  'blocked-question',
  'review',
  'merge-ready',
  'done',
  'failed',
] as const;

export const TASK_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
export const TASK_EFFORTS = ['XS', 'S', 'M', 'L', 'XL'] as const;
export const PROJECT_STATUSES = ['active', 'paused', 'archived'] as const;
export const AGENT_ROLES = [
  'architect',
  'designer',
  'pm',
  'reviewer',
  'developer',
  'tester',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskEffort = (typeof TASK_EFFORTS)[number];
export type AgentRole = (typeof AGENT_ROLES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type VaultArea = 'tasks' | 'inbox' | 'progress' | 'vault';
export type VaultFsChangeType = 'file.added' | 'file.changed' | 'file.removed';

export interface VaultSocketEmitter {
  to(room: string): {
    emit(event: string, payload: VaultFsChangeEvent): unknown;
  };
}

export interface VaultFileSummary {
  name: string;
  path: string;
  area: VaultArea;
  sizeBytes: number;
  updatedAt: string;
}

export interface VaultMarkdownFile extends VaultFileSummary {
  body: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

export interface VaultTreeNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children?: VaultTreeNode[];
  sizeBytes?: number;
  updatedAt?: string;
}

export interface VaultTask {
  id: string;
  title: string;
  status: TaskStatus;
  frontmatterStatus: TaskStatus;
  folderStatus: TaskStatus | null;
  priority: TaskPriority;
  effort: TaskEffort | null;
  assignee: AgentRole;
  dependsOn: string[];
  labels: string[];
  created: string;
  flagged: boolean;
  projectId: string | null;
  spec: string | null;
  body: string;
  path: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface VaultProject {
  id: string;
  title: string;
  description: string;
  okr: string;
  status: ProjectStatus;
  path: string;
  created: string;
  updatedAt: string;
  taskCount: number;
}

export interface VaultProjectCreateInput {
  description: string;
  okr: string;
  title: string;
}

export interface VaultFsChangeEvent {
  type: VaultFsChangeType;
  area: VaultArea;
  path: string;
  taskId: string | null;
  task: VaultTask | null;
  file: VaultMarkdownFile | null;
  emittedAt: string;
}

export interface VaultFsServiceOptions {
  vaultRoot?: string;
  io?: VaultSocketEmitter;
  onError?: (error: Error) => void;
  now?: () => Date;
}

type WatcherEvent = 'add' | 'change' | 'unlink';

const taskStatusSchema = z.enum(TASK_STATUSES);
const taskPrioritySchema = z.enum(TASK_PRIORITIES).default('P2');
const taskEffortSchema = z.enum(TASK_EFFORTS);
const agentRoleSchema = z.enum(AGENT_ROLES);
const projectStatusSchema = z.enum(PROJECT_STATUSES).default('active');
const projectIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

const dateStringSchema = z.preprocess((value) => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value;
}, z.string().min(1));

const taskFrontmatterSchema = z
  .object({
    id: z.string().regex(/^T-\d{3,}$/),
    title: z.string().min(1),
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    effort: taskEffortSchema.optional(),
    assignee: agentRoleSchema,
    depends_on: z.array(z.string()).default([]),
    labels: z.array(z.string()).default([]),
    created: dateStringSchema,
    flagged: z.boolean().default(false),
    project_id: projectIdSchema.optional(),
    spec: z.string().optional(),
  })
  .passthrough();

const projectFrontmatterSchema = z
  .object({
    id: projectIdSchema,
    title: z.string().min(1),
    status: projectStatusSchema,
    created: dateStringSchema,
  })
  .passthrough();

const knownTaskFrontmatterKeys = new Set([
  'id',
  'title',
  'status',
  'priority',
  'effort',
  'assignee',
  'depends_on',
  'labels',
  'created',
  'flagged',
  'project_id',
  'spec',
]);

const watchedAreaRoots: Record<Exclude<VaultArea, 'vault'>, string> = {
  tasks: '04-tasks',
  inbox: '00-inbox',
  progress: '06-progress',
};

const projectsRoot = '03-projects';

export class VaultFsError extends Error {
  constructor(
    readonly code:
      | 'INVALID_PATH'
      | 'OUTSIDE_VAULT'
      | 'NOT_FOUND'
      | 'UNSUPPORTED_FILE'
      | 'INVALID_TASK',
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'VaultFsError';
  }
}

export class VaultFsService {
  readonly vaultRoot: string;

  private readonly io: VaultSocketEmitter | null;
  private readonly onError: ((error: Error) => void) | null;
  private readonly now: () => Date;
  private readonly tasksById = new Map<string, VaultTask>();
  private readonly taskPathToId = new Map<string, string>();
  private readonly markdownCache = new Map<string, VaultMarkdownFile>();
  private watcher: FSWatcher | null = null;
  private initialized = false;
  private refreshPromise: Promise<void> | null = null;

  constructor(options: VaultFsServiceOptions = {}) {
    this.vaultRoot = resolve(options.vaultRoot ?? defaultVaultRoot());
    this.io = options.io ?? null;
    this.onError = options.onError ?? null;
    this.now = options.now ?? (() => new Date());
  }

  async start(): Promise<void> {
    await this.refreshAll();

    if (this.watcher !== null) {
      return;
    }

    this.watcher = watch(this.vaultRoot, {
      awaitWriteFinish: {
        pollInterval: 25,
        stabilityThreshold: 100,
      },
      ignoreInitial: true,
      ignored: (path) => this.shouldIgnoreWatchPath(path),
      persistent: true,
    });

    this.watcher.on('add', (path) => this.handleWatcherEventSafely('add', path));
    this.watcher.on('change', (path) => this.handleWatcherEventSafely('change', path));
    this.watcher.on('unlink', (path) => this.handleWatcherEventSafely('unlink', path));
    this.watcher.on('error', (error) => this.reportError(normalizeError(error)));

    await new Promise<void>((resolveReady, rejectReady) => {
      const watcher = this.watcher;
      if (watcher === null) {
        rejectReady(new Error('Vault watcher was not created'));
        return;
      }

      const handleReady = (): void => {
        watcher.off('error', handleError);
        resolveReady();
      };
      const handleError = (error: unknown): void => {
        watcher.off('ready', handleReady);
        rejectReady(normalizeError(error));
      };

      watcher.once('ready', handleReady);
      watcher.once('error', handleError);
    });
  }

  async stop(): Promise<void> {
    if (this.watcher === null) {
      return;
    }

    const watcher = this.watcher;
    this.watcher = null;
    await watcher.close();
  }

  async listTasks(status?: TaskStatus, projectId?: string | null): Promise<VaultTask[]> {
    await this.ensureReady();
    await this.refreshTasksWhenUnwatched();

    return [...this.tasksById.values()]
      .filter((task) => status === undefined || task.status === status)
      .filter((task) => projectId === undefined || projectId === null || task.projectId === projectId)
      .sort(compareTasks);
  }

  async listProjects(): Promise<VaultProject[]> {
    await this.ensureReady();
    await this.refreshTasksWhenUnwatched();

    const projectRoot = join(this.vaultRoot, projectsRoot);
    const files = await listMarkdownFiles(projectRoot);
    const projects = await Promise.all(files.map((path) => this.readProjectFile(path)));
    const taskCounts = countTasksByProject([...this.tasksById.values()]);

    return projects
      .filter((project): project is VaultProject => project !== null)
      .map((project) => ({
        ...project,
        taskCount: taskCounts.get(project.id) ?? 0,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  async createProject(input: VaultProjectCreateInput): Promise<VaultProject> {
    await this.ensureReady();
    const title = input.title.trim();
    const description = input.description.trim();
    const okr = input.okr.trim();
    const id = slugifyProjectId(title);

    if (title.length < 3 || description.length < 10 || okr.length < 10) {
      throw new VaultFsError('INVALID_TASK', 'Project title, description, and OKR are required');
    }

    const projectDir = join(this.vaultRoot, projectsRoot);
    const projectPath = join(projectDir, `${id}.md`);
    await mkdir(projectDir, { recursive: true });

    const existing = await safeStat(projectPath);
    if (existing !== null) {
      throw new VaultFsError('INVALID_TASK', `Project already exists: ${id}`);
    }

    const now = this.now();
    const content = matter.stringify(
      [
        '## Description',
        description,
        '',
        '## OKR',
        okr,
        '',
        '## Operating notes',
        '- Architect clarifies structure, constraints, project goals, epics, and ADR impact.',
        '- PM turns architecture into executable slices, acceptance criteria, sequencing, and delivery control.',
        '- Downstream roles work only inside this project unless a dependency explicitly names another project.',
        '',
      ].join('\n'),
      {
        id,
        title,
        status: 'active',
        created: now.toISOString().slice(0, 10),
      },
    );

    await writeFile(projectPath, content, { flag: 'wx' });
    const project = await this.readProjectFile(projectPath);
    if (project === null) {
      throw new VaultFsError('INVALID_TASK', `Could not read project after create: ${id}`);
    }
    return project;
  }

  async readTask(id: string): Promise<VaultTask> {
    await this.ensureReady();
    await this.refreshTasksWhenUnwatched();

    if (!/^T-\d{3,}$/.test(id)) {
      throw new VaultFsError('INVALID_TASK', `Invalid task id: ${id}`);
    }

    const task = this.tasksById.get(id);
    if (task === undefined) {
      throw new VaultFsError('NOT_FOUND', `Task not found: ${id}`);
    }

    return task;
  }

  async listInbox(): Promise<VaultFileSummary[]> {
    await this.ensureReady();
    return this.listCachedFilesByArea('inbox');
  }

  async listProgress(): Promise<VaultFileSummary[]> {
    await this.ensureReady();
    return this.listCachedFilesByArea('progress');
  }

  async read(path: string): Promise<VaultMarkdownFile> {
    const absolutePath = this.resolveVaultFile(path);
    const relativePath = toVaultRelativePath(this.vaultRoot, absolutePath);

    if (extname(relativePath) !== '.md') {
      throw new VaultFsError('UNSUPPORTED_FILE', `Only markdown vault files can be read: ${path}`);
    }

    const file = await this.readMarkdownFile(absolutePath);
    this.markdownCache.set(file.path, file);
    return file;
  }

  async listVaultTree(path = ''): Promise<VaultTreeNode[]> {
    const absolutePath = path === '' ? this.vaultRoot : this.resolveVaultFile(path);
    const rootStat = await safeStat(absolutePath);

    if (rootStat === null) {
      throw new VaultFsError('NOT_FOUND', `Vault path not found: ${path}`);
    }

    if (!rootStat.isDirectory()) {
      throw new VaultFsError('INVALID_PATH', `Vault tree path is not a directory: ${path}`);
    }

    return this.readTree(absolutePath);
  }

  private async ensureReady(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.refreshAll();
  }

  private async refreshAll(): Promise<void> {
    if (this.refreshPromise !== null) {
      await this.refreshPromise;
      return;
    }

    this.refreshPromise = this.refreshAllUnsafe();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async refreshAllUnsafe(): Promise<void> {
    this.tasksById.clear();
    this.taskPathToId.clear();
    this.markdownCache.clear();

    await Promise.all([
      this.refreshTasks(),
      this.refreshMarkdownArea('inbox'),
      this.refreshMarkdownArea('progress'),
    ]);

    this.initialized = true;
  }

  private async refreshTasks(): Promise<void> {
    const taskRoot = join(this.vaultRoot, watchedAreaRoots.tasks);
    const files = await listMarkdownFiles(taskRoot);

    await Promise.all(
      files.map(async (absolutePath) => {
        const task = await this.readTaskFile(absolutePath);
        this.tasksById.set(task.id, task);
        this.taskPathToId.set(task.path, task.id);
      }),
    );
  }

  private async refreshTasksWhenUnwatched(): Promise<void> {
    if (this.watcher !== null) {
      return;
    }

    this.tasksById.clear();
    this.taskPathToId.clear();
    await this.refreshTasks();
  }

  private async refreshMarkdownArea(area: Exclude<VaultArea, 'tasks' | 'vault'>): Promise<void> {
    const areaRoot = join(this.vaultRoot, watchedAreaRoots[area]);
    const files = await listMarkdownFiles(areaRoot);

    await Promise.all(
      files.map(async (absolutePath) => {
        const file = await this.readMarkdownFile(absolutePath);
        this.markdownCache.set(file.path, file);
      }),
    );
  }

  private async readTaskFile(absolutePath: string): Promise<VaultTask> {
    const fileStat = await safeStat(absolutePath);
    if (fileStat === null || !fileStat.isFile()) {
      throw new VaultFsError('NOT_FOUND', `Task file not found: ${absolutePath}`);
    }

    const raw = await readFile(absolutePath, 'utf-8');
    const parsed = matter(raw);
    const frontmatter = taskFrontmatterSchema.parse(parsed.data);
    const relativePath = toVaultRelativePath(this.vaultRoot, absolutePath);
    const folderStatus = taskStatusFromPath(relativePath);
    const status = folderStatus ?? frontmatter.status;
    const projectId = frontmatter.project_id ?? projectIdFromTaskPath(relativePath);
    const metadata = pickTaskMetadata(toRecord(parsed.data));

    return {
      id: frontmatter.id,
      title: frontmatter.title,
      status,
      frontmatterStatus: frontmatter.status,
      folderStatus,
      priority: frontmatter.priority,
      effort: frontmatter.effort ?? null,
      assignee: frontmatter.assignee,
      dependsOn: frontmatter.depends_on,
      labels: frontmatter.labels,
      created: frontmatter.created,
      flagged: frontmatter.flagged,
      projectId,
      spec: frontmatter.spec ?? null,
      body: parsed.content,
      path: relativePath,
      updatedAt: fileStat.mtime.toISOString(),
      metadata,
    };
  }

  private async readProjectFile(absolutePath: string): Promise<VaultProject | null> {
    const fileStat = await safeStat(absolutePath);
    if (fileStat === null || !fileStat.isFile()) {
      return null;
    }

    try {
      const raw = await readFile(absolutePath, 'utf-8');
      const parsed = matter(raw);
      const frontmatter = projectFrontmatterSchema.parse(parsed.data);
      const relativePath = toVaultRelativePath(this.vaultRoot, absolutePath);

      return {
        id: frontmatter.id,
        title: frontmatter.title,
        description: readSection(parsed.content, 'Description'),
        okr: readSection(parsed.content, 'OKR'),
        status: frontmatter.status,
        path: relativePath,
        created: frontmatter.created,
        updatedAt: fileStat.mtime.toISOString(),
        taskCount: 0,
      };
    } catch {
      return null;
    }
  }

  private async readMarkdownFile(absolutePath: string): Promise<VaultMarkdownFile> {
    const fileStat = await safeStat(absolutePath);
    if (fileStat === null || !fileStat.isFile()) {
      throw new VaultFsError('NOT_FOUND', `Vault file not found: ${absolutePath}`);
    }

    const raw = await readFile(absolutePath, 'utf-8');
    const parsed = matter(raw);
    const relativePath = toVaultRelativePath(this.vaultRoot, absolutePath);

    return {
      name: basename(relativePath),
      path: relativePath,
      area: areaForPath(relativePath),
      sizeBytes: fileStat.size,
      updatedAt: fileStat.mtime.toISOString(),
      body: parsed.content,
      content: raw,
      frontmatter: toRecord(parsed.data),
    };
  }

  private listCachedFilesByArea(area: Exclude<VaultArea, 'tasks' | 'vault'>): VaultFileSummary[] {
    return [...this.markdownCache.values()]
      .filter((file) => file.area === area)
      .map(({ name, path, area: fileArea, sizeBytes, updatedAt }) => ({
        name,
        path,
        area: fileArea,
        sizeBytes,
        updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.path.localeCompare(b.path));
  }

  private resolveVaultFile(path: string): string {
    if (path.trim() === '') {
      throw new VaultFsError('INVALID_PATH', 'Vault path cannot be empty');
    }

    if (isAbsolute(path)) {
      throw new VaultFsError('OUTSIDE_VAULT', `Vault path must be relative: ${path}`);
    }

    const absolutePath = resolve(this.vaultRoot, path);
    const relativePath = relative(this.vaultRoot, absolutePath);

    if (relativePath === '' || relativePath.startsWith(`..${sep}`) || relativePath === '..' || isAbsolute(relativePath)) {
      throw new VaultFsError('OUTSIDE_VAULT', `Vault path escapes the vault root: ${path}`);
    }

    return absolutePath;
  }

  private async readTree(absolutePath: string): Promise<VaultTreeNode[]> {
    const entries = await safeReaddir(absolutePath);
    const nodes: Array<VaultTreeNode | null> = await Promise.all(
      entries
        .filter((entry) => !entry.name.startsWith('.'))
        .map(async (entry): Promise<VaultTreeNode | null> => {
          const childAbsolutePath = join(absolutePath, entry.name);
          const childRelativePath = toVaultRelativePath(this.vaultRoot, childAbsolutePath);

          if (entry.isDirectory()) {
            return {
              name: entry.name,
              path: childRelativePath,
              type: 'directory' as const,
              children: await this.readTree(childAbsolutePath),
            };
          }

          if (!entry.isFile() || extname(entry.name) !== '.md') {
            return null;
          }

          const fileStat = await stat(childAbsolutePath);
          return {
            name: entry.name,
            path: childRelativePath,
            type: 'file' as const,
            sizeBytes: fileStat.size,
            updatedAt: fileStat.mtime.toISOString(),
          };
        }),
    );

    return nodes
      .filter((node): node is VaultTreeNode => node !== null)
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
  }

  private handleWatcherEventSafely(event: WatcherEvent, path: string): void {
    void this.handleWatcherEvent(event, path).catch((error: unknown) => {
      this.reportError(normalizeError(error));
    });
  }

  private async handleWatcherEvent(event: WatcherEvent, path: string): Promise<void> {
    const absolutePath = resolve(path);
    const relativePath = toVaultRelativePath(this.vaultRoot, absolutePath);
    const area = areaForPath(relativePath);

    if (area === 'vault' || extname(relativePath) !== '.md') {
      return;
    }

    if (event === 'unlink') {
      const taskId = this.removeFromCache(relativePath);
      this.emitChange({
        type: 'file.removed',
        area,
        path: relativePath,
        taskId,
        task: null,
        file: null,
        emittedAt: this.now().toISOString(),
      });
      return;
    }

    if (area === 'tasks') {
      const task = await this.readTaskFile(absolutePath);
      const previousTaskId = this.taskPathToId.get(task.path);
      if (previousTaskId !== undefined && previousTaskId !== task.id) {
        this.tasksById.delete(previousTaskId);
      }
      this.tasksById.set(task.id, task);
      this.taskPathToId.set(task.path, task.id);
      this.markdownCache.delete(task.path);
      this.emitChange({
        type: event === 'add' ? 'file.added' : 'file.changed',
        area,
        path: relativePath,
        taskId: task.id,
        task,
        file: null,
        emittedAt: this.now().toISOString(),
      });
      return;
    }

    const file = await this.readMarkdownFile(absolutePath);
    this.markdownCache.set(file.path, file);
    this.emitChange({
      type: event === 'add' ? 'file.added' : 'file.changed',
      area,
      path: relativePath,
      taskId: null,
      task: null,
      file,
      emittedAt: this.now().toISOString(),
    });
  }

  private removeFromCache(relativePath: string): string | null {
    this.markdownCache.delete(relativePath);

    const taskId = this.taskPathToId.get(relativePath) ?? taskIdFromFilename(relativePath);
    if (taskId === null) {
      return null;
    }

    this.taskPathToId.delete(relativePath);
    this.tasksById.delete(taskId);
    return taskId;
  }

  private emitChange(event: VaultFsChangeEvent): void {
    this.io?.to(ADMIN_VAULT_ROOM).emit(VAULT_CHANGED_EVENT, event);
  }

  private reportError(error: Error): void {
    this.onError?.(error);
  }

  private shouldIgnoreWatchPath(path: string): boolean {
    const absolutePath = resolve(path);
    const relativePath = relative(this.vaultRoot, absolutePath);

    if (relativePath === '') {
      return false;
    }

    if (relativePath.startsWith(`..${sep}`) || relativePath === '..' || isAbsolute(relativePath)) {
      return true;
    }

    const posixPath = toPosixPath(relativePath);
    const segments = posixPath.split('/');

    if (segments.some((segment) => segment.startsWith('.'))) {
      return true;
    }

    return !Object.values(watchedAreaRoots).includes(segments[0]);
  }
}

export function createVaultFsService(options: VaultFsServiceOptions = {}): VaultFsService {
  return new VaultFsService(options);
}

export const vaultFs = createVaultFsService();

function defaultVaultRoot(): string {
  const explicitPath = process.env.ORCHESTRATOR_VAULT_PATH;
  if (explicitPath !== undefined && explicitPath.trim() !== '') {
    return resolve(explicitPath);
  }

  const cwdVault = resolve(process.cwd(), '.vault');
  if (existsSync(cwdVault)) {
    return cwdVault;
  }

  return resolve(dirname(fileURLToPath(import.meta.url)), '../../..', '.vault');
}

function toVaultRelativePath(vaultRoot: string, absolutePath: string): string {
  const relativePath = relative(vaultRoot, absolutePath);

  if (relativePath === '' || relativePath.startsWith(`..${sep}`) || relativePath === '..' || isAbsolute(relativePath)) {
    throw new VaultFsError('OUTSIDE_VAULT', `Path is outside vault root: ${absolutePath}`);
  }

  return toPosixPath(relativePath);
}

function toPosixPath(path: string): string {
  return path.split(sep).join('/');
}

function areaForPath(relativePath: string): VaultArea {
  const firstSegment = relativePath.split('/')[0];

  if (firstSegment === watchedAreaRoots.tasks) {
    return 'tasks';
  }

  if (firstSegment === watchedAreaRoots.inbox) {
    return 'inbox';
  }

  if (firstSegment === watchedAreaRoots.progress) {
    return 'progress';
  }

  return 'vault';
}

function taskStatusFromPath(relativePath: string): TaskStatus | null {
  const segments = relativePath.split('/');
  const taskRootIndex = segments.indexOf(watchedAreaRoots.tasks);
  if (taskRootIndex === -1) {
    return null;
  }

  const directStatusSegment = segments[taskRootIndex + 1];
  if (isTaskStatus(directStatusSegment)) {
    return directStatusSegment;
  }

  const projectStatusSegment = segments[taskRootIndex + 2];
  return isTaskStatus(projectStatusSegment) ? projectStatusSegment : null;
}

function projectIdFromTaskPath(relativePath: string): string | null {
  const segments = relativePath.split('/');
  const taskRootIndex = segments.indexOf(watchedAreaRoots.tasks);
  if (taskRootIndex === -1) {
    return null;
  }

  const candidate = segments[taskRootIndex + 1];
  return candidate !== undefined && !isTaskStatus(candidate) && projectIdSchema.safeParse(candidate).success
    ? candidate
    : null;
}

function isTaskStatus(value: string | null | undefined): value is TaskStatus {
  return TASK_STATUSES.some((status) => status === value);
}

function taskIdFromFilename(relativePath: string): string | null {
  const match = basename(relativePath).match(/^(T-\d{3,})-/);
  return match?.[1] ?? null;
}

function pickTaskMetadata(frontmatter: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(frontmatter).filter(([key]) => !knownTaskFrontmatterKeys.has(key)),
  );
}

function countTasksByProject(tasks: readonly VaultTask[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (task.projectId === null) {
      continue;
    }
    counts.set(task.projectId, (counts.get(task.projectId) ?? 0) + 1);
  }
  return counts;
}

function readSection(markdown: string, heading: string): string {
  const lines = markdown.split('\n');
  const headingLine = `## ${heading}`;
  const start = lines.findIndex((line) => line.trim() === headingLine);
  if (start === -1) {
    return '';
  }

  const collected: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) {
      break;
    }
    collected.push(line);
  }

  return collected.join('\n').trim();
}

function slugifyProjectId(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  return slug === '' ? 'project' : slug;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const rootStat = await safeStat(root);
  if (rootStat === null || !rootStat.isDirectory()) {
    return [];
  }

  const entries = await safeReaddir(root);
  const files = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith('.'))
      .map(async (entry) => {
        const absolutePath = join(root, entry.name);
        if (entry.isDirectory()) {
          return listMarkdownFiles(absolutePath);
        }

        if (entry.isFile() && extname(entry.name) === '.md') {
          return [absolutePath];
        }

        return [];
      }),
  );

  return files.flat();
}

async function safeReaddir(root: string): Promise<Dirent<string>[]> {
  try {
    return await readdir(root, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function safeStat(path: string): Promise<Stats | null> {
  try {
    return await stat(path);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function compareTasks(a: VaultTask, b: VaultTask): number {
  const priorityOrder: Record<TaskPriority, number> = {
    P0: 0,
    P1: 1,
    P2: 2,
    P3: 3,
  };

  return (
    priorityOrder[a.priority] - priorityOrder[b.priority]
    || a.created.localeCompare(b.created)
    || a.id.localeCompare(b.id)
  );
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
