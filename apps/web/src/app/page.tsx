import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIES } from '@/lib/session/cookies';
import { ADMIN_PATH, LOGIN_PATH } from '@/lib/session/routing';

/**
 * The front door, which decides nothing for itself.
 *
 * Presence of the refresh cookie is enough to choose a direction; whether the
 * session is still valid is `/api/session`'s question, and it is the only place that
 * can answer it and rotate the tokens if the answer is "not quite".
 */
export default async function HomePage() {
  const jar = await cookies();

  redirect(jar.has(SESSION_COOKIES.REFRESH) ? ADMIN_PATH : LOGIN_PATH);
}
