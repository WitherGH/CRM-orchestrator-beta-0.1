import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { CostDashboardData } from '../../server/cost-dashboard';
import type { PrQueueItem } from '../../server/pr-queue';
import type {
  VaultFileSummary,
  VaultMarkdownFile,
  VaultTask,
  VaultTreeNode,
} from '../../server/vault-fs';

import {
  AdminOrchestratorShell,
  type AdminOrchestratorShellProps,
} from './admin-orchestrator-shell';

describe('AdminOrchestratorShell', () => {
  it('renders the CRM skeleton regions from F-001', () => {
    const html = renderToStaticMarkup(createElement(AdminOrchestratorShell));

    expect(html).toContain('aria-label="Admin orchestrator"');
    expect(html).toContain('aria-label="Orchestrator stats"');
    expect(html).toContain('aria-label="Inbox and vault explorer"');
    expect(html).toContain('aria-label="Orchestrator workspace"');
    expect(html).toContain('aria-label="Live agent state"');
    expect(html).toContain('aria-label="Notification firehose"');
  });

  it('renders the top stat bar and workspace modes', () => {
    const html = renderToStaticMarkup(createElement(AdminOrchestratorShell));

    expect(html).toContain('Tasks');
    expect(html).toContain('Cost');
    expect(html).toContain('Agents');
    expect(html).toContain('Current capacity and 7d performance');
    expect(html).toContain('CI');
    expect(html).toContain('Bot kill');
    expect(html).toContain('Kanban');
    expect(html).toContain('PR queue');
    expect(html).toContain('Daily log');
  });

  it('renders model routing controls for per-agent model changes', () => {
    const html = renderToStaticMarkup(createElement(AdminOrchestratorShell));

    expect(html).toContain('Model routing');
    expect(html).toContain('gpt-5.5');
    expect(html).toContain('opus');
    expect(html).toContain('limit 17:00 local');
  });

  it('renders notification firehose events passed into the shell', () => {
    const props: AdminOrchestratorShellProps = {
      firehoseEvents: [
        {
          agentLabel: 'Developer',
          agentRole: 'developer',
          detail: 'gpt-5.5',
          id: 'event-agent-started',
          occurredAt: '2026-05-14T12:20:00.000Z',
          payloadEntries: [],
          summary: 'Developer started T-016',
          taskId: 'T-016',
          tone: 'neutral',
          type: 'agent.started',
          typeLabel: 'Agent started',
        },
      ],
      now: new Date('2026-05-14T12:30:00.000Z'),
    };
    const Shell = AdminOrchestratorShell as FunctionComponent<AdminOrchestratorShellProps>;
    const html = renderToStaticMarkup(createElement(Shell, props));

    expect(html).toContain('Developer started T-016');
    expect(html).toContain('1 visible');
  });

  it('renders all kanban columns expected by the orchestrator spec', () => {
    const html = renderToStaticMarkup(createElement(AdminOrchestratorShell));

    expect(html).toContain('Backlog');
    expect(html).toContain('In progress');
    expect(html).toContain('Review');
    expect(html).toContain('Merge-ready');
    expect(html).toContain('Done');
  });

  it('renders vault-backed tasks in the kanban board', () => {
    const props: AdminOrchestratorShellProps = {
      now: new Date('2026-05-14T12:30:00.000Z'),
      tasks: [
        createTask({
          id: 'T-010',
          priority: 'P0',
          status: 'in-progress',
          title: 'Kanban board',
          updatedAt: '2026-05-14T11:30:00.000Z',
        }),
      ],
    };
    const Shell = AdminOrchestratorShell as FunctionComponent<AdminOrchestratorShellProps>;
    const html = renderToStaticMarkup(createElement(Shell, props));

    expect(html).toContain('T-010');
    expect(html).toContain('Kanban board');
    expect(html).toContain('1h');
  });

  it('renders the PR queue mode when selected', () => {
    const props: AdminOrchestratorShellProps = {
      activeMode: 'pr-queue',
      now: new Date('2026-05-14T12:30:00.000Z'),
      prQueueItems: [
        createPrQueueItem({
          prNumber: 13,
          taskId: 'T-013',
          title: 'PR queue panel',
        }),
      ],
    };
    const Shell = AdminOrchestratorShell as FunctionComponent<AdminOrchestratorShellProps>;
    const html = renderToStaticMarkup(createElement(Shell, props));

    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('PR queue panel');
    expect(html).toContain('#13');
    expect(html).toContain('Merge');
  });

  it('renders the cost dashboard mode when selected', () => {
    const props: AdminOrchestratorShellProps = {
      activeMode: 'cost',
      costDashboardData: createCostDashboardData(),
    };
    const Shell = AdminOrchestratorShell as FunctionComponent<AdminOrchestratorShellProps>;
    const html = renderToStaticMarkup(createElement(Shell, props));

    expect(html).toContain('Spend by agent');
    expect(html).toContain('Cost by agent for the last 7 days');
    expect(html).toContain('$12.00');
    expect(html).toContain('Developer');
  });

  it('renders vault sidebar data and selected vault content', () => {
    const props: AdminOrchestratorShellProps = {
      activeMode: 'vault',
      inboxItems: [
        createFileSummary({
          name: 'new-request.md',
          path: '00-inbox/new-request.md',
        }),
      ],
      selectedVaultFile: createVaultMarkdownFile(),
      vaultTree: createVaultTree(),
    };
    const Shell = AdminOrchestratorShell as FunctionComponent<AdminOrchestratorShellProps>;
    const html = renderToStaticMarkup(createElement(Shell, props));

    expect(html).toContain('new-request');
    expect(html).toContain('05-features');
    expect(html).toContain('F-001-multi-agent-crm');
    expect(html).toContain('href="/admin/orchestrator?mode=vault"');
    expect(html).toContain('data-vault-target="05-features/F-001-multi-agent-crm.md"');
  });

  it('renders a vault landing state when vault mode has no selected file', () => {
    const props: AdminOrchestratorShellProps = {
      activeMode: 'vault',
      vaultTree: createVaultTree(),
    };
    const Shell = AdminOrchestratorShell as FunctionComponent<AdminOrchestratorShellProps>;
    const html = renderToStaticMarkup(createElement(Shell, props));

    expect(html).toContain('Select a vault file');
    expect(html).toContain('Top level vault folders');
    expect(html).not.toContain('Task board');
  });

  it('renders the daily log mode instead of falling back to kanban', () => {
    const props: AdminOrchestratorShellProps = {
      activeMode: 'daily-log',
      tasks: [
        createTask({
          id: 'T-020',
          status: 'failed',
          title: 'Failed architecture task',
        }),
      ],
    };
    const Shell = AdminOrchestratorShell as FunctionComponent<AdminOrchestratorShellProps>;
    const html = renderToStaticMarkup(createElement(Shell, props));

    expect(html).toContain('Recent task movement');
    expect(html).toContain('Failed architecture task');
    expect(html).not.toContain('Task board');
  });
});

function createTask(overrides: Partial<VaultTask> = {}): VaultTask {
  const status = overrides.status ?? 'backlog';

  return {
    assignee: 'developer',
    body: '\n## What\nImplement the task.',
    created: '2026-05-14',
    dependsOn: [],
    effort: 'M',
    flagged: false,
    folderStatus: status,
    frontmatterStatus: status,
    id: 'T-001',
    labels: ['crm'],
    metadata: {},
    path: `04-tasks/${status}/T-001-test.md`,
    priority: 'P2',
    projectId: null,
    spec: 'F-001',
    status,
    title: 'Test task',
    updatedAt: '2026-05-14T12:00:00.000Z',
    ...overrides,
  };
}

function createPrQueueItem(overrides: Partial<PrQueueItem> = {}): PrQueueItem {
  return {
    assignee: 'developer',
    branch: 'agent/developer/t-013-pr-queue-panel',
    ciStatus: 'green',
    githubUrl: 'https://github.com/example/crm-orchestrator-beta-0.1/pull/13',
    mergeEnabled: true,
    openedAt: '2026-05-14T10:00:00.000Z',
    prNumber: 13,
    reviewerStatus: 'approved',
    taskId: 'T-013',
    taskStatus: 'merge-ready',
    title: 'PR queue panel',
    ...overrides,
  };
}

function createFileSummary(
  overrides: Partial<VaultFileSummary> = {},
): VaultFileSummary {
  return {
    area: 'inbox',
    name: 'new-request.md',
    path: '00-inbox/new-request.md',
    sizeBytes: 52,
    updatedAt: '2026-05-14T11:00:00.000Z',
    ...overrides,
  };
}

function createVaultMarkdownFile(
  overrides: Partial<VaultMarkdownFile> = {},
): VaultMarkdownFile {
  return {
    area: 'tasks',
    body: '\n# Sidebar task',
    content: '# Sidebar task\n\nRead [[F-001-multi-agent-crm|CRM spec]].',
    frontmatter: {},
    name: 'T-014-inbox-vault-explorer-sidebar.md',
    path: '04-tasks/in-progress/T-014-inbox-vault-explorer-sidebar.md',
    sizeBytes: 112,
    updatedAt: '2026-05-14T10:00:00.000Z',
    ...overrides,
  };
}

function createVaultTree(): VaultTreeNode[] {
  return [
    {
      children: [
        {
          name: 'F-001-multi-agent-crm.md',
          path: '05-features/F-001-multi-agent-crm.md',
          type: 'file',
        },
      ],
      name: '05-features',
      path: '05-features',
      type: 'directory',
    },
  ];
}

function createCostDashboardData(): CostDashboardData {
  return {
    cap: {
      dailyCapLabel: '$50.00',
      progressPercent: 24,
      remainingLabel: '$38.00',
      statusLabel: 'Within cap',
      tone: 'positive',
    },
    dayRows: [
      {
        costLabelsByRole: {
          architect: '$0.00',
          designer: '$0.00',
          developer: '$12.00',
          pm: '$0.00',
          reviewer: '$0.00',
          tester: '$0.00',
        },
        dateKey: '2026-05-14',
        dayLabel: 'May 14',
        totalLabel: '$12.00',
      },
    ],
    generatedAt: '2026-05-14T12:00:00.000Z',
    roleRows: [
      {
        averageCostPerTaskLabel: '$6.00 / task',
        role: 'developer',
        roleLabel: 'Developer',
        shareLabel: '100%',
        tasksCompletedWeek: 2,
        todayLabel: '$12.00',
        weekLabel: '$12.00',
      },
    ],
    summary: {
      monthlyProjectionLabel: '$51.43',
      tasksCompletedWeek: 2,
      todayLabel: '$12.00',
      weekLabel: '$12.00',
    },
  };
}
