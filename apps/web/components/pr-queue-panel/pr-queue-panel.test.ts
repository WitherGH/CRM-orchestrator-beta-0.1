import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PrQueueItem } from '@/server/pr-queue';

import { PrQueuePanel } from './pr-queue-panel';

describe('PrQueuePanel', () => {
  it('renders PR rows with status, age, and action affordances', () => {
    const html = renderToStaticMarkup(
      createElement(PrQueuePanel, {
        items: [
          createPrQueueItem({
            ciStatus: 'green',
            githubUrl: 'https://github.com/example/crm-orchestrator-beta-0.1/pull/13',
            mergeEnabled: true,
            reviewerStatus: 'approved',
          }),
          createPrQueueItem({
            ciStatus: 'yellow',
            mergeEnabled: false,
            prNumber: 14,
            reviewerStatus: 'pending',
            taskId: 'T-014',
            title: 'Inbox sidebar',
          }),
        ],
        mergeReadyActionPath: '/control',
        mergeActionPath: '/merge-pr',
        now: new Date('2026-05-14T12:30:00.000Z'),
      }),
    );

    expect(html).toContain('PR queue');
    expect(html).toContain('2 open');
    expect(html).toContain('action="/control"');
    expect(html).toContain('type="hidden" name="action" value="pr-merge-ready"');
    expect(html).toContain('Reviewer merge 1');
    expect(html).toContain('#13');
    expect(html).toContain('T-013');
    expect(html).toContain('PR queue panel');
    expect(html).toContain('Green');
    expect(html).toContain('Approved');
    expect(html).toContain('2h');
    expect(html).toContain('href="https://github.com/example/crm-orchestrator-beta-0.1/pull/13"');
    expect(html).toContain('action="/merge-pr"');
    expect(html).toContain('name="prNumber"');
    expect(html).toContain('Merge');
    expect(html).toContain('Request re-review');
    expect(html).toContain('Close');
  });

  it('disables merge until the PR is approved and green', () => {
    const html = renderToStaticMarkup(
      createElement(PrQueuePanel, {
        items: [
          createPrQueueItem({
            ciStatus: 'red',
            githubUrl: null,
            mergeEnabled: false,
            reviewerStatus: 'changes-requested',
          }),
        ],
      }),
    );

    expect(html).toContain('View diff</button>');
    expect(html).toContain('disabled="" type="submit"');
    expect(html).toContain('Changes requested');
    expect(html).toContain('Reviewer merge 0');
  });

  it('renders an empty state when there are no open PRs', () => {
    const html = renderToStaticMarkup(
      createElement(PrQueuePanel, {
        items: [],
      }),
    );

    expect(html).toContain('No open PRs waiting for review.');
  });
});

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
