import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from '../src/input';

describe('Input', () => {
  it('reaches a screen reader when it is invalid, not only the eye', () => {
    render(<Input aria-label="Email" invalid />);

    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
  });

  it('says nothing about validity when it is valid', () => {
    render(<Input aria-label="Email" />);

    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBeNull();
  });
});
