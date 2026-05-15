---
id: ADR-001
title: CRM Orchestrator Architecture
status: accepted
date: 2026-05-16
deciders: [yaroslav, codex]
tags: [vault/adr, vault/orchestrator]
---

# ADR-001 - CRM Orchestrator Architecture

## Context

The system needs one local control plane for a human plus AI-agent development workflow. The control plane must read the vault, show task and agent state, run/stop automation, inspect artifacts, and preserve durable memory in Obsidian.

## Decision

Use a small pnpm monorepo:

```text
apps/web/       Next.js CRM UI
orchestrator/   Hono/TypeScript runner and status/control API
packages/db/    Drizzle schema for agent runs/events/cost
packages/ui/    CSS tokens
.vault/         Obsidian memory and task state
```

The web app talks to the orchestrator through local HTTP endpoints. The orchestrator reads and writes `.vault` task files and launches Claude/Codex subprocesses in Git worktrees.

## Consequences

- The CRM can be used without a remote backend.
- Obsidian and the CRM share the same truth.
- Automation is visible and interruptible.
- A server restart stops process-local automation until the user starts it again.

## Related

- [[ADR-002-vault-project-task-model]]
- [[ADR-003-agent-role-pipeline]]
- [[F-001-multi-agent-crm]]
