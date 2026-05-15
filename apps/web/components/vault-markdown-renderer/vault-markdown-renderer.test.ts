import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  VaultMarkdownRenderer,
  defaultResolveWikilinkPath,
} from './vault-markdown-renderer';

describe('VaultMarkdownRenderer', () => {
  it('renders headings, inline formatting, and wikilinks without raw HTML injection', () => {
    const html = renderToStaticMarkup(
      createElement(VaultMarkdownRenderer, {
        markdown: [
          '---',
          'title: Vault Index',
          '---',
          '',
          '# Vault Index',
          '',
          'Read [[05-features/F-001-multi-agent-crm|CRM spec]] with `vaultFs` and **no unsafe HTML**.',
          '<script>alert("xss")</script>',
        ].join('\n'),
      }),
    );

    expect(html).toContain('<h1 class="vault-heading" id="vault-index">Vault Index</h1>');
    expect(html).toContain('CRM spec</a>');
    expect(html).toContain('data-vault-target="05-features/F-001-multi-agent-crm.md"');
    expect(html).toContain('<code class="vault-inline-code">vaultFs</code>');
    expect(html).toContain('<strong>no unsafe HTML</strong>');
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('renders wikilinks as navigation buttons when a handler is supplied', () => {
    const html = renderToStaticMarkup(
      createElement(VaultMarkdownRenderer, {
        markdown: 'Open [[ADR-001-crm-orchestrator-architecture|system ADR]].',
        onNavigate: () => undefined,
        resolveWikilink: (target) => `02-architecture/${target}.md`,
      }),
    );

    expect(html).toContain('<button');
    expect(html).toContain('class="vault-wikilink"');
    expect(html).toContain('data-vault-target="02-architecture/ADR-001-crm-orchestrator-architecture.md"');
    expect(html).toContain('system ADR</button>');
  });

  it('renders Obsidian callouts with nested markdown content', () => {
    const html = renderToStaticMarkup(
      createElement(VaultMarkdownRenderer, {
        markdown: [
          '> [!warning] Cost cap',
          '> Daily spend is above **80%**.',
          '>',
          '> - [x] Notify Yaroslav',
        ].join('\n'),
      }),
    );

    expect(html).toContain('class="vault-callout"');
    expect(html).toContain('data-callout="warning"');
    expect(html).toContain('Cost cap</p>');
    expect(html).toContain('above <strong>80%</strong>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked=""');
  });

  it('renders markdown tables and mermaid fences as first-class blocks', () => {
    const html = renderToStaticMarkup(
      createElement(VaultMarkdownRenderer, {
        markdown: [
          '| Agent | Runner |',
          '|---|---|',
          '| Developer | Codex |',
          '',
          '```mermaid',
          'graph TD',
          '  A[Vault] --> B[CRM]',
          '```',
        ].join('\n'),
      }),
    );

    expect(html).toContain('<table class="vault-table">');
    expect(html).toContain('<th>Agent</th>');
    expect(html).toContain('<td>Codex</td>');
    expect(html).toContain('class="vault-mermaid-block"');
    expect(html).toContain('data-language="mermaid"');
    expect(html).toContain('A[Vault] --&gt; B[CRM]');
  });

  it('resolves default wikilink paths conservatively', () => {
    expect(defaultResolveWikilinkPath('F-001-multi-agent-crm')).toBe('F-001-multi-agent-crm.md');
    expect(defaultResolveWikilinkPath('05-features/F-001-multi-agent-crm.md')).toBe(
      '05-features/F-001-multi-agent-crm.md',
    );
    expect(defaultResolveWikilinkPath('', '05-features/F-001-multi-agent-crm.md')).toBe(
      '05-features/F-001-multi-agent-crm.md',
    );
  });
});
