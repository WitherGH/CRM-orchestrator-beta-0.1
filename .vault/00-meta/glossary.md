---
title: Glossary
status: living
date: 2026-05-16
tags: [vault/meta]
---

# Glossary

| Term | Meaning |
|---|---|
| CRM | The Next.js control surface at `/admin/orchestrator`. |
| Orchestrator | The TypeScript runner that launches agents, tracks state, and exposes the local control API. |
| Vault | `.vault/`, the Obsidian folder and source of truth. |
| Project | A scoped workspace in `03-projects/` with its own tasks and OKR. |
| Task | A markdown file under `04-tasks/<project>/<status>/`. |
| Tick | One orchestrator scan and launch cycle. |
| Worktree | A Git worktree created for an agent task. |
| Artifact | A PR, log file, worktree, changed file, or link attached to task frontmatter. |
| Human request | A CRM-submitted request that creates role-specific tasks. |
| Merge-ready | A task with approved/reviewed work that is ready for a human merge action. |

## Roles

| Role | Job |
|---|---|
| Architect | Structure, ADRs, project decomposition, constraints. |
| PM | Sequencing, task descriptions, dependencies, acceptance criteria. |
| Designer | UI/UX behavior and design specs for the CRM surface. |
| Developer | Code implementation. |
| Reviewer | PR review and merge readiness. |
| Tester | Regression, edge cases, verification reports. |
