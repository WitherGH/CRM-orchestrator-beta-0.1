import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type {
  VaultMarkdownFile,
  VaultTreeNode,
} from '@/server/vault-fs';

import {
  VaultDocumentView,
  resolveWikilinkFromTree,
} from './vault-document-view';

describe('VaultDocumentView', () => {
  it('renders selected vault markdown and resolves wikilinks through the tree', () => {
    const file = createMarkdownFile({
      content: [
        '---',
        'title: CRM task',
        '---',
        '',
        '# CRM task',
        '',
        'Read [[F-001-multi-agent-crm|CRM spec]] and [[ADR-001-crm-orchestrator-architecture]].',
      ].join('\n'),
      name: 'T-014-inbox-vault-explorer-sidebar.md',
      path: '04-tasks/in-progress/T-014-inbox-vault-explorer-sidebar.md',
    });
    const html = renderToStaticMarkup(
      createElement(VaultDocumentView, {
        file,
        tree: createTree(),
      }),
    );

    expect(html).toContain('orchestrator-vault-document');
    expect(html).toContain('T-014-inbox-vault-explorer-sidebar');
    expect(html).toContain('04-tasks/in-progress/T-014-inbox-vault-explorer-sidebar.md');
    expect(html).toContain('CRM task');
    expect(html).toContain('data-vault-target="05-features/F-001-multi-agent-crm.md"');
    expect(html).toContain('data-vault-target="02-architecture/ADR-001-crm-orchestrator-architecture.md"');
  });

  it('falls back conservatively when a wikilink target is absent from the tree', () => {
    expect(resolveWikilinkFromTree('F-001-multi-agent-crm', undefined, createTree())).toBe(
      '05-features/F-001-multi-agent-crm.md',
    );
    expect(resolveWikilinkFromTree('ADR-001', undefined, createTree())).toBe(
      '02-architecture/ADR-001-crm-orchestrator-architecture.md',
    );
    expect(resolveWikilinkFromTree('missing-note', '00-inbox/idea.md', createTree())).toBe(
      'missing-note.md',
    );
    expect(resolveWikilinkFromTree('', '00-inbox/idea.md', createTree())).toBe(
      '00-inbox/idea.md',
    );
  });
});

function createTree(): VaultTreeNode[] {
  return [
    {
      children: [
        {
          name: 'ADR-001-crm-orchestrator-architecture.md',
          path: '02-architecture/ADR-001-crm-orchestrator-architecture.md',
          type: 'file',
        },
      ],
      name: '02-architecture',
      path: '02-architecture',
      type: 'directory',
    },
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

function createMarkdownFile(
  overrides: Partial<VaultMarkdownFile> = {},
): VaultMarkdownFile {
  return {
    area: 'tasks',
    body: '\n# CRM task',
    content: '# CRM task',
    frontmatter: {},
    name: 'T-014-inbox-vault-explorer-sidebar.md',
    path: '04-tasks/in-progress/T-014-inbox-vault-explorer-sidebar.md',
    sizeBytes: 128,
    updatedAt: '2026-05-14T10:00:00.000Z',
    ...overrides,
  };
}
