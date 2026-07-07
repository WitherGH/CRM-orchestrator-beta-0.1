import { describe, expect, it } from 'vitest';

import { buildGoalRequestPayload } from './goal-intake';

describe('buildGoalRequestPayload', () => {
  it('turns a one-line goal into a full pipeline request', () => {
    const result = buildGoalRequestPayload(
      'Landing page for X with a signup form',
      'crm',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.payload.title).toBe('Landing page for X with a signup form');
    expect(result.payload.brief).toBe('Landing page for X with a signup form');
    expect(result.payload.projectId).toBe('crm');
    expect(result.payload.priority).toBe('P1');
    expect(result.payload.roles).toHaveLength(6);
    expect(result.payload.roles.every((role) => role.enabled)).toBe(true);
  });

  it('uses the first line as title and keeps the rest in the brief', () => {
    const result = buildGoalRequestPayload('Build a blog\n\nWith RSS and dark mode.', null);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.payload.title).toBe('Build a blog');
    expect(result.payload.brief).toContain('With RSS and dark mode.');
    expect(result.payload.projectId).toBeNull();
  });

  it('truncates very long first lines to the title limit', () => {
    const result = buildGoalRequestPayload(`${'x'.repeat(200)}\nrest`, null);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.payload.title).toHaveLength(140);
    expect(result.payload.title.endsWith('…')).toBe(true);
  });

  it('rejects goals that are too short to decompose', () => {
    const result = buildGoalRequestPayload('too short', null);

    expect(result.ok).toBe(false);
  });
});
