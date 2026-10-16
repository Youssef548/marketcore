import { describe, expect, it } from 'vitest';
import { firstIssuePerField } from './issues';

describe('firstIssuePerField', () => {
  it('keeps the first message for each field and drops the rest', () => {
    expect(
      firstIssuePerField([
        { path: ['password'], message: 'Too short' },
        { path: ['email'], message: 'Enter an email address' },
        { path: ['password'], message: 'Add a digit' },
      ]),
    ).toEqual({ password: 'Too short', email: 'Enter an email address' });
  });

  it('files an issue with no path under the form', () => {
    expect(firstIssuePerField([{ path: [], message: 'Something is wrong' }])).toEqual({
      form: 'Something is wrong',
    });
  });

  it('is empty when nothing was refused', () => {
    expect(firstIssuePerField([])).toEqual({});
  });
});
