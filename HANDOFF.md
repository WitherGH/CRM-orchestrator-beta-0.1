# HANDOFF.md — Session Context Transfer (2026-07-06)

Context handoff from a Claude.ai session (repo audit + fixes + product replan).
Read this before doing any work. Written for Claude Code and other agents.

## Read Order

1. This file
2. `PLAN-MLP.md` (repo root) — the new product plan, replaces the scope in `PRODUCT.md`
3. `CLAUDE.md`, `AGENTS.md` — still valid for repo conventions
4. `.vault/_README.md` and latest file in `.vault/06-progress/`

## 1. Product Redefinition (IMPORTANT)

The old scope in `PRODUCT.md` (local-first, single-user, CRM-only control plane,
multi-tenant SaaS as a non-goal) is **superseded**. The new primary goal:

A platform where a user describes a product as one goal, and the system:
**Build** (multi-agent decomposition + parallel execution) → **Deploy** (one-click,
preview URLs) → **Market** (dedicated marketing tab: creatives, campaigns) →
**Measure** (product analytics + token-spend analytics, unit economics on one screen).
Plus **BYOM**: users connect models via OpenRouter or any CLI.

Target is a **Minimum Lovable Product** for the owner (Yaroslav) first, judged by
one dogfood scenario: idea → deployed product with a live ad campaign in < 1 day,
0 terminal commands, token cost visible before/during/after with ≥ 95% accuracy.

Full plan with phases 0–5, UI redesign, risks, and roadmap: `PLAN-MLP.md`.

## 2. What Was Already Done This Session

### Audit
Full review of `orchestrator/src/tick.ts`, `human-request.ts`, `apps/web/server/*`,
`packages/db/schema.ts`, `.vault`, agent role files.

### Fixes applied to `orchestrator/src/tick.ts` (v0.3 → patched)
Apply via `tick-fixes.patch` (unified diff vs. beta-0.1 original) or copy the
full patched `tick.ts`. After patching: `pnpm --filter @crm-orchestrator/orchestrator typecheck && pnpm --filter @crm-orchestrator/orchestrator test` — both passed (14/14 tests).

1. **Real cost tracking.** `getTodayCost()`/`recordCost()` were stubs (always 0 / no-op),
   so the cost cap never fired. Now: append-only JSONL journal at
   `.vault/06-progress/cost-journal.jsonl` (env: `ORCHESTRATOR_COST_JOURNAL_PATH`),
   entries `{ts, role, taskId, model, usd, tokensIn, tokensOut, estimated}`.
   Daily cap now actually halts new launches.
2. **Non-blocking scheduler.** `tick()` used to `Promise.allSettled` all agent runs
   (up to 45 min each), so one long task blocked all new launches. Now launches are
   fire-and-forget tracked in `inFlightLaunches` Set; `runtimeState.activeLaunches`
   reflects the set size; each tick tops roles up to capacity.
3. **Orphan reconciliation.** `reconcileOrphanedInProgressTasks()` runs on daemon and
   status-server start: in-progress tasks with no live process → moved to `backlog`
   with `flagged: true` (human unflags to relaunch). Prevents permanent role-capacity
   deadlock after a crash.
4. **PR recovery on worktree reuse.** If `gh pr create` fails because a PR already
   exists for the branch, recover it via `gh pr view <branch> --json number,url`
   instead of moving the task to review with no PR link.
5. **Atomic routing writes.** `agent-routing.json` now written tmp + `rename`
   (was rm + cp, leaving a window where the file didn't exist).
6. **Kill escalation + cost parsing.** SIGKILL 10s after SIGTERM on timeout;
   `estimateCost` also parses Claude Code JSON (`total_cost_usd`, `input_tokens`,
   `output_tokens`) and returns `estimated: true` when falling back to the
   chars/4 heuristic. `launchSingleTask` now rejects duplicate launches of a
   task that is already in flight.

## 3. Known Issues NOT Yet Fixed (Phase 0 backlog, in priority order)

- **F0.1** Switch agent invocation to `claude -p --output-format json` and Codex JSON
  output so usage/cost are exact (kills the `estimated` path).
- **F0.2** Postgres writer: schema (`agent_runs`, `daily_cost`, `orchestrator_events`)
  exists but nothing writes to it. JSONL journal stays as fallback.
- **F0.3** Worktree hygiene: `git fetch origin main` + rebase on worktree reuse;
  delete worktree after the task's PR merges.
- **F0.4** `depsOk()` counts only `done` as satisfied; should also accept
  `merge-ready` (configurable), otherwise the pipeline over-serializes.
- **F0.5** Control API (Hono, port 4373) has **zero auth**; `actorUserId` is an
  unverified client string. Add bearer-token auth (same approach as the owner's
  Second Brain project). Also `getAdminSession()` returns null in production —
  the admin UI does not work in prod at all.
- **F0.6** `blocked-question` is a dead end: add answer-in-UI flow → append answer
  to task body → move back to backlog unflagged.
- **Security (Phase 5 gate):** `codex exec --dangerously-bypass-approvals-and-sandbox`
  runs unsandboxed on the host with `.vault` symlinked in. No external users until
  runs are containerized.

## 4. Agreed Next Work Packages

- **Package 1 (recommended first): Build tab UI redesign.**
  Current UI diagnosis: everything on one screen (top stat bar + two rails + kanban +
  firehose drawer + modals), 2,380-line unstructured `orchestrator.css`, internal
  jargon as UI language ("firehose", "tick", "worktree").
  New IA: 5 top-level tabs — Home / Build / Deploy / Market / Insights.
  Build tab first: 4-column kanban (Queue / Working / Review / Done — display mapping
  over the 7 vault statuses, model unchanged), human-language agent feed instead of
  raw logs, task drawer on click, single burn meter in the header (`$3.20 / $10 today`).
  Use design tokens in `packages/ui` + Tailwind; retire the monolithic CSS gradually.
- **Package 2: Runner abstraction.** `Runner { run(task, ctx): RunResult }`;
  refactor Claude/Codex CLI into runners; add `OpenRouterRunner` (v1: text-roles only —
  architect/pm/designer/reviewer; developer/tester stay on CLI until the tool loop
  matures) and `CustomCliRunner` (config-described CLI). Then a Model Hub screen
  replaces hand-editing `agent-routing.json`.

## 5. Owner Conventions

- Chat with the owner may be Ukrainian; vault docs and code stay English.
- Vault is the source of truth; human merge approval is mandatory; automation must
  stay observable and interruptible.
- Run `pnpm lint && pnpm typecheck && pnpm test` before finishing any change.
- Never commit secrets, `.env`, worktrees, or private logs.
