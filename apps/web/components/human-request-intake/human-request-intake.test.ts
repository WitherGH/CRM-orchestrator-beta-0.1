import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { HumanRequestIntake } from './human-request-intake';

describe('HumanRequestIntake', () => {
  it('renders the intake composer fields and submission target', () => {
    const html = renderToStaticMarkup(createElement(HumanRequestIntake));

    expect(html).toContain('Intake composer');
    expect(html).toContain('name="title"');
    expect(html).toContain('name="brief"');
    expect(html).toContain('name="priority"');
    expect(html).toContain('name="labels"');
    expect(html).toContain('name="targetArea"');
    expect(html).toContain('name="humanNotes"');
    expect(html).toContain('action="/api/admin/orchestrator/requests"');
    expect(html).toContain('method="post"');
  });

  it('shows role toggles, model overrides, and limit reset hints before submission', () => {
    const html = renderToStaticMarkup(createElement(HumanRequestIntake));

    expect(html).toContain('Planned role pipeline');
    expect(html).toContain('name="roleEnabled"');
    expect(html).toContain('name="roleModel:architect"');
    expect(html).toContain('name="roleModel:developer"');
    expect(html).toContain('opus');
    expect(html).toContain('gpt-5.5');
    expect(html).toContain('limit resets 17:00 local');
    expect(html).toContain('depends on PM');
  });
});
