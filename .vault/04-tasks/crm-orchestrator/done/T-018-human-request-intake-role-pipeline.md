---
id: T-018
title: Human request intake and role pipeline
status: done
priority: P0
effort: L
assignee: developer
depends_on:
  - T-008
  - T-013
  - T-014
  - T-017
labels:
  - crm
  - dashboard
  - orchestrator
  - workflow
created: '2026-05-14'
flagged: false
pr_number: 19
pr_url: 'https://github.com/WitherGH/crm-orchestrator-beta-0.1/pull/19'
project_id: crm-orchestrator
---

## What
Add an admin console intake flow where Yaroslav can describe a desired outcome in plain language, attach notes, choose or override agent models, and submit it into the orchestrator as a structured multi-agent workflow.

The submitted request should be transformed into a role pipeline that can run through:

1. Architect: clarify architecture, constraints, ADR/spec changes.
2. PM: decompose into executable tasks with dependencies.
3. Designer: add UX/design requirements when UI is involved.
4. Developer: implement code changes in worktrees.
5. Reviewer: inspect PRs against vault/specs/ADRs.
6. Tester: add or run QA checks and report defects.

## Why
Yaroslav should not need to manually create markdown task files or ask an external chat to orchestrate the team. The CRM should become the control surface for creating, supervising, and annotating agent work.

## Acceptance criteria
- `/admin/orchestrator` includes an intake composer for a new human request.
- The composer supports title, free-form brief, priority, labels, optional target area, and human notes.
- The composer shows the planned role pipeline before submission.
- Yaroslav can enable/disable roles for a request when appropriate.
- Yaroslav can select or override the model for each role before submission.
- The UI shows model limit reset hints for selected models.
- Submission creates vault-backed task files through orchestrator mutations, preserving single-writer rules.
- Generated tasks include `depends_on` links so execution order follows architecture -> PM -> design -> dev -> review -> test, not raw numeric order.
- Human notes are written into each generated task under `## Human notes` or linked from a parent request file.
- The resulting tasks appear in the Kanban/backlog and are picked up by `pnpm tick`.
- The implementation avoids direct client-side filesystem writes.
- Add focused tests for request validation, generated dependency graph, model overrides, and UI submission behavior.

## Reference materials
- [[F-001-multi-agent-crm]]
- [[ADR-001-crm-orchestrator-architecture]]
- [[ADR-003-agent-role-pipeline]]

## Human notes
- The goal is to let Yaroslav describe a desired feature or fix from the same admin console and have the agent system turn it into the right role sequence.
- This must reduce hallucination risk by making every role output explicit, reviewable, and tied to vault notes before downstream roles act.
- Numeric task order is secondary; generated dependencies are the real execution order.
