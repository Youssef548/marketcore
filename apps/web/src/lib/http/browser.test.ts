import { describe, expect, it } from 'vitest';
import { messageFrom, safeRedirect } from './browser';

describe('safeRedirect', () => {
  it('keeps a path on this site', () => {
    expect(safeRedirect('/dashboard/orders')).toBe('/dashboard/orders');
    expect(safeRedirect('/dashboard?a=1')).toBe('/dashboard?a=1');
  });

  it('falls back when there is nothing to go to', () => {
    expect(safeRedirect(null)).toBe('/dashboard');
    expect(safeRedirect('')).toBe('/dashboard');
  });

  it('refuses an absolute URL to another origin', () => {
    // The attack this exists for: a login link carrying ?next= to a convincing copy
    // of the login page, so the next password is typed into someone else's form.
    expect(safeRedirect('https://evil.test/login')).toBe('/dashboard');
    expect(safeRedirect('http://evil.test')).toBe('/dashboard');
    expect(safeRedirect('javascript:alert(1)')).toBe('/dashboard');
  });

  it('refuses a protocol-relative URL, which a naive check lets through', () => {
    // `//evil.test` starts with `/` and is still an absolute URL, so testing only
    // for a leading slash would pass it straight to the router.
    expect(safeRedirect('//evil.test')).toBe('/dashboard');
    expect(safeRedirect('\\/evil.test')).toBe('/dashboard');
  });
});

describe('messageFrom', () => {
  it('reads the message out of an envelope', async () => {
    const response = Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid credentials', requestId: 'req_1' } },
      { status: 401 },
    );

    await expect(messageFrom(response)).resolves.toBe('Invalid credentials');
  });

  it('falls back to the status when the body is not an envelope', async () => {
    // A proxy's HTML error page, and an envelope missing `requestId`, are both not
    // an envelope — and neither may throw inside a form's error path.
    await expect(messageFrom(new Response('<html>502</html>', { status: 502 }))).resolves.toBe(
      'Unexpected response (502)',
    );

    const missingRequestId = Response.json({ error: { code: 'X', message: 'y' } }, { status: 500 });
    await expect(messageFrom(missingRequestId)).resolves.toBe('Unexpected response (500)');
  });
});
