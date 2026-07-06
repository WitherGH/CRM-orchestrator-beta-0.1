import type { VaultTask } from '../../server/vault-fs';

/**
 * The orchestrator stores the task's pull request in frontmatter
 * (pr_number / pr_url), which vault-fs surfaces via task.metadata.
 */
export interface TaskPr {
  prNumber: number;
  prUrl: string | null;
}

const prNumberKeys = ['pr_number', 'prNumber'];
const prUrlKeys = ['pr_url', 'prUrl', 'github_url', 'githubUrl'];

export function readTaskPr(task: VaultTask): TaskPr | null {
  const prNumber = readPositiveInteger(task.metadata, prNumberKeys);
  if (prNumber === null) {
    return null;
  }

  return {
    prNumber,
    prUrl: readString(task.metadata, prUrlKeys),
  };
}

function readPositiveInteger(
  metadata: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }
  }

  return null;
}

function readString(
  metadata: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  return null;
}
