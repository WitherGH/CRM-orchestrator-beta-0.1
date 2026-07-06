import { describe, expect, it } from 'vitest';

import { extractAgentQuestion } from './task-question';

describe('extractAgentQuestion', () => {
  it('extracts the question section from the task body', () => {
    const body = [
      '## Goal',
      '',
      'Build the signup form.',
      '',
      '## Question for Yaroslav',
      '',
      'Should the form require a phone number, or is email enough?',
    ].join('\n');

    expect(extractAgentQuestion(body)).toBe(
      'Should the form require a phone number, or is email enough?',
    );
  });

  it('stops at the next section and takes the latest question', () => {
    const body = [
      '## Question for human',
      '',
      'Old question already answered.',
      '',
      '## Human answer (2026-07-05)',
      '',
      'Answered.',
      '',
      '## Question for human',
      '',
      'New question, second round.',
      '',
      '## Notes',
      '',
      'Internal notes.',
    ].join('\n');

    expect(extractAgentQuestion(body)).toBe('New question, second round.');
  });

  it('returns null when there is no question section or it is empty', () => {
    expect(extractAgentQuestion('## Goal\n\nJust work.')).toBeNull();
    expect(extractAgentQuestion('## Question for human\n\n## Next section')).toBeNull();
    expect(extractAgentQuestion('')).toBeNull();
  });
});
