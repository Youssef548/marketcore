import type { AnchorHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TextLink } from '../src/text-link';

/** Stands in for a router's link: this package must not import one. */
function RouterLink(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a data-router="yes" {...props} />;
}

describe('TextLink', () => {
  it('is an anchor by default, so it is announced as a link and keeps its href', () => {
    render(<TextLink href="/register">Create one</TextLink>);

    expect(screen.getByRole('link', { name: 'Create one' }).getAttribute('href')).toBe('/register');
  });

  it('renders as the router link it is given, passing its props through', () => {
    render(
      <TextLink as={RouterLink} href="/login">
        Sign in
      </TextLink>,
    );

    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link.getAttribute('data-router')).toBe('yes');
    expect(link.getAttribute('href')).toBe('/login');
  });

  it('can be a button that reads as a link, and still acts on click', () => {
    const onClick = vi.fn();
    render(
      <TextLink as="button" type="button" onClick={onClick}>
        Sign out
      </TextLink>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps a caller class beside its own', () => {
    render(
      <TextLink href="/" className="pt-2">
        Home
      </TextLink>,
    );

    const classes = screen.getByRole('link').className.split(' ');
    expect(classes).toContain('text-action');
    expect(classes).toContain('pt-2');
  });
});
