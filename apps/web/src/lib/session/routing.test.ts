import { describe, expect, it } from 'vitest';
import { decideRoute, isCredentialPage, isProtected } from './routing';

describe('the route gate', () => {
  it('sends an anonymous visitor to sign in, carrying where they were going', () => {
    expect(decideRoute('/dashboard', false)).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Fdashboard',
    });
    expect(decideRoute('/dashboard/orders', false)).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Fdashboard%2Forders',
    });
  });

  it('lets an anonymous visitor reach the credential pages', () => {
    expect(decideRoute('/login', false)).toEqual({ kind: 'next' });
    expect(decideRoute('/register', false)).toEqual({ kind: 'next' });
  });

  it('lets a signed-in visitor reach the dashboard', () => {
    expect(decideRoute('/dashboard', true)).toEqual({ kind: 'next' });
    expect(decideRoute('/dashboard/orders', true)).toEqual({ kind: 'next' });
  });

  it('turns a signed-in visitor away from the credential pages', () => {
    // There is nothing to gain from the login form once there is a session, and the
    // API would refuse the submission anyway.
    expect(decideRoute('/login', true)).toEqual({ kind: 'redirect', to: '/dashboard' });
    expect(decideRoute('/register', true)).toEqual({ kind: 'redirect', to: '/dashboard' });
  });

  it('does not treat a path that merely starts with the prefix as protected', () => {
    // `/dashboarding` is a different route; a bare `startsWith('/dashboard')` would
    // gate it and, worse, would gate any future `/dashboard-*` route by accident.
    expect(isProtected('/dashboarding')).toBe(false);
    expect(decideRoute('/dashboarding', false)).toEqual({ kind: 'next' });
  });

  it('names exactly the routes it guards', () => {
    expect(isProtected('/dashboard')).toBe(true);
    expect(isProtected('/dashboard/')).toBe(true);
    expect(isProtected('/')).toBe(false);
    expect(isCredentialPage('/login')).toBe(true);
    expect(isCredentialPage('/register')).toBe(true);
    expect(isCredentialPage('/registration')).toBe(false);
  });
});
