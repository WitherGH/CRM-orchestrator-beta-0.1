import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type {
  VaultFileSummary,
  VaultMarkdownFile,
  VaultTreeNode,
} from '../../server/vault-fs';

import { InboxVaultSidebar } from './inbox-vault-sidebar';

describe('InboxVaultSidebar', () => {
  const now = new Date('2026-05-14T12:00:00.000Z');

  it('renders inbox files with timestamps and opens the selected inbox drawer', () => {
    const selectedInboxFile = createMarkdownFile({
      content: [
        '---',
        'title: Signal parser idea',
        '---',
        '',
        '# Signal parser idea',
        '',
        'Route screenshots through parser templates.',
      ].join('\n'),
      name: 'signal-parser-idea.md',
      path: '00-inbox/signal-parser-idea.md',
    });
    const html = renderToStaticMarkup(
      createElement(InboxVaultSidebar, {
        inboxItems: [
          createFileSummary({
            name: 'signal-parser-idea.md',
            path: '00-inbox/signal-parser-idea.md',
            updatedAt: '2026-05-14T10:30:00.000Z',
          }),
        ],
        now,
        selectedInboxFile,
        vaultTree: [],
      }),
    );

    expect(html).toContain('Inbox');
    expect(html).toContain('1 file');
    expect(html).toContain('href="/admin/orchestrator?inbox=00-inbox%2Fsignal-parser-idea.md"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('1h');
    expect(html).toContain('Signal parser idea');
    expect(html).toContain('Route screenshots through parser templates.');
    expect(html).toContain('Triage now');
    expect(html).toContain('Schedule');
    expect(html).toContain('Archive');
    expect(html).toContain('type="hidden" name="filename" value="signal-parser-idea.md"');
  });

  it('renders an empty inbox state and a collapsible vault tree', () => {
    const tree = [
      {
        children: [
          {
            name: 'F-001-multi-agent-crm.md',
            path: '05-features/F-001-multi-agent-crm.md',
            type: 'file',
            updatedAt: '2026-05-14T09:00:00.000Z',
          },
        ],
        name: '05-features',
        path: '05-features',
        type: 'directory',
      },
    ] satisfies VaultTreeNode[];
    const html = renderToStaticMarkup(
      createElement(InboxVaultSidebar, {
        inboxItems: [],
        selectedVaultPath: '05-features/F-001-multi-agent-crm.md',
        vaultTree: tree,
      }),
    );

    expect(html).toContain('Inbox zero, nothing to triage.');
    expect(html).toContain('<details class="orchestrator-tree-group" open="">');
    expect(html).toContain('05-features');
    expect(html).toContain('F-001-multi-agent-crm');
    expect(html).toContain('href="/admin/orchestrator?vault=05-features%2FF-001-multi-agent-crm.md"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('read-only');
  });
});

function createFileSummary(
  overrides: Partial<VaultFileSummary> = {},
): VaultFileSummary {
  return {
    area: 'inbox',
    name: 'idea.md',
    path: '00-inbox/idea.md',
    sizeBytes: 64,
    updatedAt: '2026-05-14T11:00:00.000Z',
    ...overrides,
  };
}

function createMarkdownFile(
  overrides: Partial<VaultMarkdownFile> = {},
): VaultMarkdownFile {
  return {
    ...createFileSummary(),
    body: '\n# Idea',
    content: '---\ntitle: Idea\n---\n\n# Idea',
    frontmatter: {
      title: 'Idea',
    },
    ...overrides,
  };
}
