import type { ReactNode } from 'react';
import type { Organization, UserSummary } from '@app/contracts';
import type { SessionView } from '../session';
import type { SessionStatuses } from '../constants';

// Built from the constants beside it, so the tags a shell narrows on and the tags
// the provider constructs are the same values by construction, not by agreement.
export type SessionState =
  | { status: typeof SessionStatuses.LOADING }
  /** A refusal: there is no session. Distinct from a failure to ask. */
  | { status: typeof SessionStatuses.ANONYMOUS }
  /** The server could not be reached, or answered something unusable. */
  | { status: typeof SessionStatuses.FAILED; message: string }
  | { status: typeof SessionStatuses.READY; session: SessionView };

/**
 * The session a signed-in subtree may rely on.
 *
 * `useSession` answers *whether* there is a session; this answers *what it is*, for
 * modules that are only ever rendered once the answer is yes. The four arms of
 * `SessionState` are narrowed in one place — the shell — so a consumer receives a
 * session rather than a union it has to narrow and cannot get wrong silently.
 *
 * The active organization is resolved here rather than by each module that needs to
 * name the tenant, so membership is applied once and the two cannot disagree.
 */
export interface ReadySession {
  user: UserSummary;
  organizations: Organization[];
  /** The organization the session is acting in, or null when none is chosen. */
  activeOrganization: Organization | null;
  reload: () => Promise<void>;
}

export interface ReadySessionProviderProps {
  session: SessionView;
  reload: () => Promise<void>;
  children: ReactNode;
}
