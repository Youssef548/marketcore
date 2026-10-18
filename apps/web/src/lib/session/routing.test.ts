import { describe, expect, it } from 'vitest';
import { decideRoute, isCredentialPage, isProtected, movedTo } from './routing';

describe('the route gate', () => {
  it('sends an anonymous visitor to sign in, carrying where they were going', () => {
    expect(decideRoute('/admin', false)).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Fadmin',
    });
    expect(decideRoute('/admin/orders', false)).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Fadmin%2Forders',
    });
  });

  it('lets an anonymous visitor reach the credential pages', () => {
    expect(decideRoute('/login', false)).toEqual({ kind: 'next' });
    expect(decideRoute('/register', false)).toEqual({ kind: 'next' });
  });

  it('lets a signed-in visitor reach the console', () => {
    expect(decideRoute('/admin', true)).toEqual({ kind: 'next' });
    expect(decideRoute('/admin/orders', true)).toEqual({ kind: 'next' });
  });

  it('turns a signed-in visitor away from the credential pages', () => {
    // There is nothing to gain from the login form once there is a session, and the
    // API would refuse the submission anyway.
    // To the storefront, not the console (D101): a buyer who signed in and belongs to no
    // organization would otherwise be sent to a screen whose every control is inert.
    expect(decideRoute('/login', true)).toEqual({ kind: 'redirect', to: '/browse' });
    expect(decideRoute('/register', true)).toEqual({ kind: 'redirect', to: '/browse' });
  });

  it('does not treat a path that merely starts with the prefix as protected', () => {
    // `/administration` is a different route; a bare `startsWith('/admin')` would
    // gate it and, worse, would gate any future `/admin-*` route by accident.
    expect(isProtected('/administration')).toBe(false);
    expect(decideRoute('/administration', false)).toEqual({ kind: 'next' });
  });

  it('names exactly the routes it guards', () => {
    expect(isProtected('/admin')).toBe(true);
    expect(isProtected('/admin/')).toBe(true);
    expect(isProtected('/')).toBe(false);
    expect(isCredentialPage('/login')).toBe(true);
    expect(isCredentialPage('/register')).toBe(true);
    expect(isCredentialPage('/registration')).toBe(false);
  });
});

/**
 * D92 — the operator console lives under `/admin`, and the two URLs it used before
 * move permanently. The move is decided before the gate: an old URL is about the
 * address, not about the session, and a signed-out visitor to `/dashboard` must be
 * carried to sign in *for `/admin`* rather than for the dead address.
 */
describe('the console\u2019s moved URLs', () => {
  it('moves them whichever way the session is', () => {
    expect(decideRoute('/dashboard', false)).toEqual({ kind: 'moved', to: '/admin' });
    expect(decideRoute('/dashboard', true)).toEqual({ kind: 'moved', to: '/admin' });
    expect(decideRoute('/products', false)).toEqual({ kind: 'moved', to: '/admin/products' });
    expect(decideRoute('/products', true)).toEqual({ kind: 'moved', to: '/admin/products' });
  });

  it('moves nothing else, so the rule cannot grow into a prefix it was never given', () => {
    // Only the two URLs the console actually served moved. A deeper path is not a
    // route at all — inventing a destination for it would be guessing where a page
    // that never existed should now live.
    expect(movedTo('/products/123')).toBeNull();
    expect(movedTo('/dashboard/orders')).toBeNull();
    expect(movedTo('/admin')).toBeNull();
    expect(decideRoute('/products/123', false)).toEqual({ kind: 'next' });
  });
});

describe('storefront routes are signed-in only (SRS §5)', () => {
  it.each(['/browse', '/p/shirt-66666666-6666-4666-8666-666666666666', '/cart', '/checkout', '/orders/k1/placed', '/account/orders'])(
    '%s sends an anonymous visitor to sign in, and back',
    (path) => {
      expect(decideRoute(path, false)).toEqual({
        kind: 'redirect',
        to: `/login?next=${encodeURIComponent(path)}`,
      });
    },
  );

  it('does not catch routes that merely share a prefix', () => {
    expect(isProtected('/products')).toBe(false);
    expect(isProtected('/pricing')).toBe(false);
  });
});
