import { ErrorEnvelopeSchema } from '@app/contracts';

/**
 * The origin a candidate path is resolved against.
 *
 * A placeholder: nothing navigates to it. It exists only so the URL parser has a base
 * to resolve against, and it is fixed rather than the current origin so this module
 * stays a pure function — the caller's route, not the runtime's host, decides the
 * fallback.
 */
const LOCAL_ORIGIN = 'http://localhost';

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
 * sent to it — so an unvalidated value here is an open redirect: a login link that
 * lands on a convincing copy of the login page and harvests the next password. Only
 * a path on this origin is accepted.
 *
 * The check parses the candidate rather than inspecting its prefix, because the two
 * disagree about what a URL is. `//evil.test` is the obvious case; `/\evil.test` is
 * the one a prefix check lets through, because it starts with a single slash while
 * the URL parser treats `\` as a separator and reads an authority. The same applies
 * to a strip-able tab or newline. Resolving against a fixed origin and comparing the
 * result covers all three without enumerating them.
 *
 * Where a signed-in visitor lands when there is nothing to go back to is the
 * *caller's* fact, not this module's: the caller knows which surface owns that
 * visitor, and naming it here would put a route this helper does not serve inside a
 * generic HTTP module.
 */
export function safeRedirect(target: string | null, fallback: string): string {
  if (target === null) return fallback;

  return localPath(target) ?? fallback;
}

/**
 * The path, query and fragment of `target`, or null when it leaves this site.
 *
 * The origin is a fixed placeholder: nothing is navigated to, and it exists only to
 * give the parser a base to resolve against.
 */
function localPath(target: string): string | null {
  if (!target.startsWith('/')) return null;

  let resolved: URL;
  try {
    resolved = new URL(target, LOCAL_ORIGIN);
  } catch {
    return null;
  }

  if (resolved.origin !== LOCAL_ORIGIN) return null;

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
