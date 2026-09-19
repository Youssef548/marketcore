import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from '../src/button';

describe('Button', () => {
  it('is not natively disabled while busy, so a keyboard user is not thrown off the form', () => {
    // A genuinely `disabled` submit button drops focus, which sends a keyboard
    // user back to the top of the form mid-submit. `aria-disabled` keeps the
    // button focusable and announced as unavailable.
    render(<Button busy>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  it('refuses a click while busy, so a double submit is still impossible', () => {
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Save
      </Button>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('hands the click through when it is not busy', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('announces nothing when it is not busy', () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.getAttribute('aria-busy')).toBeNull();
    expect(button.getAttribute('aria-disabled')).toBeNull();
  });
});
