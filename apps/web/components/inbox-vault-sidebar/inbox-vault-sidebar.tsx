import type {
  VaultFileSummary,
  VaultMarkdownFile,
  VaultTreeNode,
} from '../../server/vault-fs';
import { VaultMarkdownRenderer } from '../vault-markdown-renderer/vault-markdown-renderer';

export interface InboxVaultSidebarProps {
  inboxItems: readonly VaultFileSummary[];
  now?: Date;
  selectedInboxFile?: VaultMarkdownFile | null;
  selectedVaultPath?: string | null;
  vaultTree: readonly VaultTreeNode[];
}

type InboxAction = {
  description: string;
  label: string;
  value: 'archive' | 'snooze' | 'to-pm';
};

const inboxActions: readonly InboxAction[] = [
  {
    description: 'assign to PM',
    label: 'Triage now',
    value: 'to-pm',
  },
  {
    description: 'tomorrow',
    label: 'Schedule',
    value: 'snooze',
  },
  {
    description: 'remove from queue',
    label: 'Archive',
    value: 'archive',
  },
];

export function InboxVaultSidebar({
  inboxItems,
  now = new Date(),
  selectedInboxFile = null,
  selectedVaultPath = null,
  vaultTree,
}: InboxVaultSidebarProps) {
  return (
    <aside className="orchestrator-left-rail" aria-label="Inbox and vault explorer">
      <section className="orchestrator-panel" aria-labelledby="orchestrator-inbox-title">
        <div className="orchestrator-panel-header">
          <h2 className="orchestrator-panel-title" id="orchestrator-inbox-title">
            Inbox
          </h2>
          <span className="orchestrator-card-meta">{formatFileCount(inboxItems.length)}</span>
        </div>
        <div className="orchestrator-panel-body">
          {inboxItems.length > 0 ? (
            <ul className="orchestrator-file-list">
              {inboxItems.map((item) => (
                <InboxItemLink
                  item={item}
                  key={item.path}
                  now={now}
                  selected={selectedInboxFile?.path === item.path}
                />
              ))}
            </ul>
          ) : (
            <p className="orchestrator-empty">Inbox zero, nothing to triage.</p>
          )}
        </div>
      </section>

      {selectedInboxFile === null ? null : (
        <InboxDrawer file={selectedInboxFile} />
      )}

      <section className="orchestrator-panel" aria-labelledby="orchestrator-vault-title">
        <div className="orchestrator-panel-header">
          <h2 className="orchestrator-panel-title" id="orchestrator-vault-title">
            Vault
          </h2>
          <span className="orchestrator-card-meta">read-only</span>
        </div>
        <div className="orchestrator-panel-body">
          {vaultTree.length > 0 ? (
            <ul className="orchestrator-tree-list">
              {vaultTree.map((node) => (
                <VaultTreeItem
                  key={node.path}
                  node={node}
                  selectedPath={selectedVaultPath}
                />
              ))}
            </ul>
          ) : (
            <p className="orchestrator-empty">No markdown files found.</p>
          )}
        </div>
      </section>
    </aside>
  );
}

function InboxItemLink({
  item,
  now,
  selected,
}: {
  item: VaultFileSummary;
  now: Date;
  selected: boolean;
}) {
  return (
    <li>
      <a
        aria-current={selected ? 'page' : undefined}
        className="orchestrator-file-item orchestrator-file-link"
        href={orchestratorHref({ inbox: item.path })}
      >
        <span className="orchestrator-file-name">{stripMarkdownExtension(item.name)}</span>
        <span className="orchestrator-file-meta">{formatUpdatedLabel(item.updatedAt, now)}</span>
      </a>
    </li>
  );
}

function InboxDrawer({ file }: { file: VaultMarkdownFile }) {
  return (
    <section
      className="orchestrator-inbox-drawer"
      aria-labelledby="orchestrator-inbox-drawer-title"
    >
      <div className="orchestrator-panel-header">
        <div className="orchestrator-drawer-heading">
          <h3 className="orchestrator-panel-title" id="orchestrator-inbox-drawer-title">
            {stripMarkdownExtension(file.name)}
          </h3>
          <span className="orchestrator-card-meta">{file.path}</span>
        </div>
        <a className="orchestrator-action" href="/admin/orchestrator">
          Close
        </a>
      </div>
      <div className="orchestrator-inbox-preview">
        <VaultMarkdownRenderer currentPath={file.path} markdown={file.content} />
      </div>
      <form className="orchestrator-inbox-actions" aria-label="Inbox quick actions">
        <input name="filename" type="hidden" value={file.name} />
        {inboxActions.map((action) => (
          <button
            className="orchestrator-action orchestrator-inbox-action"
            disabled
            key={action.value}
            name="action"
            type="button"
            value={action.value}
          >
            <span>{action.label}</span>
            <span className="orchestrator-card-meta">{action.description}</span>
          </button>
        ))}
      </form>
    </section>
  );
}

function VaultTreeItem({
  node,
  selectedPath,
}: {
  node: VaultTreeNode;
  selectedPath: string | null;
}) {
  if (node.type === 'directory') {
    const children = node.children ?? [];
    const selectedInside = selectedPath !== null && (
      selectedPath === node.path || selectedPath.startsWith(`${node.path}/`)
    );

    return (
      <li className="orchestrator-tree-item">
        <details
          className="orchestrator-tree-group"
          open={selectedInside || isPrimaryVaultFolder(node.path)}
        >
          <summary className="orchestrator-tree-summary">
            <span className="orchestrator-tree-name">{node.name}</span>
            <span className="orchestrator-file-meta">{formatFileCount(countFiles(children))}</span>
          </summary>
          {children.length > 0 ? (
            <ul className="orchestrator-tree-list orchestrator-tree-children">
              {children.map((child) => (
                <VaultTreeItem
                  key={child.path}
                  node={child}
                  selectedPath={selectedPath}
                />
              ))}
            </ul>
          ) : null}
        </details>
      </li>
    );
  }

  return (
    <li className="orchestrator-tree-item">
      <a
        aria-current={selectedPath === node.path ? 'page' : undefined}
        className="orchestrator-tree-link"
        href={orchestratorHref({ vault: node.path })}
      >
        <span className="orchestrator-tree-name">{stripMarkdownExtension(node.name)}</span>
        {node.updatedAt === undefined ? null : (
          <span className="orchestrator-file-meta">{formatDateLabel(node.updatedAt)}</span>
        )}
      </a>
    </li>
  );
}

function countFiles(nodes: readonly VaultTreeNode[]): number {
  return nodes.reduce((count, node) => {
    if (node.type === 'file') {
      return count + 1;
    }

    return count + countFiles(node.children ?? []);
  }, 0);
}

function formatFileCount(count: number): string {
  return count === 1 ? '1 file' : `${count} files`;
}

function formatUpdatedLabel(updatedAt: string, now: Date): string {
  const timestamp = Date.parse(updatedAt);
  if (Number.isNaN(timestamp)) {
    return 'unknown';
  }

  const elapsedMs = Math.max(0, now.getTime() - timestamp);
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;

  if (elapsedMs < minuteMs) {
    return 'now';
  }

  if (elapsedMs < hourMs) {
    return `${Math.floor(elapsedMs / minuteMs)}m`;
  }

  if (elapsedMs < 48 * hourMs) {
    return `${Math.floor(elapsedMs / hourMs)}h`;
  }

  return formatDateLabel(updatedAt);
}

function formatDateLabel(updatedAt: string): string {
  const timestamp = Date.parse(updatedAt);
  if (Number.isNaN(timestamp)) {
    return 'unknown';
  }

  return new Date(timestamp).toISOString().slice(0, 10);
}

function isPrimaryVaultFolder(path: string): boolean {
  return path === '00-inbox'
    || path === '04-tasks'
    || path === '05-features'
    || path === '06-progress';
}

function orchestratorHref(params: Record<string, string>): string {
  const searchParams = new URLSearchParams(params);
  return `/admin/orchestrator?${searchParams.toString()}`;
}

function stripMarkdownExtension(name: string): string {
  return name.replace(/\.md$/, '');
}
