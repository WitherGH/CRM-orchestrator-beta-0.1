'use client';

import {
  type DragEvent,
  useEffect,
  useState,
} from 'react';

import type { LiveAgentSnapshot } from '../../server/live-agent-state';
import type {
  AgentRole,
  TaskPriority,
  TaskStatus,
  VaultTask,
} from '../../server/vault-fs';
import { TaskDetailDrawer } from '../task-detail-drawer/task-detail-drawer';

type KanbanColumnStatus = Extract<
  TaskStatus,
  'backlog' | 'in-progress' | 'review' | 'merge-ready' | 'done' | 'failed'
>;

type PriorityTone = 'danger' | 'alert' | 'muted-light';

export interface KanbanColumn {
  ariaLabel: string;
  countLabel: string;
  label: string;
  status: KanbanColumnStatus;
  tasks: VaultTask[];
}

interface KanbanBoardProps {
  githubRepository?: string | null;
  initialSelectedTaskId?: string | null;
  liveAgentSnapshot?: LiveAgentSnapshot;
  now?: Date;
  projectId?: string | null;
  tasks: readonly VaultTask[];
}

const KANBAN_COLUMN_CONFIG = [
  { emptyLabel: 'No backlog tasks.', label: 'Backlog', status: 'backlog' },
  { emptyLabel: 'No tasks in progress.', label: 'In progress', status: 'in-progress' },
  { emptyLabel: 'No tasks in review.', label: 'Review', status: 'review' },
  { emptyLabel: 'No merge-ready tasks.', label: 'Merge-ready', status: 'merge-ready' },
  { emptyLabel: 'No failed tasks.', label: 'Failed', status: 'failed' },
  { emptyLabel: 'No recent completions.', label: 'Done', status: 'done' },
] as const satisfies ReadonlyArray<{
  emptyLabel: string;
  label: string;
  status: KanbanColumnStatus;
}>;

const KANBAN_STATUSES = KANBAN_COLUMN_CONFIG.map((column) => column.status);
const DONE_VISIBLE_LIMIT = 5;
const controlActionEndpoint = '/api/admin/orchestrator/control';

const priorityRank: Record<TaskPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

const agentLabels: Record<AgentRole, string> = {
  architect: 'Architect',
  designer: 'Designer',
  developer: 'Developer',
  pm: 'PM',
  reviewer: 'Reviewer',
  tester: 'Tester',
};

const agentMarks: Record<AgentRole, string> = {
  architect: 'AR',
  designer: 'DS',
  developer: 'CD',
  pm: 'PM',
  reviewer: 'RV',
  tester: 'QA',
};

export function KanbanBoard({
  githubRepository,
  initialSelectedTaskId = null,
  liveAgentSnapshot,
  now = new Date(),
  projectId = null,
  tasks,
}: KanbanBoardProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialSelectedTaskId);
  const [boardTasks, setBoardTasks] = useState<VaultTask[]>(() => [...tasks]);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<KanbanColumnStatus | null>(null);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set());
  const [moveError, setMoveError] = useState<string | null>(null);
  const columns = buildKanbanColumns(boardTasks);
  const selectedTask = boardTasks.find((task) => task.id === selectedTaskId) ?? null;

  useEffect(() => {
    setBoardTasks([...tasks]);
  }, [tasks]);

  async function moveTask(taskId: string, status: KanbanColumnStatus): Promise<void> {
    const task = boardTasks.find((candidate) => candidate.id === taskId);
    if (task === undefined || task.status === status || pendingTaskIds.has(taskId)) {
      setDragOverStatus(null);
      return;
    }

    const previousTasks = boardTasks;
    const updatedAt = new Date().toISOString();
    setMoveError(null);
    setPendingTaskIds((current) => new Set(current).add(taskId));
    setBoardTasks((current) => current.map((candidate) => (
      candidate.id === taskId
        ? {
            ...candidate,
            folderStatus: status,
            frontmatterStatus: status,
            flagged: status === 'failed' ? candidate.flagged : false,
            status,
            updatedAt,
          }
        : candidate
    )));

    try {
      const response = await fetch(controlActionEndpoint, {
        body: JSON.stringify({
          action: 'task-status',
          projectId,
          status,
          taskId,
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Task move failed with ${response.status}`);
      }
    } catch {
      setBoardTasks(previousTasks);
      setMoveError(`Could not move ${taskId}. Refresh and try again.`);
    } finally {
      setPendingTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
      setDragOverStatus(null);
    }
  }

  return (
    <>
      {moveError === null ? null : (
        <p className="orchestrator-board-error" role="status">
          {moveError}
        </p>
      )}
      <div className="orchestrator-board" aria-label="Task board">
        {columns.map((column) => (
          <TaskColumnView
            column={column}
            draggedTaskId={draggedTaskId}
            dragOverStatus={dragOverStatus}
            key={column.status}
            now={now}
            onColumnDragLeave={() => setDragOverStatus(null)}
            onColumnDragOver={(event, status) => {
              if (draggedTaskId === null) {
                return;
              }

              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDragOverStatus(status);
            }}
            onDropTask={(event, status) => {
              event.preventDefault();
              const taskId = event.dataTransfer.getData('text/plain') || draggedTaskId;
              if (taskId !== null && taskId !== '') {
                void moveTask(taskId, status);
              }
            }}
            onTaskDragEnd={() => {
              setDraggedTaskId(null);
              setDragOverStatus(null);
            }}
            onTaskDragStart={(event, taskId) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', taskId);
              setDraggedTaskId(taskId);
            }}
            onTaskSelect={setSelectedTaskId}
            pendingTaskIds={pendingTaskIds}
            selectedTaskId={selectedTaskId}
          />
        ))}
      </div>
      <TaskDetailDrawer
        githubRepository={githubRepository}
        isOpen={selectedTask !== null}
        liveAgentSnapshot={liveAgentSnapshot}
        onClose={() => setSelectedTaskId(null)}
        projectId={projectId}
        task={selectedTask}
      />
    </>
  );
}

export function buildKanbanColumns(tasks: readonly VaultTask[]): KanbanColumn[] {
  const tasksByStatus = new Map<KanbanColumnStatus, VaultTask[]>();

  for (const column of KANBAN_COLUMN_CONFIG) {
    tasksByStatus.set(column.status, []);
  }

  for (const task of tasks) {
    if (!isKanbanStatus(task.status)) {
      continue;
    }

    tasksByStatus.get(task.status)?.push(task);
  }

  return KANBAN_COLUMN_CONFIG.map((config) => {
    const allTasks = sortTasksForColumn(
      config.status,
      tasksByStatus.get(config.status) ?? [],
    );
    const visibleTasks = config.status === 'done'
      ? allTasks.slice(0, DONE_VISIBLE_LIMIT)
      : allTasks;
    const countLabel = formatColumnCount(config.status, visibleTasks.length, allTasks.length);

    return {
      ariaLabel: formatColumnAriaLabel(config.label, visibleTasks.length, allTasks.length),
      countLabel,
      label: config.label,
      status: config.status,
      tasks: visibleTasks,
    };
  });
}

export function formatTaskAgeLabel(task: VaultTask, now = new Date()): string {
  const sourceTimestamp = task.status === 'backlog'
    ? parseTimestamp(task.created) ?? parseTimestamp(task.updatedAt)
    : parseTimestamp(task.updatedAt) ?? parseTimestamp(task.created);

  if (sourceTimestamp === null) {
    return 'unknown age';
  }

  const elapsedMs = Math.max(0, now.getTime() - sourceTimestamp);
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;

  if (elapsedMs < minuteMs) {
    return 'now';
  }

  if (elapsedMs < hourMs) {
    return `${Math.floor(elapsedMs / minuteMs)}m`;
  }

  if (elapsedMs < 48 * hourMs) {
    return `${Math.floor(elapsedMs / hourMs)}h`;
  }

  if (elapsedMs < weekMs) {
    return `${Math.floor(elapsedMs / dayMs)}d`;
  }

  if (elapsedMs < 10 * weekMs) {
    return `${Math.floor(elapsedMs / weekMs)}w`;
  }

  return new Date(sourceTimestamp).toISOString().slice(0, 10);
}

function TaskColumnView({
  column,
  draggedTaskId,
  dragOverStatus,
  now,
  onColumnDragLeave,
  onColumnDragOver,
  onDropTask,
  onTaskDragEnd,
  onTaskDragStart,
  onTaskSelect,
  pendingTaskIds,
  selectedTaskId,
}: {
  column: KanbanColumn;
  draggedTaskId: string | null;
  dragOverStatus: KanbanColumnStatus | null;
  now: Date;
  onColumnDragLeave: () => void;
  onColumnDragOver: (event: DragEvent<HTMLElement>, status: KanbanColumnStatus) => void;
  onDropTask: (event: DragEvent<HTMLElement>, status: KanbanColumnStatus) => void;
  onTaskDragEnd: () => void;
  onTaskDragStart: (event: DragEvent<HTMLButtonElement>, taskId: string) => void;
  onTaskSelect: (taskId: string) => void;
  pendingTaskIds: Set<string>;
  selectedTaskId: string | null;
}) {
  const columnId = `${column.status}-column`;
  const emptyLabel = KANBAN_COLUMN_CONFIG.find(
    (config) => config.status === column.status,
  )?.emptyLabel ?? 'No tasks.';

  return (
    <section
      className="orchestrator-column"
      aria-label={column.ariaLabel}
      aria-labelledby={columnId}
      data-drag-over={dragOverStatus === column.status ? 'true' : undefined}
      data-status={column.status}
      onDragLeave={onColumnDragLeave}
      onDragOver={(event) => onColumnDragOver(event, column.status)}
      onDrop={(event) => onDropTask(event, column.status)}
    >
      <div className="orchestrator-column-header">
        <h3 className="orchestrator-column-title" id={columnId}>
          {column.label}
        </h3>
        <span className="orchestrator-column-count">{column.countLabel}</span>
      </div>
      <ul className="orchestrator-task-list orchestrator-column-body">
        {column.tasks.length > 0 ? (
          column.tasks.map((task) => (
            <TaskCardView
              ageLabel={formatTaskAgeLabel(task, now)}
              isDragging={task.id === draggedTaskId}
              isPending={pendingTaskIds.has(task.id)}
              isSelected={task.id === selectedTaskId}
              key={task.id}
              onDragEnd={onTaskDragEnd}
              onDragStart={onTaskDragStart}
              onSelect={onTaskSelect}
              task={task}
            />
          ))
        ) : (
          <li className="orchestrator-empty">{emptyLabel}</li>
        )}
      </ul>
    </section>
  );
}

function TaskCardView({
  ageLabel,
  isDragging,
  isPending,
  isSelected,
  onDragEnd,
  onDragStart,
  onSelect,
  task,
}: {
  ageLabel: string;
  isDragging: boolean;
  isPending: boolean;
  isSelected: boolean;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, taskId: string) => void;
  onSelect: (taskId: string) => void;
  task: VaultTask;
}) {
  const priorityTone = getPriorityTone(task.priority);

  return (
    <li className="orchestrator-task-card-item">
      <button
        aria-controls={isSelected ? 'orchestrator-task-detail-drawer' : undefined}
        aria-expanded={isSelected}
        aria-haspopup="dialog"
        className="orchestrator-task-card"
        data-dragging={isDragging ? 'true' : undefined}
        data-flagged={task.flagged ? 'true' : undefined}
        data-pending={isPending ? 'true' : undefined}
        data-task-id={task.id}
        draggable
        onDragEnd={onDragEnd}
        onDragStart={(event) => onDragStart(event, task.id)}
        onClick={() => onSelect(task.id)}
        type="button"
      >
        <span className="orchestrator-task-title">
          <span className="orchestrator-task-title-main">
            <span className="orchestrator-task-id">{task.id}</span> {task.title}
          </span>
          {task.flagged ? (
            <span className="orchestrator-card-meta" data-tone="alert">
              Flagged
            </span>
          ) : null}
        </span>
        <span className="orchestrator-chip-row" aria-label={`${task.id} metadata`}>
          <span className="orchestrator-chip orchestrator-agent-chip">
            <span className="orchestrator-agent-mark" aria-hidden="true">
              {agentMarks[task.assignee]}
            </span>
            {agentLabels[task.assignee]}
          </span>
          <span className="orchestrator-chip" data-tone={priorityTone}>
            {task.priority}
          </span>
          <span className="orchestrator-chip">{task.effort ?? 'effort unset'}</span>
          <span className="orchestrator-chip">{ageLabel}</span>
        </span>
      </button>
    </li>
  );
}

function getPriorityTone(priority: TaskPriority): PriorityTone | undefined {
  if (priority === 'P0') {
    return 'danger';
  }

  if (priority === 'P1') {
    return 'alert';
  }

  if (priority === 'P3') {
    return 'muted-light';
  }

  return undefined;
}

function isKanbanStatus(status: TaskStatus): status is KanbanColumnStatus {
  return KANBAN_STATUSES.some((kanbanStatus) => kanbanStatus === status);
}

function sortTasksForColumn(
  status: KanbanColumnStatus,
  tasks: readonly VaultTask[],
): VaultTask[] {
  return [...tasks].sort((a, b) => {
    if (status === 'done') {
      return (
        readSortTimestamp(b.updatedAt, b.created)
        - readSortTimestamp(a.updatedAt, a.created)
        || a.id.localeCompare(b.id)
      );
    }

    return (
      priorityRank[a.priority] - priorityRank[b.priority]
      || readSortTimestamp(a.created, a.updatedAt) - readSortTimestamp(b.created, b.updatedAt)
      || a.id.localeCompare(b.id)
    );
  });
}

function formatColumnCount(
  status: KanbanColumnStatus,
  visibleCount: number,
  totalCount: number,
): string {
  if (status === 'done' && totalCount > DONE_VISIBLE_LIMIT) {
    return `${visibleCount}/${totalCount}`;
  }

  return String(totalCount);
}

function formatColumnAriaLabel(label: string, visibleCount: number, totalCount: number): string {
  if (visibleCount === totalCount) {
    return `${label} column, ${totalCount} tasks`;
  }

  return `${label} column, showing ${visibleCount} of ${totalCount} tasks`;
}

function readSortTimestamp(primary: string, fallback: string): number {
  return parseTimestamp(primary) ?? parseTimestamp(fallback) ?? 0;
}

function parseTimestamp(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}
