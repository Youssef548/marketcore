import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('the QA agent reads the sign-in screen', async ({ app, agent, screen }) => {
  await app.open('/');
  await expect(screen.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await agent.assert(
    'the screen is a sign-in form with an email field, a password field, and a "Sign in" button',
  );
});
