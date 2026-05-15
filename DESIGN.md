# DESIGN.md

Design ground rules for CRM Orchestrator.

## Experience

The CRM is an operational console. It should feel dense, quiet, and precise. The first screen is the usable control surface, never a marketing page.

## Layout

- Left rail: inbox and vault explorer.
- Main: project switcher, human request composer, workspace tabs, Kanban or PR/cost/vault views.
- Right rail: automation controls, live agents, model routing.
- Task drawer: metadata, manual controls, edit form, artifacts, recent logs.

## Visual Direction

- Dark graphite by default.
- Thin borders and disciplined spacing, no decorative gradients.
- Monospace UI is acceptable because this is a control console.
- Color is for state: active, warning, danger, success.
- Cards are for repeated entities only: tasks, agents, PR rows.

## Interaction Rules

- Tasks must be draggable between statuses.
- Destructive actions require confirmation.
- Agent log and kill controls must remain visible when an agent is running or stale.
- Tabs must be real navigation links and preserve the selected project.
- Artifacts and task files should be clickable whenever the CRM can resolve them.
- Forms should submit through the CRM control API and return to the same project workspace.

## Bans

- Marketing hero sections.
- Decorative orbs, bokeh, or gradient backgrounds.
- In-app explanatory prose that replaces actual controls.
- Hidden automation that cannot be stopped or inspected.
- UI that requires terminal monitoring to know whether work is happening.
