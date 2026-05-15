'use client';

import type {
  VaultMarkdownFile,
  VaultTreeNode,
} from '@/server/vault-fs';

import {
  VaultMarkdownRenderer,
  defaultResolveWikilinkPath,
  type VaultWikilinkTarget,
} from '../vault-markdown-renderer/vault-markdown-renderer';

export interface VaultDocumentViewProps {
  file: VaultMarkdownFile;
  tree: readonly VaultTreeNode[];
}

export function VaultDocumentView({ file, tree }: VaultDocumentViewProps) {
  return (
    <section
      className="orchestrator-vault-document"
      aria-labelledby="orchestrator-vault-document-title"
    >
      <header className="orchestrator-vault-document-header">
        <div>
          <p className="orchestrator-label">Vault</p>
          <h1
            className="orchestrator-vault-document-title"
            id="orchestrator-vault-document-title"
          >
            {stripMarkdownExtension(file.name)}
          </h1>
        </div>
        <span className="orchestrator-log-path" title={file.path}>
          {file.path}
        </span>
      </header>
      <VaultMarkdownRenderer
        currentPath={file.path}
        markdown={file.content}
        onNavigate={(target) => navigateToVaultTarget(target)}
        resolveWikilink={(target, currentPath) => (
          resolveWikilinkFromTree(target, currentPath, tree)
        )}
      />
    </section>
  );
}

export function resolveWikilinkFromTree(
  target: string,
  currentPath: string | undefined,
  tree: readonly VaultTreeNode[],
): string {
  const trimmedTarget = target.trim();
  if (trimmedTarget === '') {
    return currentPath ?? '';
  }

  const files = flattenTreeFiles(tree);
  const normalizedTarget = normalizePath(trimmedTarget);
  const directMatch = files.find((file) => file.path === normalizedTarget);
  if (directMatch !== undefined) {
    return directMatch.path;
  }

  const basenameMatch = files.find((file) => file.name === normalizedTarget);
  if (basenameMatch !== undefined) {
    return basenameMatch.path;
  }

  const targetWithExtension = hasFileExtension(normalizedTarget)
    ? normalizedTarget
    : `${normalizedTarget}.md`;
  const suffixMatch = files.find((file) => file.path.endsWith(`/${targetWithExtension}`));
  if (suffixMatch !== undefined) {
    return suffixMatch.path;
  }

  const titleMatch = files.find((file) => (
    stripMarkdownExtension(file.name) === normalizedTarget
    || stripMarkdownExtension(file.name).startsWith(`${normalizedTarget}-`)
  ));
  if (titleMatch !== undefined) {
    return titleMatch.path;
  }

  return defaultResolveWikilinkPath(trimmedTarget, currentPath);
}

function navigateToVaultTarget(target: VaultWikilinkTarget): void {
  const url = new URL('/admin/orchestrator', window.location.origin);
  if (target.path !== '') {
    url.searchParams.set('vault', target.path);
  }

  window.location.assign(`${url.pathname}${url.search}${formatAnchor(target.anchor)}`);
}

function flattenTreeFiles(tree: readonly VaultTreeNode[]): VaultTreeNode[] {
  return tree.flatMap((node) => {
    if (node.type === 'file') {
      return [node];
    }

    return flattenTreeFiles(node.children ?? []);
  });
}

function formatAnchor(anchor: string | null): string {
  if (anchor === null) {
    return '';
  }

  return `#${slugify(anchor)}`;
}

function hasFileExtension(path: string): boolean {
  return /\.[A-Za-z0-9]+$/.test(path);
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\\/g, '/');
}

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function stripMarkdownExtension(name: string): string {
  return name.replace(/\.md$/, '');
}
