# CRM-orchestrator-beta-0.1

Private beta repository for the CRM Orchestrator control plane.

This repo contains only the multi-agent CRM, its orchestrator runner, its vault memory, and the supporting packages needed to run the control surface. The Terminal frontend product workspace was intentionally removed.

## What Is Inside

- `apps/web` - Next.js admin CRM at `/admin/orchestrator`
- `orchestrator` - Hono/TypeScript runner and status/control API
- `packages/db` - Drizzle schema for agent runs, events, and cost data
- `packages/ui` - shared design tokens used by the CRM
- `.vault` - Obsidian vault used as durable memory and task state
- `.claude/agents` and `.codex/agents` - role prompts for the six-agent workflow

## Prerequisites

- Node 22+
- pnpm
- Claude Code CLI, authenticated with `claude login`
- OpenAI Codex CLI, authenticated with `codex login`
- GitHub CLI, authenticated with `gh auth login`
- Obsidian, for reading and editing `.vault`

## Setup

```bash
pnpm install
cp .env.example .env
```

Then review `.env` and adjust model routing, HTTP port, vault path, and cost cap.

## Run Locally

Start the CRM:

```bash
pnpm dev
```

Open:

```text
http://127.0.0.1:3000/admin/orchestrator?project=crm-orchestrator
```

Start the orchestrator status/control server:

```bash
pnpm --filter @crm-orchestrator/orchestrator status
```

Health check:

```bash
curl http://127.0.0.1:4373/status
```

## Obsidian Workflow

Open `.vault/` as an Obsidian vault. The CRM reads and writes the same folder, so task edits in Obsidian and actions in the CRM are the same source of truth.

Recommended Obsidian plugins:

- Dataview
- Tasks
- Templater
- Excalidraw, optional

The active project is `.vault/03-projects/crm-orchestrator.md`. Tasks live under:

```text
.vault/04-tasks/crm-orchestrator/<status>/T-NNN-*.md
```

## Operating Model

1. Write a project OKR or human request in the CRM.
2. The architect/PM/designer/developer/reviewer/tester pipeline decomposes and executes work through vault tasks.
3. The CRM shows task status, live agents, logs, artifacts, PR queue, daily summaries, and cost.
4. Merge-ready work is still human-approved. The reviewer merge button only runs when you press it.

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Privacy

This beta repo is intended to be private. Do not publish `.env`, worktrees, logs with secrets, or private agent output.
