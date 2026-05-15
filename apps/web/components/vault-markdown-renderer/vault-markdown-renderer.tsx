'use client';

import type { ReactNode } from 'react';

export interface VaultWikilinkTarget {
  anchor: string | null;
  label: string;
  path: string;
  raw: string;
  target: string;
}

export interface VaultMarkdownRendererProps {
  className?: string;
  currentPath?: string;
  markdown: string;
  onNavigate?: (target: VaultWikilinkTarget) => void;
  resolveWikilink?: (target: string, currentPath: string | undefined) => string;
}

interface RenderContext {
  currentPath?: string;
  onNavigate?: (target: VaultWikilinkTarget) => void;
  resolveWikilink?: (target: string, currentPath: string | undefined) => string;
}

interface TableBlock {
  headers: string[];
  rows: string[][];
}

const calloutPattern = /^>\s*\[!([a-zA-Z][\w-]*)\]([+-])?\s*(.*)$/;
const fencePattern = /^```([\w-]+)?\s*$/;
const headingPattern = /^(#{1,6})\s+(.+)$/;
const orderedListPattern = /^\s*\d+[.)]\s+(.+)$/;
const unorderedListPattern = /^\s*[-*]\s+(.+)$/;

export function VaultMarkdownRenderer({
  className,
  currentPath,
  markdown,
  onNavigate,
  resolveWikilink,
}: VaultMarkdownRendererProps) {
  const classes = ['vault-markdown', className].filter(Boolean).join(' ');
  const context: RenderContext = { currentPath, onNavigate, resolveWikilink };

  return (
    <article className={classes}>
      {renderBlocks(stripFrontmatter(markdown).split('\n'), context, 'root')}
    </article>
  );
}

export function defaultResolveWikilinkPath(target: string, currentPath?: string): string {
  const trimmedTarget = target.trim();
  if (trimmedTarget === '') {
    return currentPath ?? '';
  }

  if (hasFileExtension(trimmedTarget)) {
    return trimmedTarget;
  }

  return `${trimmedTarget}.md`;
}

function renderBlocks(lines: string[], context: RenderContext, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const fenceMatch = line.match(fencePattern);
    if (fenceMatch !== null) {
      const codeLines: string[] = [];
      const language = fenceMatch[1]?.toLowerCase() ?? 'text';
      index += 1;

      while (index < lines.length && !lines[index]?.startsWith('```')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      nodes.push(renderCodeBlock(codeLines.join('\n'), language, `${keyPrefix}-code-${index}`));
      continue;
    }

    const calloutMatch = line.match(calloutPattern);
    if (calloutMatch !== null) {
      const quoted = readQuotedBlock(lines, index);
      index = quoted.nextIndex;
      nodes.push(
        renderCallout({
          body: quoted.lines.slice(1),
          context,
          fold: calloutMatch[2] ?? null,
          key: `${keyPrefix}-callout-${index}`,
          title: calloutMatch[3]?.trim() ?? '',
          type: calloutMatch[1]?.toLowerCase() ?? 'note',
        }),
      );
      continue;
    }

    if (line.startsWith('>')) {
      const quoted = readQuotedBlock(lines, index);
      index = quoted.nextIndex;
      nodes.push(
        <blockquote className="vault-blockquote" key={`${keyPrefix}-quote-${index}`}>
          {renderBlocks(quoted.lines, context, `${keyPrefix}-quote-${index}`)}
        </blockquote>,
      );
      continue;
    }

    const headingMatch = line.match(headingPattern);
    if (headingMatch !== null) {
      const level = Math.min(headingMatch[1]?.length ?? 1, 6);
      const text = headingMatch[2] ?? '';
      nodes.push(renderHeading(level, text, context, `${keyPrefix}-heading-${index}`));
      index += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      nodes.push(<hr className="vault-rule" key={`${keyPrefix}-rule-${index}`} />);
      index += 1;
      continue;
    }

    if (isBlockId(line)) {
      const blockId = line.trim().slice(1);
      nodes.push(<span className="vault-block-id" id={blockId} key={`${keyPrefix}-block-${index}`} />);
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const table = readTable(lines, index);
      index = table.nextIndex;
      nodes.push(renderTable(table.table, context, `${keyPrefix}-table-${index}`));
      continue;
    }

    if (isListLine(line)) {
      const list = readList(lines, index);
      index = list.nextIndex;
      nodes.push(renderList(list.items, list.ordered, context, `${keyPrefix}-list-${index}`));
      continue;
    }

    const paragraph = readParagraph(lines, index);
    index = paragraph.nextIndex;
    nodes.push(
      <p className="vault-paragraph" key={`${keyPrefix}-paragraph-${index}`}>
        {renderInline(paragraph.text, context, `${keyPrefix}-paragraph-${index}`)}
      </p>,
    );
  }

  return nodes;
}

function renderCodeBlock(code: string, language: string, key: string): ReactNode {
  if (language === 'mermaid') {
    return (
      <figure className="vault-mermaid-block" data-language="mermaid" key={key}>
        <figcaption className="vault-mermaid-header">
          <span className="vault-code-language">mermaid</span>
          <span className="vault-code-caption">diagram source</span>
        </figcaption>
        <pre className="vault-code-block vault-mermaid-source">
          <code>{code}</code>
        </pre>
      </figure>
    );
  }

  return (
    <pre className="vault-code-block" data-language={language} key={key}>
      <code>{code}</code>
    </pre>
  );
}

function renderHeading(
  level: number,
  text: string,
  context: RenderContext,
  key: string,
): ReactNode {
  const props = {
    className: 'vault-heading',
    id: slugify(plainInlineText(text)),
  };
  const children = renderInline(text, context, key);

  if (level === 1) {
    return <h1 key={key} {...props}>{children}</h1>;
  }

  if (level === 2) {
    return <h2 key={key} {...props}>{children}</h2>;
  }

  if (level === 3) {
    return <h3 key={key} {...props}>{children}</h3>;
  }

  if (level === 4) {
    return <h4 key={key} {...props}>{children}</h4>;
  }

  if (level === 5) {
    return <h5 key={key} {...props}>{children}</h5>;
  }

  return <h6 key={key} {...props}>{children}</h6>;
}

function renderCallout(input: {
  body: string[];
  context: RenderContext;
  fold: string | null;
  key: string;
  title: string;
  type: string;
}): ReactNode {
  const title = input.title === '' ? toTitleCase(input.type) : input.title;

  return (
    <aside
      className="vault-callout"
      data-callout={input.type}
      data-fold={input.fold ?? undefined}
      key={input.key}
    >
      <div className="vault-callout-header">
        <span className="vault-callout-type">{input.type}</span>
        <p className="vault-callout-title">
          {renderInline(title, input.context, `${input.key}-title`)}
        </p>
      </div>
      {input.body.length > 0 ? (
        <div className="vault-callout-body">
          {renderBlocks(input.body, input.context, `${input.key}-body`)}
        </div>
      ) : null}
    </aside>
  );
}

function renderTable(table: TableBlock, context: RenderContext, key: string): ReactNode {
  return (
    <div className="vault-table-scroll" key={key}>
      <table className="vault-table">
        <thead>
          <tr>
            {table.headers.map((header, index) => (
              <th key={`${key}-head-${index}`}>
                {renderInline(header, context, `${key}-head-${index}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={`${key}-row-${rowIndex}`}>
              {table.headers.map((_, cellIndex) => (
                <td key={`${key}-cell-${rowIndex}-${cellIndex}`}>
                  {renderInline(row[cellIndex] ?? '', context, `${key}-cell-${rowIndex}-${cellIndex}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderList(
  items: string[],
  ordered: boolean,
  context: RenderContext,
  key: string,
): ReactNode {
  const ListTag = ordered ? 'ol' : 'ul';

  return (
    <ListTag className="vault-list" key={key}>
      {items.map((item, index) => {
        const task = parseTaskListItem(item);

        return (
          <li className={task === null ? undefined : 'vault-task-list-item'} key={`${key}-item-${index}`}>
            {task === null ? null : (
              <input
                aria-label={task.checked ? 'Completed task' : 'Open task'}
                checked={task.checked}
                className="vault-task-checkbox"
                disabled
                readOnly
                type="checkbox"
              />
            )}
            <span>{renderInline(task?.text ?? item, context, `${key}-item-${index}`)}</span>
          </li>
        );
      })}
    </ListTag>
  );
}

function renderInline(text: string, context: RenderContext, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = stripObsidianComments(text);
  let keyIndex = 0;

  while (remaining.length > 0) {
    const match = findNextInlineMatch(remaining);

    if (match === null) {
      nodes.push(remaining);
      break;
    }

    if (match.index > 0) {
      nodes.push(remaining.slice(0, match.index));
    }

    const key = `${keyPrefix}-inline-${keyIndex}`;
    nodes.push(renderInlineMatch(match, context, key));
    remaining = remaining.slice(match.index + match.source.length);
    keyIndex += 1;
  }

  return nodes;
}

interface InlineMatch {
  index: number;
  source: string;
  text: string;
  type: 'bold' | 'code' | 'highlight' | 'italic' | 'link' | 'wikilink' | 'embed';
  url?: string;
}

function findNextInlineMatch(text: string): InlineMatch | null {
  const patterns: Array<{
    pattern: RegExp;
    toMatch: (match: RegExpExecArray) => InlineMatch;
  }> = [
    {
      pattern: /!\[\[([^\]]+)\]\]/,
      toMatch: (match) => ({
        index: match.index,
        source: match[0] ?? '',
        text: match[1] ?? '',
        type: 'embed',
      }),
    },
    {
      pattern: /\[\[([^\]]+)\]\]/,
      toMatch: (match) => ({
        index: match.index,
        source: match[0] ?? '',
        text: match[1] ?? '',
        type: 'wikilink',
      }),
    },
    {
      pattern: /\[([^\]]+)\]\(([^)]+)\)/,
      toMatch: (match) => ({
        index: match.index,
        source: match[0] ?? '',
        text: match[1] ?? '',
        type: 'link',
        url: match[2] ?? '',
      }),
    },
    {
      pattern: /`([^`]+)`/,
      toMatch: (match) => ({
        index: match.index,
        source: match[0] ?? '',
        text: match[1] ?? '',
        type: 'code',
      }),
    },
    {
      pattern: /\*\*([^*]+)\*\*/,
      toMatch: (match) => ({
        index: match.index,
        source: match[0] ?? '',
        text: match[1] ?? '',
        type: 'bold',
      }),
    },
    {
      pattern: /==([^=]+)==/,
      toMatch: (match) => ({
        index: match.index,
        source: match[0] ?? '',
        text: match[1] ?? '',
        type: 'highlight',
      }),
    },
    {
      pattern: /\*([^*]+)\*/,
      toMatch: (match) => ({
        index: match.index,
        source: match[0] ?? '',
        text: match[1] ?? '',
        type: 'italic',
      }),
    },
  ];

  const matches = patterns
    .map(({ pattern, toMatch }) => {
      const match = pattern.exec(text);
      return match === null ? null : toMatch(match);
    })
    .filter((match): match is InlineMatch => match !== null);

  if (matches.length === 0) {
    return null;
  }

  return matches.sort((a, b) => a.index - b.index)[0] ?? null;
}

function renderInlineMatch(match: InlineMatch, context: RenderContext, key: string): ReactNode {
  if (match.type === 'wikilink' || match.type === 'embed') {
    const target = parseWikilink(match.text, context);
    const className = match.type === 'embed' ? 'vault-embed-link' : 'vault-wikilink';
    const label = match.type === 'embed' ? `Embed ${target.label}` : target.label;

    if (context.onNavigate !== undefined) {
      return (
        <button
          className={className}
          data-vault-target={target.path}
          key={key}
          onClick={() => context.onNavigate?.(target)}
          type="button"
        >
          {label}
        </button>
      );
    }

    return (
      <a
        className={className}
        data-vault-target={target.path}
        href={vaultHref(target)}
        key={key}
      >
        {label}
      </a>
    );
  }

  if (match.type === 'link') {
    const href = match.url ?? '';
    const isExternal = /^https?:\/\//.test(href) || href.startsWith('mailto:');

    return (
      <a
        className="vault-link"
        href={href}
        key={key}
        rel={isExternal ? 'noreferrer' : undefined}
        target={isExternal ? '_blank' : undefined}
      >
        {match.text}
      </a>
    );
  }

  if (match.type === 'code') {
    return (
      <code className="vault-inline-code" key={key}>
        {match.text}
      </code>
    );
  }

  if (match.type === 'bold') {
    return <strong key={key}>{match.text}</strong>;
  }

  if (match.type === 'italic') {
    return <em key={key}>{match.text}</em>;
  }

  return <mark key={key}>{match.text}</mark>;
}

function parseWikilink(raw: string, context: RenderContext): VaultWikilinkTarget {
  const [targetPart = '', labelPart] = splitOnce(raw, '|');
  const [pathPart = '', anchorPart] = splitOnce(targetPart, '#');
  const target = pathPart.trim();
  const anchor = anchorPart?.trim() === '' ? null : anchorPart?.trim() ?? null;
  const label = labelPart?.trim() || anchor || basenameWithoutExtension(target) || targetPart;
  const resolver = context.resolveWikilink ?? defaultResolveWikilinkPath;

  return {
    anchor,
    label,
    path: resolver(target, context.currentPath),
    raw,
    target,
  };
}

function vaultHref(target: VaultWikilinkTarget): string {
  const params = target.path === '' ? '' : `?vault=${encodeURIComponent(target.path)}`;
  const anchor = target.anchor === null ? '' : `#${slugify(target.anchor)}`;
  return `/admin/orchestrator${params}${anchor}`;
}

function readQuotedBlock(lines: string[], startIndex: number): { lines: string[]; nextIndex: number } {
  const quoted: string[] = [];
  let index = startIndex;

  while (index < lines.length && (lines[index] ?? '').startsWith('>')) {
    quoted.push((lines[index] ?? '').replace(/^>\s?/, ''));
    index += 1;
  }

  return { lines: quoted, nextIndex: index };
}

function readList(lines: string[], startIndex: number): {
  items: string[];
  nextIndex: number;
  ordered: boolean;
} {
  const firstLine = lines[startIndex] ?? '';
  const ordered = orderedListPattern.test(firstLine);
  const items: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const match = ordered ? line.match(orderedListPattern) : line.match(unorderedListPattern);
    if (match === null) {
      break;
    }

    items.push(match[1] ?? '');
    index += 1;
  }

  return { items, nextIndex: index, ordered };
}

function readParagraph(lines: string[], startIndex: number): { nextIndex: number; text: string } {
  const paragraphLines: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (line.trim() === '' || isBlockStart(lines, index)) {
      break;
    }

    paragraphLines.push(line.trim());
    index += 1;
  }

  return {
    nextIndex: index,
    text: paragraphLines.join(' '),
  };
}

function readTable(lines: string[], startIndex: number): { nextIndex: number; table: TableBlock } {
  const headers = splitTableRow(lines[startIndex] ?? '');
  const rows: string[][] = [];
  let index = startIndex + 2;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line.trim() === '' || !line.includes('|')) {
      break;
    }

    rows.push(splitTableRow(line));
    index += 1;
  }

  return {
    nextIndex: index,
    table: { headers, rows },
  };
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index] ?? '';
  return (
    fencePattern.test(line)
    || calloutPattern.test(line)
    || line.startsWith('>')
    || headingPattern.test(line)
    || isHorizontalRule(line)
    || isBlockId(line)
    || isTableStart(lines, index)
    || isListLine(line)
  );
}

function isListLine(line: string): boolean {
  return orderedListPattern.test(line) || unorderedListPattern.test(line);
}

function isTableStart(lines: string[], index: number): boolean {
  const current = lines[index] ?? '';
  const next = lines[index + 1] ?? '';

  return current.includes('|') && isTableDivider(next);
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isHorizontalRule(line: string): boolean {
  return /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function isBlockId(line: string): boolean {
  return /^\^[A-Za-z0-9_-]+\s*$/.test(line.trim());
}

function parseTaskListItem(text: string): { checked: boolean; text: string } | null {
  const match = text.match(/^\[( |x|X)\]\s+(.+)$/);
  if (match === null) {
    return null;
  }

  return {
    checked: match[1]?.toLowerCase() === 'x',
    text: match[2] ?? '',
  };
}

function stripFrontmatter(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  if (lines[0] !== '---') {
    return normalized;
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line === '---');
  if (endIndex === -1) {
    return normalized;
  }

  return lines.slice(endIndex + 1).join('\n');
}

function stripObsidianComments(text: string): string {
  return text.replace(/%%.*?%%/g, '');
}

function plainInlineText(text: string): string {
  return stripObsidianComments(text)
    .replace(/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, '$2$1')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, '$2$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_=\[\]]/g, '');
}

function slugify(text: string): string {
  return plainInlineText(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function splitOnce(text: string, delimiter: string): [string, string | undefined] {
  const index = text.indexOf(delimiter);
  if (index === -1) {
    return [text, undefined];
  }

  return [text.slice(0, index), text.slice(index + delimiter.length)];
}

function hasFileExtension(path: string): boolean {
  return /\.[A-Za-z0-9]+$/.test(path);
}

function basenameWithoutExtension(path: string): string {
  const name = path.split('/').at(-1) ?? path;
  return name.replace(/\.[A-Za-z0-9]+$/, '');
}

function toTitleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
