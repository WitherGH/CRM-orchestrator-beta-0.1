# CLAUDE.md - CRM Orchestrator Context

This repo is `CRM-orchestrator-beta-0.1`: a private beta control plane for running a six-role agent workflow over an Obsidian vault.

## Read First

1. `.vault/_README.md`
2. `.vault/03-projects/crm-orchestrator.md`
3. `.vault/05-features/F-001-multi-agent-crm.md`
4. latest file in `.vault/06-progress/`
5. your role file in `.claude/agents/`

## What This Repo Is

- A Next.js CRM at `/admin/orchestrator`.
- A TypeScript/Hono orchestrator status and control API.
- A vault-backed task/project system.
- A local workflow for Claude and Codex agents.

## What This Repo Is Not

- It is not the Terminal frontend product.
- It is not a trading terminal.
- It does not contain the `terminal-frontend` project workspace.

## Roles

- Architect: structure, ADRs, project decomposition.
- PM: sequencing, acceptance criteria, progress summaries.
- Designer: console UX and interaction specs.
- Developer: implementation in code.
- Reviewer: PR inspection and merge readiness.
- Tester: regression and edge-case coverage.

## Working Rules

- The vault is the source of truth.
- Every task belongs to a project through `project_id`.
- CRM actions must stay project-scoped.
- Do not silently merge PRs. Human approval remains required.
- If a task cannot produce code, it must produce a written artifact or clear report.

## Commands

```bash
pnpm dev
pnpm --filter @crm-orchestrator/orchestrator status
pnpm test
pnpm typecheck
pnpm lint
```
