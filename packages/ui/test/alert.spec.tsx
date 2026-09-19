import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert } from '../src/alert';

describe('Alert', () => {
  it('announces the message rather than merely showing it', () => {
    render(<Alert>Invalid credentials</Alert>);

    expect(screen.getByRole('alert').textContent).toBe('Invalid credentials');
  });

  it('renders nothing at all when there is nothing to say', () => {
    const { container } = render(<Alert>{null}</Alert>);

    expect(container.innerHTML).toBe('');
  });

  it('carries an id, so a field can point its input at the message', () => {
    render(<Alert id="email-error">Required</Alert>);

    expect(screen.getByRole('alert').id).toBe('email-error');
  });
});
