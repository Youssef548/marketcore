import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field } from '../src/field';

describe('Field', () => {
  it('points the input at the element carrying its message', () => {
    // The defect this component exists to fix: the login and register forms each
    // rendered an error paragraph beside an input with nothing linking the two, so
    // a screen reader announced the input and never mentioned why it was refused.
    render(<Field label="Email" error="Enter an email address" />);

    const input = screen.getByLabelText('Email');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const message = document.getElementById(describedBy as string);
    expect(message?.textContent).toBe('Enter an email address');
  });

  it('leaves the association off when there is no message to describe', () => {
    render(<Field label="Email" />);

    expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('marks the input invalid only while it is refused', () => {
    const { rerender } = render(<Field label="Email" error="Required" />);
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');

    rerender(<Field label="Email" />);
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBeNull();
  });

  it('uses the id it is given, so a caller can own it', () => {
    render(<Field id="email" label="Email" error="Required" />);

    expect(screen.getByLabelText('Email').id).toBe('email');
    expect(screen.getByRole('alert').id).toBe('email-error');
  });
});
