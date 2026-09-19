import { expect, test, type Page } from '@playwright/test';
import { OrganizationSchema, TokenPairSchema } from '@app/contracts';
import { credentials, organizationPayload, TEST_PASSWORD, unique } from '../support/fixtures';

const API = '/api/v1';

/**
 * The web app is reached by its public name rather than through `localhost`, because
 * a browser cannot be handed a `Host` header the way a request context can. The
 * Playwright config maps the name to the host; DNS for it is deliberately not arranged.
 */
const WEB = 'https://web.marketcore.test:8443';

async function signIn(page: Page, email: string) {
  await page.goto(`${WEB}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * The web app's own layer.
 *
 * Everything else in this repository that touches the session runs in one Node
 * process, where `Set-Cookie` is a header a test invented. Whether a browser *stores*
 * that cookie — and whether it withholds it from JavaScript — is decided by the
 * browser, over real TLS, and a `Secure` cookie sent over plain http is dropped in
 * silence rather than refused. That branch is unreachable anywhere but here.
 */
test.describe('web: the session in a real browser', () => {
  test('paints the shared design system instead of shipping it unstyled', async ({ page }) => {
    // Tailwind 4 finds classes by walking the project and deliberately skips
    // `node_modules`, where `@app/ui` is reached through a symlink. So every class
    // defined inside the shared package was absent from the stylesheet: the primary
    // button had no background at all, and the input's focus border and the alert's
    // colours did not exist. The components still rendered, which is why the unit test
    // that asserted their presence passed while the page had no visible button.
    //
    // Only a browser can ask this question, and it has to be asked of computed styles:
    // a class name being present in the markup proves nothing about whether anything
    // was painted.
    await page.emulateMedia({ colorScheme: 'dark' });

    await page.goto(`${WEB}/login`);

    // Emulated dark on purpose. The theme is a decision rather than a consequence of
    // the machine, so the page must be light whichever way the visitor's OS is set —
    // and `color-scheme: light` is what makes the browser agree, including for the
    // form controls it would otherwise paint itself.
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
    const pageBackground = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(pageBackground).toBe('rgb(255, 255, 255)');

    const button = page.getByRole('button', { name: 'Sign in' });
    const buttonBackground = await button.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(buttonBackground, 'the primary button has a background').not.toBe('rgba(0, 0, 0, 0)');
    expect(buttonBackground, 'and is not the page it sits on').not.toBe(pageBackground);

    const input = page.getByLabel('Email');
    const inputBackground = await input.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(inputBackground, 'the field states its own surface').toBe('rgb(255, 255, 255)');
  });

  test('creates an account, signs in, and is turned away once signed out', async ({ page }) => {
    const email = `${unique('web')}@marketcore.test`;

    await page.goto(`${WEB}/register`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Registration returns a user and no tokens: the API separates creating a user
    // from signing one in, and the app sends the visitor to sign in rather than
    // chaining a login behind their back.
    await expect(page).toHaveURL(/\/login\?registered=1/);

    await signIn(page, email);
    // Scoped to the header: the address is the shell's own claim about who is signed
    // in, and the dashboard body names it too.
    await expect(page.getByRole('banner').getByText(email)).toBeVisible();

    const cookies = await page.context().cookies();
    const access = cookies.find((cookie) => cookie.name === 'mc_at');
    const refresh = cookies.find((cookie) => cookie.name === 'mc_rt');

    // The reason the tokens are not in a response body.
    expect(access?.httpOnly, 'the access cookie is httpOnly').toBe(true);
    expect(refresh?.httpOnly, 'the refresh cookie is httpOnly').toBe(true);

    // Only reachable because Caddy terminates real TLS: over plain http the browser
    // would have discarded a Secure cookie without saying so, and this would be
    // undefined rather than false.
    expect(access?.secure, 'the access cookie is Secure').toBe(true);
    expect(refresh?.secure, 'the refresh cookie is Secure').toBe(true);
    expect(access?.sameSite).toBe('Lax');

    // The access cookie carries no expiry of its own — `-1` is a session cookie. The
    // token's fifteen minutes are the API's to enforce, and its 401 is the only thing
    // entitled to say they are over.
    expect(access?.expires, 'the access cookie has no expiry of its own').toBe(-1);
    // The refresh cookie does, or closing the browser would end a 30-day session.
    expect(refresh?.expires ?? 0).toBeGreaterThan(Math.floor(Date.now() / 1000));

    // The claim the whole design rests on, checked from inside the page.
    expect(await page.evaluate(() => document.cookie)).not.toContain('mc_');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);

    // The gate, not just the UI: asking for the dashboard again is refused.
    await page.goto(`${WEB}/dashboard`);
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  });

  test('asks which organization to act in, and remembers the answer', async ({ page, request }) => {
    const email = `${unique('web-orgs')}@marketcore.test`;

    // Two organizations, created through the API: the browser never holds a token, so
    // it cannot create one, which is the point of the design rather than a gap in it.
    await request.post(`${API}/auth/register`, { data: credentials(email) });
    const session = await request.post(`${API}/auth/login`, { data: credentials(email) });
    expect(session.status()).toBe(200);
    const tokens = TokenPairSchema.parse(await session.json());
    const authorization = { authorization: `Bearer ${tokens.accessToken}` };

    const created = await Promise.all(
      ['first', 'second'].map((prefix) =>
        request.post(`${API}/organizations`, {
          data: organizationPayload(prefix),
          headers: authorization,
        }),
      ),
    );
    const [first, second] = await Promise.all(
      created.map(async (response) => OrganizationSchema.parse(await response.json())),
    );

    await signIn(page, email);

    // Two memberships and nothing chosen: the control asks rather than picking one.
    // A guess would be invisible, and the API would refuse a request naming none.
    await expect(page.getByRole('combobox')).toHaveValue('');

    await page.getByRole('combobox').selectOption(second.id);
    await expect(page.getByRole('combobox')).toHaveValue(second.id);

    // Held in a cookie because the next data page is fetched by the server, which can
    // only read a cookie — and not readable by script, like the tokens.
    const chosen = (await page.context().cookies()).find((cookie) => cookie.name === 'mc_org');
    expect(chosen?.value).toBe(second.id);
    expect(chosen?.httpOnly).toBe(true);

    // It survives a reload, which is the only reason to store it at all.
    await page.reload();
    await expect(page.getByRole('combobox')).toHaveValue(second.id);

    // And the membership check is real: naming an organization the caller is not in is
    // refused rather than stored. Issued from inside the page, so it is the browser's
    // own resolver and the session's own cookies that carry it — `page.request` would
    // resolve the public name through Node, where it does not exist.
    const refused = await page.evaluate(async () => {
      const response = await fetch('/api/session/organization', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId: '00000000-0000-4000-8000-000000000000' }),
      });

      return { status: response.status, body: await response.json() };
    });

    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('FORBIDDEN');
    expect(first.id).not.toBe(second.id);
  });
});
