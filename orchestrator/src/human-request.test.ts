import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import matter from 'gray-matter';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildHumanRequestPlan,
  createHumanRequestTasks,
  humanRequestInputSchema,
  type HumanRequestInput,
} from './human-request';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { force: true, recursive: true })));
  tempRoots.length = 0;
});

describe('human request intake planning', () => {
  it('validates human request intake payloads', () => {
    const result = humanRequestInputSchema.safeParse(createInput());
    const invalid = humanRequestInputSchema.safeParse({
      ...createInput(),
      labels: ['Bad Label'],
      roles: createInput().roles.map((role) => ({ ...role, enabled: false })),
    });

    expect(result.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it('builds dependency links from role order, not raw numeric order', () => {
    const plan = buildHumanRequestPlan(
      createInput({
        roles: [
          { enabled: true, model: 'opus', role: 'architect' },
          { enabled: true, model: 'sonnet', role: 'pm' },
          { enabled: false, model: 'sonnet', role: 'designer' },
          { enabled: true, model: 'gpt-5.5', role: 'developer' },
          { enabled: true, model: 'opus', role: 'reviewer' },
          { enabled: true, model: 'gpt-5.5', role: 'tester' },
        ],
      }),
      ['T-020', 'T-021', 'T-030'],
      new Date('2026-05-14T12:00:00.000Z'),
    );

    expect(plan.taskIds).toEqual(['T-031', 'T-032', 'T-033', 'T-034', 'T-035']);
    expect(plan.tasks.map((task) => [task.assignee, task.dependsOn])).toEqual([
      ['architect', []],
      ['pm', ['T-031']],
      ['developer', ['T-032']],
      ['reviewer', ['T-033']],
      ['tester', ['T-034']],
    ]);
  });

  it('preserves selected model overrides in generated task frontmatter', async () => {
    const vaultPath = join(tmpdir(), `crm-human-request-${randomUUID()}`);
    tempRoots.push(vaultPath);

    const result = await createHumanRequestTasks(
      createInput({
        roles: [
          { enabled: false, model: 'opus', role: 'architect' },
          { enabled: false, model: 'sonnet', role: 'pm' },
          { enabled: false, model: 'sonnet', role: 'designer' },
          { enabled: true, model: 'gpt-5.4', role: 'developer' },
          { enabled: false, model: 'opus', role: 'reviewer' },
          { enabled: false, model: 'gpt-5.5', role: 'tester' },
        ],
      }),
      {
        existingTaskIds: ['T-040'],
        now: () => new Date('2026-05-14T12:00:00.000Z'),
        vaultPath,
      },
    );
    const raw = await readFile(
      join(vaultPath, '04-tasks', 'backlog', 'T-041-developer-add-admin-request-intake.md'),
      'utf-8',
    );
    const parsed = matter(raw);

    expect(result.taskIds).toEqual(['T-041']);
    expect(parsed.data).toMatchObject({
      assignee: 'developer',
      model: 'gpt-5.4',
      request_id: 'R-20260514T120000-add-admin-request-intake',
      status: 'backlog',
    });
    expect(parsed.content).toContain('## Human notes');
    expect(parsed.content).toContain('Keep each role output reviewable before continuing.');
  });
});

function createInput(overrides: Partial<HumanRequestInput> = {}): HumanRequestInput {
  return {
    actorUserId: 'local-admin',
    brief: 'Add an admin request intake that creates role pipeline tasks.',
    humanNotes: 'Keep each role output reviewable before continuing.',
    labels: ['crm', 'orchestrator'],
    priority: 'P0',
    roles: [
      { enabled: true, model: 'opus', role: 'architect' },
      { enabled: true, model: 'sonnet', role: 'pm' },
      { enabled: true, model: 'sonnet', role: 'designer' },
      { enabled: true, model: 'gpt-5.5', role: 'developer' },
      { enabled: true, model: 'opus', role: 'reviewer' },
      { enabled: true, model: 'gpt-5.5', role: 'tester' },
    ],
    targetArea: 'apps/web',
    title: 'Add admin request intake',
    ...overrides,
  };
}
