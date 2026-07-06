import { describe, expect, it } from 'vitest';

import { appendAnswerToBody } from './task-actions';

describe('appendAnswerToBody', () => {
  it('appends a dated human answer section to the task body', () => {
    const next = appendAnswerToBody(
      '## Goal\n\nBuild the form.\n',
      'Use the existing endpoint.',
      '2026-07-06T15:30:00.000Z',
    );

    expect(next).toBe(
      '## Goal\n\nBuild the form.\n\n## Human answer (2026-07-06)\n\nUse the existing endpoint.\n',
    );
  });

  it('handles an empty body without leading blank lines', () => {
    const next = appendAnswerToBody('', 'Answer.', '2026-07-06T15:30:00.000Z');

    expect(next).toBe('## Human answer (2026-07-06)\n\nAnswer.\n');
  });

  it('trims trailing whitespace before appending and trims the answer', () => {
    const next = appendAnswerToBody('Body.\n\n\n', '  Yes, go ahead.  ', '2026-07-06T15:30:00.000Z');

    expect(next).toBe('Body.\n\n## Human answer (2026-07-06)\n\nYes, go ahead.\n');
  });
});
