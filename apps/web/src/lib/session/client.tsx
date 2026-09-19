'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ErrorEnvelopeSchema } from '@app/contracts';
import { SessionViewSchema, type SessionView } from './session';

export type SessionState =
  | { status: 'loading' }
  /** A refusal: there is no session. Distinct from a failure to ask. */
  | { status: 'anonymous' }
  /** The server could not be reached, or answered something unusable. */
  | { status: 'failed'; message: string }
  | { status: 'ready'; session: SessionView };

/**
 * Read once, from `/api/session`.
 *
 * Never throws: every outcome is a state, because each one is rendered differently
 * and an exception would have to be caught in the same place anyway. A refusal is
 * kept distinct from a failure on purpose — signing a user out because a request
 * timed out turns a blip into a logout.
 */
async function readSession(): Promise<SessionState> {
  let response: Response;
  try {
    response = await fetch('/api/session', { headers: { accept: 'application/json' } });
  } catch {
    return { status: 'failed', message: 'Could not reach the server' };
  }

  if (response.status === 401) return { status: 'anonymous' };

  if (!response.ok) {
    const envelope = ErrorEnvelopeSchema.safeParse(await response.json().catch(() => null));
    return {
      status: 'failed',
      message: envelope.success
        ? envelope.data.error.message
        : `Unexpected response (${response.status})`,
    };
  }

  const parsed = SessionViewSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    return { status: 'failed', message: 'The server sent a session this version cannot read' };
  }

  return { status: 'ready', session: parsed.data };
}

interface SessionContextValue {
  state: SessionState;
  reload: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  const reload = useCallback(async () => {
    setState(await readSession());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(() => ({ state, reload }), [state, reload]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error('useSession was used outside a SessionProvider');
  }
  return value;
}

/** Ends the session. The server clears the cookies; the caller navigates. */
export async function signOut(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
}

/** Remembers the chosen organization. The caller reloads the session afterwards. */
export async function selectOrganization(organizationId: string): Promise<void> {
  await fetch('/api/session/organization', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationId }),
  });
}
