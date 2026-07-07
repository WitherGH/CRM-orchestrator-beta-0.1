# Progress — tick.ts fixes landed + Build tab redesign (Package 1, increment 1)

Date: 2026-07-06
Context: continuation of the Claude.ai session handoff (`HANDOFF.md`, `PLAN-MLP.md` at repo root).

## Done

### Orchestrator core (commit `fix(orchestrator): …`)

Applied `tick-fixes.patch` to `orchestrator/src/tick.ts`:
cost journal (JSONL at `.vault/06-progress/cost-journal.jsonl`), non-blocking
scheduler, orphan reconciliation, PR reuse on worktree reuse, atomic routing
writes, SIGKILL escalation + Claude JSON cost parsing.
Verified: orchestrator typecheck clean, 14/14 tests.

### Build tab redesign (commit `feat(web): …`)

First increment of Package 1 from `HANDOFF.md` section 4:

- New `(product)` route group: Home / Build / Deploy / Market / Insights tabs.
  `/` now lands on `/build`; ops console unchanged at `/admin/orchestrator`.
- Build tab: 4-column board (Queue / Working / Review / Done) as a display
  mapping over the 7 vault statuses (`blocked-question` → Working + "needs your
  answer", `failed` → Review + "failed", `merge-ready` → Review + "ready to
  merge"). Vault model unchanged. Task drawer on card click with link back to
  the ops console.
- Agent feed in human language ("Developer is working on “X” (T-031) · $0.42"),
  polling the existing live-agents API every 5s.
- Burn meter in the header (`$0.00 / $50.00 today`) reading the real cost
  journal; warms at 80%, red at cap. Links to /insights.
- Design tokens: light product theme in `packages/ui/tokens/product.css`
  (`--product-*` prefix), Tailwind v4 utilities themed from them via
  `@theme inline`. Preflight intentionally not imported so `orchestrator.css`
  admin styling is unaffected.
- Deploy / Market / Insights / Home are phase-labelled placeholders for now.

Verified: `pnpm lint && pnpm typecheck && pnpm test` all green
(web: 137/137 tests, orchestrator: 14/14), `next build` clean, and a dev-server
smoke test of `/build`, `/insights`, `/` redirect, and `/admin/orchestrator`.

## Increment 2 (same day)

- Home tab is real now: one goal field posting to the existing human-request
  API (full pipeline enabled on default models; title = first line of goal),
  plus a project list with progress bar, done/total, working / needs-you
  counts, and today's burn per project from the cost journal.
- Answer-in-UI flow for `blocked-question` (F0.6 UI side): answer textarea in
  the task drawer appends a dated "## Human answer" section to the task body
  via `task-edit`, then requeues to backlog unflagged via `task-status`.
- Drawer also offers Retry for `failed` and Unflag & requeue for flagged
  tasks. All through the existing control API — no orchestrator changes.
- Verified: lint, typecheck, 147/147 web tests, `next build`, dev smoke of
  /home and /build.

## Increment 3 (same day) — Package 1 complete

- Approve-merge in the UI: merge-ready tasks read `pr_number` / `pr_url` from
  frontmatter (via task.metadata); the card badge shows "ready to merge · #N"
  and the drawer offers a PR link + "Approve merge" button posting to the
  existing /prs/merge route.
- Agent questions surfaced: the latest "## Question for …" section of the
  task body (the marker tick.ts uses to route to blocked-question) is shown
  as a two-line preview on the card and quoted in full above the drawer's
  answer box.
- Verified: lint, typecheck, 153/153 web + 14/14 orchestrator tests, and a
  dev-server smoke with synthetic blocked-question and merge-ready vault
  tasks (removed after the check).

**Package 1 is done.** The daily loop — goal in, watch agents, answer
questions, approve merges, see burn — now happens entirely in the product UI.
Retiring the remaining `orchestrator.css` admin panels continues gradually as
those panels get product-tab equivalents (Model Hub in Package 2 replaces the
model-routing rail; Insights in Phase 4 replaces the cost mode).

## Increment 4 (2026-07-07) — token-economics fixes (F0.1, F0.4, estimates)

- **F0.1 exact usage for Claude runs**: launches now use
  `--output-format stream-json --verbose`, and `estimateCost` parses the final
  result event (total_cost_usd + usage incl. cache tokens) — the chars/4
  heuristic only remains as a last-resort fallback marked `estimated: true`.
  Codex keeps its exact "Tokens used" summary-line parse; its JSON migration
  lands with the Runner abstraction in Package 2.
- **Pre-launch estimates + predictive cap**: per-launch cost is estimated from
  journal history (same role+model → same role → any, avg of last 20 exact
  entries; `ORCHESTRATOR_DEFAULT_LAUNCH_COST_USD` with an empty journal, $1).
  The tick now defers launches that would *push today past the cap* instead of
  only halting after it is blown. The Build drawer shows "Estimated run cost"
  for queued tasks from the same signal.
- **F0.4 deps unblocked**: `depsOk` accepts `done` and `merge-ready` by default
  (`ORCHESTRATOR_DEP_SATISFIED_STATUSES` to override); the tick also lists the
  merge-ready folder, which the scheduler previously never read.
- **Codex role-file cache**: role files are memoized by mtime; the static role
  prefix stays byte-identical across launches for provider prompt-cache hits.
- Verified: lint, typecheck, 24/24 orchestrator (10 new) + 155/155 web tests,
  `next build`. Claude CLI flag support confirmed locally. First real agent
  run should be checked in the journal for `estimated: false`.

## Next: Package 2 — Runner abstraction

`Runner { run(task, ctx): RunResult }`; refactor Claude/Codex CLI into
runners; OpenRouterRunner v1 (text roles: architect/pm/designer/reviewer);
CustomCliRunner; then the Model Hub screen replaces agent-routing.json edits.

Then Package 2: Runner abstraction (`Runner { run(task, ctx) }`,
OpenRouterRunner v1 for text roles, CustomCliRunner, Model Hub screen).
