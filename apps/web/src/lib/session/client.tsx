'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { ErrorEnvelopeSchema } from '@app/contracts';
import { SERVER_UNREACHABLE_MESSAGE } from '@/lib/forms/post-json';
import { messageFrom } from '@/lib/http/browser';
import { SessionStatuses } from './constants';
import { SessionViewSchema } from './session';
import type {
  ReadySession,
  ReadySessionProviderProps,
  SessionState,
} from './interfaces/client.interface';

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
    return { status: SessionStatuses.FAILED, message: SERVER_UNREACHABLE_MESSAGE };
  }

  if (response.status === 401) return { status: SessionStatuses.ANONYMOUS };

  if (!response.ok) {
    const envelope = ErrorEnvelopeSchema.safeParse(await response.json().catch(() => null));
    return {
      status: SessionStatuses.FAILED,
      message: envelope.success
        ? envelope.data.error.message
        : `Unexpected response (${response.status})`,
    };
  }

  const parsed = SessionViewSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    return {
      status: SessionStatuses.FAILED,
      message: 'The server sent a session this version cannot read',
    };
  }

  return { status: SessionStatuses.READY, session: parsed.data };
}

interface SessionContextValue {
  state: SessionState;
  reload: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>({ status: SessionStatuses.LOADING });

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

const ReadySessionContext = createContext<ReadySession | null>(null);

export function ReadySessionProvider({ session, reload, children }: ReadySessionProviderProps) {
  const value = useMemo<ReadySession>(
    () => ({
      user: session.user,
      organizations: session.organizations,
      activeOrganization:
        session.organizations.find(({ id }) => id === session.activeOrganizationId) ?? null,
      reload,
    }),
    [session, reload],
  );

  return <ReadySessionContext.Provider value={value}>{children}</ReadySessionContext.Provider>;
}

/**
 * Throws rather than returning null. This module is rendered only inside the shell's
 * signed-in branch, so its absence is a wiring mistake — and a guard that returns
 * null would let every consumer answer "is this rendered in the right place" for
 * itself, silently, which is the restatement this seam exists to remove.
 */
export function useReadySession(): ReadySession {
  const value = useContext(ReadySessionContext);
  if (value === null) {
    throw new Error('useReadySession was used outside a signed-in shell');
  }
  return value;
}

/**
 * Ends the session. The server clears the cookies; the caller navigates.
 *
 * A failure throws rather than being swallowed, because a sign-out that silently does
 * nothing leaves the user signed in while believing otherwise. A 401 is not a
 * failure: it means there was no session to end, which is the outcome the caller
 * wanted anyway.
 */
export async function signOut(): Promise<void> {
  const response = await fetch('/api/auth/logout', { method: 'POST' });

  if (!response.ok && response.status !== 401) {
    throw new Error('Could not sign out');
  }
}

/** Remembers the chosen organization. The caller reloads the session afterwards. */
export async function selectOrganization(organizationId: string): Promise<void> {
  await fetch('/api/session/organization', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationId }),
  });
}

/**
 * Creates a product in the organization the session acts in.
 *
 * The browser names no tenant: the route handler adds `x-organization-id` from the
 * session, so a page cannot create into an organization it does not belong to. A
 * refusal arrives as the server's own message, read with the shared envelope.
 */
export async function createProduct(input: {
  name: string;
  priceMinor: number;
  currency: string;
}): Promise<void> {
  const response = await fetch('/api/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await messageFrom(response));
  }
}

/**
 * Creates an organization, with the caller as its owner.
 *
 * The caller reloads afterwards, and that reload is what admits them to the shell: the
 * organization did not exist a moment ago, so there is nothing to navigate to — the session
 * changes and the shell appears in place. A failure carries the server's message, because a
 * duplicate name is a thing the user can fix and a status number is not.
 */
export async function createOrganization(name: string): Promise<void> {
  const response = await fetch('/api/organizations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  if (response.ok) return;

  const envelope = ErrorEnvelopeSchema.safeParse(await response.json().catch(() => null));
  throw new Error(
    envelope.success ? envelope.data.error.message : 'Could not create the organization',
  );
}
