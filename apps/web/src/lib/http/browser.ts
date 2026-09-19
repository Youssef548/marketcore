import { ErrorEnvelopeSchema } from '@app/contracts';

/**
 * The message from a refusal, in the browser.
 *
 * Every failure this app returns — from the API or produced by the BFF — carries the
 * same envelope, so there is one way to read a message out of one. A response that
 * is not an envelope (a proxy's HTML error page) falls back to the status rather
 * than throwing inside an error path.
 */
export async function messageFrom(response: Response): Promise<string> {
  const envelope = ErrorEnvelopeSchema.safeParse(await response.json().catch(() => null));

  return envelope.success
    ? envelope.data.error.message
    : `Unexpected response (${response.status})`;
}

/**
 * Where to go after signing in, constrained to this site.
 *
 * `?next=` is attacker-controllable by definition — it exists so a victim can be
 * sent to it — so an unvalidated value is an open redirect: a login link that lands
 * on a convincing copy of the login page and harvests the next password. Only a path
 * on this origin is accepted.
 *
 * `//evil.test` is rejected along with `https://evil.test`: a protocol-relative URL
 * starts with `/` and is absolute, which is exactly the case a naive
 * `startsWith('/')` check lets through.
 */
export function safeRedirect(target: string | null): string {
  if (target === null || !target.startsWith('/') || target.startsWith('//')) {
    return '/dashboard';
  }

  return target;
}
