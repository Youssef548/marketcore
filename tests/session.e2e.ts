import { test } from '@e2e-dev/web';
import { credentials, expect } from 'e2e';

test('an unauthenticated visitor is sent to sign in', async ({ app, screen, browser }) => {
  await app.open('/dashboard');

  await expect(browser).toHaveURL(/\/login\?next=%2Fdashboard$/);
  await expect(screen.getByRole('heading', 'Sign in')).toBeVisible();
});

test('the seeded owner signs in and sees their session', async ({ app, screen, browser, agent }) => {
  const owner = credentials.user('owner');

  await app.open('/login');
  await screen.getByLabel('Email').fill(owner.username);
  await screen.getByLabel('Password').fill(owner.password);
  await screen.getByRole('button', 'Sign in').tap();

  await expect(browser).toHaveURL('/dashboard');

  // Scoped to <main>: the top bar renders its own "Your session" heading and the
  // user's email again, so an unscoped locator is LOCATOR_AMBIGUOUS.
  const main = screen.getByRole('main');
  await expect(main.getByRole('heading', 'Your session')).toBeVisible();
  await expect(main.getByText('owner@marketcore.test')).toBeVisible();
  await expect(main.getByText('1 — Nile Traders')).toBeVisible();

  await agent.assert('the page names the signed-in user and the organization the session acts in');
});

test('a new account is created, then handed to sign in', async ({ app, screen, browser }) => {
  const email = `e2e-${Date.now()}@marketcore.test`;
  // A throwaway account gets its own password rather than the seed's; the policy
  // requires 12+ code points and nothing more.
  const password = `e2e-pass-${Date.now()}`;

  await app.open('/register');
  await screen.getByLabel('Email').fill(email);
  await screen.getByLabel('Password').fill(password);
  await screen.getByRole('button', 'Create account').tap();

  await expect(browser).toHaveURL(/\/login\?registered=1$/);
  // Next's route announcer is also role="alert", and alert takes no accessible
  // name from its contents, so filter by text rather than by name.
  await expect(
    screen.getByRole('alert').filter({ hasText: 'Account created. Sign in to continue.' }),
  ).toBeVisible();
});
