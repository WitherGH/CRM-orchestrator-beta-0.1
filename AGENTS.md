# AGENTS.md - CRM Orchestrator

You are working in `CRM-orchestrator-beta-0.1`, a private beta repo for the multi-agent CRM and orchestrator.

## Repository Shape

```text
apps/web/       Next.js CRM UI
orchestrator/   Hono/TypeScript runner and control API
packages/db/    Drizzle schema
packages/ui/    shared CRM design tokens
.vault/         Obsidian memory, projects, tasks, progress
```

## Source Of Truth

The vault owns project state:

```text
.vault/03-projects/crm-orchestrator.md
.vault/04-tasks/crm-orchestrator/<status>/T-NNN-*.md
.vault/05-features/F-001-multi-agent-crm.md
.vault/06-progress/
```

## Agent Contract

- Architect writes architecture and decomposition artifacts.
- PM turns architecture into executable slices.
- Designer specifies control surface behavior and UI details.
- Developer implements scoped code changes.
- Reviewer checks PRs against task, vault, tests, and artifacts.
- Tester adds regression and edge coverage.

## Implementation Rules

- Prefer existing local patterns.
- Use TypeScript and Zod for external boundaries.
- Keep project-scoped behavior intact.
- Add tests for new behavior.
- Run `pnpm lint && pnpm typecheck && pnpm test` before finishing.
- Never commit secrets, `.env`, worktrees, or private logs.

## Human Context

Yaroslav works in Ukrainian and English. User-facing chat may be Ukrainian. Vault docs should stay English so every agent can read them.
