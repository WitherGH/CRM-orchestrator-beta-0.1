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

## Next (Package 1 remaining)

1. Home tab: real goal intake (reuse human-request API) + project list with
   progress and burn per project.
2. Answer-in-UI flow for `blocked-question` cards (pairs with F0.6 in core).
3. Actions in the task drawer (approve merge, unflag/relaunch) instead of
   linking out to the ops console.
4. Start migrating remaining admin panels off `orchestrator.css`.

Then Package 2: Runner abstraction (`Runner { run(task, ctx) }`,
OpenRouterRunner v1 for text roles, CustomCliRunner, Model Hub screen).
