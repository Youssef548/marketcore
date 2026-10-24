import { describe, expect, it } from 'vitest';
import { readJson } from './body';

const LOGIN_URL = 'http://localhost/api/auth/login';

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request(LOGIN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('readJson', () => {
  it('reads an application/json body', async () => {
    await expect(readJson(request('{"email":"a@b.test"}'))).resolves.toEqual({ email: 'a@b.test' });
  });

  it('ignores media-type parameters such as charset', async () => {
    const withCharset = request('{"a":1}', { 'content-type': 'application/json; charset=utf-8' });

    await expect(readJson(withCharset)).resolves.toEqual({ a: 1 });
  });

  it('refuses a text/plain body, the form a cross-site page can send', async () => {
    // No preflight is required for `text/plain`, and `request.json()` parses it anyway,
    // so before this check a cross-site form could post a login body that parsed — and
    // the response set the attacker's session cookies in the victim's browser.
    const crossSite = request('{"email":"attacker@evil.test","password":"hunter2hunter2"}', {
      'content-type': 'text/plain',
    });

    await expect(readJson(crossSite)).resolves.toBeUndefined();
  });

  it('refuses a form-encoded body', async () => {
    const form = request('email=a%40b.test&password=hunter2hunter2', {
      'content-type': 'application/x-www-form-urlencoded',
    });

    await expect(readJson(form)).resolves.toBeUndefined();
  });

  it('refuses a body that declares no media type at all', async () => {
    const unlabelled = new Request(LOGIN_URL, { method: 'POST', body: '{"a":1}' });

    await expect(readJson(unlabelled)).resolves.toBeUndefined();
  });

  it('refuses a request another site aimed here', async () => {
    const crossOrigin = request('{"a":1}', { origin: 'https://evil.test' });

    await expect(readJson(crossOrigin)).resolves.toBeUndefined();
  });

  it('refuses a request the browser labels as cross-site', async () => {
    const crossSite = request('{"a":1}', { 'sec-fetch-site': 'cross-site' });

    await expect(readJson(crossSite)).resolves.toBeUndefined();
  });

  it('reads a same-origin request', async () => {
    const sameOrigin = request('{"a":1}', { origin: 'http://localhost', 'sec-fetch-site': 'same-origin' });

    await expect(readJson(sameOrigin)).resolves.toEqual({ a: 1 });
  });

  it('returns undefined for malformed JSON rather than throwing', async () => {
    await expect(readJson(request('{not json'))).resolves.toBeUndefined();
  });
});
