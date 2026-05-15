---
id: T-001
title: Audit existing React Terminal Project code
status: done
priority: P0
effort: M
assignee: architect
depends_on: []
spec: ''
labels:
  - audit
  - migration
created: '2026-05-13'
flagged: false
project_id: crm-orchestrator
---

## What
Run a full audit of the existing repo at `WitherGH/react_terminal_project`. Produce `02-architecture/_audit-2026-05-13.md` covering what's there, what works, what's fragile, what's dead code, and a tech debt register.

## Why
Per [[ADR-003-code-migration]], we salvage core + rewrite UI. Cannot decide what to salvage until we audit.

## Acceptance criteria
- [ ] `02-architecture/_audit-2026-05-13.md` exists
- [ ] Module-by-module inventory (≤2 sentences each)
- [ ] Explicit "What works" section
- [ ] Explicit "What's fragile" section
- [ ] Tech debt register with P0/P1/P2 priorities
- [ ] No code suggestions (that's Developer's domain)

## Reference materials
- [[ADR-003-code-migration]]
- [[ADR-001-audience]]
- Repo: https://github.com/WitherGH/react_terminal_project
- Local clone for audit: `./.legacy-code/` (read here, not from GitHub)

## Out of scope
- Writing the migration plan (separate task)
- Implementing any code changes
- Visual/design review
