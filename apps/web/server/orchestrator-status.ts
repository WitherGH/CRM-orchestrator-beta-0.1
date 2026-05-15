export interface OrchestratorRuntimeSnapshot {
  activeLaunches: number;
  daemonRunning: boolean;
  lastTickError: string | null;
  lastTickFinishedAt: string | null;
  lastTickStartedAt: string | null;
  processStartedAt: string;
}

export interface OrchestratorStatusSnapshot {
  agents: {
    active: number;
    roles: Array<{
      capacity: number;
      limitReset?: string;
      model?: string;
      role: string;
      runner: 'claude' | 'codex';
      runningCount: number;
      runningTaskIds: string[];
    }>;
    total: number;
  };
  ok: boolean;
  runtime: OrchestratorRuntimeSnapshot;
  tasks: {
    byStatus: Record<string, number>;
    flagged: number;
    total: number;
  };
  timestamp: string;
}

export interface OrchestratorStatusReadResult {
  message: string | null;
  online: boolean;
  snapshot: OrchestratorStatusSnapshot | null;
}

const defaultTimeoutMs = 2_500;

export async function readOrchestratorStatus(
  options: {
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<OrchestratorStatusReadResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs ?? defaultTimeoutMs);

  try {
    const response = await fetchImpl(`${options.baseUrl ?? defaultOrchestratorBaseUrl()}/status`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as unknown;

    if (!response.ok || !isStatusSnapshot(payload)) {
      return {
        message: readErrorMessage(payload) ?? 'Orchestrator status unavailable',
        online: false,
        snapshot: null,
      };
    }

    return {
      message: null,
      online: true,
      snapshot: payload,
    };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Orchestrator status unavailable',
      online: false,
      snapshot: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function defaultOrchestratorBaseUrl(): string {
  const explicitUrl = process.env.ORCHESTRATOR_HTTP_URL;
  if (explicitUrl !== undefined && explicitUrl.trim() !== '') {
    return explicitUrl.replace(/\/$/, '');
  }

  const host = process.env.ORCHESTRATOR_HTTP_HOST ?? '127.0.0.1';
  const port = process.env.ORCHESTRATOR_HTTP_PORT ?? '4373';
  return `http://${host}:${port}`;
}

function isStatusSnapshot(value: unknown): value is OrchestratorStatusSnapshot {
  return typeof value === 'object'
    && value !== null
    && 'agents' in value
    && typeof value.agents === 'object'
    && value.agents !== null
    && 'ok' in value
    && typeof value.ok === 'boolean'
    && 'runtime' in value
    && typeof value.runtime === 'object'
    && value.runtime !== null
    && 'tasks' in value
    && typeof value.tasks === 'object'
    && value.tasks !== null
    && 'timestamp' in value
    && typeof value.timestamp === 'string';
}

function readErrorMessage(payload: unknown): string | null {
  if (
    typeof payload === 'object'
    && payload !== null
    && 'message' in payload
    && typeof payload.message === 'string'
  ) {
    return payload.message;
  }

  return null;
}
