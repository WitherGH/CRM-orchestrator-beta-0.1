# PRODUCT.md

This file orients design and product agents for the CRM Orchestrator beta.

## Product

CRM Orchestrator is a local-first control plane for a multi-agent software development workflow. It lets one human create project workspaces, describe OKRs, decompose work into agent tasks, run agents, watch progress, inspect logs/artifacts, control task state, review PRs, and merge approved work.

## Primary User

Yaroslav, operating as owner, PM, reviewer, and release manager for a solo-plus-agents workflow.

## Core Jobs

1. Know what each agent is doing without reading terminal logs.
2. Create a project workspace with title, description, and OKR.
3. Convert a human request into role-specific vault tasks.
4. Run or pause project-scoped automation.
5. Manually run, edit, move, delete, or kill individual tasks.
6. Inspect logs, changed files, PRs, and artifacts from a single drawer.
7. Keep Obsidian as the durable memory layer.

## Product Principles

- Source of truth is the vault, not transient chat history.
- Automation stays observable and interruptible.
- Project workspaces are isolated by default.
- Agent autonomy never bypasses human merge approval.
- Every task must leave inspectable artifacts or a clear explanation.
- Console state must be understandable in under 30 seconds.

## Non-Goals

- A general team project-management SaaS.
- Multi-tenant user administration.
- A trading terminal or end-user frontend product.
- Fully autonomous merging to `main`.
- Replacing Obsidian as the long-term knowledge base.

## Current Beta Scope

- One CRM project workspace: `crm-orchestrator`.
- Six roles: architect, PM, designer, developer, reviewer, tester.
- Claude routes for architect/designer/PM/reviewer.
- Codex routes for developer/tester.
- GitHub PR queue and reviewer merge-ready process.
- Local Next.js CRM plus local Hono orchestrator API.
