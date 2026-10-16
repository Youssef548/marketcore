import { messageFrom } from '@/lib/http/browser';
import type { SubmitResult } from './interfaces/forms.interface';

/** What a form says when the request never got an answer, as opposed to a refusal. */
export const SERVER_UNREACHABLE_MESSAGE = 'Could not reach the server';

/**
 * A form's request to this app's BFF, reduced to the two outcomes a form renders.
 *
 * `expectedStatus` is the one success the form knows how to continue from — 204 for a sign-in,
 * 201 for a registration. Anything else is a refusal, and its message comes from the shared error
 * envelope. A network failure is told apart from a refusal, because "the server said no" and "the
 * server never answered" call for different next steps.
 */
export async function postJson(path: string, body: unknown, expectedStatus: number): Promise<SubmitResult> {
  let response: Response;

  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: SERVER_UNREACHABLE_MESSAGE };
  }

  if (response.status === expectedStatus) {
    return { ok: true };
  }

  return { ok: false, message: await messageFrom(response) };
}
