import { expect, test, type Locator, type Page } from '@playwright/test';
import { OrganizationSchema, TokenPairSchema } from '@app/contracts';
import { credentials, organizationPayload, TEST_PASSWORD, unique } from '../support/fixtures';

const API = '/api/v1';

/**
 * The web app is reached by its public name rather than through `localhost`, because
 * a browser cannot be handed a `Host` header the way a request context can. The
 * Playwright config maps the name to the host; DNS for it is deliberately not arranged.
 */
const WEB = 'https://web.marketcore.test:8443';

/**
 * A computed colour, as sRGB bytes.
 *
 * Read through a canvas rather than by parsing the string, because the browser
 * serialises a colour in the space it was written in — the tokens are literal
 * `oklch()`, so `getComputedStyle` returns `oklch(…)`, not `rgb(…)`. A regex over the
 * string silently read the digits of an oklch value as three RGB channels, which is
 * how the assertions below passed while measuring nothing. `fillStyle` parses any
 * colour syntax and `getImageData` returns the bytes the screen would show.
 */
type Rgb = [number, number, number];

function bodyColour(page: Page, property: 'backgroundColor' | 'color'): Promise<Rgb> {
  return page.evaluate((prop) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('no 2d context');

    context.fillStyle = getComputedStyle(document.body)[prop as 'backgroundColor'];
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as [number, number, number];
  }, property);
}

function elementColour(locator: Locator, property: 'backgroundColor' | 'color'): Promise<Rgb> {
  // Self-contained on purpose: this function is serialised and run in the page, so it
  // cannot close over anything defined out here.
  return locator.evaluate((element, prop) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('no 2d context');

    context.fillStyle = getComputedStyle(element)[prop as 'backgroundColor'];
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as [number, number, number];
  }, property);
}

/** WCAG relative luminance, from sRGB bytes. */
function luminance([r, g, b]: Rgb): number {
  const [red, green, blue] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

async function signIn(page: Page, email: string) {
  await page.goto(`${WEB}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin/);
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

    const pageBackground = await bodyColour(page, 'backgroundColor');
    const bodyText = await bodyColour(page, 'color');

    // Measured as a property, not as a colour. The old assertion pinned
    // `rgb(255, 255, 255)`, which asserts *a colour* where the intent was *a
    // property*: the previous direction's canvas was linen, so it broke — and it would not have
    // caught a dark direction either. This fails loudly if the theme starts
    // following the OS, or if the ramp drops below legible, which are the two
    // things the assertion was written to protect.
    expect(luminance(pageBackground), 'the page is light whichever way the OS is set')
      .toBeGreaterThan(0.7);
    expect(contrast(pageBackground, bodyText), 'body text clears 7:1 on the page')
      .toBeGreaterThanOrEqual(7);

    const button = page.getByRole('button', { name: 'Sign in' });
    const buttonBackground = await elementColour(button, 'backgroundColor');
    // A transparent button paints the canvas, so comparing bytes is what catches the
    // unstyled case: equal to the page means nothing was painted.
    expect(buttonBackground, 'the primary button is not the page it sits on').not.toEqual(pageBackground);
  });

  test('ships a dark theme a person chooses, not one the operating system imposes', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });

    await page.goto(`${WEB}/login`);
    const lightBackground = await bodyColour(page, 'backgroundColor');

    // The OS is dark and the page is not. The theme is a decision, and the default is
    // light whatever the machine says — this is the assertion that would catch a
    // palette quietly becoming a media query.
    expect(luminance(lightBackground), 'a dark OS does not make a dark page').toBeGreaterThan(0.7);

    const chosen = await page.evaluate(async () => {
      const response = await fetch('/api/theme', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme: 'dark' }),
      });
      return response.status;
    });
    expect(chosen).toBe(204);

    await page.reload();

    // Reached offline in the other sense: the second palette is only exercised where a
    // browser is interpreting it, which is here.
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');

    const darkBackground = await bodyColour(page, 'backgroundColor');
    const darkText = await bodyColour(page, 'color');

    expect(luminance(darkBackground), 'the chosen theme is dark').toBeLessThan(0.3);
    expect(contrast(darkBackground, darkText), 'body text clears 4.5:1 in the dark theme')
      .toBeGreaterThanOrEqual(4.5);
  });

  test('lists the products of the organization the session acts in', async ({ page }) => {
    // The seeded owner belongs to Nile Traders alone, so the organization resolves
    // without asking and the catalog is deterministic.
    await signIn(page, 'owner@marketcore.test');

    await page.goto(`${WEB}/admin/products`);

    // The page owns the document's h1; the shell names where the page sits. Both
    // assertions moved here with the heading: the top bar used to carry it, and a
    // browser is the only layer that can say which element is actually painted.
    await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible();
    await expect(
      page.getByRole('banner').getByRole('navigation', { name: 'Breadcrumb' }),
    ).toHaveText(/Catalog\s*\/\s*Products/);

    // The ladder descends from the page's own title rather than skipping a level.
    await expect(page.getByRole('heading', { level: 2, name: 'All products' })).toBeVisible();

    // ...and the row can only appear if the request carried `x-organization-id`: the
    // API answers a tenant-scoped read without that header with 400, never with
    // everything. This is the first page in the app that reads tenant data, so it is
    // the first place that claim can be checked from a browser.
    await expect(page.getByRole('cell', { name: 'Nile Cotton Shirt' })).toBeVisible();
  });

  test('keeps one session across two tabs, without a rotation becoming a replay', async ({ context }) => {
    // The case the rotation coordinator exists for, and the one nothing tested. The API
    // revokes a session when a refresh token is replayed, so two tabs refreshing
    // independently is not a slow logout — it is a *replay*, and it kills the session for
    // both. Single-flight plus one step of memory is what makes a second tab safe.
    const first = await context.newPage();
    const second = await context.newPage();

    await signIn(first, 'owner@marketcore.test');

    // Both tabs load at once, which is the shape that leaks a rotation: each would hold
    // the same refresh cookie and each would try to use it.
    await Promise.all([first.goto(`${WEB}/admin`), second.goto(`${WEB}/admin`)]);

    await expect(first.getByRole('banner').getByText('owner@marketcore.test')).toBeVisible();
    await expect(second.getByRole('banner').getByText('owner@marketcore.test')).toBeVisible();

    // Still signed in after the fact: the session was rotated, not revoked. A replay
    // would have answered 401 here and sent both tabs to sign in.
    await first.goto(`${WEB}/admin/products`);
    await expect(first.getByRole('cell', { name: 'Nile Cotton Shirt' })).toBeVisible();
  });

  test('a brand-new user is asked for an organization before reaching the shell', async ({ page }) => {
    const email = `${unique('web-first-run')}@marketcore.test`;
    const organization = `Onboarded ${Date.now()}`;

    await page.goto(`${WEB}/register`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/login\?registered=1/);

    await signIn(page, email);

    // A user who belongs to nothing gets the first-run screen, not a shell whose every
    // tenant-scoped control answers "choose an organization first".
    await expect(
      page.getByRole('heading', { name: /not in an organization yet/i }),
    ).toBeVisible();
    await expect(page.getByRole('complementary')).toHaveCount(0);

    // And it is a gate, not a hint: asking for a tenant page directly does not get past it.
    await page.goto(`${WEB}/admin/products`);
    await expect(
      page.getByRole('heading', { name: /not in an organization yet/i }),
    ).toBeVisible();

    await page.getByLabel('Organization name').fill(organization);
    await page.getByRole('button', { name: 'Create organization' }).click();

    // Creating it admits the session to the shell, with the new organization as the tenant —
    // named in the top bar, which is where the shell keeps the tenant rather than the rail.
    await expect(page.getByRole('complementary')).toBeVisible();
    await expect(page.getByRole('banner')).toContainText(organization);

    // And the tenant it just made is real: the catalog is empty rather than unavailable.
    await expect(page.getByText('No products yet')).toBeVisible();
  });

  test('creates an account, signs in, and is turned away once signed out', async ({ page, request }) => {
    const email = `${unique('web')}@marketcore.test`;

    await page.goto(`${WEB}/register`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Registration returns a user and no tokens: the API separates creating a user
    // from signing one in, and the app sends the visitor to sign in rather than
    // chaining a login behind their back.
    await expect(page).toHaveURL(/\/login\?registered=1/);

    // This user belongs to nothing, and a user who belongs to nothing is sent to the
    // first-run screen rather than the shell — so an organization is created first, through
    // the same call the onboarding screen makes. What is under test here is the session and
    // its cookies; the gate has its own journey above, and it is a gate rather than a hint.
    const session = await request.post(`${API}/auth/login`, { data: credentials(email) });
    expect(session.status()).toBe(200);
    const tokens = TokenPairSchema.parse(await session.json());
    const created = await request.post(`${API}/organizations`, {
      data: { name: `Shell ${Date.now()}` },
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(created.status()).toBe(201);

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

    // The gate, not just the UI: asking for the console again is refused, and the
    // address it carries to sign-in is the console's, not the one it was asked for.
    await page.goto(`${WEB}/admin`);
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
  });

  test('moves the console\u2019s old URLs permanently to /admin', async ({ page }) => {
    // D92. `/dashboard` and `/products` were the console's address until this change,
    // so they are answered with a permanent redirect rather than a 404. A browser is
    // the right layer for this: only a browser follows the hop, and only a browser can
    // be caught asking for the old address in the first place.
    const statuses: number[] = [];
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/dashboard') statuses.push(response.status());
    });

    await page.goto(`${WEB}/dashboard`);

    expect(statuses, 'the old URL answers 308, not a temporary redirect').toContain(308);
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);

    // Signed in, the same old URL lands on the page it has always meant.
    await signIn(page, 'owner@marketcore.test');
    await page.goto(`${WEB}/products`);
    await expect(page).toHaveURL(/\/admin\/products$/);
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
